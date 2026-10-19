import {createHash} from "node:crypto";
import {calendarRoster,ROSTER_KEY,rosterSummary,type RosterEdit} from "./roster";
import {matchCalendarEvents,kidsCalendarRequest} from "../widget/home-source";
import type {CalendarEvent,Student} from "../../types/models";

export const ABSENCE_MARKER="dmpAbsenceRemovalV1";
export type AbsenceOperation={key:string;studentId:string;event:CalendarEvent;state:"pending"|"confirmed"|"conflict";message:string;updatedAt:string};
export const absenceKey=(studentId:string,eventId:string)=>createHash("sha256").update(JSON.stringify([studentId,eventId])).digest("hex");
export class AbsenceConflict extends Error {}
// Only fields relevant to ownership, participants and occurrence identity. No credentials.
function fingerprint(e:any){const privateFields={...e.extendedProperties?.private};delete privateFields[ABSENCE_MARKER];return createHash("sha256").update(JSON.stringify([e.summary||"",e.description||"",e.location||"",e.start,e.end,e.recurringEventId||"",e.originalStartTime||null,e.recurrence||[],e.attendees||[],Object.entries(privateFields).sort(([a],[b])=>a.localeCompare(b))])).digest("hex");}
export async function removeAbsentParticipant(op:AbsenceOperation,students:Student[],token:string,request:typeof fetch=fetch):Promise<CalendarEvent>{
 const url=(id:string)=>"https://www.googleapis.com/calendar/v3/calendars/primary/events/"+encodeURIComponent(id);
 const read=async(id:string)=>{const r=await request(url(id),{headers:{authorization:`Bearer ${token}`},cache:"no-store",signal:AbortSignal.timeout(15000)});if(r.status===404||r.status===410)throw new AbsenceConflict("A ocorrência não está disponível no Google. Confira manualmente; a ausência foi preservada.");if(!r.ok)throw Error(`Google não pôde ser consultado (HTTP ${r.status}). Tente novamente.`);const e=await r.json();if(e.id!==id)throw new AbsenceConflict("Identidade da ocorrência divergente.");return e;};
 const event=await read(op.event.id);
 if(event.status==="cancelled"||event.start?.date||event.recurrence?.length||!event.etag||Date.parse(event.start?.dateTime)!==Date.parse(op.event.start)||Date.parse(event.end?.dateTime)!==Date.parse(op.event.end))throw new AbsenceConflict("A ocorrência foi cancelada ou teve seu horário alterado. Revise na Agenda; nenhuma alteração foi aplicada.");
 const parent=event.recurringEventId?await read(event.recurringEventId):null;
 const mapped:CalendarEvent={id:event.id,etag:event.etag,summary:event.summary||"",description:event.description||"",location:event.location||"",start:event.start.dateTime,end:event.end.dateTime,recurringEventId:event.recurringEventId,originalStartTime:event.originalStartTime?.dateTime,calendarRoster:calendarRoster(event.extendedProperties?.private,parent?.extendedProperties?.private)};
 if(kidsCalendarRequest(mapped))throw new AbsenceConflict("Esta operação é exclusiva de aulas Personal. Use a chamada Kids.");
 const projected=matchCalendarEvents([mapped],students)[0];const current=projected.matchedStudentIds||[];
 let marker:any;try{marker=JSON.parse(event.extendedProperties?.private?.[ABSENCE_MARKER]||"null");}catch{throw new AbsenceConflict("Metadados da ocorrência inválidos. Revise manualmente.");}
 const ownVersion=marker?.signature===fingerprint(event)&&Array.isArray(marker.removed);
 // A lost response is safe to retry, but never remove somebody who was re-added later.
 if(ownVersion&&marker.removed.includes(op.key)&&!current.includes(op.studentId))return projected;
 if(event.etag!==op.event.etag&&!(ownVersion&&marker.rootEtag===op.event.etag))throw new AbsenceConflict("A aula mudou desde a solicitação. Atualize e revise os participantes na Agenda antes de tentar novamente.");
 if(!current.includes(op.studentId))return projected;
 if(!students.some(s=>s.id===op.studentId&&s.sessions.some(a=>a.source==="ABSENCE"&&a.calendarEvent?.id===op.event.id)))throw new AbsenceConflict("Ausência não confirmada no DMP. Nenhum participante foi retirado.");
 const ids=current.filter(id=>id!==op.studentId);const roster=mapped.calendarRoster!;
 const edit:RosterEdit={op:"absence-"+op.key.slice(0,48),at:Math.max(Date.now(),(roster.single?.at||0)+1,...roster.rules.map(r=>r.at+1)),from:mapped.originalStartTime||mapped.start,scope:"single",eventId:event.id,ids,add:[],remove:[op.studentId]};
 const privateFields={...event.extendedProperties?.private,[ROSTER_KEY]:JSON.stringify(edit)};
 const summary=ids.length?rosterSummary(event.summary||"",current,ids,students):rosterSummary(event.summary||"",current,[],students)+" · sem participantes";
 const next={...event,summary,extendedProperties:{...event.extendedProperties,private:privateFields}};
 privateFields[ABSENCE_MARKER]=JSON.stringify({rootEtag:ownVersion?marker.rootEtag:event.etag,removed:[...new Set<string>([...(ownVersion?marker.removed:[]),op.key])],signature:fingerprint(next)});
 if(Object.values(privateFields).some(v=>new TextEncoder().encode(String(v)).length>1024)||Object.keys(privateFields).length>280)throw new AbsenceConflict("Limite de metadados atingido. Revise a ocorrência manualmente.");
 if(parent&&(await read(parent.id)).etag!==parent.etag)throw new AbsenceConflict("A série mudou durante a conferência. Nenhuma alteração aplicada.");
 const body={summary,extendedProperties:{private:privateFields}};
 try{const r=await request(url(event.id),{method:"PATCH",headers:{authorization:`Bearer ${token}`,"Content-Type":"application/json","If-Match":event.etag},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});if(r.status===412)throw new AbsenceConflict("A aula mudou durante a gravação. Revise na Agenda.");if(!r.ok)throw Error(`Google recusou a retirada (HTTP ${r.status}). A ausência permanece salva.`);}catch(error){if(error instanceof AbsenceConflict)throw error;const check=await read(event.id);if(check.extendedProperties?.private?.[ABSENCE_MARKER]!==privateFields[ABSENCE_MARKER])throw error;}
 const check=await read(event.id);
 if(check.extendedProperties?.private?.[ABSENCE_MARKER]!==privateFields[ABSENCE_MARKER]||fingerprint(check)!==fingerprint(next))throw new AbsenceConflict("A resposta não confirmou a versão esperada. Revise a ocorrência.");
 return matchCalendarEvents([{...mapped,etag:check.etag,summary:check.summary,calendarRoster:calendarRoster(check.extendedProperties?.private,parent?.extendedProperties?.private)}],students)[0];
}
