import {createHash} from "node:crypto";
import {ROSTER_KEY,RULE_PREFIX,calendarRoster} from "./roster";
export type TimeCommand={id:string;etag:string;start:string;end:string;scope:"single"|"following";operationId:string};
export class TimeChangeError extends Error{constructor(message:string,public status=409){super(message);}}
type GoogleEvent=Record<string,any>;
export type TimePlan={command:TimeCommand;event:GoogleEvent;parent?:GoogleEvent;exceptions:GoogleEvent[];newId?:string;newSeries?:GoogleEvent;trimmed?:string[];boundary?:string;delta?:number;checkedThrough:string};
const zone="America/Sao_Paulo",day=86400000;
export const timeDate=(value:string)=>new Intl.DateTimeFormat("en-CA",{timeZone:zone,year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(value));
const stamp=(value:string|number)=>new Date(value).toISOString().replace(/[-:]/g,"").replace(/\.\d{3}Z$/,"Z");
const canonical=(value:any):any=>Array.isArray(value)?value.map(canonical):value&&typeof value==="object"?Object.fromEntries(Object.keys(value).sort().filter(k=>value[k]!==undefined).map(k=>[k,canonical(value[k])])):value;
const same=(a:unknown,b:unknown)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
function fail(message:string):never{throw new TimeChangeError(message);}
function validEvent(event:GoogleEvent){
  if(!event?.id||!event.etag||event.status==="cancelled"||!event.start?.dateTime||!event.end?.dateTime||event.start.date||event.locked||event.organizer?.self!==true||(event.eventType&&event.eventType!=="default"))fail("Este compromisso não permite alteração de horário pelo DMP.");
}
export function validateTimeCommand(command:TimeCommand){
  if(!command||typeof command.id!=="string"||!command.id||command.id.length>1024||!command.etag||!["single","following"].includes(command.scope)||!/^[a-zA-Z0-9-]{16,80}$/.test(command.operationId||""))fail("Pedido de horário inválido.");
  if(![command.start,command.end].every(v=>typeof v==="string"&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00-03:00$/.test(v)&&Number.isFinite(Date.parse(v)))||Date.parse(command.end)<=Date.parse(command.start)||timeDate(command.start)!==timeDate(command.end))fail("Informe início e fim válidos no mesmo dia.");
}
// Only copy writable event fields; Google resource IDs, etags and organizer are never overwritten.
export function writableEvent(event:GoogleEvent){
  return Object.fromEntries(["summary","description","location","colorId","visibility","transparency","reminders","extendedProperties","attachments","conferenceData","attendees","guestsCanInviteOthers","guestsCanModify","guestsCanSeeOtherGuests"].filter(k=>event[k]!==undefined).map(k=>[k,structuredClone(event[k])]));
}
function weeklyRule(parent:GoogleEvent){
  if(parent.recurrence?.length!==1||!parent.recurrence[0].startsWith("RRULE:"))fail("Esta recorrência precisa ser ajustada no Google para preservar suas exceções.");
  const pairs=String(parent.recurrence[0]).slice(6).split(";").map(v=>v.split("="));
  const fields=Object.fromEntries(pairs);
  if(pairs.some(v=>v.length!==2)||new Set(pairs.map(v=>v[0])).size!==pairs.length||fields.FREQ!=="WEEKLY"||Object.keys(fields).some(k=>!["FREQ","INTERVAL","BYDAY","WKST","COUNT","UNTIL"].includes(k))||fields.COUNT&&fields.UNTIL)fail("Esta recorrência precisa ser ajustada no Google.");
  const weekday=["SU","MO","TU","WE","TH","FR","SA"][new Date(timeDate(parent.start.dateTime)+"T12:00:00Z").getUTCDay()];
  if(fields.BYDAY&&fields.BYDAY!==weekday)fail("Use o Google para séries com vários dias por semana.");
  if(parent.start.timeZone&&parent.start.timeZone!==zone)fail("Confira no Google a recorrência em outro fuso horário.");
  const interval=Number(fields.INTERVAL||1);
  if(!Number.isInteger(interval)||interval<1||interval>52||fields.COUNT&&(!/^\d+$/.test(fields.COUNT)||Number(fields.COUNT)<1)||fields.UNTIL&&!/^\d{8}T\d{6}Z$/.test(fields.UNTIL))fail("Recorrência inválida.");
  return {fields,step:interval*7*day};
}
const rrule=(fields:Record<string,string>)=>"RRULE:"+Object.entries(fields).map(([k,v])=>`${k}=${v}`).join(";");
const untilTime=(value:string)=>Date.parse(value.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/,"$1-$2-$3T$4:$5:$6Z"));
function rebaseProperties(event:GoogleEvent,boundary:string,delta:number){
  const properties=structuredClone(event.extendedProperties||{}),privateFields=properties.private||{};
  calendarRoster(privateFields); // Validate existing DMP metadata before touching the series.
  for(const [key,value] of Object.entries(privateFields))if(key===ROSTER_KEY||key.startsWith(RULE_PREFIX)){
    const rule=JSON.parse(String(value));
    if(Date.parse(rule.from)>=Date.parse(boundary))rule.from=new Date(Date.parse(rule.from)+delta).toISOString();
    privateFields[key]=JSON.stringify(rule);
  }
  return {...properties,private:privateFields};
}
export function buildTimePlan(command:TimeCommand,event:GoogleEvent,parent:GoogleEvent|undefined,exceptions:GoogleEvent[],now=new Date().toISOString()):TimePlan{
  validateTimeCommand(command);validEvent(event);
  if(event.id!==command.id||event.etag!==command.etag)fail("A aula mudou. Reabra a agenda antes de salvar.");
  if(timeDate(command.start)!==timeDate(event.start.dateTime))fail("Alterar horário mantém o dia da aula.");
  const checkedThrough=new Date(Date.parse(command.start)+366*day).toISOString();
  const plan:TimePlan={command,event,exceptions:[],checkedThrough};
  if(command.scope==="single")return plan;
  if(!parent||event.recurringEventId!==parent.id)fail("Esta aula não pertence a uma série recorrente.");
  validEvent(parent);
  const boundary=event.originalStartTime?.dateTime;
  if(!boundary||timeDate(boundary)<timeDate(now)||timeDate(boundary)!==timeDate(command.start))fail("Escolha uma ocorrência de hoje ou futura no dia original da série.");
  const {fields,step}=weeklyRule(parent),elapsed=(Date.parse(boundary)-Date.parse(parent.start.dateTime))/step;
  if(!Number.isInteger(elapsed)||elapsed<0)fail("A ocorrência não corresponde à recorrência oficial.");
  const delta=Date.parse(command.start)-Date.parse(boundary),future={...fields},past={...fields};
  if(fields.COUNT){const remaining=Number(fields.COUNT)-elapsed;if(remaining<1)fail("A série já terminou.");future.COUNT=String(remaining);}
  if(fields.UNTIL){if(untilTime(fields.UNTIL)<Date.parse(boundary))fail("A série já terminou.");future.UNTIL=stamp(untilTime(fields.UNTIL)+delta);}
  delete past.COUNT;past.UNTIL=stamp(Date.parse(boundary)-1000);
  // Splitting at the first occurrence is handled as a versioned master time change.
  const newId=elapsed===0?parent.id:"dmptime"+createHash("sha256").update(command.operationId).digest("hex");
  const futureExceptions=exceptions.filter(e=>e.recurringEventId===parent.id&&Date.parse(e.originalStartTime?.dateTime)>=Date.parse(boundary));
  if(elapsed===0&&futureExceptions.length)fail("A primeira aula já possui exceções. Revise a série pelo Google antes de mudar todos os horários.");
  if(futureExceptions.some(e=>e.status!=="cancelled"&&e.start?.dateTime&&timeDate(e.start.dateTime)!==timeDate(e.originalStartTime.dateTime)))fail("Há uma aula transferida para outro dia. Revise essa exceção no Google antes de mudar a série.");
  if(futureExceptions.length>100)fail("Há muitas exceções nesta série. Revise pelo Google.");
  for(const e of futureExceptions)if(!e.etag||e.status!=="cancelled"&&(!e.start?.dateTime||!e.end?.dateTime||e.organizer?.self!==true))fail("Não foi possível preservar todas as exceções da série.");
  const newSeries={...writableEvent(parent),id:newId,start:{dateTime:command.start,timeZone:zone},end:{dateTime:command.end,timeZone:zone},recurrence:[rrule(future)],extendedProperties:rebaseProperties(parent,boundary,delta)};
  return {...plan,parent,boundary,delta,newId,newSeries,trimmed:elapsed===0?undefined:[rrule(past)],exceptions:futureExceptions};
}
export function exceptionTimePatch(plan:TimePlan,exception:GoogleEvent):GoogleEvent{
  if(exception.status==="cancelled")return {status:"cancelled"};
  const date=timeDate(exception.start.dateTime);
  return {...writableEvent(exception),start:{dateTime:date+plan.command.start.slice(10),timeZone:zone},end:{dateTime:date+plan.command.end.slice(10),timeZone:zone},extendedProperties:rebaseProperties(exception,plan.boundary!,plan.delta!)};
}
export function plannedSlots(plan:TimePlan){
  if(plan.command.scope==="single")return [{start:plan.command.start,end:plan.command.end}];
  const {fields,step}=weeklyRule(plan.newSeries!);const until=fields.UNTIL?untilTime(fields.UNTIL):Infinity;
  const duration=Date.parse(plan.command.end)-Date.parse(plan.command.start),slots:Array<{start:string;end:string}>=[];
  for(let i=0,start=Date.parse(plan.command.start);start<Date.parse(plan.checkedThrough)&&start<=until&&i<Number(fields.COUNT||1000);i++,start+=step){
    const original=start-plan.delta!,exception=plan.exceptions.find(e=>Date.parse(e.originalStartTime.dateTime)===original);
    if(exception?.status==="cancelled")continue;
    if(exception){const patch=exceptionTimePatch(plan,exception);slots.push({start:patch.start!.dateTime,end:patch.end!.dateTime});}
    else slots.push({start:new Date(start).toISOString(),end:new Date(start+duration).toISOString()});
  }
  return slots;
}
export function assertNoTimeConflicts(plan:TimePlan,events:GoogleEvent[]){
  for(const slot of plannedSlots(plan))for(const other of events){
    if(other.status==="cancelled"||other.transparency==="transparent"||other.id===plan.event.id||plan.command.scope==="following"&&(other.recurringEventId===plan.parent?.id||other.id===plan.parent?.id||other.recurringEventId===plan.newId||other.id===plan.newId))continue;
    const start=other.start?.dateTime||other.start?.date&&other.start.date+"T00:00:00-03:00",end=other.end?.dateTime||other.end?.date&&other.end.date+"T00:00:00-03:00";
    if(start&&end&&Date.parse(slot.start)<Date.parse(end)&&Date.parse(slot.end)>Date.parse(start))fail(`Conflito em ${timeDate(slot.start).split("-").reverse().join("/")}: ${other.summary||"outro compromisso"}. Escolha outro horário.`);
  }
}
export function timePatchConfirmed(event:GoogleEvent,patch:GoogleEvent){return Object.entries(patch).every(([k,v])=>k==="start"||k==="end"?Date.parse(event[k]?.dateTime)===Date.parse((v as any).dateTime):same(event[k],v));}
