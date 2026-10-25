import {NextRequest,NextResponse} from "next/server";
import {isAuthorized} from "@/lib/auth";
import {pool} from "@/lib/db";
import {sameOrigin} from "@/lib/widget/devices";
import {getGoogleAccessToken,setGoogleCookies} from "@/lib/google-calendar";
import {absenceKey} from "@/lib/calendar/absence-removal";
import {AttendanceCorrectionError,correctionTarget,correctionRevision,correctionGoogle,confirmCorrectionGoogle,correctedAttendance} from "@/lib/calendar/attendance-correction";
export const runtime="nodejs";
const validId=(value:unknown):value is string=>typeof value==="string"&&value.length>0&&value.length<=256;
const failure=(error:unknown)=>NextResponse.json({ok:false,message:error instanceof AttendanceCorrectionError?error.message:"Não foi possível confirmar a correção. Atualize o histórico antes de repetir."},{status:error instanceof AttendanceCorrectionError?error.status:503});
export async function GET(request:NextRequest){
 if(!await isAuthorized(request))return NextResponse.json({message:"Entre novamente no DMP."},{status:401});
 try{
  const studentId=request.nextUrl.searchParams.get("studentId"),sessionId=request.nextUrl.searchParams.get("sessionId");
  if(!validId(studentId)||!validId(sessionId))throw new AttendanceCorrectionError(400,"Registro inválido.");
  const result=await pool.query("SELECT payload FROM dmp_data WHERE id=$1",["students"]),students=result.rows[0]?.payload;
  if(!Array.isArray(students))throw new AttendanceCorrectionError(503,"Histórico indisponível.");
  const {student,session}=correctionTarget(students,studentId,sessionId);
  if(session.source!=="ABSENCE")throw new AttendanceCorrectionError(409,"Este registro já não é uma ausência. Atualize o histórico.");
  const auth=session.calendarEvent?await getGoogleAccessToken(request):null;
  if(session.calendarEvent&&!auth?.accessToken)throw new AttendanceCorrectionError(401,"Conecte a Agenda Google nesta sessão para conferir a ocorrência.");
  const google=await correctionGoogle(session,studentId,students,auth?.accessToken||"");
  const response=NextResponse.json({ok:true,studentName:student.name,date:session.date,revision:correctionRevision(session),eventEtag:google?.event.etag||"",parentEtag:google?.parent?.etag||"",googleAction:google?(google.ids.includes(studentId)?"ALREADY_PRESENT":"RESTORE_PARTICIPANT"):"UNLINKED"},{headers:{"Cache-Control":"no-store"}});
  if(auth?.refreshed)setGoogleCookies(response,auth.refreshed);return response;
 }catch(error){return failure(error);}
}
export async function POST(request:NextRequest){
 if(!await isAuthorized(request))return NextResponse.json({message:"Entre novamente no DMP."},{status:401});
 if(!sameOrigin(request))return NextResponse.json({message:"Origem não autorizada."},{status:403});
 const body=await request.json().catch(()=>null);
 if(!body||body.confirmed!==true||!validId(body.studentId)||!validId(body.sessionId)||typeof body.revision!=="string"||!/^[a-f0-9]{64}$/.test(body.revision)||typeof body.eventEtag!=="string"||body.eventEtag.length>512||typeof body.parentEtag!=="string"||body.parentEtag.length>512)return NextResponse.json({message:"Reabra a confirmação da ausência."},{status:400});
 const client=await pool.connect();let lock="";
 try{
  // Discover the lock key without writing. Re-read the record under the row lock below.
  const initial=await client.query("SELECT payload FROM dmp_data WHERE id=$1",["students"]);
  if(!Array.isArray(initial.rows[0]?.payload))throw new AttendanceCorrectionError(503,"Histórico indisponível.");
  const first=correctionTarget(initial.rows[0].payload,body.studentId,body.sessionId).session;
  lock="dmp-absence:"+(first.calendarEvent?.id||body.studentId+":"+body.sessionId);
  const acquired=await client.query("SELECT pg_try_advisory_lock(hashtext($1)) AS locked",[lock]);
  if(!acquired.rows[0]?.locked){lock="";throw new AttendanceCorrectionError(409,"Outra alteração desta aula está em andamento. Aguarde e atualize o histórico.");}
  await client.query("BEGIN");
  const result=await client.query("SELECT payload FROM dmp_data WHERE id=$1 FOR UPDATE",["students"]),students=result.rows[0]?.payload;
  if(!Array.isArray(students))throw new AttendanceCorrectionError(503,"Histórico indisponível.");
  const {session}=correctionTarget(students,body.studentId,body.sessionId);
  if(session.source==="ATTENDANCE"&&session.attendanceCorrections?.some(a=>a.previousRevision===body.revision)){await client.query("COMMIT");return NextResponse.json({ok:true,already:true,data:students});}
  if(session.source!=="ABSENCE"||correctionRevision(session)!==body.revision||session.calendarEvent?.id!==first.calendarEvent?.id)throw new AttendanceCorrectionError(409,"O registro mudou. Reabra a confirmação no histórico.");
  if(students.find(s=>s.id===body.studentId).sessions.some((s:any)=>s.id!==session.id&&s.date===session.date&&(!s.calendarEvent||!session.calendarEvent||s.calendarEvent.id===session.calendarEvent.id)))throw new AttendanceCorrectionError(409,"Existe outro registro nesta data/ocorrência. Confira o histórico para evitar duplicidade.");
  const auth=session.calendarEvent?await getGoogleAccessToken(request):null;
  if(session.calendarEvent&&!auth?.accessToken)throw new AttendanceCorrectionError(401,"Conecte a Agenda Google para confirmar a ocorrência.");
  const google=await correctionGoogle(session,body.studentId,students,auth?.accessToken||"");
  const googleEtag=await confirmCorrectionGoogle(google,body.studentId,students,{eventEtag:body.eventEtag,parentEtag:body.parentEtag});
  const corrected=correctedAttendance(session,body.revision,googleEtag);
  const next=students.map(s=>s.id===body.studentId?{...s,sessions:s.sessions.map((s:any)=>s.id===session.id?corrected:s)}:s);
  await client.query("UPDATE dmp_data SET payload=$2,updated_at=clock_timestamp() WHERE id=$1",["students",JSON.stringify(next)]);
  if(session.calendarEvent){
   const key=absenceKey(body.studentId,session.calendarEvent.id);
   await client.query("UPDATE dmp_data SET payload=jsonb_set(payload,ARRAY[$2]::text[],(payload->$2)||$3::jsonb),updated_at=clock_timestamp() WHERE id=$1 AND payload ? $2",["dmp_absence_google_v1",key,JSON.stringify({state:"confirmed",message:"Ausência corrigida para presença pelo histórico.",updatedAt:new Date().toISOString()})]);
  }
  await client.query("COMMIT");
  const response=NextResponse.json({ok:true,already:false,data:next});if(auth?.refreshed)setGoogleCookies(response,auth.refreshed);return response;
 }catch(error){await client.query("ROLLBACK").catch(()=>{});return failure(error);}
 finally{if(lock)await client.query("SELECT pg_advisory_unlock(hashtext($1))",[lock]).catch(()=>{});client.release();}
}
