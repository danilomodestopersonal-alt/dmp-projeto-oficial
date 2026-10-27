import {createHash} from "node:crypto";
import type {Student,CalendarEvent} from "@/types/models";
import {calendarRoster,rosterIds,ROSTER_KEY,RULE_PREFIX,type RosterEdit} from "./roster";
import {matchCalendarEvents,kidsCalendarRequest,normalizeName} from "@/lib/widget/home-source";
import {calendarTimeApi} from "./time-change-google";
import {timeDate} from "./time-change";
import {personalHolidays,type HolidayConfig} from "./personal-holidays";

type Event=Record<string,any>;
export type MaintenanceApi=ReturnType<typeof calendarTimeApi>;
export type MaintenanceCommand={kind:"roster"|"repair"|"repair-batch"|"holiday";selection?:{id:string;etag:string}[];id?:string;etag?:string;expected?:string[];scope?:"single"|"following";date?:string;keep?:string[]};
export type MaintenanceStep={before:Event;body:Event;parent?:Event;exceptions?:Event[];label:string;start:string};
export type MaintenancePlan={command:MaintenanceCommand;steps:MaintenanceStep[];kept:string[];excluded:string[];description:string};
export type MaintenanceJournal={operationId:string;digest:string;plan:MaintenancePlan;createdAt:string;attempted?:Record<string,boolean>;completed:Record<string,{etag:string;at:string;exceptions?:string}>;done?:boolean;restored?:boolean;restoreStarted?:boolean;restoredSteps?:Record<string,string>};
export class MaintenanceError extends Error{constructor(message:string,public status=409){super(message);}}
export const MAINTENANCE_MARKER="dmpPersonalMaintenanceV1";
const canonical=(v:any):any=>Array.isArray(v)?v.map(canonical):v&&typeof v==="object"?Object.fromEntries(Object.keys(v).sort().filter(k=>v[k]!==undefined).map(k=>[k,canonical(v[k])])):v;
export const maintenanceHash=(value:unknown)=>createHash("sha256").update(JSON.stringify(canonical(value))??"undefined").digest("hex");
const fail=(s:string):never=>{throw new MaintenanceError(s);};
const day=86400000;
const stamp=(v:number|string)=>new Date(v).toISOString().replace(/[-:]/g,"").replace(/\.\d{3}Z$/, "Z");
const parseStamp=(s:string)=>Date.parse(s.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/,"$1-$2-$3T$4:$5:$6Z"));
export function normalizedCommand(input:any):MaintenanceCommand{
 if(!input||!["roster","repair","repair-batch","holiday"].includes(input.kind))throw new MaintenanceError("Pedido inválido.",400);
 if(input.kind==="repair-batch"){
  if(!Array.isArray(input.selection)||!input.selection.length||input.selection.length>80||new Set(input.selection.map((e:any)=>e?.id)).size!==input.selection.length)throw new MaintenanceError("Selecione de 1 a 80 ocorrências diferentes.",400);
  const selection=input.selection.map((e:any)=>{const single=normalizedCommand({kind:"repair",id:e?.id,etag:e?.etag,scope:"single",expected:[]});return {id:single.id!,etag:single.etag!};}).sort((a:any,b:any)=>a.id.localeCompare(b.id));
  return {kind:"repair-batch",selection};
 }
 if(input.kind==="holiday"){
  if(typeof input.date!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(input.date)||!Array.isArray(input.keep)||input.keep.length>100||input.keep.some((id:unknown)=>typeof id!=="string"||!id||id.length>1024)||new Set(input.keep).size!==input.keep.length)throw new MaintenanceError("Escolha o feriado e confira as aulas.",400);
  return {kind:"holiday",date:input.date,keep:[...input.keep].sort()};
 }
 if(typeof input.id!=="string"||!input.id||input.id.length>1024||typeof input.etag!=="string"||!input.etag||input.etag.length>512||!["single","following"].includes(input.scope))throw new MaintenanceError("Reabra a aula para conferir a versão.",400);
 const expected=input.expected;
 if(!Array.isArray(expected)||expected.length>80||expected.some((id:unknown)=>typeof id!=="string"||!id||id.length>256)||new Set(expected).size!==expected.length)throw new MaintenanceError("Participantes inválidos.",400);
 return {kind:input.kind,id:input.id,etag:input.etag,scope:input.scope,expected:[...expected].sort()};
}
function writable(e:Event){return Boolean(e?.id&&e.etag&&e.status!=="cancelled"&&e.start?.dateTime&&e.end?.dateTime&&!e.start.date&&!e.locked&&e.organizer?.self===true&&(!e.eventType||e.eventType==="default")&&!(e.attendees||[]).some((a:any)=>!a.self));}
export function mappedPersonal(e:Event,parent:Event|undefined,students:Student[]){
 const mapped:CalendarEvent={id:e.id,etag:e.etag,summary:e.summary||"",start:e.start?.dateTime||"",end:e.end?.dateTime||"",recurringEventId:e.recurringEventId,originalStartTime:e.originalStartTime?.dateTime,calendarRoster:calendarRoster(e.extendedProperties?.private,parent?.extendedProperties?.private)};
 return matchCalendarEvents([mapped],students)[0];
}
function isPersonal(e:Event,parent:Event|undefined,students:Student[]){
 if(!writable(e)||parent&&!writable(parent)||kidsCalendarRequest({id:e.id,summary:e.summary||"",start:e.start.dateTime,end:e.end.dateTime})||parent&&kidsCalendarRequest({id:parent.id,summary:parent.summary||"",start:parent.start.dateTime,end:parent.end.dateTime}))return false;
 const mapped=mappedPersonal(e,parent,students),raw={...mapped,calendarRoster:undefined};
 if(mapped.calendarRoster?.single&&mapped.calendarRoster.single.eventId!==e.id)return false;
 const legacy=matchCalendarEvents([raw],students)[0].matchedStudentIds||[];
 if(rosterIds(mapped,legacy).some(id=>!students.some(s=>s.id===id)))return false;
 const edits=[...(mapped.calendarRoster?.rules||[]),...(mapped.calendarRoster?.single?[mapped.calendarRoster.single]:[])];
 const proven=edits.some(edit=>[...edit.ids,...edit.add,...edit.remove].some(id=>students.some(s=>s.id===id)));
 // Names in arbitrary appointments must not be enough to cancel them.
 const tokens=normalizeName(e.summary||"").split(" ").filter(Boolean);
 const nameTokens=students.filter(s=>legacy.includes(s.id)||edits.some(edit=>[...edit.ids,...edit.add,...edit.remove].includes(s.id))).flatMap(s=>normalizeName(s.name).split(" "));
 const onlyLesson=tokens.length>0&&tokens.every(t=>["aula","personal","treino","e","de","do","da"].includes(t)||nameTokens.includes(t)||t.length>=3&&nameTokens.some(n=>n.startsWith(t)));
 return onlyLesson&&(legacy.length>0||proven);
}
function assertPersonal(e:Event,parent:Event|undefined,students:Student[]){if(!isPersonal(e,parent,students))fail("A identidade, propriedade ou os participantes desta aula não estão claros. Nenhum evento foi cancelado.");}
function hasHistory(e:Event,students:Student[]){return students.some(s=>s.sessions?.some(x=>x.calendarEvent?.id===e.id));}
function emptyProof(e:Event,parent:Event|undefined,students:Student[]){
 const mapped=mappedPersonal(e,parent,students),r=mapped.calendarRoster!,at=Date.parse(mapped.originalStartTime||mapped.start);
 return (mapped.matchedStudentIds||[]).length===0&&(Boolean(r.single&&r.single.ids.length===0)||r.rules.some(rule=>Date.parse(rule.from)<=at&&rule.remove.length>0));
}
const sameIds=(a:string[],b:string[])=>[...a].sort().join("\0")===[...b].sort().join("\0");
function removalFields(e:Event,parent:Event|undefined,students:Student[],command:MaintenanceCommand){
 const mapped=mappedPersonal(e,parent,students),r=mapped.calendarRoster!,current=mapped.matchedStudentIds||[];
 const edit:RosterEdit={op:"p16-"+maintenanceHash(command).slice(0,24),at:Math.max(1,...r.rules.map(x=>x.at+1),(r.single?.at||0)+1),from:mapped.originalStartTime||mapped.start,scope:command.scope!,eventId:e.id,ids:[],add:[],remove:current};
 const target=command.scope==="following"?parent!:e;
 const fields={...target.extendedProperties?.private,[command.scope==="following"?RULE_PREFIX+edit.op:ROSTER_KEY]:JSON.stringify(edit)};
 if(JSON.stringify(edit).length>1024||JSON.stringify(fields).length>29000||Object.keys(fields).length>275)fail("Limite seguro dos participantes atingido. Revise a série no Google.");
 return {...target.extendedProperties,private:fields};
}
async function followingStep(command:MaintenanceCommand,event:Event,parent:Event,students:Student[],api:MaintenanceApi):Promise<MaintenanceStep>{
 if(!event.originalStartTime?.dateTime)fail("A ocorrência não possui vínculo completo com a recorrência.");
 const boundary=Date.parse(event.originalStartTime.dateTime),start=Date.parse(parent.start.dateTime);
 const recurrence:string[]=parent.recurrence||[],rules=recurrence.filter(x=>x.startsWith("RRULE:"));
 if(rules.length!==1||recurrence.some(x=>!x.startsWith("RRULE:")&&!/^EXDATE:\d{8}T\d{6}Z(?:,\d{8}T\d{6}Z)*$/.test(x)))fail("Esta recorrência precisa de revisão no Google para preservar suas exceções.");
 const pairs=rules[0].slice(6).split(";").map(s=>s.split("=")),fields=Object.fromEntries(pairs);
 const weekDay=["SU","MO","TU","WE","TH","FR","SA"][new Date(timeDate(parent.start.dateTime)+"T12:00:00Z").getUTCDay()];
 const step=Number(fields.INTERVAL||1)*7*day;
 if(pairs.some(x=>x.length!==2)||pairs.length!==Object.keys(fields).length||fields.FREQ!=="WEEKLY"||fields.BYDAY&&fields.BYDAY!==weekDay||Object.keys(fields).some(k=>!["FREQ","INTERVAL","BYDAY","WKST","UNTIL","COUNT"].includes(k))||!Number.isSafeInteger(step/day)||step<7*day||step>364*day||fields.COUNT&&fields.UNTIL||fields.COUNT&&!/^[1-9]\d*$/.test(fields.COUNT)||fields.UNTIL&&!/^\d{8}T\d{6}Z$/.test(fields.UNTIL)||parent.start.timeZone&&parent.start.timeZone!=="America/Sao_Paulo"||(boundary-start)%step!==0||boundary<start)fail("Recorrência não suportada com segurança. A série foi preservada.");
 const end=fields.COUNT?start+(Number(fields.COUNT)-1)*step:fields.UNTIL?parseStamp(fields.UNTIL):Infinity;
 if(boundary>end)fail("A ocorrência está fora da recorrência atual.");
 const all=await api.list({singleEvents:"false",showDeleted:"true"});
 const exceptions=all.filter(e=>e.recurringEventId===parent.id);
 if(exceptions.some(e=>!e.etag||!e.originalStartTime?.dateTime))fail("Não foi possível conferir todas as exceções da série.");
 const extendedProperties=command.kind==="roster"?removalFields(event,parent,students,command):parent.extendedProperties;
 const projectedParent={...parent,extendedProperties};
 const rosters=calendarRoster({},extendedProperties?.private);
 const future=exceptions.filter(e=>Date.parse(e.originalStartTime.dateTime)>=boundary);
 // Inspect the finite changing part, then the final repeating roster. No infinite
 // expansion and no guessed IDs are ever sent in a mutation.
 const lastChange=Math.max(boundary,...rosters.rules.map(r=>Date.parse(r.from)),...future.map(e=>Date.parse(e.originalStartTime.dateTime)));
 const horizon=Math.min(end,start+Math.ceil((lastChange-start)/step)*step+step);
 if((horizon-boundary)/step>520||future.length>200)fail("A série exige uma revisão mais extensa. Nenhum cancelamento foi aplicado.");
 const excluded=new Set(recurrence.filter(x=>x.startsWith("EXDATE:")).flatMap(x=>x.slice(7).split(",")));
 const empty:number[]=[];let lastKept=boundary-step;
 for(let at=boundary;at<=horizon;at+=step){
  const variants=future.filter(e=>Date.parse(e.originalStartTime.dateTime)===at);
  if(variants.length>1)fail("Há exceções conflitantes para o mesmo horário.");
  const raw=variants[0]||{...parent,id:event.id,recurrence:undefined,recurringEventId:parent.id,originalStartTime:{dateTime:new Date(at).toISOString()},start:{...parent.start,dateTime:new Date(at).toISOString()},end:{...parent.end,dateTime:new Date(at+Date.parse(parent.end.dateTime)-start).toISOString()},extendedProperties:undefined};
  if(raw.status==="cancelled"||excluded.has(stamp(at)))continue;
  const ids=mappedPersonal(raw,projectedParent,students).matchedStudentIds||[];
  if(ids.length||variants.length&&(!isPersonal(raw,projectedParent,students)||hasHistory(raw,students))){lastKept=at;continue;}
  empty.push(at);
 }
 // Moved exceptions are indexed by originalStartTime. They remain in the same
 // recurrence and retain their original IDs and data.
 if(future.some(e=>(Date.parse(e.originalStartTime.dateTime)-start)%step!==0))fail("Uma exceção não corresponde à regra semanal. Revise a série no Google.");
 const tail={...parent,id:event.id,recurrence:undefined,recurringEventId:parent.id,originalStartTime:{dateTime:new Date(horizon+step).toISOString()},start:{dateTime:new Date(horizon+step).toISOString()},end:{dateTime:new Date(horizon+step+3600000).toISOString()},extendedProperties:undefined};
 const tailEmpty=(mappedPersonal(tail,projectedParent,students).matchedStudentIds||[]).length===0;
 const nextFields={...fields};let limit=end;
 if(tailEmpty){limit=Math.min(end,Math.max(start,lastKept));delete nextFields.COUNT;nextFields.UNTIL=stamp(limit);if(lastKept<start)excluded.add(stamp(start));}
 for(const at of empty)if(at<=limit)excluded.add(stamp(at));
 if(!tailEmpty&&!empty.length)fail("Não foi encontrado um segmento vazio para cancelar.");
 const next=["RRULE:"+Object.entries(nextFields).map(([k,v])=>k+"="+v).join(";"),...(excluded.size?["EXDATE:"+[...excluded].sort().join(",")]:[])];
 return {before:parent,body:{recurrence:next,extendedProperties},exceptions,label:event.summary||"Aula Personal",start:event.start.dateTime};
}
export async function buildMaintenancePlan(command:MaintenanceCommand,students:Student[],api:MaintenanceApi,config:HolidayConfig,now=new Date().toISOString()):Promise<MaintenancePlan>{
 const plan:MaintenancePlan={command,steps:[],kept:[],excluded:[],description:""};
 if(command.kind==="repair-batch"){
  const checked=normalizedCommand(command);
  for(const selected of checked.selection!){
   const single=await buildMaintenancePlan({kind:"repair",...selected,scope:"single",expected:[]},students,api,config,now);
   if(single.steps.some(step=>hasHistory(step.before,students)))fail("Uma aula selecionada possui histórico. Atualize a revisão; nenhum cancelamento foi iniciado.");
   plan.steps.push(...single.steps);
  }
  plan.steps.sort((a,b)=>a.start.localeCompare(b.start)||a.before.id.localeCompare(b.before.id));
  plan.description=`Cancelar ${plan.steps.length} ocorrência(s) sem alunos, somente nas datas e horários abaixo.`;
 }else if(command.kind==="holiday"){
  const holiday=personalHolidays(Number(command.date!.slice(0,4)),config).find(h=>h.date===command.date);
  if(!holiday||command.date!<timeDate(now))fail("Escolha um feriado habilitado de hoje ou futuro.");
  const begin=command.date+"T00:00:00-03:00",end=new Date(Date.parse(begin)+day).toISOString();
  const events=await api.list({singleEvents:"true",showDeleted:"false",timeMin:begin,timeMax:end}),parents=new Map<string,Event>();
  const candidates:string[]=[];
  for(const event of events){
   if(event.recurringEventId&&!parents.has(event.recurringEventId)){const p=await api.read(event.recurringEventId);if(!p)fail("Uma série não está disponível. Atualize a agenda.");parents.set(event.recurringEventId,p);}
   const parent=parents.get(event.recurringEventId);
   if(!isPersonal(event,parent,students)||event.recurrence?.length||timeDate(event.start.dateTime)!==command.date||(mappedPersonal(event,parent,students).matchedStudentIds||[]).length===0||hasHistory(event,students)){plan.excluded.push(event.summary||"Compromisso");continue;}
   candidates.push(event.id);
   if(command.keep!.includes(event.id)){plan.kept.push(event.summary);continue;}
   plan.steps.push({before:event,parent,body:{status:"cancelled"},label:mappedPersonal(event,parent,students).summary,start:event.start.dateTime});
  }
  if(command.keep!.some(id=>!candidates.includes(id)))fail("Uma das aulas escolhidas mudou. Gere uma nova prévia.");
  if(plan.steps.length>80)fail("Há muitas aulas neste dia. Revise antes de cancelar.");
  plan.description=holiday!.name+" · "+command.date;
 }else{
  const event=await api.read(command.id!);if(!event||event.etag!==command.etag)fail("A aula mudou. Reabra a agenda e confira a prévia.");
  const parent=event.recurringEventId?await api.read(event.recurringEventId):undefined;
  if(event.recurringEventId&&!parent)fail("Série indisponível.");
  assertPersonal(event,parent,students);
  if(event.recurrence?.length||timeDate(event.start.dateTime)<timeDate(now))fail("Escolha uma ocorrência de hoje ou futura. O histórico foi preservado.");
  const ids=mappedPersonal(event,parent,students).matchedStudentIds||[];
  if(!sameIds(ids,command.expected!))fail("Os participantes mudaram. Reabra a aula.");
  if(command.kind==="roster"&&!ids.length)fail("Esta aula já está vazia. Use Revisar aulas vazias.");
  if(command.kind==="repair"&&!emptyProof(event,parent,students))fail("Não há prova de remoção dos últimos alunos pelo DMP. Nenhum evento foi cancelado.");
  if(command.scope==="following"){
   if(!parent||timeDate(event.originalStartTime?.dateTime||event.start.dateTime)<timeDate(now))fail("Escolha uma ocorrência recorrente de hoje ou futura.");
   plan.steps.push(await followingStep(command,event,parent,students,api));
  }else plan.steps.push({before:event,parent,body:{status:"cancelled",...(command.kind==="roster"?{extendedProperties:removalFields(event,parent,students,command)}:{})},label:event.summary||"Aula Personal",start:event.start.dateTime});
  plan.description=command.scope==="following"?"Cancelar o segmento sem alunos e preservar as exceções com participantes.":"Cancelar somente esta ocorrência sem alunos.";
 }
 return plan;
}
export async function findEmptyLessons(date:string,students:Student[],api:MaintenanceApi){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+"T00:00:00Z")))throw new MaintenanceError("Data inválida.",400);
 const begin=date+"T00:00:00-03:00",events=await api.list({singleEvents:"true",showDeleted:"false",timeMin:begin,timeMax:new Date(Date.parse(begin)+35*day).toISOString()}),parents=new Map<string,Event>(),result:any[]=[];
 for(const e of events){
  if(e.recurringEventId&&!parents.has(e.recurringEventId)){const p=await api.read(e.recurringEventId);if(!p)fail("Série indisponível. A revisão não está completa.");parents.set(e.recurringEventId,p);}
  const p=parents.get(e.recurringEventId);
  if(isPersonal(e,p,students)&&emptyProof(e,p,students))result.push({id:e.id,etag:e.etag,start:e.start.dateTime,summary:e.summary,recurringEventId:e.recurringEventId||"",expected:[]});
 }
 return result;
}
function patchWithMarker(step:MaintenanceStep,id:string){return {...step.body,extendedProperties:{...(step.body.extendedProperties||step.before.extendedProperties),private:{...(step.body.extendedProperties||step.before.extendedProperties)?.private,[MAINTENANCE_MARKER]:id}}};}
function matches(e:Event,body:Event):boolean{return Object.keys(body).every(k=>body[k]===null?e[k]===undefined||e[k]===null:body[k]&&typeof body[k]==="object"&&!Array.isArray(body[k])?matches(e[k]||{},body[k]):maintenanceHash(e[k])===maintenanceHash(body[k]));}
export function personalCalendarApi(token:string,request:typeof fetch=fetch):MaintenanceApi{
 const api=calendarTimeApi(token,request);
 return {...api,patch:async(id:string,body:any,etag:string)=>{
  try{
   const r=await request("https://www.googleapis.com/calendar/v3/calendars/primary/events/"+encodeURIComponent(id)+"?sendUpdates=none",{method:"PATCH",headers:{authorization:"Bearer "+token,"Content-Type":"application/json","If-Match":etag},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
   if(r.status===412)throw new MaintenanceError("A aula mudou durante a gravação. Confira a agenda.");
   if(!r.ok)throw new MaintenanceError("O Google recusou a alteração (HTTP "+r.status+").",502);
  }catch(e){
   if(e instanceof MaintenanceError)throw e;
   const current=await api.read(id);if(!current||!matches(current,body)&&!(body.status==="cancelled"&&current.status==="cancelled"))throw e;
  }
  const current=await api.read(id);
  if(!current||!matches(current,body)&&!(body.status==="cancelled"&&current.status==="cancelled"))throw new MaintenanceError("O Google ainda não confirmou a alteração.",502);
  return current;
 }};
}
async function exceptionVersion(id:string,api:MaintenanceApi){return maintenanceHash((await api.list({singleEvents:"false",showDeleted:"true"})).filter(e=>e.recurringEventId===id).map(e=>[e.id,e.etag]).sort((a,b)=>a[0].localeCompare(b[0])));}
function restoreBody(step:MaintenanceStep,id:string){const prior=step.before.extendedProperties?.private||{},removed=Object.fromEntries(Object.keys(step.body.extendedProperties?.private||{}).filter(k=>!(k in prior)).map(k=>[k,null]));return {extendedProperties:{...step.before.extendedProperties,private:{...removed,...prior,[MAINTENANCE_MARKER]:id+":restored"}},...(step.body.recurrence?{recurrence:step.before.recurrence}:{}),...(step.body.status?{status:step.before.status||"confirmed"}:{})};}
async function checkExceptions(step:MaintenanceStep,api:MaintenanceApi,strict:boolean){
 if(!step.exceptions)return;
 const current=(await api.list({singleEvents:"false",showDeleted:"true"})).filter(e=>e.recurringEventId===step.before.id);
 if(strict&&(current.length!==step.exceptions.length||current.some(e=>!step.exceptions!.some(old=>old.id===e.id&&old.etag===e.etag))))fail("Uma exceção da série mudou. Gere uma nova prévia.");
}
export async function executeMaintenance(j:MaintenanceJournal,api:MaintenanceApi,save:(j:MaintenanceJournal)=>Promise<void>){
 if(j.restored||j.restoreStarted)fail("Esta operação foi restaurada ou está em restauração. Gere uma nova prévia.");
 if(j.done)return;
 for(const step of j.plan.steps){
  if(j.completed[step.before.id])continue;
  const body=patchWithMarker(step,j.operationId),current=await api.read(step.before.id);
  if(!current)fail("O evento não está mais disponível. A operação precisa de revisão.");
  const cancelled=step.body.status==="cancelled"&&current.status==="cancelled"&&j.attempted?.[step.before.id];
  if(!matches(current,body)&&!cancelled){
   if(current.etag!==step.before.etag)fail("A agenda foi alterada depois da prévia. As alterações já confirmadas foram preservadas; confira o resultado.");
   if(step.parent){const parent=await api.read(step.parent.id);if(!parent||parent.etag!==step.parent.etag)fail("A série mudou. Confira as aulas antes de continuar.");}
   await checkExceptions(step,api,true);
   j.attempted={...j.attempted,[step.before.id]:true};await save(j);
   await api.patch(step.before.id,body,current.etag);
  }
  const confirmed=await api.read(step.before.id);
  if(!confirmed||!matches(confirmed,body)&&!(step.body.status==="cancelled"&&confirmed.status==="cancelled"&&j.attempted?.[step.before.id]))throw new MaintenanceError("O Google ainda não confirmou o cancelamento. Retome a mesma operação.",502);
  j.completed[step.before.id]={etag:confirmed.etag,at:new Date().toISOString(),...(step.exceptions?{exceptions:await exceptionVersion(step.before.id,api)}:{})};await save(j);
 }
 j.done=true;await save(j);
}
export async function restoreMaintenance(j:MaintenanceJournal,api:MaintenanceApi,save:(j:MaintenanceJournal)=>Promise<void>){
 if(j.restored)return;
 // Restore the same IDs only while the exact saved version is still present.
 // A sparse/missing cancellation or external edit is never recreated blindly.
 for(const step of j.plan.steps){
  const done=j.completed[step.before.id];if(!done||j.restoredSteps?.[step.before.id])continue;
  const current=await api.read(step.before.id);
  if(current&&j.restoreStarted&&matches(current,restoreBody(step,j.operationId)))continue;
  if(!current||current.etag!==done.etag||current.extendedProperties?.private?.[MAINTENANCE_MARKER]!==j.operationId)fail("O evento mudou ou não está mais disponível. A restauração automática foi bloqueada para evitar duplicidade.");
  if(step.parent){const p=await api.read(step.parent.id);if(!p||p.etag!==step.parent.etag)fail("A série mudou. Confira no Google antes de restaurar.");}
  if(done.exceptions&&await exceptionVersion(step.before.id,api)!==done.exceptions)fail("Uma exceção mudou após o cancelamento. Confira no Google antes de restaurar.");
 }
 j.restoreStarted=true;await save(j);
 for(const step of [...j.plan.steps].reverse()){
  const done=j.completed[step.before.id];if(!done||j.restoredSteps?.[step.before.id])continue;
  const body=restoreBody(step,j.operationId);
  const current=await api.read(step.before.id);
  if(!current)fail("Evento indisponível para restauração.");
  if(!matches(current,body)){if(current.etag!==done.etag)fail("O evento mudou durante a restauração.");await api.patch(step.before.id,body,current.etag);}
  const restored=await api.read(step.before.id);if(!restored||!matches(restored,body))fail("Restauração ainda não confirmada.");
  j.restoredSteps={...j.restoredSteps,[step.before.id]:restored.etag};await save(j);
 }
 j.restored=true;j.done=true;await save(j);
}
export function publicMaintenancePlan(plan:MaintenancePlan){return {digest:maintenanceHash(plan),description:plan.description,steps:plan.steps.map(s=>({id:s.before.id,label:s.label,start:s.start,scope:s.body.recurrence?"following":"single"})),kept:plan.kept,excluded:plan.excluded};}
