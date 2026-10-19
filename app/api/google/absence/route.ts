import {NextRequest,NextResponse} from "next/server";
import {randomUUID} from "node:crypto";
import {isAuthorized} from "@/lib/auth";
import {pool} from "@/lib/db";
import {getGoogleAccessToken,googleConfigured,setGoogleCookies} from "@/lib/google-calendar";
import {absenceKey,AbsenceConflict,removeAbsentParticipant,type AbsenceOperation} from "@/lib/calendar/absence-removal";
import type {CalendarEvent,Session,Student} from "@/types/models";
export const runtime="nodejs";
const STORE="dmp_absence_google_v1";
const parse=(value:any)=>typeof value==="string"?JSON.parse(value):value;
const day=(value:string)=>new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Sao_Paulo"}).format(new Date(value));
export async function GET(request:NextRequest){
 if(!await isAuthorized(request))return NextResponse.json({message:"Sessão inválida."},{status:401});
 try{const result=await pool.query("SELECT payload FROM dmp_data WHERE id=$1",[STORE]);const operations:AbsenceOperation[]=Object.values(parse(result.rows[0]?.payload)||{});return NextResponse.json({operations:operations.filter(o=>o.state!=="confirmed")});}catch{return NextResponse.json({message:"Não foi possível consultar as pendências."},{status:503});}
}
export async function POST(request:NextRequest){
 if(!await isAuthorized(request))return NextResponse.json({message:"Sessão inválida."},{status:401});
 const p=await request.json().catch(()=>null);
 if(!p||!["register","retry"].includes(p.action)||typeof p.studentId!=="string"||p.studentId.length>256||!p.event||typeof p.event.id!=="string"||!p.event.id||p.event.id.length>1024||!Number.isFinite(Date.parse(p.event.start))||!Number.isFinite(Date.parse(p.event.end))||typeof p.event.summary!=="string"||p.event.summary.length>2000||p.event.allDay||p.event.id.startsWith("dmp-"))return NextResponse.json({message:"Ocorrência inválida."},{status:400});
 const event:CalendarEvent={id:p.event.id,summary:p.event.summary,start:p.event.start,end:p.event.end,etag:typeof p.event.etag==="string"?p.event.etag:undefined,description:String(p.event.description||"").slice(0,8000),location:String(p.event.location||"").slice(0,2000)};
 const key=absenceKey(p.studentId,event.id);let session:Session|undefined;let operation:AbsenceOperation|undefined;let refreshed:any;
 const client=await pool.connect();let locked=false;let committed=false;
 try{
  // Serialize operations for the same occurrence, including requests from other tabs.
  await client.query("SELECT pg_advisory_lock(hashtext($1))",["dmp-absence:"+event.id]);locked=true;
  await client.query("BEGIN");
  // A short row lock covers only the local save. Google is contacted after COMMIT.
  const result=await client.query("SELECT payload FROM dmp_data WHERE id=$1 FOR UPDATE",["students"]);
  const students:Student[]=parse(result.rows[0]?.payload);if(!Array.isArray(students))throw new AbsenceConflict("Cadastro indisponível. Nenhuma ausência registrada.");
  const student=students.find(s=>s.id===p.studentId);if(!student)throw new AbsenceConflict("Aluno não encontrado.");
  session=student.sessions.find(s=>s.source==="ABSENCE"&&s.calendarEvent?.id===event.id&&s.date===day(event.start));
  if(!session&&p.action==="retry")throw new AbsenceConflict("Ausência não encontrada. Tentar novamente não cria registros.");
  if(!session){
   if(student.sessions.some(s=>s.calendarEvent?.id===event.id&&s.source!=="ABSENCE"))throw new AbsenceConflict("Há presença ou treino nesta ocorrência. Revise o histórico antes de registrar ausência.");
   session={id:randomUUID(),date:day(event.start),workoutName:"Ausência",notes:"Ausência informada.",completedExercises:[],source:"ABSENCE",finishedAt:new Date().toISOString(),calendarEvent:{id:event.id,summary:event.summary,description:event.description,start:event.start,end:event.end,location:event.location}};
   student.sessions=[session,...student.sessions];
   await client.query("UPDATE dmp_data SET payload=$2,updated_at=NOW() WHERE id=$1",["students",JSON.stringify(students)]);
  }
  await client.query("INSERT INTO dmp_data(id,payload,updated_at) VALUES($1,$2,NOW()) ON CONFLICT(id) DO NOTHING",[STORE,"{}"]);
  const state=await client.query("SELECT payload FROM dmp_data WHERE id=$1 FOR UPDATE",[STORE]);const ops:Record<string,AbsenceOperation>=parse(state.rows[0].payload)||{};
  operation=ops[key]||{key,studentId:p.studentId,event,state:"pending",message:"Ausência salva. Retirada no Google pendente.",updatedAt:new Date().toISOString()};
  // Review is explicit and only replaces the snapshot, never the saved absence.
  if(p.action==="retry"&&p.reviewed===true&&operation.state==="conflict")operation={...operation,event,state:"pending",message:"Nova conferência solicitada."};
  ops[key]=operation;
  await client.query("UPDATE dmp_data SET payload=$2,updated_at=NOW() WHERE id=$1",[STORE,JSON.stringify(ops)]);
  await client.query("COMMIT");committed=true;
  let remoteEvent:CalendarEvent|undefined;
  if(operation.state!=="confirmed"){
   try{
    if(!googleConfigured())throw Error("Google não configurado. A ausência está salva.");
    const auth=await getGoogleAccessToken(request);refreshed=auth.refreshed;if(!auth.accessToken)throw Error("Reconecte a Agenda Google e tente novamente. A ausência está salva.");
    remoteEvent=await removeAbsentParticipant(operation,students,auth.accessToken);
    operation={...operation,state:"confirmed",message:"Ausência salva e retirada confirmada no Google.",updatedAt:new Date().toISOString()};
   }catch(error){operation={...operation,state:error instanceof AbsenceConflict?"conflict":"pending",message:error instanceof Error?error.message:"Retirada não confirmada. Tente novamente.",updatedAt:new Date().toISOString()};}
   // JSON field update avoids overwriting another occurrence's operation.
   await client.query("UPDATE dmp_data SET payload=jsonb_set(payload::jsonb,ARRAY[$2]::text[],$3::jsonb,true),updated_at=NOW() WHERE id=$1",[STORE,key,JSON.stringify(operation)]);
  }
  const response=NextResponse.json({saved:true,session,operation,event:remoteEvent});if(refreshed)setGoogleCookies(response,refreshed);return response;
 }catch(error){await client.query("ROLLBACK").catch(()=>{});return NextResponse.json({saved:committed,message:error instanceof Error?error.message:"Não foi possível confirmar a operação. Consulte as pendências antes de repetir."},{status:error instanceof AbsenceConflict?409:503});}
 finally{if(locked)await client.query("SELECT pg_advisory_unlock(hashtext($1))",["dmp-absence:"+event.id]).catch(()=>{});client.release();}
}
