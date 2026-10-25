import {createHash} from "node:crypto";
import type {CalendarEvent,Session,Student} from "@/types/models";
import {calendarRoster,ROSTER_KEY,rosterIds,rosterSummary,type RosterEdit} from "./roster";
import {matchCalendarEvents,kidsCalendarRequest} from "../widget/home-source";

export class AttendanceCorrectionError extends Error {constructor(public status:number,message:string){super(message);}}
export const correctionRevision=(session:Session)=>createHash("sha256").update(JSON.stringify(session)).digest("hex");
export const CORRECTION_MARKER="dmpAttendanceCorrectionV1";
const conflict=(message:string):never=>{throw new AttendanceCorrectionError(409,message);};
const day=(instant:string)=>new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Sao_Paulo"}).format(new Date(instant));
function signature(e:any){const fields={...e.extendedProperties?.private};delete fields[CORRECTION_MARKER];return createHash("sha256").update(JSON.stringify([e.id,e.status||"confirmed",e.summary||"",e.description||"",e.location||"",e.start,e.end,e.recurringEventId||"",e.originalStartTime||null,e.recurrence||[],e.attendees||[],Object.entries(fields).sort(([a],[b])=>a.localeCompare(b))])).digest("hex");}
export function correctionTarget(students:Student[],studentId:string,sessionId:string){
 const people=students.filter(s=>s.id===studentId),sessions=people[0]?.sessions?.filter(s=>s.id===sessionId)||[];
 if(people.length!==1||sessions.length!==1)conflict("Registro não encontrado de forma única. Atualize o histórico.");
 const student=people[0],session=sessions[0];
 if(!/^\d{4}-\d{2}-\d{2}$/.test(session.date)||!Number.isFinite(Date.parse(session.date+"T12:00:00Z"))||new Date(session.date+"T12:00:00Z").toISOString().slice(0,10)!==session.date||session.date>day(new Date().toISOString()))conflict("Confira a data do registro antes de corrigir.");
 return {student,session};
}
export async function correctionGoogle(session:Session,studentId:string,students:Student[],token:string,request:typeof fetch=fetch){
 const original=session.calendarEvent;
 if(!original)return null;
 if(!original.id||original.id.startsWith("dmp-")||original.allDay||!Number.isFinite(Date.parse(original.start))||!Number.isFinite(Date.parse(original.end))||day(original.start)!==session.date)conflict("Este registro não possui uma ocorrência Google verificável. Confira a aula original.");
 const url=(id:string)=>"https://www.googleapis.com/calendar/v3/calendars/primary/events/"+encodeURIComponent(id);
 const read=async(id:string)=>{const r=await request(url(id),{headers:{Authorization:`Bearer ${token}`},cache:"no-store",signal:AbortSignal.timeout(15000)});if(r.status===404||r.status===410)conflict("A ocorrência original não está disponível. Nenhuma nova aula será criada; confira a Agenda.");if(!r.ok)throw new AttendanceCorrectionError(503,"Não foi possível conferir a Agenda Google.");const value=await r.json();if(value.id!==id)conflict("Identidade da ocorrência divergente.");return value;};
 const event=await read(original.id);
 if(event.status==="cancelled"||event.start?.date||event.recurrence?.length||!event.etag||Date.parse(event.start?.dateTime)!==Date.parse(original.start)||Date.parse(event.end?.dateTime)!==Date.parse(original.end))conflict("A ocorrência foi cancelada ou teve data/horário alterados. Confira a aula no Google antes de corrigir.");
 const parent=event.recurringEventId?await read(event.recurringEventId):null;
 if(parent&&(parent.status==="cancelled"||!parent.etag))conflict("A série não está disponível para conferência.");
 const mapped:CalendarEvent={...original,etag:event.etag,summary:event.summary||"",description:event.description||"",location:event.location||"",recurringEventId:event.recurringEventId,originalStartTime:event.originalStartTime?.dateTime,calendarRoster:calendarRoster(event.extendedProperties?.private,parent?.extendedProperties?.private)};
 if(kidsCalendarRequest(mapped))conflict("Esta correção é exclusiva do histórico Personal.");
 // Inactive students still have a historical identity; no new name-based event is searched.
 const known=students.map(s=>({...s,status:"ACTIVE" as const}));
 const projected=matchCalendarEvents([mapped],known)[0],ids=projected.matchedStudentIds||[];
 if(rosterIds(mapped,ids).some(id=>!students.some(s=>s.id===id)))conflict("A ocorrência contém participantes não reconhecidos. Confira a Agenda.");
 const revision=correctionRevision(session),operation=createHash("sha256").update(JSON.stringify([studentId,session.id,revision])).digest("hex");
 let receipt:any;try{receipt=JSON.parse(event.extendedProperties?.private?.[CORRECTION_MARKER]||"null");}catch{conflict("Metadados de correção inválidos. Confira a Agenda.");}
 const own=receipt?.op===operation&&receipt?.signature===signature(event)&&receipt?.parentEtag===(parent?.etag||"")&&ids.includes(studentId);
 return {event,parent,mapped,ids,revision,operation,own,read,url,request,token};
}
export async function confirmCorrectionGoogle(context:Awaited<ReturnType<typeof correctionGoogle>>,studentId:string,students:Student[],expected:{eventEtag:string;parentEtag:string}){
 if(!context){if(expected.eventEtag||expected.parentEtag)conflict("O vínculo Google mudou. Reabra a confirmação.");return undefined;}
 const {event,parent,mapped,ids,revision,operation,own,read,url,request,token}=context;
 if(!own&&(event.etag!==expected.eventEtag||(parent?.etag||"")!==expected.parentEtag))conflict("A aula mudou desde a confirmação. Reabra o histórico para conferir novamente.");
 if(ids.includes(studentId)){
  if(parent&&(await read(parent.id)).etag!==parent.etag)conflict("A série mudou durante a conferência.");
  if((await read(event.id)).etag!==event.etag)conflict("A aula mudou durante a conferência.");
  return String(event.etag);
 }
 const nextIds=[...ids,studentId],roster=mapped.calendarRoster!;
 const edit:RosterEdit={op:"attendance-"+operation.slice(0,48),at:Math.max(Date.now(),(roster.single?.at||0)+1,...roster.rules.map(r=>r.at+1)),from:mapped.originalStartTime||mapped.start,scope:"single",eventId:event.id,ids:nextIds,add:[studentId],remove:[]};
 const fields={...event.extendedProperties?.private,[ROSTER_KEY]:JSON.stringify(edit)};
 const summary=rosterSummary(event.summary||"",ids,nextIds,students);
 const next={...event,summary,extendedProperties:{...event.extendedProperties,private:fields}};
 fields[CORRECTION_MARKER]=JSON.stringify({op:operation,revision,parentEtag:parent?.etag||"",signature:signature(next)});
 if(Object.values(fields).some(v=>new TextEncoder().encode(String(v)).length>1024)||Object.keys(fields).length>280)conflict("Limite de metadados atingido. Confira a ocorrência manualmente.");
 if(parent&&(await read(parent.id)).etag!==parent.etag)conflict("A série mudou durante a conferência.");
 try{
  const response=await request(url(event.id),{method:"PATCH",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json","If-Match":event.etag},body:JSON.stringify({summary,extendedProperties:{private:fields}}),signal:AbortSignal.timeout(15000)});
  if(response.status===412)conflict("A aula foi alterada no Google durante a gravação. Nenhuma presença foi confirmada no DMP.");
  if(!response.ok)throw new AttendanceCorrectionError(503,"O Google não confirmou a alteração. Reabra a correção para conferir.");
 }catch(error){if(error instanceof AttendanceCorrectionError&&error.status===409)throw error;const check=await read(event.id);if(check.extendedProperties?.private?.[CORRECTION_MARKER]!==fields[CORRECTION_MARKER]||signature(check)!==signature(next))throw error;}
 const check=await read(event.id);
 if(check.extendedProperties?.private?.[CORRECTION_MARKER]!==fields[CORRECTION_MARKER]||signature(check)!==signature(next))conflict("A versão final da aula não corresponde à correção. Confira antes de repetir.");
 if(parent&&(await read(parent.id)).etag!==parent.etag)conflict("A série mudou após a gravação. A presença ainda não foi confirmada no DMP.");
 return String(check.etag);
}
export function correctedAttendance(session:Session,previousRevision:string,googleEtag?:string):Session{
 if(session.source!=="ABSENCE"||correctionRevision(session)!==previousRevision)conflict("O registro foi alterado. Atualize o histórico.");
 return {...session,source:"ATTENDANCE",workoutName:/^aus[eê]ncia$/i.test(session.workoutName)?"Presença":session.workoutName,attendanceCorrections:[...(session.attendanceCorrections||[]),{id:previousRevision,at:new Date().toISOString(),from:"ABSENCE",to:"ATTENDANCE",previousRevision,eventId:session.calendarEvent?.id,googleEtag,previousWorkoutName:session.workoutName}]};
}
