import type {Session,Student} from "@/types/models";
import {occurrenceState} from "./attendance-state";
import {lastConfirmedPresence} from "@/lib/home/last-presence";
export function isSavedWorkout(session:Session,date:string){
 return ["FREE","PLANNED"].includes(session.source||"")&&Array.isArray(session.completedExercises)&&session.completedExercises.some(e=>e.name?.trim())&&lastConfirmedPresence([session],date)===date;
}
/** Display evidence only. Never changes a session, attendance counter or action target. */
export function agendaAttendance(student:Student,eventId:string,date:string,uniqueOccurrence:boolean):ReturnType<typeof occurrenceState>{
 const records=(student.sessions||[]).filter(s=>s.date===date),linked=records.filter(s=>s.calendarEvent?.id===eventId);
 const absence=linked.find(s=>s.source==="ABSENCE");
 if(absence)return {studentId:student.id,state:"absent",sessionId:absence.id,registered:false};
 const confirmed=linked.find(s=>s.source==="ATTENDANCE"||isSavedWorkout(s,date));
 if(confirmed)return {studentId:student.id,state:"present",sessionId:confirmed.id,registered:isSavedWorkout(confirmed,date)};
 // Day-only evidence may decorate just one known Personal occurrence, never several.
 const unlinked=records.filter(s=>!s.calendarEvent);
 if(!linked.length&&uniqueOccurrence&&!records.some(s=>s.source==="ABSENCE")&&!records.some(s=>s.calendarEvent&&s.calendarEvent.id!==eventId)){
  const saved=unlinked.find(s=>s.source==="ATTENDANCE"||isSavedWorkout(s,date));
  if(saved)return {studentId:student.id,state:"present",sessionId:saved.id,registered:isSavedWorkout(saved,date)};
 }
 if(records.some(s=>!s.calendarEvent)||linked.length)return {studentId:student.id,state:"unknown",reason:uniqueOccurrence?"unconfirmed-presence":"ambiguous-day-record"};
 return {studentId:student.id,state:"pending"};
}
