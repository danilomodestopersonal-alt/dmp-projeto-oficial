// DMP-only weekly appointments. This module has no integration or billing imports.
export type FixedSchedule={title:string;weekdays:number[];startTime:string;endTime:string;startDate:string;endDate?:string;notes?:string};
export type FixedVersion=FixedSchedule&{effectiveFrom:string};
export type FixedSeries={id:string;versions:FixedVersion[];cancelledDates:string[];closedFrom?:string;closedReason?:'end'|'delete'};
export type FixedStore={schema:1;revision:number;series:FixedSeries[];operations:{id:string;digest:string}[]};
export type FixedOccurrence={id:string;seriesId:string;date:string;start:string;end:string;title:string;notes?:string;source:'dmp-fixed'};
export type FixedCommand={action:'create'|'edit'|'cancel-one'|'end'|'delete';seriesId:string;effectiveFrom?:string;date?:string;schedule?:FixedSchedule};
export class FixedError extends Error{constructor(message:string,public status=409){super(message);}}
export const emptyFixedStore=():FixedStore=>({schema:1,revision:0,series:[],operations:[]});
export function localDay(now=new Date()){return new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
export const validDay=(d:unknown):d is string=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&d>='2000-01-01'&&d<='2100-12-31'&&!Number.isNaN(Date.parse(d))&&new Date(d+'T12:00:00Z').toISOString().slice(0,10)===d;
const fail=(message:string):never=>{throw new FixedError(message,400);};
export function fixedSchedule(input:any):FixedSchedule{
 if(!input||typeof input.title!=='string'||!input.title.trim()||input.title.length>160)fail('Informe um nome com até 160 caracteres.');
 if(!Array.isArray(input.weekdays)||!input.weekdays.length||input.weekdays.length>7||input.weekdays.some((d:any)=>!Number.isInteger(d)||d<0||d>6)||new Set(input.weekdays).size!==input.weekdays.length)fail('Selecione os dias da semana.');
 if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(input.startTime)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(input.endTime)||input.endTime<=input.startTime)fail('Informe início e término no mesmo dia.');
 if(!validDay(input.startDate)||input.endDate&&(!validDay(input.endDate)||input.endDate<input.startDate))fail('Confira as datas inicial e final.');
 if(input.notes!==undefined&&(typeof input.notes!=='string'||input.notes.length>2000))fail('As observações devem ter até 2.000 caracteres.');
 return {title:input.title.trim(),weekdays:[...input.weekdays].sort(),startTime:input.startTime,endTime:input.endTime,startDate:input.startDate,...(input.endDate?{endDate:input.endDate}:{}),...(input.notes?.trim()?{notes:input.notes.trim()}: {})};
}
export function fixedCommand(input:any):FixedCommand{
 if(!input||!['create','edit','cancel-one','end','delete'].includes(input.action)||!/^[-a-zA-Z0-9]{16,80}$/.test(input.seriesId||''))fail('Pedido de compromisso inválido.');
 const c:FixedCommand={action:input.action,seriesId:input.seriesId};
 if(c.action==='create'||c.action==='edit')c.schedule=fixedSchedule(input.schedule);
 if(c.action!=='create'){
  if(c.action==='cancel-one'){if(!validDay(input.date))fail('Escolha a ocorrência.');c.date=input.date;}
  else {if(!validDay(input.effectiveFrom))fail('Escolha a data efetiva.');c.effectiveFrom=input.effectiveFrom;}
 }
 return c;
}
export function occurrenceOn(s:FixedSeries,date:string):FixedOccurrence|null{
 if(!validDay(date)||s.closedFrom&&date>=s.closedFrom||s.cancelledDates.includes(date))return null;
 const v=[...s.versions].reverse().find(v=>v.effectiveFrom<=date);
 if(!v||date<v.startDate||v.endDate&&date>v.endDate||!v.weekdays.includes(new Date(date+'T12:00:00Z').getUTCDay()))return null;
 return {id:'dmp-fixed:'+s.id+':'+date,seriesId:s.id,date,start:date+'T'+v.startTime+':00-03:00',end:date+'T'+v.endTime+':00-03:00',title:v.title,notes:v.notes,source:'dmp-fixed'};
}
export function fixedOccurrences(store:FixedStore,from:string,to=from):FixedOccurrence[]{
 if(!validDay(from)||!validDay(to)||to<from||Date.parse(to)-Date.parse(from)>366*86400000)return [];
 const list:FixedOccurrence[]=[];for(let d=from;d<=to;d=new Date(Date.parse(d+'T12:00:00Z')+86400000).toISOString().slice(0,10))for(const s of store.series){const o=occurrenceOn(s,d);if(o)list.push(o);}
 return list.sort((a,b)=>a.start.localeCompare(b.start)||a.id.localeCompare(b.id));
}
export function overlapsFixed(o:FixedOccurrence,events:{start:string;end:string}[]){return events.some(e=>Date.parse(e.start)<Date.parse(o.end)&&Date.parse(e.end)>Date.parse(o.start));}
export function applyFixedCommand(store:FixedStore,c:FixedCommand,now=new Date()):FixedStore{
 if(store.schema!==1||!Array.isArray(store.series))throw new FixedError('Registros indisponíveis.',503);
 const next:FixedStore=structuredClone(store),today=localDay(now),s=next.series.find(s=>s.id===c.seriesId);
 if(c.action==='create'){
  if(s)throw new FixedError('Este compromisso já existe. Atualize a lista.');
  if(next.series.length>=500)fail('Limite de 500 recorrências atingido.');
  next.series.push({id:c.seriesId,versions:[{...c.schedule!,effectiveFrom:c.schedule!.startDate}],cancelledDates:[]});
 }else{
  if(!s)throw new FixedError('Compromisso não encontrado.',404);
  const effective=c.date||c.effectiveFrom!;
  if(effective<today)fail('Escolha hoje ou uma data futura. O histórico será preservado.');
  const occurring=occurrenceOn(s,effective);
  if(occurring&&Date.parse(occurring.start)<now.getTime())fail('Essa ocorrência já começou. Escolha a próxima data; o histórico foi preservado.');
  if(c.action==='cancel-one'){
   if(!occurring)throw new FixedError('A ocorrência mudou ou já foi cancelada. Atualize a lista.');
   if(s.cancelledDates.length>=5000)fail('Limite de exceções atingido.');
   s.cancelledDates.push(c.date!);s.cancelledDates.sort();
  }else if(c.action==='edit'){
   if(s.closedFrom&&effective>=s.closedFrom)fail('A recorrência está encerrada. Crie um novo compromisso.');
   if(s.versions.length>=500)fail('Limite de alterações atingido.');
   // Later scheduled revisions require explicit review, never silently overwrite.
   if(s.versions.some(v=>v.effectiveFrom>effective))throw new FixedError('Há uma alteração programada após esta data. Confira-a antes de editar.');
   s.versions=s.versions.filter(v=>v.effectiveFrom!==effective);
   s.versions.push({...c.schedule!,effectiveFrom:effective});s.versions.sort((a,b)=>a.effectiveFrom.localeCompare(b.effectiveFrom));
  }else{
   if(s.closedFrom&&s.closedFrom<=effective)throw new FixedError('A recorrência já está encerrada nesta data.');
   s.closedFrom=effective;s.closedReason=c.action;
  }
 }
 next.revision++;return next;
}
