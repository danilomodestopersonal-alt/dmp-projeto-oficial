import type { KidsAbsenceAudit, KidsData, KidsLesson } from "../../types/kids";
import type { KidsReplacementBalanceEvent } from "./replacement-balance";

export class AbsenceError extends Error {
  constructor(public code:string, message:string, public status=422) { super(message); }
}
export function absenceKey(lesson:KidsLesson, studentId:string) {
  return JSON.stringify(["kids-absence-v1",studentId,lesson.classId,lesson.id,lesson.date]);
}
export function absenceState(lesson:KidsLesson, studentId:string) {
  return {attendance:lesson.attendance[studentId] === "ABSENT" ? "ABSENT" as const : "PRESENT" as const,
    replacementRight:lesson.attendance[studentId] === "ABSENT" && Boolean(lesson.absenceReplacementRights?.[studentId])};
}
export function individualAbsenceDueEvents(data:KidsData,studentId:string,throughDate:string):KidsReplacementBalanceEvent[] {
  const events=new Map<string,KidsReplacementBalanceEvent>();
  for (const lesson of data.lessons) {
    if(lesson.date>throughDate || ["CANCELLED","HOLIDAY"].includes(lesson.status) || !absenceState(lesson,studentId).replacementRight) continue;
    events.set(absenceKey(lesson,studentId),{id:absenceKey(lesson,studentId),classId:lesson.classId,
      className:data.classes.find(group=>group.id===lesson.classId)?.name || lesson.replacementName || "Reposição",
      date:lesson.date,type:"DUE",source:"INDIVIDUAL_ABSENCE",label:"Falta individual com direito à reposição",lessonId:lesson.id});
  }
  return [...events.values()];
}
export function reversalProtected(data:KidsData,studentId:string) {
  // Não existe alocação inequívoca entre todos os consumos e cada direito.
  // Na dúvida, exigir revisão manual em vez de apagar crédito utilizado.
  return Boolean((data.replacements||[]).some(item=>item.studentId===studentId && item.status!=="PENDING") ||
    (data.replacementUsages||[]).some(item=>item.studentId===studentId) ||
    data.lessons.some(lesson=> !["CANCELLED","HOLIDAY"].includes(lesson.status) && (lesson.replacementStudentIds||[]).includes(studentId)) ||
    data.classes.some(group=>group.students.some(student=>student.id===studentId && student.active) &&
      data.lessons.some(lesson=>lesson.classId===group.id && lesson.kind!=="REPLACEMENT" &&
        !["CANCELLED","HOLIDAY"].includes(lesson.status) &&
        data.lessons.filter(item=>item.classId===group.id && item.kind!=="REPLACEMENT" && item.date.slice(0,7)===lesson.date.slice(0,7) && item.date<lesson.date).length>=4)));
}
export function reconcileAbsenceRights(current:KidsData,next:KidsData,origin:"DMP"|"DS"="DMP",now=new Date().toISOString()):KidsData {
  const audit=[...(current.absenceAudit||[])];
  const lessons=next.lessons.map(lesson=>({...lesson,absenceReplacementRights:Object.fromEntries(
    Object.entries(lesson.absenceReplacementRights||{}).filter(([id,value])=>value===true && lesson.attendance[id]==="ABSENT" && !["CANCELLED","HOLIDAY"].includes(lesson.status)))}));
  const updated={...next,lessons};
  const changes:KidsAbsenceAudit[]=[];
  const identities=new Map<string,{lesson:KidsLesson;id:string}>();
  for(const data of [current,updated]) for(const lesson of data.lessons) for(const id of Object.keys(lesson.absenceReplacementRights||{})) identities.set(absenceKey(lesson,id),{lesson,id});
  for(const [key,{lesson,id}] of identities) {
    const old=current.lessons.find(item=>absenceKey(item,id)===key);
    const fresh=lessons.find(item=>absenceKey(item,id)===key);
    const before=old?absenceState(old,id):{attendance:"PRESENT" as const,replacementRight:false};
    const after=fresh?absenceState(fresh,id):{attendance:"PRESENT" as const,replacementRight:false};
    if(before.replacementRight && !after.replacementRight && reversalProtected(current,id)) throw new AbsenceError("REVERSAL_REVIEW_REQUIRED","Direito protegido: há reposição agendada, realizada ou antecipada. Revise no DMP antes de retirar o direito.");
    if(after.replacementRight) {
      const group=next.classes.find(item=>item.id===lesson.classId);
      const member=group?.students.find(item=>item.id===id);
      const participant=(lesson.replacementStudentIds||[]).includes(id);
      if(!group || (!member && !participant) || (member?.startDate && member.startDate>lesson.date)) throw new AbsenceError("INVALID_MEMBERSHIP","Aluno incompatível com a aula.");
    }
    if(before.replacementRight!==after.replacementRight) changes.push({key,origin,studentId:id,classId:lesson.classId,lessonId:lesson.id,date:lesson.date,before,after,recordedAt:now});
  }
  const merged=[...(next.replacements||[])];
  for(const item of current.replacements||[]) if(item.origin==="INDIVIDUAL_ABSENCE" && !merged.some(candidate=>candidate.id===item.id)) merged.push(item);
  const replacements=merged.filter(item=>item.origin!=="INDIVIDUAL_ABSENCE" || lessons.some(lesson=>absenceKey(lesson,item.studentId)===item.id && absenceState(lesson,item.studentId).replacementRight));
  for(const lesson of lessons) for(const [id,right] of Object.entries(lesson.absenceReplacementRights||{})) {
    if(!right) continue;
    const key=absenceKey(lesson,id);
    if(!replacements.some(item=>item.id===key)) replacements.push({id:key,origin:"INDIVIDUAL_ABSENCE",studentId:id,classId:lesson.classId,sourceLessonId:lesson.id,sourceDate:lesson.date,reason:"Falta individual com direito à reposição",status:"PENDING"});
  }
  return {...updated,replacements,absenceAudit:[...audit,...changes]};
}
