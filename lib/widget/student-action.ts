import type {CalendarEvent,Session,Student} from "@/types/models";
import {calendarEventDate,getCalendarEventStudents,kidsCalendarRequest,matchCalendarEvents} from "./home-source";
export type StudentAction="register"|"presence"|"absence";
export type StudentActionTarget={kind:"student-action";id:string;date:string;studentId:string;action:StudentAction;time:string};
export class StudentActionError extends Error {constructor(public status:number,message:string){super(message);}}
export function actionTarget(value:unknown):StudentActionTarget {
 const v=value as Partial<StudentActionTarget>|null;
 if(!v||v.kind!=="student-action"||typeof v.id!=="string"||!v.id.trim()||v.id.length>256||typeof v.studentId!=="string"||!v.studentId.trim()||v.studentId.length>256||!['register','presence','absence'].includes(v.action||'')||typeof v.date!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(v.date)||(!Number.isFinite(Date.parse(v.date+"T12:00:00Z"))||new Date(v.date+"T12:00:00Z").toISOString().slice(0,10)!==v.date)||typeof v.time!=="string"||!/^([01]\d|2[0-3]):[0-5]\d$/.test(v.time))throw new StudentActionError(400,"Link de atendimento inválido.");
 return v as StudentActionTarget;
}
export function selectedOccurrence(students:Student[],events:CalendarEvent[],target:StudentActionTarget){
 const student=students.find(s=>s.id===target.studentId&&s.status==="ACTIVE");
 const event=matchCalendarEvents(events,students).find(e=>e.id===target.id);
 const time=event?new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Sao_Paulo",hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date(event.start)):"";
 if(!student||!event||event.allDay||kidsCalendarRequest(event)||calendarEventDate(event)!==target.date||time!==target.time||!getCalendarEventStudents(event,students).some(s=>s.id===student.id))throw new StudentActionError(409,"Aula ou aluno mudou. Atualize o widget antes de continuar.");
 return {student,event};
}
export function existingOccurrence(student:Student,target:StudentActionTarget){return (student.sessions||[]).find(s=>s.date===target.date&&(!s.calendarEvent||s.calendarEvent.id===target.id));}
export function prepareStudentAction(students:Student[],events:CalendarEvent[],target:StudentActionTarget,sessionId:string,payload?:Partial<Session>){
 const {student,event}=selectedOccurrence(students,events,target);
 const detailed=target.action==="register"||(target.action==="presence"&&!!payload?.completedExercises?.length);
 const planned=detailed&&payload?.source==="PLANNED";
 const workout=planned?student.workouts?.find(w=>w.id===payload?.workoutId&&w.active!==false&&!w.archivedAt):null;
 if(planned&&!workout)throw new StudentActionError(409,"Ficha indisponível. Confira o treino deste aluno novamente.");
 const source=planned?"PLANNED":detailed?"FREE":target.action==="presence"?"ATTENDANCE":"ABSENCE";
 const existing=existingOccurrence(student,target);
 if(existing){if(existing.id===sessionId&&existing.source===source&&(!planned||existing.workoutId===workout?.id))return {students,session:existing,already:true};throw new StudentActionError(409,"Este aluno já tem registro para esta ocorrência. Consulte o histórico para corrigir.");}
 if(detailed&&(!payload||payload.date!==target.date||!Array.isArray(payload.completedExercises)||!payload.completedExercises.length||payload.completedExercises.length>100||payload.completedExercises.some(e=>!e||typeof e.name!=="string"||!e.name.trim())))throw new StudentActionError(400,"Revise os exercícios e a data antes de salvar.");
 const exercises=(source==="FREE"||source==="PLANNED")?payload!.completedExercises!.map(e=>({id:String(e.id||""),name:String(e.name).slice(0,300),block:String(e.block||"").slice(0,100),sets:String(e.sets||"").slice(0,100),reps:String(e.reps||"").slice(0,100),load:String(e.load||"").slice(0,100),notes:String(e.notes||"").slice(0,2000)})):[];
 const session:Session={id:sessionId,date:target.date,source,...(workout?{workoutId:workout.id}:{}),workoutName:workout?workout.name:source==="FREE"?"Treino realizado":source==="ATTENDANCE"?"Presença":"Ausência",focus:source==="FREE"?String(payload?.focus||"").slice(0,300):"",notes:String(payload?.notes||"").slice(0,5000),completedExercises:exercises,finishedAt:new Date().toISOString(),calendarEvent:{id:event.id,summary:event.summary,description:event.description,start:event.start,end:event.end,allDay:event.allDay,location:event.location}};
 return {students:students.map(s=>s.id===student.id?{...s,sessions:[session,...(s.sessions||[])]}:s),session,already:false};
}
