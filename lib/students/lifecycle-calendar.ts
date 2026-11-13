import type {Student} from '@/types/models';
import {currentPause,validDate,saoPauloDate} from './lifecycle';
import {calendarRoster,ROSTER_KEY,RULE_PREFIX,rosterSummary,rosterIds,type RosterEdit} from '@/lib/calendar/roster';
import {assertPersonal,mappedPersonal,followingStep,buildMaintenancePlan,executeMaintenance,maintenanceHash,MaintenanceError,type MaintenanceApi,type MaintenanceJournal,type MaintenanceStep} from '@/lib/calendar/personal-maintenance';
import {defaultHolidayConfig} from '@/lib/calendar/personal-holidays';
import {normalizeName} from '@/lib/widget/home-source';

type Event=Record<string,any>;
export type ReturnSlot={date:string;start:string;end:string;until:string};
export type LifecycleCommand={kind:'pause'|'resume';studentId:string;from:string;effectiveAt?:string;expectedReturn?:string;monthlyAmount?:number;dueDay?:number;financialActive?:boolean;billingFrom?:string;slots?:ReturnSlot[]};
export type LifecyclePlan={command:LifecycleCommand;studentVersion:string;patches:MaintenanceStep[];inserts:Event[];lessons:{id:string;start:string;label:string;action:string}[];issuedIds:string[]};
export type LifecycleJournal={operationId:string;digest:string;plan:LifecyclePlan;maintenance:MaintenanceJournal;inserted:Record<string,string>;done?:boolean};
const fail=(text:string):never=>{throw new MaintenanceError(text);};
const day=86400000;
const at=(date:string,time='00:00')=>date+'T'+time+':00-03:00';
const nextDay=(date:string,days:number)=>new Date(Date.parse(date+'T12:00:00Z')+days*day).toISOString().slice(0,10);
const stamp=(iso:string)=>new Date(iso).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
export function lifecycleCommand(input:any,now=saoPauloDate()):LifecycleCommand{
 if(!input||!['pause','resume'].includes(input.kind)||typeof input.studentId!=='string'||!input.studentId||input.studentId.length>256||!validDate(input.from)||input.from<now)fail('Escolha o aluno e uma data de hoje ou futura.');
 const c:LifecycleCommand={kind:input.kind,studentId:input.studentId,from:input.from};
 if(c.kind==='pause'){
  if(input.expectedReturn){if(!validDate(input.expectedReturn)||input.expectedReturn<input.from)fail('A previsão deve ser igual ou posterior à data de retirada das aulas.');c.expectedReturn=input.expectedReturn;}
 }else{
  if(typeof input.financialActive!=='boolean'||!Number.isFinite(input.monthlyAmount)||input.monthlyAmount<0||Math.abs(Math.round(input.monthlyAmount*100)-input.monthlyAmount*100)>1e-6||!Number.isInteger(input.dueDay)||input.dueDay<1||input.dueDay>31||!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.billingFrom)||input.billingFrom<input.from.slice(0,7))fail('Confira mensalidade, vencimento e primeiro mês de cobrança.');
  if(!Array.isArray(input.slots)||!input.slots.length||input.slots.length>6)fail('Configure de um a seis horários para o retorno.');
  c.financialActive=input.financialActive;c.monthlyAmount=input.monthlyAmount;c.dueDay=input.dueDay;c.billingFrom=input.billingFrom;
  c.slots=input.slots.map((s:any)=>{if(!validDate(s.date)||!validDate(s.until)||s.date<c.from||s.until<s.date||Date.parse(s.until)-Date.parse(s.date)>366*day||!/^([01]\d|2[0-3]):[0-5]\d$/.test(s.start)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(s.end)||s.end<=s.start)fail('Confira datas e horários. Cada série pode cobrir até um ano.');return {date:s.date,start:s.start,end:s.end,until:s.until};});
 }
 return c;
}
function withoutHistory(e:Event,students:Student[]){if(students.some(s=>s.sessions?.some(x=>x.calendarEvent?.id===e.id)))fail('Uma aula selecionada já tem histórico. Confira a data e a agenda antes de continuar.');}
// Only the server calls this at confirmation; the browser cannot choose the cutoff.
export function inactivateNowCommand(studentId:string,now=new Date()):LifecycleCommand{
 const command=lifecycleCommand({kind:'pause',studentId,from:saoPauloDate(now)},saoPauloDate(now));
 return {...command,effectiveAt:now.toISOString()};
}
function lessonFailure(e:Event,error:unknown):never{
 const when=e.start?.dateTime?new Date(e.start.dateTime).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short'}):'data indisponível';
 throw new MaintenanceError(`Revise a aula “${e.summary||'Sem título'}” · ${when} · ID ${e.id}. ${error instanceof Error?error.message:'Vínculo incompleto.'}`);
}
function checkLesson(e:Event,check:()=>void){try{check();}catch(error){lessonFailure(e,error);}}
function seriesKey(id:string){return id.replace(/_\d{8}T\d{6}Z$/,'').replace(/_R\d{8}T\d{6}Z?$/,'');}
// An ambiguous short name must request review, never silently disappear from
// inactivation planning after the display matcher rejects it. This only blocks
// a plan; it does not assign a participant or authorize a Google mutation.
function unresolvedTarget(e:Event,parent:Event|undefined,student:Student,students:Student[]){
 const mapped=mappedPersonal(e,parent,students);
 if(mapped.matchedStudentIds?.includes(student.id))return false;
 if(mapped.calendarRoster?.single?.eventId===e.id)return false;
 if(!rosterIds(mapped,[student.id]).includes(student.id))return false;
 let title=' '+normalizeName(e.summary||'')+' ';
 const otherNames=students.filter(s=>s.id!==student.id).flatMap(s=>{const p=normalizeName(s.name).split(' ');return p.length>1?[p.join(' '),p[0]+' '+p.at(-1)]:[];}).sort((a,b)=>b.length-a.length);
 // A complete name belonging to somebody else is not evidence for the target.
 for(const name of otherNames)title=title.replaceAll(' '+name+' ',' ');
 const parts=normalizeName(student.name).split(' ');
 return title.trim().split(' ').some(word=>word.length>=3&&parts.some(part=>part.startsWith(word)));
}
function assertTargetIdentity(e:Event,parent:Event|undefined,student:Student,students:Student[]){
 const mapped=mappedPersonal(e,parent,students);
 if(!(mapped.matchedStudentIds||[]).includes(student.id)){
  if(unresolvedTarget(e,parent,student,students))fail('Um nome abreviado ou ambíguo exige conferir os participantes na agenda antes de inativar ou reativar.');
  return;
 }
 if(rosterIds(mapped,[]).includes(student.id))return;
 const normalize=(v:string)=>v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
 const parts=normalize(student.name).split(' '),title=' '+normalize(e.summary||'')+' ';
 if(title.includes(' '+parts.join(' ')+' ')||title.includes(' '+parts[0]+' '+parts.at(-1)+' '))return;
 // A short name is only accepted with an existing exact series link in the
 // student's lesson history. Names alone never establish mutation authority.
 const words=normalize(e.summary||'').split(' '),known=students.filter(s=>words.some(w=>w.length>=3&&normalize(s.name).split(' ').some(n=>n===w||n.startsWith(w))));
 const unique=words.some(w=>w.length>=3&&parts.some(n=>n===w||n.startsWith(w))&&known.filter(s=>normalize(s.name).split(' ').some(n=>n===w||n.startsWith(w))).every(s=>s.id===student.id));
 const linked=Boolean(parent&&e.recurringEventId===parent.id&&student.sessions?.some(s=>s.calendarEvent?.id&&/_\d{8}T\d{6}Z$/.test(s.calendarEvent.id)&&seriesKey(s.calendarEvent.id)===seriesKey(parent.id)));
 if(!unique||!linked)fail('Um nome abreviado ou ambíguo exige conferir os participantes na agenda antes de inativar ou reativar.');
}
function rosterFields(target:Event,event:Event,parent:Event|undefined,students:Student[],studentId:string,kind:'pause'|'resume',scope:'single'|'following',from:string,version:number,op:string){
 const current=mappedPersonal(event,parent,students).matchedStudentIds||[];
 const ids=kind==='pause'?current.filter(id=>id!==studentId):[...new Set([...current,studentId])];
 const edit:RosterEdit={op,at:version,from,scope,eventId:event.id,ids,add:kind==='resume'?[studentId]:[],remove:kind==='pause'?[studentId]:[]};
 const fields={...target.extendedProperties?.private,[scope==='following'?RULE_PREFIX+op:ROSTER_KEY]:JSON.stringify(edit)};
 if(new TextEncoder().encode(JSON.stringify(edit)).length>1024||new TextEncoder().encode(JSON.stringify(fields)).length>28000||Object.keys(fields).length>270)fail('A série atingiu o limite seguro de alterações. Confira a agenda.');
 return {...target.extendedProperties,private:fields};
}
function nextVersion(events:Event[]){return Math.max(1,...events.flatMap(e=>{const r=calendarRoster(e.extendedProperties?.private);return [...r.rules.map(x=>x.at+1),...(r.single?[r.single.at+1]:[])];}));}
export async function buildLifecyclePlan(command:LifecycleCommand,students:Student[],issuedIds:string[],api:MaintenanceApi,now=new Date().toISOString()):Promise<LifecyclePlan>{
 const student=students.find(s=>s.id===command.studentId);if(!student||student.status!==(command.kind==='pause'?'ACTIVE':'ARCHIVED'))fail('Confira a situação atual do cadastro. O histórico foi preservado.');
 const paused=currentPause(student!);
 if(command.kind==='pause'&&paused&&!student!.lifecycle?.pending)fail('Este aluno já foi inativado.');
 if(command.kind==='resume'&&(paused&&command.from<paused.from||student!.lifecycle?.pending))fail('Conclua a inativação antes de reativar o aluno.');
 const plan:LifecyclePlan={command,studentVersion:maintenanceHash(student),patches:[],inserts:[],lessons:[],issuedIds:[...issuedIds].sort()};
 // Reactivation must identify the selected inactive student without changing stored data.
 if(command.kind==='resume')students=students.map(s=>s.id===student!.id?{...s,status:'ACTIVE'}:s);
 const all=await api.list({singleEvents:'false',showDeleted:'true'});
 const op='p29'+maintenanceHash(command).slice(0,24),version=nextVersion(all);
 const cutoff=Math.max(Date.parse(at(command.from)),Date.parse(command.effectiveAt||now));
 const live=all.filter(e=>e.status!=='cancelled');
 if(command.kind==='pause'){
  const parents=live.filter(e=>e.recurrence?.length);
  const processed=new Set<string>();
  for(const parent of parents){
   const exceptions=all.filter(e=>e.recurringEventId===parent.id);
   const related=[parent,...exceptions.filter(e=>e.status!=='cancelled')];
   const relevant=related.some(e=>(mappedPersonal(e,e===parent?undefined:parent,students).matchedStudentIds||[]).includes(student!.id)||unresolvedTarget(e,e===parent?undefined:parent,student!,students))||calendarRoster(parent.extendedProperties?.private).rules.some(r=>r.add.includes(student!.id));
   if(!relevant)continue;
   // Only the weekly shape supported by the existing safe cancellation flow.
   if(!(parent.recurrence as string[]).some(r=>/^RRULE:FREQ=WEEKLY(?:;|$)/.test(r)))fail('Há uma recorrência fora do padrão semanal seguro. Revise essa série antes de inativar.');
   const from=new Date(Math.max(cutoff,Date.parse(parent.start.dateTime))).toISOString();
   const horizon=new Date(Date.parse(from)+370*day).toISOString();
   const instances=(await api.list({timeMin:from,timeMax:horizon,showDeleted:'false'},'/'+encodeURIComponent(parent.id)+'/instances')).filter(e=>Date.parse(e.start?.dateTime)>=cutoff).sort((a,b)=>Date.parse(a.originalStartTime?.dateTime)-Date.parse(b.originalStartTime?.dateTime));
   if(!instances.length){
    const rule=Object.fromEntries(String(parent.recurrence.find((r:string)=>r.startsWith('RRULE:'))).slice(6).split(';').map((v:string)=>v.split('=')));
    const until=rule.UNTIL?Date.parse(rule.UNTIL.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/,'$1-$2-$3T$4:$5:$6Z')):rule.COUNT&&(!rule.BYDAY||!rule.BYDAY.includes(','))?Date.parse(parent.start.dateTime)+(Number(rule.COUNT)-1)*Number(rule.INTERVAL||1)*7*day:Infinity;
    if(!Number.isFinite(until)||until>Date.parse(horizon))fail('Uma série não apresentou ocorrências no próximo ano. Confira o limite e as exceções dessa série antes de inativar.');
    continue;
   }
   const first=instances[0];
   checkLesson(first,()=>assertPersonal(parent,undefined,students));
   if(!first.originalStartTime?.dateTime)fail('Vínculo da recorrência incompleto.');
   const boundary=first.originalStartTime.dateTime;
   if(exceptions.some(e=>e.status!=='cancelled'&&(Date.parse(e.originalStartTime?.dateTime)>=Date.parse(boundary))!==(Date.parse(e.start?.dateTime)>=cutoff)))fail('Uma exceção mudou de lado da data da inativação. Confira essa ocorrência no Google; nada será removido automaticamente.');
   const affected=instances.filter(e=>(mappedPersonal(e,parent,students).matchedStudentIds||[]).includes(student!.id)||unresolvedTarget(e,parent,student!,students));
   if(!affected.length&&!calendarRoster(parent.extendedProperties?.private).rules.some(r=>r.add.includes(student!.id)&&Date.parse(r.from)>=cutoff))continue;
   affected.forEach(e=>checkLesson(e,()=>{assertPersonal(e,parent,students);assertTargetIdentity(e,parent,student!,students);withoutHistory(e,students);}));
   for(const e of exceptions.filter(e=>e.status!=='cancelled'&&Date.parse(e.start?.dateTime)>=cutoff)){checkLesson(e,()=>{assertPersonal(e,parent,students);withoutHistory(e,students);});}
   const extendedProperties=rosterFields(parent,first,parent,students,student!.id,'pause','following',boundary,version,op);
   const projected={...parent,extendedProperties};
   const projectedApi={...api,read:async(id:string)=>id===parent.id?projected:api.read(id),list:async(params:Record<string,string>,path?:string)=>(await api.list(params,path)).map(e=>e.id===parent.id?projected:e)};
   let step:MaintenanceStep={before:parent,body:{extendedProperties},exceptions,label:parent.summary,start:first.start.dateTime};
   try{const empty=await followingStep({kind:'repair',id:first.id,etag:first.etag,scope:'following',expected:[]},first,projected,students,projectedApi);step={...empty,before:parent};}
   catch(e){if(!(e instanceof Error)||e.message!=='Não foi encontrado um segmento vazio para cancelar.')throw e;}
   plan.patches.push(step);processed.add(parent.id);
   for(const e of affected){const ids=mappedPersonal(e,parent,students).matchedStudentIds||[];plan.lessons.push({id:e.id,start:e.start.dateTime,label:e.summary,action:ids.length>1?'Retirar apenas '+student!.name:'Cancelar ocorrência sem alunos'});}
  }
  for(const e of live.filter(e=>!e.recurrence?.length&&!processed.has(e.recurringEventId)&&e.start?.dateTime&&Date.parse(e.start.dateTime)>=cutoff)){
   const parent=e.recurringEventId?live.find(p=>p.id===e.recurringEventId):undefined;
   const ids=mappedPersonal(e,parent,students).matchedStudentIds||[];if(!ids.includes(student!.id)&&!unresolvedTarget(e,parent,student!,students))continue;
   checkLesson(e,()=>{assertPersonal(e,parent,students);assertTargetIdentity(e,parent,student!,students);withoutHistory(e,students);});
   if(ids.length===1){const p=await buildMaintenancePlan({kind:'roster',id:e.id,etag:e.etag,scope:'single',expected:ids},students,api,defaultHolidayConfig,now);plan.patches.push(...p.steps);}
   else{const extendedProperties=rosterFields(e,e,parent,students,student!.id,'pause','single',e.originalStartTime?.dateTime||e.start.dateTime,version,op);plan.patches.push({before:e,parent,body:{extendedProperties,summary:rosterSummary(e.summary,ids,ids.filter(id=>id!==student!.id),students)},label:e.summary,start:e.start.dateTime});}
   plan.lessons.push({id:e.id,start:e.start.dateTime,label:e.summary,action:ids.length>1?'Retirar apenas '+student!.name:'Cancelar ocorrência sem alunos'});
  }
 }else{
  const slots=command.slots!;const dates=slots.flatMap(s=>[s.date,s.until]).sort();
  const events=await api.list({singleEvents:'true',showDeleted:'false',timeMin:at(dates[0]),timeMax:at(nextDay(dates.at(-1)!,1))});
  const occupied:{start:number;end:number}[]=[];
  for(const [index,slot] of slots.entries()){
   const excluded:string[]=[];let created=0;
   for(let date=slot.date;date<=slot.until;date=nextDay(date,7)){
    const start=at(date,slot.start),end=at(date,slot.end);if(Date.parse(start)<Date.parse(now))fail('O primeiro horário do retorno já passou. Escolha um horário futuro.');
    const key=start+'|'+end;if(occupied.some(x=>x.start<Date.parse(end)&&x.end>Date.parse(start)))fail('Há horários repetidos ou sobrepostos no retorno.');occupied.push({start:Date.parse(start),end:Date.parse(end)});
    const overlaps=events.filter(e=>Date.parse(e.start?.dateTime||e.start?.date)<Date.parse(end)&&Date.parse(e.end?.dateTime||e.end?.date)>Date.parse(start));
    if(overlaps.length){
     const e=overlaps[0];if(overlaps.length!==1||Date.parse(e.start?.dateTime)!==Date.parse(start)||Date.parse(e.end?.dateTime)!==Date.parse(end))fail('Há conflito de horário em '+date+'. Confira a agenda antes de retomar.');
     const parent=e.recurringEventId?all.find(p=>p.id===e.recurringEventId):undefined;assertPersonal(e,parent,students);assertTargetIdentity(e,parent,student!,students);withoutHistory(e,students);
     const ids=mappedPersonal(e,parent,students).matchedStudentIds||[];
     if(!ids.length)fail('Existe uma aula vazia nesse horário. Use primeiro a revisão segura da agenda.');
     if(!ids.includes(student!.id)){
      const extendedProperties=rosterFields(e,e,parent,students,student!.id,'resume','single',e.originalStartTime?.dateTime||start,version,op+index);
      plan.patches.push({before:e,parent,body:{extendedProperties,summary:rosterSummary(e.summary,ids,[...ids,student!.id],students)},label:e.summary,start});
     }
     excluded.push(stamp(start));plan.lessons.push({id:e.id,start,label:e.summary,action:ids.includes(student!.id)?'Aluno já presente; preservar':'Adicionar à aula existente'});
    }else{created++;plan.lessons.push({id:key,start,label:student!.name,action:'Criar aula semanal'});}
   }
   if(created){
    const id='dmp29'+maintenanceHash({command,index}).slice(0,48);
    plan.inserts.push({id,summary:'Aula · '+student!.name,start:{dateTime:at(slot.date,slot.start),timeZone:'America/Sao_Paulo'},end:{dateTime:at(slot.date,slot.end),timeZone:'America/Sao_Paulo'},recurrence:['RRULE:FREQ=WEEKLY;UNTIL='+stamp(at(slot.until,'23:59')),...(excluded.length?['EXDATE:'+excluded.join(',')]:[])],extendedProperties:{private:{dmpStudentReturnV1:id}}});
   }
  }
 }
 if(plan.patches.length>180||plan.lessons.length>320)fail('A seleção ultrapassa o limite seguro. Reduza o período ou confira as séries.');
 plan.patches.sort((a,b)=>a.before.id.localeCompare(b.before.id));plan.lessons.sort((a,b)=>a.start.localeCompare(b.start)||a.id.localeCompare(b.id));return plan;
}
export async function executeLifecycle(j:LifecycleJournal,api:MaintenanceApi,save:(j:LifecycleJournal)=>Promise<void>){
 if(j.done)return;
 // Reuse durable, conditional and idempotent writes from safe lesson maintenance.
 await executeMaintenance(j.maintenance,api,async()=>save(j));
 for(const body of j.plan.inserts){
  if(j.inserted[body.id])continue;
  let e=await api.read(body.id);
  if(!e){try{e=await api.insert(body);}catch(error){e=await api.read(body.id);if(!e)throw error;}}
  if(!e||e.status==='cancelled'||e.extendedProperties?.private?.dmpStudentReturnV1!==body.id||maintenanceHash(e.recurrence)!==maintenanceHash(body.recurrence)||Date.parse(e.start?.dateTime)!==Date.parse(body.start.dateTime)||Date.parse(e.end?.dateTime)!==Date.parse(body.end.dateTime)||e.summary!==body.summary)fail('Uma aula do retorno foi alterada. Confira a operação pendente; nenhum evento será duplicado.');
  j.inserted[body.id]=e.etag;await save(j);
 }
}
export function publicLifecyclePlan(p:LifecyclePlan){return {digest:maintenanceHash(p),lessons:p.lessons,series:p.patches.filter(s=>s.before.recurrence?.length).length,issued:p.issuedIds.length,kind:p.command.kind};}
