import type {KidsData,KidsLesson} from "@/types/kids";
import {homeKidsCard} from "./home-card";
import {kidsLessonClass} from "./class-history";
import {AbsenceError,reconcileAbsenceRights,absenceKey} from "./individual-absence";
import {recordCompletedReplacement,replacementRosterIsValid} from "./replacement-integrity";

export type HomeAttendanceCommand={
  request:Parameters<typeof homeKidsCard>[1];lessonId:string;studentId:string;
  target:"PRESENT"|"ABSENT";operationId:string;
};
export type HomeAttendanceAudit={
  operationId:string;lessonId:string;classId:string;studentId:string;date:string;
  before:"PRESENT"|"ABSENT"|"DEFAULT";after:"PRESENT"|"ABSENT"|"DEFAULT";
  replacementRightBefore:boolean;replacementRightAfter:boolean;recordedAt:string;origin:"HOME";
};
const state=(lesson:KidsLesson,id:string)=>lesson.attendance?.[id]||"DEFAULT";

// This explicit, single-student action never runs normalization or completes a class.
// A future/ongoing lesson returns to its operational default when a mistaken absence
// is removed. Only an ended lesson can receive a recorded PRESENT from this action.
export function applyHomeAttendance(data:KidsData,command:HomeAttendanceCommand,now=new Date().toISOString()){
  if(!command||!["PRESENT","ABSENT"].includes(command.target)||!command.request||
     !/^[a-zA-Z0-9-]{16,80}$/.test(command.operationId||""))throw new AbsenceError("INVALID_ACTION","Ação de chamada inválida.",400);
  const previous=data.homeAttendanceAudit||[];
  const replay=previous.find(item=>item.operationId===command.operationId);
  if(replay){
    if(replay.lessonId!==command.lessonId||replay.studentId!==command.studentId)throw new AbsenceError("ACTION_CONFLICT","Ação de chamada incompatível.");
    return {data,changed:false};
  }
  const card=homeKidsCard(data,command.request),student=card.students.find(item=>item.id===command.studentId);
  if(card.lessonId!==command.lessonId||!student?.canOpenAttendance)throw new AbsenceError("ATTENDANCE_CHANGED","A chamada mudou. Confira em Kids.");
  const current=data.lessons.find(item=>item.id===command.lessonId)!;
  const before=state(current,command.studentId);
  if(command.target==="ABSENT"&&before==="ABSENT")return {data,changed:false};
  // The green check is a correction, never a bulk/manual confirmation of defaults.
  if(command.target==="PRESENT"&&before!=="ABSENT")return {data,changed:false};
  const group=kidsLessonClass(data,current);
  const end=current.replacementEndTime||group?.endTime;
  const ended=Boolean(end&&new Date(`${current.date}T${end}:00-03:00`).getTime()<=new Date(now).getTime());
  const attendance={...current.attendance},rights={...current.absenceReplacementRights};
  if(command.target==="ABSENT")attendance[command.studentId]="ABSENT";
  else if(ended)attendance[command.studentId]="PRESENT";
  else delete attendance[command.studentId];
  delete rights[command.studentId];
  const lesson:KidsLesson={...current,attendance,absenceReplacementRights:rights,updatedAt:now};
  let next:KidsData={...data,lessons:data.lessons.map(item=>item.id===lesson.id?lesson:item),updatedAt:now};
  if(lesson.status==="COMPLETED"&&lesson.replacementStudentIds?.includes(command.studentId)){
    if(!ended||!replacementRosterIsValid(lesson))throw new AbsenceError("REPLACEMENT_REVIEW","Confira os participantes da reposição em Kids.");
    const reconciled=recordCompletedReplacement(next,lesson);
    const usageId=`replacement-usage:${lesson.id}:${command.studentId}`;
    const usage=reconciled.replacementUsages?.find(item=>item.id===usageId);
    next={...next,replacementUsages:[...(data.replacementUsages||[]).filter(item=>item.id!==usageId),...(usage?[usage]:[])]};
  }
  // Official credit protection rejects a reversal involving a used/scheduled credit.
  const reconciled=reconcileAbsenceRights(data,next,"DMP",now);
  const saved=reconciled.lessons.find(item=>item.id===lesson.id)!;
  const key=absenceKey(lesson,command.studentId);
  // Reuse official eligibility rules without normalizing unrelated records.
  next={...next,lessons:data.lessons.map(item=>item.id===lesson.id?saved:item)};
  if(data.replacements||reconciled.replacements?.some(item=>item.id===key))next.replacements=[...(data.replacements||[]).filter(item=>item.id!==key),...(reconciled.replacements||[]).filter(item=>item.id===key)];
  const creditAudit=(reconciled.absenceAudit||[]).slice(data.absenceAudit?.length||0).filter(item=>item.key===key);
  if(data.absenceAudit||creditAudit.length)next.absenceAudit=[...(data.absenceAudit||[]),...creditAudit];
  const audit:HomeAttendanceAudit={operationId:command.operationId,origin:"HOME",lessonId:lesson.id,classId:lesson.classId,studentId:command.studentId,date:lesson.date,before,after:state(saved,command.studentId),replacementRightBefore:Boolean(current.absenceReplacementRights?.[command.studentId]),replacementRightAfter:Boolean(saved.absenceReplacementRights?.[command.studentId]),recordedAt:now};
  return {data:{...next,homeAttendanceAudit:[...previous,audit]},changed:true};
}
