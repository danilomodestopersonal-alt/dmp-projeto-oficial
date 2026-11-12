import type { KidsCategory, KidsData, KidsExternalReplacement, KidsExternalReplacementAudit, KidsStudent } from '@/types/kids';
import { computeKidsStudentReplacementBalance, KIDS_REPLACEMENT_BALANCE_START } from './replacement-balance';
import { kidsLessonClass } from './class-history';

export const externalCategoryLabels:Record<KidsCategory,string>={RED:'Vermelha',ORANGE:'Laranja',GREEN:'Verde',YELLOW:'Amarela'};
const PREFIX='external-replacement:';
export const externalUsageRef=(id:string)=>PREFIX+id;
export class ExternalReplacementError extends Error {
  constructor(public code:string,message:string,public status=409){super(message);}
}
export type ExternalCommand={action:'create'|'update'|'void';operationId:string;recordId?:string;revision?:number;studentId?:string;date?:string;time?:string;teacher?:string;category?:KidsCategory;notes?:string};
export function saoPauloDay(now=new Date()) { return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(now); }
export function externalStudents(data:KidsData):KidsStudent[] {
  const students=new Map<string,KidsStudent>();
  for(const group of data.classes)for(const student of group.students)students.set(student.id,student);
  return [...students.values()].sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
}
const fail=(code:string,message:string,status=409):never=>{throw new ExternalReplacementError(code,message,status);};
const text=(v:unknown,max:number,field:string,required=false)=>{
  if(v!=null&&typeof v!=='string')fail('INVALID',`Confira ${field}.`,400);
  const s=String(v||'').trim();if(s.length>max||required&&!s)fail('INVALID',`Preencha ${field} corretamente.`,400);return s;
};
export function normalizeExternalCommand(raw:ExternalCommand):ExternalCommand {
  if(!raw||!['create','update','void'].includes(raw.action))fail('ACTION','Operação inválida.',400);
  if(typeof raw.operationId!=='string'||! /^[a-zA-Z0-9_-]{16,100}$/.test(raw.operationId))fail('OPERATION','Identificação da operação inválida.',400);
  const base:ExternalCommand={action:raw.action,operationId:raw.operationId};
  if(raw.action!=='create'){
    base.recordId=text(raw.recordId,100,'o lançamento',true);
    if(!Number.isInteger(raw.revision)||Number(raw.revision)<1)fail('REVISION','Atualize o lançamento antes de corrigir.',409);
    base.revision=raw.revision;
  }
  if(raw.action==='void')return base;
  const date=text(raw.date,10,'a data',true),time=text(raw.time,5,'o horário');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T12:00:00Z'))||new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date)fail('DATE','Informe uma data válida.',400);
  if(time&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))fail('TIME','Informe um horário válido.',400);
  if(!Object.hasOwn(externalCategoryLabels,raw.category||''))fail('CATEGORY','Selecione uma categoria Kids.',400);
  return {...base,...(raw.action==='create'?{studentId:text(raw.studentId,160,'o aluno',true)}:{}),date,time,teacher:text(raw.teacher,100,'o professor',true),category:raw.category,notes:text(raw.notes,800,'a observação')};
}
const summary=(data:KidsData,id:string,today:string)=>{
  const {due,replaced,balance}=computeKidsStudentReplacementBalance(data,id,today);return {due,replaced,balance};
};
/** Same student/date/time cannot be consumed again through either attendance path. */
function assertNotDuplicate(data:KidsData,record:KidsExternalReplacement){
  const ref=externalUsageRef(record.id);
  const candidates=new Map<string,string>();
  for(const item of data.externalReplacements||[])if(item.status==='ACTIVE'&&item.id!==record.id&&item.studentId===record.studentId&&item.date===record.date)candidates.set(externalUsageRef(item.id),item.time);
  for(const lesson of data.lessons){
    if(lesson.date!==record.date||['CANCELLED','HOLIDAY'].includes(lesson.status)||!(lesson.replacementStudentIds||[]).includes(record.studentId))continue;
    candidates.set(lesson.id,lesson.replacementStartTime||kidsLessonClass(data,lesson)?.startTime||'');
  }
  for(const usage of data.replacementUsages||[]){
    if(usage.studentId!==record.studentId||usage.date!==record.date||usage.lessonId===ref||candidates.has(usage.lessonId))continue;
    const lesson=data.lessons.find(l=>l.id===usage.lessonId);
    candidates.set(usage.lessonId,lesson?.replacementStartTime||(lesson?kidsLessonClass(data,lesson)?.startTime:'')||'');
  }
  for(const item of data.replacements||[]){
    if(item.studentId!==record.studentId||item.status==='PENDING'||(item.completedDate||item.scheduledDate)!==record.date)continue;
    const id=item.destinationLessonId||item.id;if(candidates.has(id))continue;
    const lesson=data.lessons.find(l=>l.id===id);
    candidates.set(id,lesson?.replacementStartTime||(lesson?kidsLessonClass(data,lesson)?.startTime:'')||'');
  }
  for(const [id,time]of candidates)if(!record.time||!time||record.time===time)fail('DUPLICATE',`Já existe reposição para este aluno em ${record.date.split('-').reverse().join('/')}${time?' às '+time:''}. Confira o lançamento ou a chamada antes de registrar novamente. Se foram aulas diferentes, informe os horários de ambas. Referência: ${id}`);
}
export function planExternalReplacement(data:KidsData,raw:ExternalCommand,now=new Date()) {
  const command=normalizeExternalCommand(raw),requestKey=JSON.stringify(command),today=saoPauloDay(now),stamp=now.toISOString();
  const previous=(data.externalReplacementAudit||[]).find(a=>a.operationId===command.operationId);
  if(previous){
    if(previous.requestKey!==requestKey)fail('REPLAY_CONFLICT','Esta identificação já foi usada em outra operação. Atualize a tela.');
    return {data,audit:previous,replay:true,outsidePeriod:false};
  }
  const old=command.action==='create'?null:(data.externalReplacements||[]).find(r=>r.id===command.recordId)||null;
  if(command.action!=='create'&&(!old||old.status!=='ACTIVE'||old.revision!==command.revision))fail('STALE_RECORD','O lançamento foi alterado ou desfeito. Atualize a lista.');
  const studentId=old?.studentId||command.studentId!;
  const student=externalStudents(data).find(s=>s.id===studentId);
  if(!student&&command.action!=='void')fail('STUDENT','Aluno não encontrado no cadastro Kids.',400);
  const after:KidsExternalReplacement=command.action==='void'?{...old!,status:'VOID',revision:old!.revision+1,updatedAt:stamp}:{
    id:old?.id||command.operationId,studentId,studentName:student!.name,date:command.date!,time:command.time!,teacher:command.teacher!,category:command.category!,notes:command.notes!,
    status:'ACTIVE',revision:(old?.revision||0)+1,createdAt:old?.createdAt||stamp,updatedAt:stamp,
  };
  if(command.action!=='void'){
    if(after.date>today||after.time&&new Date(`${after.date}T${after.time}:00-03:00`)>now)fail('FUTURE','Registre somente uma reposição que já aconteceu.',400);
    if(after.date<'2000-01-01')fail('DATE','Confira a data da reposição.',400);
    assertNotDuplicate(data,after);
  }
  const ref=externalUsageRef(after.id),usageId='replacement-usage:'+ref;
  if(data.lessons.some(l=>l.id===ref))fail('IDENTITY','A referência está em conflito. Nenhum registro foi alterado.');
  const owned=(data.replacementUsages||[]).filter(u=>u.lessonId===ref||u.id===usageId);
  if(old&&(owned.length!==1||owned[0].studentId!==old.studentId||owned[0].date!==old.date||owned[0].id!==usageId||owned[0].lessonId!==ref||owned[0].attendance!=='PRESENT'))fail('LEDGER_CONFLICT','O registro de consumo está divergente. Confira o histórico antes de corrigir.');
  if(!old&&owned.length)fail('IDENTITY','Identificação já utilizada. Atualize a tela.');
  const usages=(data.replacementUsages||[]).filter(u=>u.lessonId!==ref);
  if(after.status==='ACTIVE')usages.push({id:usageId,lessonId:ref,studentId,date:after.date,attendance:'PRESENT',recordedAt:after.createdAt});
  const next:KidsData={...data,externalReplacements:[...(data.externalReplacements||[]).filter(r=>r.id!==after.id),after],replacementUsages:usages,updatedAt:stamp};
  const audit:KidsExternalReplacementAudit={operationId:command.operationId,requestKey,action:command.action,recordId:after.id,before:old,after,balanceBefore:summary(data,studentId,today),balanceAfter:summary(next,studentId,today),recordedAt:stamp};
  next.externalReplacementAudit=[...(data.externalReplacementAudit||[]),audit];
  return {data:next,audit,replay:false,outsidePeriod:after.date<(data.semesterStart>KIDS_REPLACEMENT_BALANCE_START?data.semesterStart:KIDS_REPLACEMENT_BALANCE_START)};
}
/** Old/general clients cannot forge or erase this server-owned record or consumption. */
export function preserveExternalReplacements(current:KidsData|null,submitted:KidsData):KidsData {
  const next={...submitted};
  if(current?.externalReplacements)next.externalReplacements=current.externalReplacements;else delete next.externalReplacements;
  if(current?.externalReplacementAudit)next.externalReplacementAudit=current.externalReplacementAudit;else delete next.externalReplacementAudit;
  // Follow the registry's existing canonical-ID normalization after a name change.
  // Accept only the server-derived alias, not arbitrary client reassignment.
  const aliases=new Map<string,string>();
  if(current)for(const group of current.classes)for(const student of group.students){
    const canonical='kid-'+student.name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'');
    if(student.id!==canonical&&!submitted.classes.some(g=>g.students.some(s=>s.id===student.id))&&submitted.classes.some(g=>g.students.some(s=>s.id===canonical&&s.name===student.name)))aliases.set(student.id,canonical);
  }
  if(next.externalReplacements&&aliases.size)next.externalReplacements=next.externalReplacements.map(r=>({...r,studentId:aliases.get(r.studentId)||r.studentId}));
  const owned=(u:{lessonId:string;id:string})=>u.lessonId.startsWith(PREFIX)||u.id.startsWith('replacement-usage:'+PREFIX);
  const input=next.replacementUsages||[],saved=current?.replacementUsages||[];
  if(input.some(owned)||saved.some(owned))next.replacementUsages=[...input.filter(u=>!owned(u)),...saved.filter(owned).map(u=>({...u,studentId:aliases.get(u.studentId)||u.studentId}))];
  // Prevent a second consumption via a regular/standalone lesson after an external entry.
  if(current)for(const record of next.externalReplacements||[])if(record.status==='ACTIVE'){
    const withoutOwn={...next,externalReplacements:(next.externalReplacements||[]).filter(r=>r.id!==record.id),replacementUsages:(next.replacementUsages||[]).filter(u=>u.lessonId!==externalUsageRef(record.id))};
    assertNotDuplicate(withoutOwn,record);
  }
  return next;
}
