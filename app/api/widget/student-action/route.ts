import {NextRequest,NextResponse} from "next/server";
import type {PoolClient} from "pg";
import {pool} from "@/lib/db";
import {isAuthorized} from "@/lib/auth";
import {sameOrigin} from "@/lib/widget/devices";
export const runtime="nodejs";
export async function GET(){return NextResponse.json({version:28,adendo14:true,individualStudentActions:true,confirmationRequired:true},{headers:{"Cache-Control":"no-store"}});}
// Widget buttons navigate to confirmation. Only an authenticated explicit POST can write.
export async function POST(request:NextRequest){
 if(!(await isAuthorized(request)))return NextResponse.json({message:"Sessão inválida. Entre novamente no DMP."},{status:401});
 if(!sameOrigin(request))return NextResponse.json({message:"Origem não autorizada."},{status:403});
 let client:PoolClient|undefined;
 try{
  const {actionTarget,prepareStudentAction,StudentActionError}=await import("@/lib/widget/student-action");
  const {createHash}=await import("node:crypto");
  const body=await request.json();const target=actionTarget(body.target);
  const {GET:readCalendar}=await import("@/app/api/google/calendar/route");
  const url=new URL("/api/google/calendar",request.url);url.searchParams.set("date",target.date);url.searchParams.set("days","1");
  const calendar=await readCalendar(new NextRequest(url,{headers:request.headers}));
  if(!calendar.ok)return calendar;
  const events=(await calendar.json()).events;
  if(!Array.isArray(events))throw new StudentActionError(503,"Agenda indisponível. Nenhum registro salvo.");
  client=await pool.connect();await client.query("BEGIN");
  const current=await client.query("SELECT payload FROM dmp_data WHERE id=$1 FOR UPDATE",["students"]);
  const students=current.rows[0]?.payload;
  if(!Array.isArray(students))throw new StudentActionError(503,"Dados indisponíveis. Nenhum registro salvo.");
  const sessionId="widget:"+createHash("sha256").update(JSON.stringify([target.studentId,target.id,target.date])).digest("hex");
  const result=prepareStudentAction(students,events,target,sessionId,body.session);
  if(!result.already)await client.query("UPDATE dmp_data SET payload=$2,updated_at=NOW() WHERE id=$1",["students",JSON.stringify(result.students)]);
  const {occurrenceState}=await import("@/lib/widget/attendance-state");
  const {matchCalendarEvents,getCalendarEventStudents}=await import("@/lib/widget/home-source");
  const matched=matchCalendarEvents(events,result.students);const event=matched.find(e=>e.id===target.id)!;
  const people=getCalendarEventStudents(event,result.students);
  const occurrenceComplete=people.length>0&&people.every(s=>["present","absent"].includes(occurrenceState(s,target.id,target.date).state));
  const next=occurrenceComplete?matched.filter(e=>!e.allDay&&e.start>event.start).sort((a,b)=>a.start.localeCompare(b.start)).find(e=>{const ss=getCalendarEventStudents(e,result.students);return ss.length>0&&ss.some(s=>occurrenceState(s,e.id,target.date).state==="pending");}):null;
  await client.query("COMMIT");
  const response=NextResponse.json({ok:true,already:result.already,session:result.session,occurrenceComplete,nextEventId:next?.id||null});
  for(const cookie of calendar.cookies.getAll())response.cookies.set(cookie);
  return response;
 }catch(error){
  if(client)await client.query("ROLLBACK").catch(()=>{});
  const {StudentActionError}=await import("@/lib/widget/student-action");
  return NextResponse.json({message:error instanceof StudentActionError?error.message:"Não foi possível confirmar o registro. Confira a conexão e tente novamente."},{status:error instanceof StudentActionError?error.status:503});
 }finally{client?.release();}
}
