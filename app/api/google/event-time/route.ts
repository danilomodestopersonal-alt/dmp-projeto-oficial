import {NextRequest,NextResponse} from "next/server";
import {isAuthorized} from "@/lib/auth";
import {pool} from "@/lib/db";
import {getGoogleAccessToken,googleConfigured,setGoogleCookies} from "@/lib/google-calendar";
import {buildTimePlan,assertNoTimeConflicts,TimeChangeError,validateTimeCommand,timeDate,type TimeCommand} from "@/lib/calendar/time-change";
import {calendarTimeApi,executeTimePlan,cancelTimePlan,type TimeJournal} from "@/lib/calendar/time-change-google";
import {kidsCalendarRequest} from "@/lib/widget/home-source";

export const runtime="nodejs";
export async function POST(request:NextRequest){
  if(!await isAuthorized(request))return NextResponse.json({ok:false,error:"Sessão inválida. Entre novamente."},{status:401});
  if(!googleConfigured())return NextResponse.json({ok:false,error:"Google não configurado."},{status:503});
  const client=await pool.connect();let locked=false,journal:TimeJournal|undefined;
  try{
    const input=await request.json();const cancel=input.cancel===true;delete input.cancel;
    const command=input as TimeCommand;validateTimeCommand(command);
    const {accessToken,refreshed}=await getGoogleAccessToken(request);
    if(!accessToken)return NextResponse.json({ok:false,error:"Reconecte o Google."},{status:401});
    const api=calendarTimeApi(accessToken),key="calendar_time_change:"+command.operationId;
    const lock=await client.query("SELECT pg_try_advisory_lock(hashtext($1)) AS locked",["dmp_calendar_time_change"]);
    locked=lock.rows[0]?.locked===true;
    if(!locked)return NextResponse.json({ok:false,error:"Outra alteração de horário está em andamento. Aguarde."},{status:409});
    const existing=await client.query("SELECT payload FROM dmp_data WHERE id=$1",[key]);
    journal=existing.rows[0]?.payload as TimeJournal|undefined;
    const save=async(value:TimeJournal)=>{await client.query("INSERT INTO dmp_data(id,payload,updated_at) VALUES($1,$2,NOW()) ON CONFLICT(id) DO UPDATE SET payload=EXCLUDED.payload,updated_at=NOW()",[key,JSON.stringify(value)]);};
    if(journal){
      if(JSON.stringify(journal.plan.command)!==JSON.stringify(command))throw new TimeChangeError("Esta operação já possui outro horário. Retome sem mudar os campos.");
    }else{
      if(cancel)throw new TimeChangeError("Não há alteração pendente para cancelar.");
      const pending=await client.query("SELECT payload FROM dmp_data WHERE id LIKE 'calendar_time_change:%' AND coalesce(payload->>'done','false') <> 'true' LIMIT 1");
      if(pending.rows.length){
        const prior=pending.rows[0].payload.plan;
        return NextResponse.json({ok:false,error:`Há uma alteração pendente de ${prior.event.summary||"aula"} em ${timeDate(prior.command.start).split("-").reverse().join("/")}. Reabra essa aula para retomar ou cancelar.`,...(prior.command.id===command.id?{resume:prior.command}:{})},{status:409});
      }
      const event=await api.read(command.id);if(!event)throw new TimeChangeError("A aula não está mais disponível.");
      if(kidsCalendarRequest({id:event.id,summary:event.summary||"",start:event.start?.dateTime||"",end:event.end?.dateTime||""}))throw new TimeChangeError("Altere o horário da turma pelo Kids.");
      const parent=command.scope==="following"&&event.recurringEventId?await api.read(event.recurringEventId):undefined;
      // Non-expanded list includes all real exceptions without expanding an infinite series.
      const all=parent?await api.list({singleEvents:"false",showDeleted:"true"}):[];
      const exceptions=parent?all.filter(e=>e.recurringEventId===parent.id):[];
      if(parent&&!exceptions.some(e=>e.id===event.id)&&Date.parse(parent.start?.dateTime)!==Date.parse(event.originalStartTime?.dateTime))exceptions.push(event);
      const plan=buildTimePlan(command,event,parent,exceptions);
      const result=await client.query("SELECT payload FROM dmp_data WHERE id=$1",["students"]);
      const raw=result.rows[0]?.payload,students=typeof raw==="string"?JSON.parse(raw):raw||[];
      const prefix=event.id.replace(/_\d{8}T\d{6}Z$/,"")+"_";
      const hasHistory=students.some((s:any)=>(s.sessions||[]).some((session:any)=>session.calendarEvent?.id===event.id||command.scope==="following"&&session.date>=timeDate(plan.boundary!)&&session.calendarEvent?.id?.startsWith(prefix)));
      if(hasHistory)throw new TimeChangeError("Há chamada ou treino registrado nesta ocorrência. O histórico foi preservado; escolha uma aula futura sem registro.");
      const occupied=await api.list({singleEvents:"true",showDeleted:"false",timeMin:command.start.slice(0,10)+"T00:00:00-03:00",timeMax:command.scope==="following"?plan.checkedThrough:command.end});
      assertNoTimeConflicts(plan,occupied);
      journal={plan};await save(journal);
    }
    if(cancel)await cancelTimePlan(journal,api,save);else await executeTimePlan(journal,api,save);
    const response=NextResponse.json({ok:true,confirmed:true,cancelled:journal.cancelled===true,checkedThrough:journal.plan.checkedThrough});
    if(refreshed)setGoogleCookies(response,refreshed);return response;
  }catch(error){
    return NextResponse.json({ok:false,pending:Boolean(journal&&!journal.done),error:error instanceof Error?error.message:"Não foi possível alterar o horário.",...(journal&&!journal.done?{resume:journal.plan.command}:{})},{status:error instanceof TimeChangeError?error.status:502});
  }finally{
    if(locked)await client.query("SELECT pg_advisory_unlock(hashtext($1))",["dmp_calendar_time_change"]).catch(()=>{});
    client.release();
  }
}
