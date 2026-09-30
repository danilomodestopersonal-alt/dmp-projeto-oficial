import type { KidsData } from "../../types/kids";
import { absenceKey, absenceState, AbsenceError, reconcileAbsenceRights } from "./individual-absence";
export type DsAbsenceRequest={studentId:string;classId:string;lessonId:string;date:string;sourceEventId:string;revision:number;expectedRevision:number;attendance:"PRESENT"|"ABSENT";replacementRight:boolean};
export function validateDsAbsence(input:unknown):DsAbsenceRequest {
  if(!input || typeof input!=="object" || Array.isArray(input)) throw new AbsenceError("INVALID_PAYLOAD","Payload inválido.",400);
  const value=input as Record<string,unknown>;
  const keys=["studentId","classId","lessonId","date","sourceEventId","revision","expectedRevision","attendance","replacementRight"];
  if(Object.keys(value).length!==keys.length || keys.some(key=>!(key in value))) throw new AbsenceError("INVALID_PAYLOAD","Campos obrigatórios ausentes ou campos não autorizados.",400);
  for(const key of ["studentId","classId","lessonId","sourceEventId"]) if(typeof value[key]!=="string" || !(value[key] as string).trim() || (value[key] as string).length>200) throw new AbsenceError("INVALID_PAYLOAD","Identificador inválido.",400);
  if(typeof value.date!=="string" || !/^\d{4}-\d{2}-\d{2}$/.test(value.date) || !Number.isFinite(Date.parse(value.date+"T12:00:00Z")) || new Date(value.date+"T12:00:00Z").toISOString().slice(0,10)!==value.date) throw new AbsenceError("INVALID_PAYLOAD","Data inválida.",400);
  if(!Number.isSafeInteger(value.revision) || Number(value.revision)<1 || !Number.isSafeInteger(value.expectedRevision) || Number(value.expectedRevision)<0 || Number(value.revision)!==Number(value.expectedRevision)+1 || !["PRESENT","ABSENT"].includes(String(value.attendance)) || typeof value.replacementRight!=="boolean" || (value.attendance==="PRESENT" && value.replacementRight)) throw new AbsenceError("INVALID_PAYLOAD","Estado ou revisão inválidos.",400);
  return value as DsAbsenceRequest;
}
export function applyDsAbsence(data:KidsData,input:DsAbsenceRequest,now=new Date().toISOString()) {
  const groups=data.classes.filter(item=>item.id===input.classId);
  const candidates=data.lessons.filter(item=>item.id===input.lessonId && item.classId===input.classId && item.date===input.date);
  const group=groups[0],lesson=candidates[0];
  if(groups.length!==1 || candidates.length!==1 || !group.active || !group.students.some(item=>item.id===input.studentId && item.active && (!item.startDate || item.startDate<=input.date)) || lesson.kind==="REPLACEMENT" || ["CANCELLED","HOLIDAY"].includes(lesson.status) || (lesson.replacementStudentIds||[]).includes(input.studentId) || input.date<data.semesterStart || input.date>data.semesterEnd || input.date>new Date(now).toLocaleDateString("sv-SE",{timeZone:"America/Sao_Paulo"})) throw new AbsenceError("INVALID_OCCURRENCE","Aluno, turma ou aula incompatíveis.");
  const key=absenceKey(lesson,input.studentId);
  const history=(data.absenceAudit||[]).filter(item=>item.key===key && item.origin==="DS" && item.revision);
  const previous=history[history.length-1];
  const currentRevision=previous?.revision || 0;
  const desired={attendance:input.attendance,replacementRight:input.replacementRight};
  if(currentRevision===input.revision && previous?.sourceEventId===input.sourceEventId && JSON.stringify(previous.after)===JSON.stringify(desired) && JSON.stringify(absenceState(lesson,input.studentId))===JSON.stringify(desired)) return {data,key,revision:currentRevision,duplicate:true};
  if(input.expectedRevision!==currentRevision || input.revision!==currentRevision+1 || (previous && previous.sourceEventId!==input.sourceEventId)) throw new AbsenceError("REVISION_CONFLICT","Revisão desatualizada ou identidade DS divergente. Sincronize novamente.",409);
  if(!previous && !(input.attendance==="ABSENT" && input.replacementRight)) throw new AbsenceError("UNAUTHORIZED_TRANSITION","Primeiro evento deve ser falta com direito.");
  const before=absenceState(lesson,input.studentId);
  const nextLesson={...lesson,attendance:{...lesson.attendance,[input.studentId]:input.attendance},absenceReplacementRights:{...lesson.absenceReplacementRights,[input.studentId]:input.replacementRight},updatedAt:now};
  const next=reconcileAbsenceRights(data,{...data,lessons:data.lessons.map(item=>item===lesson?nextLesson:item),updatedAt:now},"DS",now);
  // Um registro DS por revisão; a contabilidade continua derivada da aula.
  next.absenceAudit=[...(data.absenceAudit||[]),{key,origin:"DS",studentId:input.studentId,classId:input.classId,lessonId:input.lessonId,date:input.date,before,after:desired,recordedAt:now,revision:input.revision,sourceEventId:input.sourceEventId}];
  return {data:next,key,revision:input.revision,duplicate:false};
}
