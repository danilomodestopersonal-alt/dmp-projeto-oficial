import type {KidsData, KidsLesson} from '@/types/kids';
import {kidsLessonClass} from './class-history';
import {KIDS_HOLIDAYS} from './calendar';

export type AutomaticAttendanceAudit = {
  id:string; lessonId:string; classId:string; date:string; dueAt:string;
  recordedAt:string; origin:'AUTOMATIC'; addedStudentIds:string[]; retainedAbsentIds:string[];
};
type Observation = {signature:string; dueAt:string; observedAt:string};
export type AttendanceJobState = {
  schema:1; activatedAt:string; lastRunAt?:string;
  observations:Record<string,Observation>;
  diagnostics:Array<{lessonId:string;date:string;code:string}>;
};
const timePattern=/^([01]\d|2[0-3]):[0-5]\d$/;
const datePattern=/^\d{4}-\d{2}-\d{2}$/;
const day=(date:string)=>new Date(date+'T12:00:00Z');
function validDate(date:string){return datePattern.test(date)&&Number.isFinite(day(date).getTime())&&day(date).toISOString().slice(0,10)===date;}

// The saved official Kids occurrence is the authority. Google is never written by this job.
// A pre-end observation is required: newly discovered historical lessons are not inferred.
export function consolidateKidsAttendance(data:KidsData, previous:AttendanceJobState|undefined, now:string){
  const instant=Date.parse(now);
  if(!Number.isFinite(instant)||data.version!==1||!Array.isArray(data.classes)||!Array.isArray(data.lessons))throw Error('KIDS_AUTO_INVALID_DATA');
  const state:AttendanceJobState=previous?structuredClone(previous):{schema:1,activatedAt:now,observations:{},diagnostics:[]};
  if(state.schema!==1||!Number.isFinite(Date.parse(state.activatedAt))||!state.observations)throw Error('KIDS_AUTO_INVALID_STATE');
  state.lastRunAt=now;state.diagnostics=[];
  const audits=[...(data.automaticAttendanceAudit||[])];
  const idCounts=new Map<string,number>(), occurrenceCounts=new Map<string,number>();
  for(const lesson of data.lessons){idCounts.set(lesson.id,(idCounts.get(lesson.id)||0)+1);if(lesson.kind!=='REPLACEMENT'){const key=JSON.stringify([lesson.classId,lesson.date]);occurrenceCounts.set(key,(occurrenceCounts.get(key)||0)+1);}}
  const blocked=(lesson:KidsLesson,code:string)=>{state.diagnostics.push({lessonId:lesson.id,date:lesson.date,code});return lesson;};
  let changed=false;
  const lessons=data.lessons.map(lesson=>{
    if(lesson.status!=='SCHEDULED'||KIDS_HOLIDAYS.has(lesson.date)) {delete state.observations[lesson.id];return lesson;}
    const group=kidsLessonClass(data,lesson);
    if(!validDate(lesson.date)||!group||!timePattern.test(group.startTime)||!timePattern.test(group.endTime)||group.endTime<=group.startTime)return blocked(lesson,'INVALID_SCHEDULE');
    // All supported dates are modern Brazil, UTC-03. Verify the civil day in Brasília.
    const dueAt=lesson.date+'T'+group.endTime+':00-03:00',due=Date.parse(dueAt);
    if(due<=Date.parse(state.activatedAt))return lesson; // activation is prospective, never backfill old history
    const occurrence=JSON.stringify([lesson.classId,lesson.date]);
    let reason='';
    if(idCounts.get(lesson.id)!==1||occurrenceCounts.get(occurrence)!==1||data.classes.filter(g=>g.id===lesson.classId).length!==1)reason='AMBIGUOUS_OCCURRENCE';
    else if(!group.active||group.id!==lesson.classId||group.weekday!==day(lesson.date).getUTCDay()||lesson.date<data.semesterStart||lesson.date>data.semesterEnd)reason='UNCONFIRMED_SCHEDULE';
    else if(lesson.kind==='REPLACEMENT'||lesson.replacementStudentIds?.length||lesson.replacementRosterLocked||lesson.replacementEligible||lesson.replacementStatus!=='NONE'||lesson.cancelReason||lesson.replacementStartTime||lesson.replacementEndTime||lesson.replacementCategory)reason='PROTECTED_OR_REPLACEMENT';
    else if(data.replacementUsages?.some(u=>u.lessonId===lesson.id)||data.replacements?.some(r=>r.destinationLessonId===lesson.id))reason='PROTECTED_OR_REPLACEMENT';
    else if(audits.some(a=>a.lessonId===lesson.id))reason='ALREADY_PROCESSED_MANUAL_STATE';
    const members=group.students.filter(s=>s.active&&(!s.startDate||s.startDate<=lesson.date));
    if(!reason&&(!members.length||new Set(group.students.map(s=>s.id)).size!==group.students.length||members.some(s=>!s.id||!s.name.trim()||(s.startDate&&!validDate(s.startDate)))))reason='INVALID_ROSTER';
    if(!reason&&Object.entries(lesson.attendance||{}).some(([id,status])=>!group.students.some(s=>s.id===id)||!['PRESENT','ABSENT'].includes(status)))reason='UNKNOWN_ATTENDANCE';
    if(!reason&&Object.entries(lesson.absenceReplacementRights||{}).some(([id,right])=>right&&lesson.attendance?.[id]!=='ABSENT'))reason='INCONSISTENT_RIGHT';
    if(reason){delete state.observations[lesson.id];return blocked(lesson,reason);}
    const signature=JSON.stringify([lesson.id,lesson.classId,lesson.date,group.category,group.weekday,group.startTime,group.endTime,members.map(s=>[s.id,s.startDate||'']).sort((a,b)=>a[0].localeCompare(b[0]))]);
    if(due>instant){state.observations[lesson.id]={signature,dueAt,observedAt:now};return lesson;}
    const observation=state.observations[lesson.id];
    if(!observation||Date.parse(observation.observedAt)>=due)return blocked(lesson,'NO_PRE_END_EVIDENCE');
    if(observation.signature!==signature)return blocked(lesson,'SCHEDULE_CHANGED_AFTER_END');
    const attendance={...lesson.attendance};const addedStudentIds:string[]=[];
    for(const student of members)if(!Object.hasOwn(attendance,student.id)){attendance[student.id]='PRESENT';addedStudentIds.push(student.id);}
    audits.push({id:JSON.stringify(['kids-auto-v1',lesson.id,lesson.classId,lesson.date]),lessonId:lesson.id,classId:lesson.classId,date:lesson.date,dueAt,recordedAt:now,origin:'AUTOMATIC',addedStudentIds,retainedAbsentIds:Object.keys(attendance).filter(id=>attendance[id]==='ABSENT')});
    changed=true;delete state.observations[lesson.id];
    return {...lesson,status:'COMPLETED' as const,attendance,classSnapshot:lesson.classSnapshot||structuredClone(group),updatedAt:now};
  });
  for(const id of Object.keys(state.observations))if(!data.lessons.some(l=>l.id===id))delete state.observations[id];
  return {data:changed?{...data,lessons,automaticAttendanceAudit:audits,updatedAt:now}:data,state,changed};
}
