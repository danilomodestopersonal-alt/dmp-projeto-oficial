import { KIDS_HOLIDAYS } from "./calendar";
import type { KidsClass, KidsData, KidsLesson } from '@/types/kids';
import { AbsenceError } from './errors';
import { getKidsPedagogicalPlan, formatKidsPlan } from './pedagogy';

export type KidsClassChange={group:KidsClass;effectiveFrom:string};
export function classDefinition(group:KidsClass):Omit<KidsClass,'history'> { const {history:_,...definition}=structuredClone(group);return definition; }
export function kidsClassAt(group:KidsClass,date:string):KidsClass {
 const revision=[...(group.history||[])].sort((a,b)=>a.from.localeCompare(b.from)).filter(item=>item.from<=date).at(-1);
 return revision?{...structuredClone(revision.value),history:group.history}:group;
}
export function kidsLessonClass(data:Pick<KidsData,'classes'>,lesson:KidsLesson):KidsClass|undefined {
 const group=data.classes.find(item=>item.id===lesson.classId);
 return lesson.classSnapshot|| (group?kidsClassAt(group,lesson.date):undefined);
}
export function kidsClassMemberships(group:KidsClass,studentId:string){
 if(!group.history?.length)return group.students.filter(s=>s.id===studentId&&s.active).map(student=>({student,from:student.startDate||'0001-01-01',to:'9999-12-31'}));
 const versions=[...group.history].sort((a,b)=>a.from.localeCompare(b.from));
 return versions.flatMap((version,i)=>version.value.students.filter(s=>s.id===studentId&&s.active).map(student=>({student,from:[version.from,student.startDate||'0001-01-01'].sort().at(-1)!,to:versions[i+1]?.from||'9999-12-31'})));
}
const day=(date:Date)=>date.toISOString().slice(0,10);
const nextDate=(date:string)=>day(new Date(Date.parse(date+'T12:00:00Z')+86400000));
const clean=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
function untouched(lesson:KidsLesson){return lesson.status==='SCHEDULED'&&!Object.keys(lesson.attendance||{}).length&&!lesson.replacementStudentIds?.length&&!lesson.actualPlan&&!lesson.notes&&!lesson.image&&!Object.values(lesson.absenceReplacementRights||{}).some(Boolean);}
export function applyKidsClassChange(data:KidsData,change:KidsClassChange,today:string):KidsData {
 const old=data.classes.find(g=>g.id===change.group.id),from=change.effectiveFrom;
 if(!old||!/^\d{4}-\d{2}-\d{2}$/.test(from)||(!Number.isFinite(Date.parse(from+'T12:00:00Z'))||day(new Date(from+'T12:00:00Z'))!==from)||from<=today||from>data.semesterEnd)throw new AbsenceError('CLASS_EFFECTIVE','Escolha uma data futura dentro do semestre. Chamadas antigas não serão alteradas.');
 if(old.history?.some(v=>v.from>=from))throw new AbsenceError('CLASS_EFFECTIVE','Já há uma alteração nesta data ou depois dela. Escolha uma vigência posterior à última alteração.');
 const next=classDefinition(change.group);
 if(!next.name.trim()||!next.teacher.trim()||!Number.isInteger(next.weekday)||next.weekday<0||next.weekday>6||!/^([01]\d|2[0-3]):[0-5]\d$/.test(next.startTime)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(next.endTime)||next.endTime<=next.startTime||!['RED','ORANGE','GREEN','YELLOW'].includes(next.category))throw new AbsenceError('CLASS_FIELDS','Confira nome, professor, dia, categoria e horários de início/fim.');
 const official=new Map(data.classes.flatMap(g=>g.students).map(s=>[s.id,s]));
 if(new Set(next.students.map(s=>s.id)).size!==next.students.length||next.students.some(s=>!official.has(s.id)))throw new AbsenceError('CLASS_STUDENT','Selecione crianças do cadastro Kids existente.');
 // Only memberships change here; student profiles are managed by their existing editor.
 next.students=next.students.map(s=>({...official.get(s.id)!,active:s.active,startDate:s.startDate}));
 const history=old.history?.length?structuredClone(old.history):[{from:'0001-01-01',value:classDefinition(old)}];
 history.push({from,value:next});const versioned:KidsClass={...next,history};
 const kept=data.lessons.filter(l=>l.classId!==old.id||l.kind==='REPLACEMENT'||l.date<from||!untouched(l)).map(l=>l.classId===old.id&&l.kind!=='REPLACEMENT'&&l.date>=from?{...l,classSnapshot:kidsLessonClass(data,l)}:l);
 const lessonDates=new Set(kept.filter(l=>l.classId===old.id&&l.kind!=='REPLACEMENT').map(l=>l.date));
 const generated:KidsLesson[]=[];
 for(let date=from;date<=data.semesterEnd;date=nextDate(date)){
  if(new Date(date+'T12:00:00Z').getUTCDay()!==next.weekday||lessonDates.has(date))continue;
  const conflict=kept.some(l=>l.classId!==old.id&&l.date===date&&l.status!=='CANCELLED'&&l.status!=='HOLIDAY'&&(()=>{const g=kidsLessonClass(data,l);return g&&clean(g.teacher)===clean(next.teacher)&&g.startTime<next.endTime&&g.endTime>next.startTime;})());
  if(conflict)throw new AbsenceError('CLASS_CONFLICT','O professor já possui outra aula nesse horário em '+date+'. Nenhuma alteração foi salva.');
  const previous=data.lessons.find(l=>l.classId===old.id&&l.kind!=='REPLACEMENT'&&l.date===date);
  const plan=getKidsPedagogicalPlan(next.category,date);
  generated.push({...previous,id:previous?.id||`lesson-${old.id}-${date}`,classId:old.id,date,status:KIDS_HOLIDAYS.has(date)?'HOLIDAY':'SCHEDULED',attendance:{},absenceReplacementRights:{},objective:previous?.objective||plan?.objective||'',theme:previous?.theme||plan?.theme||'',pedagogicalFocus:previous?.pedagogicalFocus||plan?.focus||'',stations:previous?.stations||plan?.stations||[],teacherTip:previous?.teacherTip||plan?.tip||'',plannedPlan:previous?.plannedPlan||(plan?formatKidsPlan(plan):''),actualPlan:'',notes:'',replacementEligible:false,replacementStatus:'NONE',kind:'REGULAR',updatedAt:next.updatedAt});
 }
 return {...data,classes:data.classes.map(g=>g.id===old.id?versioned:g),lessons:[...kept,...generated].sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id))};
}

