import type {CalendarEvent,Student} from "@/types/models";
import type {AbsenceOperation} from "./absence-removal";
// Read-only projection. Never creates an absence or sends a Google mutation.
export function visibleAbsencePending(operations:AbsenceOperation[],students:Student[],events:CalendarEvent[],date:string):AbsenceOperation[]{
 const pending=operations.filter(op=>op.state!=="confirmed");
 const known=new Set(operations.map(op=>JSON.stringify([op.studentId,op.event.id])));
 for(const event of events){
  if(!event.etag||event.allDay||event.id.startsWith("dmp-")||!Number.isFinite(Date.parse(event.start)))continue;
  const eventDate=new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Sao_Paulo"}).format(new Date(event.start));
  if(eventDate!==date)continue;
  for(const studentId of event.matchedStudentIds||[]){
   const identity=JSON.stringify([studentId,event.id]);if(known.has(identity))continue;
   const student=students.find(s=>s.id===studentId);
   if(!student?.sessions.some(s=>s.source==="ABSENCE"&&s.date===eventDate&&s.calendarEvent?.id===event.id))continue;
   known.add(identity);
   pending.push({key:"legacy:"+identity,studentId,event,state:"pending",message:"A ausência já está salva, mas o aluno ainda consta nesta ocorrência da agenda. Tente novamente somente a retirada.",updatedAt:""});
  }
 }
 return pending;
}
