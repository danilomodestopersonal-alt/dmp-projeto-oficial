import type {Student,CalendarEvent} from '@/types/models';
import type {KidsData} from '@/types/kids';
import {validDate,saoPauloDate} from '@/lib/students/lifecycle';
import {kidsLessonClass} from '@/lib/kids/class-history';
import {homeKidsCard} from '@/lib/kids/home-card';
import {projectHomeKidsEvents} from '@/lib/kids/home-calendar';
import {taughtBySubstitute} from '@/lib/kids/personal-teaching';
import {isKidsFifthMonthlyLesson} from '@/lib/kids/replacement-balance';
import {kidsCalendarRequest,normalizeName} from '@/lib/widget/home-source';
import {buildMaintenancePlan,assertPersonal,mappedPersonal,maintenanceHash,executeMaintenance,MaintenanceError,type MaintenanceApi,type MaintenancePlan,type MaintenanceJournal,type MaintenanceStep} from './personal-maintenance';
type Event=Record<string,any>;
export type AgendaCommand={kind:'personal-day';date:string;selection:{id:string;etag:string}[];reason:string}|{kind:'kids-substitute';lessonId:string;teacherName?:string};
export type AgendaPlan={command:AgendaCommand;maintenance:MaintenancePlan;binding?:string;lessonId?:string;date:string;label:string;students:string[]};
export type AgendaJournal={operationId:string;digest:string;createdAt:string;plan:AgendaPlan;maintenance:MaintenanceJournal;errors:Record<string,string>;done?:boolean};
function fail(s:string):never{throw new MaintenanceError(s);}
const day=86400000,at=(d:string,t:string)=>d+'T'+t+':00-03:00';
export function agendaCommand(input:any):AgendaCommand{
 if(input?.kind==='personal-day'){
  if(!validDate(input.date)||typeof input.reason!=='string'||input.reason.trim().length>500||!Array.isArray(input.selection)||!input.selection.length||input.selection.length>80||new Set(input.selection.map((s:any)=>s?.id)).size!==input.selection.length)fail('Escolha a data e de 1 a 80 aulas diferentes.');
  if(input.selection.some((s:any)=>typeof s?.id!=='string'||!s.id||s.id.length>1024||typeof s?.etag!=='string'||!s.etag||s.etag.length>512))fail('Atualize a lista de aulas.');
  return {kind:input.kind,date:input.date,reason:input.reason.trim(),selection:input.selection.map((s:any)=>({id:s.id,etag:s.etag})).sort((a:any,b:any)=>a.id.localeCompare(b.id))};
 }
 if(input?.kind==='kids-substitute'&&typeof input.lessonId==='string'&&input.lessonId&&input.lessonId.length<=256&&(!input.teacherName||typeof input.teacherName==='string'&&input.teacherName.trim().length<=120))return {kind:input.kind,lessonId:input.lessonId,...(input.teacherName?.trim()?{teacherName:input.teacherName.trim()}:{})};
 fail('Pedido de agenda inválido.');
}
function future(event:Event,students:Student[],date:string,now:string){
 if(!event.start?.dateTime||!event.end?.dateTime||event.recurrence?.length||saoPauloDate(new Date(event.start.dateTime))!==date||Date.parse(event.start.dateTime)<=Date.parse(now))fail('A aula já começou ou não pertence à data selecionada. O histórico foi preservado.');
 if(students.some(s=>s.sessions?.some(x=>x.calendarEvent?.id===event.id||x.calendarEvent&&'recurringEventId' in x.calendarEvent&&x.calendarEvent.recurringEventId&&x.calendarEvent.recurringEventId===event.recurringEventId&&x.date===date)))fail('A aula possui presença, falta ou treino registrado.');
}
function peopleProof(event:Event,parent:Event|undefined,students:Student[]){
 assertPersonal(event,parent,students);
 const mapped=mappedPersonal(event,parent,students),ids=mapped.matchedStudentIds||[];
 if(!ids.length)fail('A aula não possui alunos identificados.');
 const title=' '+normalizeName(event.summary||'')+' ';
 for(const id of ids){const s=students.find(s=>s.id===id)!;const parts=normalizeName(s.name).split(' '),roster=mapped.calendarRoster;
  const explicit=roster?.single?.ids.includes(id)||roster?.rules.some(r=>r.ids.includes(id)||r.add.includes(id));
  const unique=parts[0]?.length>=3&&students.filter(n=>normalizeName(n.name).split(' ')[0]===parts[0]).length===1;
  if(!explicit&&!title.includes(' '+parts.join(' ')+' ')&&!title.includes(' '+parts[0]+' '+parts.at(-1)+' ')&&!(unique&&title.includes(' '+parts[0]+' ')))fail('A identificação dos alunos precisa de conferência individual.');
 }
 return ids;
}
export async function personalDay(date:string,students:Student[],api:MaintenanceApi,now=new Date().toISOString(),kids:KidsData|null=null){
 if(!validDate(date)||date<saoPauloDate(new Date(now)))fail('Escolha hoje ou uma data futura.');
 const events=await api.list({singleEvents:'true',showDeleted:'false',timeMin:at(date,'00:00'),timeMax:new Date(Date.parse(at(date,'00:00'))+day).toISOString()}),rows=[];
 const projected=projectHomeKidsEvents(events.filter(e=>e.start?.dateTime).map(e=>({id:e.id,summary:e.summary||'',start:e.start.dateTime,end:e.end?.dateTime||e.start.dateTime,recurringEventId:e.recurringEventId,originalStartTime:e.originalStartTime?.dateTime})),kids,date);
 const kidsIds=new Set(projected.filter(e=>e.kidsLesson||kidsCalendarRequest(e)).map(e=>e.id));
 for(const e of events){
  if(!e.start?.dateTime||saoPauloDate(new Date(e.start.dateTime))!==date||kidsIds.has(e.id))continue;
  const parent=e.recurringEventId?await api.read(e.recurringEventId):undefined;
  let ids:string[];try{ids=peopleProof(e,parent,students);}catch{continue;}
  let blocked='';try{if(e.recurringEventId&&!parent)fail('Série indisponível.');future(e,students,date,now);}catch(error){blocked=(error as Error).message;}
  rows.push({id:e.id,etag:e.etag,start:e.start.dateTime,end:e.end.dateTime,label:e.summary,students:ids.map(id=>students.find(s=>s.id===id)!.name),blocked});
 }
 return rows.sort((a,b)=>a.start.localeCompare(b.start)||a.id.localeCompare(b.id));
}
export function kidsBinding(data:KidsData,id:string){
 const l=data?.lessons.find(l=>l.id===id),g=l&&kidsLessonClass(data,l);if(!l||!g)fail('Aula Kids não encontrada.');
 const start=l!.replacementStartTime||g!.startTime,end=l!.replacementEndTime||g!.endTime,category=l!.replacementCategory||g!.category;
 const binding={lessonId:l!.id,classId:l!.classId,date:l!.date,start,end,category,status:l!.status==='CANCELLED'||l!.status==='HOLIDAY'?l!.status:'OPEN'};
 return {lesson:l!,group:g!,...binding,hash:maintenanceHash(binding)};
}
export async function buildAgendaPlan(command:AgendaCommand,students:Student[],kids:KidsData|null,api:MaintenanceApi,now=new Date().toISOString()):Promise<AgendaPlan>{
 const steps:MaintenanceStep[]=[],maintenance:MaintenancePlan={command:{kind:'repair-batch',selection:[]},steps,kept:[],excluded:[],description:''};
 if(command.kind==='personal-day'){
  const rows=await personalDay(command.date,students,api,now,kids),names=[];
  for(const selected of command.selection){const row=rows.find(r=>r.id===selected.id);if(!row||row.blocked||row.etag!==selected.etag)fail(row?.blocked||'Uma aula mudou ou não é Personal. Confira novamente.');
   const e=await api.read(row.id),parent=e?.recurringEventId?await api.read(e.recurringEventId):undefined;if(!e)fail('Aula indisponível.');future(e!,students,command.date,now);const ids=peopleProof(e!,parent,students);
   const plan=await buildMaintenancePlan({kind:'roster',id:row.id,etag:row.etag,expected:ids,scope:'single'},students,api,{national:true,state:true,city:true},now);steps.push(...plan.steps);names.push(...row.students);
  }
  maintenance.description='Cancelamento Personal · '+command.date;return {command,maintenance,date:command.date,label:maintenance.description,students:[...new Set(names)]};
 }
 if(!kids)fail('Cadastro Kids indisponível.');const k=kidsBinding(kids!,command.lessonId);
 if(taughtBySubstitute(k.lesson))fail('Esta aula já está registrada com professor substituto.');
 if(!['SCHEDULED','COMPLETED'].includes(k.lesson.status)||k.group.active===false||Date.parse(at(k.date,k.end))<=Date.parse(now))fail('Escolha uma aula Kids válida que ainda não terminou.');
 const events=await api.list({singleEvents:'true',showDeleted:'false',timeMin:at(k.date,'00:00'),timeMax:new Date(Date.parse(at(k.date,'00:00'))+day).toISOString()});
 const dto=events.filter(e=>e.start?.dateTime).map(e=>({id:e.id,summary:e.summary||'',start:e.start.dateTime,end:e.end?.dateTime||'',recurringEventId:e.recurringEventId,originalStartTime:e.originalStartTime?.dateTime} as CalendarEvent));
 const projected=projectHomeKidsEvents(dto,kids!,k.date),matches=projected.filter(e=>{const req=e.kidsLesson||kidsCalendarRequest(e);return req&&homeKidsCard(kids,req).lessonId===k.lessonId;});
 if(matches.length>1)fail('Mais de uma ocorrência Google corresponde à aula Kids. Confira o vínculo individual antes de prosseguir.');
 if(!matches.length&&k.lesson.kind!=='REPLACEMENT'&&!isKidsFifthMonthlyLesson(kids!,k.lesson))fail('Não foi identificado um vínculo único com a agenda Google. Abra a ocorrência correta; a turma foi preservada.');
 for(const match of matches){const e=events.find(e=>e.id===match.id)!,parent=e.recurringEventId?await api.read(e.recurringEventId):undefined;
  const linked=Boolean(match.kidsLesson);if(!linked&&!/\b(kids|bola|tenis)\b/.test(normalizeName(e.summary||'')))fail('O título não identifica uma aula Kids com segurança.');
  for(const x of [e,...(parent?[parent]:[])])if(!x.etag||x.status==='cancelled'||x.organizer?.self!==true||x.locked||x.start?.date||x.eventType&&x.eventType!=='default'||(x.attendees||[]).some((a:any)=>!a.self))fail('A ocorrência não é exclusiva da agenda pessoal. A turma e o evento foram preservados.');
  if(e.recurrence?.length||e.recurringEventId&&!parent||Date.parse(match.end)!==Date.parse(at(k.date,k.end))||Date.parse(match.start)!==Date.parse(at(k.date,k.start)))fail('O vínculo ou horário Kids mudou. Confira a ocorrência.');
  steps.push({before:e,parent,body:{status:'cancelled'},start:e.start.dateTime,label:e.summary});
 }
 maintenance.description='Professor substituto · '+k.group.name+' · '+k.date;
 return {command,maintenance,date:k.date,label:maintenance.description,lessonId:k.lessonId,binding:k.hash,students:homeKidsCard(kids,{lessonId:k.lessonId,date:k.date,time:k.start,category:k.category}).students.map(s=>s.name)};
}
export function publicAgenda(j:AgendaJournal){return {operationId:j.operationId,digest:j.digest,command:j.plan.command,date:j.plan.date,label:j.plan.label,students:j.plan.students,done:Boolean(j.done),createdAt:j.createdAt,results:j.plan.maintenance.steps.map(s=>({id:s.before.id,label:s.label,start:s.start,state:j.maintenance.completed[s.before.id]?'done':j.errors[s.before.id]?'failed':'pending',message:j.errors[s.before.id]||''}))};}
export function previewAgenda(plan:AgendaPlan){return {digest:maintenanceHash(plan),...plan,maintenance:undefined,steps:plan.maintenance.steps.map(s=>({id:s.before.id,label:s.label,start:s.start,end:s.before.end.dateTime}))};}
export async function executeAgenda(j:AgendaJournal,api:MaintenanceApi,save:(j:AgendaJournal)=>Promise<void>,check:(step:MaintenanceStep)=>Promise<()=>Promise<void>>){
 for(const step of j.plan.maintenance.steps){if(j.maintenance.completed[step.before.id])continue;let release:(()=>Promise<void>)|undefined;
  try{
   // Recover a cancellation already accepted by Google even after its scheduled time.
   // This path only confirms the recorded attempt; it cannot issue a new cancellation.
   const recovered=j.maintenance.attempted?.[step.before.id]&&(await api.read(step.before.id))?.status==='cancelled';
   if(!recovered)release=await check(step);
   const part:MaintenanceJournal={...j.maintenance,done:false,plan:{...j.maintenance.plan,steps:[step]}};
   await executeMaintenance(part,api,async p=>{j.maintenance.completed=p.completed;j.maintenance.attempted=p.attempted;await save(j);});delete j.errors[step.before.id];
  }catch(e){j.errors[step.before.id]=e instanceof Error?e.message:'Não confirmado.';}finally{if(release)await release();}
  await save(j);
 }
 return j.plan.maintenance.steps.every(s=>Boolean(j.maintenance.completed[s.before.id]));
}
export function assertPersonalUnperformed(step:MaintenanceStep,students:Student[],date:string,now=new Date().toISOString()){future(step.before,students,date,now);peopleProof(step.before,step.parent,students);}
