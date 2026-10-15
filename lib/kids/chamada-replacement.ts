import type { KidsData, KidsLesson, KidsStudent } from '@/types/kids';
import { AbsenceError } from './individual-absence';
import { recordCompletedReplacement, replacementRosterIsValid } from './replacement-integrity';

export function addChamadaReplacement(lesson:KidsLesson, student:KidsStudent, regularIds:string[]):KidsLesson {
 if(!['SCHEDULED','COMPLETED'].includes(lesson.status))throw new AbsenceError('ROSTER_STATUS','Aula cancelada ou feriado não recebe reposição.');
 if(!student.active)throw new AbsenceError('ROSTER_STUDENT','Selecione um aluno ativo do cadastro Kids do DMP.');
 const ids=lesson.replacementStudentIds||[];
 if(regularIds.includes(student.id)||ids.includes(student.id))throw new AbsenceError('ROSTER_DUPLICATE','Este aluno já está na chamada.');
 return {...lesson,replacementStudentIds:[...ids,student.id],replacementCapacity:ids.length+1,attendance:{...lesson.attendance,[student.id]:'PRESENT'}};
}
export function removeChamadaReplacement(lesson:KidsLesson,studentId:string):KidsLesson {
 if(lesson.absenceReplacementRights?.[studentId])throw new AbsenceError('ROSTER_RIGHT','Esta falta tem direito à reposição. Confira esse direito antes de corrigir a inclusão.');
 const attendance={...lesson.attendance},rights={...lesson.absenceReplacementRights};delete attendance[studentId];delete rights[studentId];
 const ids=(lesson.replacementStudentIds||[]).filter(id=>id!==studentId);
 return {...lesson,replacementStudentIds:ids,replacementCapacity:ids.length,attendance,absenceReplacementRights:rights};
}
const ids=(lesson:KidsLesson)=>lesson.replacementStudentIds||[];
const same=(a:string[],b:string[])=>a.length===b.length&&a.every(id=>b.includes(id));

/** Reconcilia somente mudanças de participantes de reposição em chamadas regulares. */
export function reconcileChamadaReplacements(current:KidsData,submitted:KidsData,now=new Date().toISOString()):KidsData {
 let next=submitted;
 const audit=[...(current.replacementRosterAudit||[])];
 for(const lesson of submitted.lessons){
  const old=current.lessons.find(item=>item.id===lesson.id);
  if(!old||old.kind==='REPLACEMENT'||lesson.kind==='REPLACEMENT'||same(ids(old),ids(lesson)))continue;
  if(lesson.classId!==old.classId||lesson.date!==old.date||!['SCHEDULED','COMPLETED'].includes(lesson.status)||!['SCHEDULED','COMPLETED'].includes(old.status))throw new AbsenceError('ROSTER_STATUS','A inclusão ou correção exige a mesma aula agendada ou realizada.');
  if(old.status==='COMPLETED'&&lesson.status!==old.status)throw new AbsenceError('ROSTER_STATUS','A correção de participantes não pode reabrir a aula.');
  if(new Set(ids(lesson)).size!==ids(lesson).length||!replacementRosterIsValid(lesson))throw new AbsenceError('ROSTER_INVALID','Confira os participantes e a presença ou falta de cada reposição.');
  const group=current.classes.find(item=>item.id===old.classId);
  if(!group)throw new AbsenceError('ROSTER_CLASS','Turma da chamada não encontrada.');
  const regularIds=group.students.filter(s=>s.active&&(!s.startDate||s.startDate<=old.date)).map(s=>s.id);
  const added=ids(lesson).filter(id=>!ids(old).includes(id)),removed=ids(old).filter(id=>!ids(lesson).includes(id));
  for(const id of added){
   const registered=current.classes.some(g=>g.active&&g.students.some(s=>s.id===id&&s.active&&(!s.startDate||s.startDate<=old.date)));
   if(!registered||regularIds.includes(id))throw new AbsenceError('ROSTER_STUDENT','Selecione um aluno Kids do DMP que ainda não esteja na chamada.');
  }
  for(const id of removed)if(old.absenceReplacementRights?.[id])throw new AbsenceError('ROSTER_RIGHT','Há direito de reposição nesta falta. Confira o vínculo antes de corrigir a inclusão.');
  // O consumo é o já existente no DMP: lista da ocorrência + uso determinístico.
  // Em correção por engano, remove o uso ativo e conserva a alteração na auditoria.
  next={...next,replacementUsages:[...(next.replacementUsages||[]).filter(u=>u.lessonId!==lesson.id),...(current.replacementUsages||[]).filter(u=>u.lessonId===lesson.id&&!removed.includes(u.studentId))],replacements:(next.replacements||[]).map(r=>r.destinationLessonId===lesson.id&&removed.includes(r.studentId)?{...r,status:'PENDING' as const,destinationLessonId:undefined,scheduledDate:undefined,completedDate:undefined,attendance:undefined}:r)};
  if(lesson.status==='COMPLETED')next=recordCompletedReplacement(next,lesson);
  audit.push({lessonId:lesson.id,date:lesson.date,added,removed,before:[...ids(old)],after:[...ids(lesson)],recordedAt:now});
 }
 return audit.length?{...next,replacementRosterAudit:audit}:next;
}

/** Confirma uma gravação cuja resposta se perdeu, sem repetir o PUT. */
export function chamadaSaveMatches(requested:KidsLesson,remote?:KidsLesson):boolean {
 if(!remote)return false;
 const generated=new Set(['replacementOriginalStudentIds','replacementRosterLocked','replacementIntegrityVersion','replacementCapacity']);
 const stable=(value:unknown):string=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.entries(item).sort(([a],[b])=>a.localeCompare(b))):item);
 return Object.entries(requested).every(([key,value])=>generated.has(key)||stable(value)===stable(remote[key as keyof KidsLesson]));
}
