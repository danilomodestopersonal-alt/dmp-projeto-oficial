import {NextRequest,NextResponse} from "next/server";
import type {PoolClient} from "pg";
import {isAuthorized} from "@/lib/auth";
import {sameOrigin} from "@/lib/widget/devices";
import {pool} from "@/lib/db";
import {getGoogleAccessToken,setGoogleCookies} from "@/lib/google-calendar";
import {personalHolidays,defaultHolidayConfig,type HolidayConfig} from "@/lib/calendar/personal-holidays";
import {buildMaintenancePlan,findEmptyLessons,normalizedCommand,maintenanceHash,publicMaintenancePlan,executeMaintenance,restoreMaintenance,personalCalendarApi,MaintenanceError,type MaintenanceJournal} from "@/lib/calendar/personal-maintenance";
export const runtime="nodejs";
const configKey="dmp_personal_holidays_config_v1",prefix="dmp_personal_maintenance:";
const decode=(value:any)=>typeof value==="string"?JSON.parse(value):value;
const configOf=(value:any):HolidayConfig=>({...defaultHolidayConfig,...decode(value)});
const failure=(e:unknown,extra={})=>NextResponse.json({ok:false,message:e instanceof Error?e.message:"Não foi possível conferir a agenda.",...extra},{status:e instanceof MaintenanceError?e.status:502});
export async function GET(request:NextRequest){
 if(!await isAuthorized(request))return NextResponse.json({message:"Entre novamente no DMP."},{status:401});
 try{
  const saved=await pool.query("SELECT payload FROM dmp_data WHERE id=$1",[configKey]),config=configOf(saved.rows[0]?.payload);
  const year=Number(request.nextUrl.searchParams.get("year")||new Date().getFullYear());
  const history=await pool.query("SELECT payload FROM dmp_data WHERE id LIKE 'dmp_personal_maintenance:%' ORDER BY updated_at DESC LIMIT 10");
  const operations=history.rows.map(row=>decode(row.payload) as MaintenanceJournal).map(j=>({operationId:j.operationId,digest:j.digest,command:j.plan.command,description:j.plan.description,createdAt:j.createdAt,count:Object.keys(j.completed).length,done:Boolean(j.done),restored:Boolean(j.restored),restoreStarted:Boolean(j.restoreStarted)}));
  if(request.nextUrl.searchParams.get("action")!=="repair")return NextResponse.json({ok:true,config,holidays:personalHolidays(year,config),operations},{headers:{"Cache-Control":"no-store"}});
  const auth=await getGoogleAccessToken(request);if(!auth.accessToken)throw new MaintenanceError("Conecte o Google nesta sessão.",401);
  const result=await pool.query("SELECT payload FROM dmp_data WHERE id=$1",["students"]),students=decode(result.rows[0]?.payload);
  if(!Array.isArray(students))throw new MaintenanceError("Alunos indisponíveis.",503);
  const empty=await findEmptyLessons(request.nextUrl.searchParams.get("date")||"",students,personalCalendarApi(auth.accessToken));
  const response=NextResponse.json({ok:true,empty},{headers:{"Cache-Control":"no-store"}});if(auth.refreshed)setGoogleCookies(response,auth.refreshed);return response;
 }catch(e){return failure(e);}
}
export async function POST(request:NextRequest){
 if(!await isAuthorized(request))return NextResponse.json({message:"Entre novamente no DMP."},{status:401});
 if(!sameOrigin(request))return NextResponse.json({message:"Origem não autorizada."},{status:403});
 const input=await request.json().catch(()=>null);
 if(!input||!["config","preview","execute","restore"].includes(input.action))return NextResponse.json({message:"Pedido inválido."},{status:400});
 if(input.action==="config"){
  const c=input.config;if(!c||!["national","state","city"].every(k=>typeof c[k]==="boolean")||Object.keys(c).length!==3)return NextResponse.json({message:"Configuração inválida."},{status:400});
  try{await pool.query("INSERT INTO dmp_data(id,payload,updated_at) VALUES($1,$2,clock_timestamp()) ON CONFLICT(id) DO UPDATE SET payload=EXCLUDED.payload,updated_at=clock_timestamp()",[configKey,JSON.stringify(c)]);return NextResponse.json({ok:true});}catch(e){return failure(e);}
 }
 let client:PoolClient|undefined,locked=false,journal:MaintenanceJournal|undefined;
 try{
  const auth=await getGoogleAccessToken(request);if(!auth.accessToken)throw new MaintenanceError("Conecte o Google nesta sessão.",401);
  const api=personalCalendarApi(auth.accessToken);
  const studentsResult=await pool.query("SELECT payload FROM dmp_data WHERE id=$1",["students"]),students=decode(studentsResult.rows[0]?.payload);
  if(!Array.isArray(students))throw new MaintenanceError("Alunos indisponíveis.",503);
  const configResult=await pool.query("SELECT payload FROM dmp_data WHERE id=$1",[configKey]),config=configOf(configResult.rows[0]?.payload);
  const finish=(data:Record<string,unknown>)=>{const r=NextResponse.json({ok:true,...data},{headers:{"Cache-Control":"no-store"}});if(auth.refreshed)setGoogleCookies(r,auth.refreshed);return r;};
  if(input.action==="preview"){
   const command=normalizedCommand(input.command),plan=await buildMaintenancePlan(command,students,api,config);
   return finish({preview:publicMaintenancePlan(plan)});
  }
  if(input.confirmed!==true||!/^[a-zA-Z0-9-]{16,80}$/.test(input.operationId||"")||!/^[a-f0-9]{64}$/.test(input.digest||""))throw new MaintenanceError("Confira a prévia e confirme o cancelamento.",400);
  client=await pool.connect();const lock=await client.query("SELECT pg_try_advisory_lock(hashtext($1)) AS locked",["dmp_calendar_time_change"]);locked=lock.rows[0]?.locked===true;
  if(!locked)throw new MaintenanceError("Outra alteração da agenda está em andamento. Aguarde.");
  const key=prefix+input.operationId,found=await client.query("SELECT payload FROM dmp_data WHERE id=$1",[key]);journal=decode(found.rows[0]?.payload);
  if(journal){if(journal.operationId!==input.operationId||journal.digest!==input.digest)throw new MaintenanceError("Operação divergente. Reabra a revisão.");}
  const save=async(j:MaintenanceJournal)=>{await client!.query("INSERT INTO dmp_data(id,payload,updated_at) VALUES($1,$2,clock_timestamp()) ON CONFLICT(id) DO UPDATE SET payload=EXCLUDED.payload,updated_at=clock_timestamp()",[key,JSON.stringify(j)]);};
  if(input.action==="restore"){
   if(!journal)throw new MaintenanceError("Operação não encontrada.");
   await restoreMaintenance(journal,api,save);
  }else{
   const command=normalizedCommand(input.command);
   if(journal){if(maintenanceHash(command)!==maintenanceHash(journal.plan.command))throw new MaintenanceError("A seleção desta operação mudou. Retome sem alterar os campos.");}
   else{
    const fresh=await client.query("SELECT payload FROM dmp_data WHERE id=$1",["students"]),currentStudents=decode(fresh.rows[0]?.payload);
    if(!Array.isArray(currentStudents))throw new MaintenanceError("Alunos indisponíveis.",503);
    const plan=await buildMaintenancePlan(command,currentStudents,api,config);
    if(maintenanceHash(plan)!==input.digest)throw new MaintenanceError("A agenda mudou desde a prévia. Confira as aulas novamente.");
    if(!plan.steps.length)throw new MaintenanceError("Não há aulas selecionadas para cancelar.",400);
    journal={operationId:input.operationId,digest:input.digest,plan,createdAt:new Date().toISOString(),completed:{}};await save(journal);
   }
   await executeMaintenance(journal!,api,save);
  }
  return finish({confirmed:true,operationId:journal!.operationId,count:Object.keys(journal!.completed).length,restored:Boolean(journal!.restored)});
 }catch(e){return failure(e,{pending:Boolean(journal&&!journal.done),completed:journal?Object.keys(journal.completed).length:0,...(journal?{operationId:journal.operationId}:{})});}
 finally{if(client){if(locked)await client.query("SELECT pg_advisory_unlock(hashtext($1))",["dmp_calendar_time_change"]).catch(()=>{});client.release();}}
}
