import type {Student} from "@/types/models";
/** Read-only occurrence projection. A date alone never proves which lesson was settled. */
export function occurrenceState(student:Student,eventId:string,date:string){
 const records=(student.sessions||[]).filter(s=>s.date===date&&s.calendarEvent?.id===eventId);
 const legacy=(student.sessions||[]).some(s=>s.date===date&&!s.calendarEvent);
 const states=new Set(records.map(s=>s.source==="ABSENCE"?"absent":"present"));
 if(states.size>1)return {studentId:student.id,state:"unknown" as const,reason:"conflicting-records"};
 if(records.length)return {studentId:student.id,state:states.has("absent")?"absent" as const:"present" as const,sessionId:records[0].id,registered:records.some(s=>s.source!=="ABSENCE"&&s.source!=="ATTENDANCE")};
 return {studentId:student.id,state:legacy?"unknown" as const:"pending" as const,...(legacy?{reason:"unlinked-record"}:{})};
}
