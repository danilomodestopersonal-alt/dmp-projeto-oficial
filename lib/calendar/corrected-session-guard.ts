import type {Student} from "@/types/models";
/** Old tabs cannot restore an absence over a confirmed, audited correction. */
export function correctedSessionsPreserved(current:Student[],incoming:Student[]){
 for(const student of current)for(const session of student.sessions||[]){
  if(!session.attendanceCorrections?.length)continue;
  const matches=incoming.filter(s=>s.id===student.id).flatMap(s=>s.sessions||[]).filter(s=>s.id===session.id);
  if(matches.length!==1)return false;
  const next=matches[0];
  if(next.source!==session.source||next.date!==session.date||JSON.stringify(next.calendarEvent)!==JSON.stringify(session.calendarEvent)||JSON.stringify(next.attendanceCorrections)!==JSON.stringify(session.attendanceCorrections))return false;
 }
 for(const student of incoming)for(const session of student.sessions||[]){
  if(session.attendanceCorrections?.length&&!current.find(s=>s.id===student.id)?.sessions?.some(s=>s.id===session.id&&s.attendanceCorrections?.length))return false;
 }
 return true;
}