export function kidsClassChangeConfirmed(data:KidsData,change:KidsClassChange){
 const saved=data.classes.find(group=>group.id===change.group.id)?.history?.find(item=>item.from===change.effectiveFrom)?.value;
 if(!saved||saved.updatedAt!==change.group.updatedAt)return false;
 return ['name','teacher','weekday','startTime','endTime','category'].every(key=>saved[key as keyof typeof saved]===change.group[key as keyof KidsClass])&&JSON.stringify(saved.students.map(s=>[s.id,s.active,s.startDate||'']).sort())===JSON.stringify(change.group.students.map(s=>[s.id,s.active,s.startDate||'']).sort());
}

// The existing student registry edits profiles/membership, never the versioned timetable.
export function mergeKidsStudentRegistryGroup(raw:KidsClass,edited:KidsClass,date:string):KidsClass {
 if(!raw.history?.length)return edited;
 const visible=kidsClassAt(raw,date);
 const before=new Map(visible.students.map(s=>[s.id,s]));
 const after=new Map(edited.students.map(s=>[s.id,s]));
 const merge=(members:KidsClass['students'])=>{
  const result=members.map(student=>{
   const next=after.get(student.id),previous=before.get(student.id);
   if(!next)return student;
   // A planned removal/addition stays intact unless the registry explicitly changes it.
   return {...student,...next,active:previous&&previous.active===next.active?student.active:next.active,startDate:previous&&previous.startDate===next.startDate?student.startDate:next.startDate};
  });
  for(const student of edited.students)if(!before.has(student.id)&&!result.some(s=>s.id===student.id))result.push({...student});
  return result;
 };
 const history=raw.history.map(version=>({...version,value:{...version.value,students:merge(version.value.students)}}));
 return {...raw,students:merge(raw.students),history,updatedAt:edited.updatedAt};
}
