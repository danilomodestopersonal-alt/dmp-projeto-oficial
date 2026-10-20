import type {CalendarEvent,Student} from "@/types/models";
import type {AbsenceOperation} from "./absence-removal";
// Eligibility for an explicit retry, never authority to cancel. The server checks
// the fresh Google event, its ETag, signed removal metadata and remaining roster.
export function emptyAbsenceOccurrence(event:CalendarEvent):boolean{
 const r=event.calendarRoster,s=r?.single;
 return Boolean(!event.cancelled&&!event.allDay&&s?.scope==="single"&&s.eventId===event.id&&s.op.startsWith("absence-")&&s.ids.length===0&&!(event.matchedStudentIds?.length)&&!r?.rules.some(rule=>rule.at>s.at&&Date.parse(rule.from)<=Date.parse(event.originalStartTime||event.start)&&rule.add.length>0));
}
// Read-only projection. Never creates an absence or sends a Google mutation.
export function visibleAbsencePending(operations:AbsenceOperation[],students:Student[],events:CalendarEvent[],date:string):AbsenceOperation[]{
 const pending=operations.filter(op=>op.state!=="confirmed");
 const known=new Set(operations.map(op=>JSON.stringify([op.studentId,op.event.id])));
 for(const event of events){
  if(!event.etag||event.allDay||event.id.startsWith("dmp-")||!Number.isFinite(Date.parse(event.start)))continue;
  const eventDate=new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Sao_Paulo"}).format(new Date(event.start));
  if(eventDate<=date&&emptyAbsenceOccurrence(event)){
   // One repair per occurrence, even when several students were absent.
   if(!pending.some(op=>op.event.id===event.id)){
    const absent=students.filter(s=>s.sessions.some(a=>a.source==="ABSENCE"&&a.date===eventDate&&a.calendarEvent?.id===event.id));
    const student=absent.find(s=>event.calendarRoster?.single?.remove.includes(s.id))||absent[0];
    if(student)pending.push({key:"empty:"+event.id,studentId:student.id,event,repairEmpty:true,state:"pending",message:"As ausências estão salvas, mas esta ocorrência antiga ficou vazia no Google. Corrija somente esta ocorrência.",updatedAt:""});
   }
   continue;
  }
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
