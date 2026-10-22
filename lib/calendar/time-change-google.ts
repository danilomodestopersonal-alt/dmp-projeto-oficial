import {TimeChangeError,timePatchConfirmed,exceptionTimePatch,type TimePlan} from "./time-change";
export type TimeJournal={plan:TimePlan;done?:boolean;cancelled?:boolean;created?:boolean;createdEtag?:string;exceptionVersions?:Record<string,string>};
const operationKey="dmpTimeOperationV1";
const root="https://www.googleapis.com/calendar/v3/calendars/primary/events";
export function calendarTimeApi(token:string,request:typeof fetch=fetch){
  const call=async(path:string,method="GET",body?:unknown,etag?:string)=>{
    const r=await request(root+path,{method,headers:{authorization:`Bearer ${token}`,"Content-Type":"application/json",...(etag?{"If-Match":etag}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),cache:"no-store",signal:AbortSignal.timeout(15000)});
    if(r.status===404||r.status===410)return null;
    if(r.status===412)throw new TimeChangeError("A agenda mudou durante a gravação. Reabra a aula.");
    if(!r.ok)throw new TimeChangeError(`O Google não confirmou a operação (HTTP ${r.status}).`,502);
    return r.status===204?{}:r.json();
  };
  const read=async(id:string)=>{const event=await call("/"+encodeURIComponent(id));if(event&&event.id!==id)throw new TimeChangeError("Identidade do evento divergente.");return event;};
  const list=async(params:Record<string,string>,path="")=>{
    const all:any[]=[];let pageToken="";
    for(let page=0;page<20;page++){
      const body=await call(path+"?"+new URLSearchParams({...params,maxResults:"2500",...(pageToken?{pageToken}:{})}));
      if(!body||!Array.isArray(body.items))throw new TimeChangeError("Não foi possível conferir toda a agenda.",502);
      all.push(...body.items);if(!body.nextPageToken)return all;pageToken=body.nextPageToken;
    }
    throw new TimeChangeError("A consulta excedeu o limite seguro. Nenhum horário foi alterado.");
  };
  const patch=async(id:string,body:any,etag:string)=>{
    try{await call("/"+encodeURIComponent(id)+"?sendUpdates=none&conferenceDataVersion=1&supportsAttachments=true","PATCH",body,etag);}catch(error){
      const current=await read(id);if(!current||!timePatchConfirmed(current,body))throw error;
    }
    const saved=await read(id);if(!saved||!timePatchConfirmed(saved,body))throw new TimeChangeError("Alteração ainda não confirmada pelo Google.",502);return saved;
  };
  return {read,list,patch,insert:async(body:any)=>call("?sendUpdates=none&conferenceDataVersion=1&supportsAttachments=true","POST",body),remove:async(id:string,etag:string)=>call("/"+encodeURIComponent(id)+"?sendUpdates=none","DELETE",undefined,etag)};
}
export async function executeTimePlan(journal:TimeJournal,api:ReturnType<typeof calendarTimeApi>,save:(journal:TimeJournal)=>Promise<void>){
  const p=journal.plan,op=p.command.operationId;
  if(journal.cancelled)throw new TimeChangeError("Esta alteração foi cancelada. Reabra a aula.");
  if(journal.done)return;
  const mark=(event:any)=>({...event.extendedProperties,private:{...event.extendedProperties?.private,[operationKey]:op}});
  if(p.command.scope==="single"||!p.trimmed){
    const target=p.command.scope==="single"?p.event:p.parent!;
    const body:any=p.command.scope==="single"?{start:{...target.start,dateTime:p.command.start},end:{...target.end,dateTime:p.command.end},extendedProperties:mark(target)}:{start:p.newSeries!.start,end:p.newSeries!.end,recurrence:p.newSeries!.recurrence,extendedProperties:mark(p.newSeries)};
    const current=await api.read(target.id);
    if(!current)throw new TimeChangeError("A aula não está mais disponível.");
    if(!timePatchConfirmed(current,body)){
      if(current.etag!==target.etag)throw new TimeChangeError("A aula mudou. Reabra a agenda.");
      await api.patch(target.id,body,current.etag);
    }
    journal.done=true;await save(journal);return;
  }
  const newBody={...p.newSeries,extendedProperties:mark(p.newSeries)};
  let next=await api.read(p.newId!);
  if(!next){
    const currentParent=await api.read(p.parent!.id);
    if(!currentParent||currentParent.etag!==p.parent!.etag)throw new TimeChangeError("A série mudou antes da gravação. Reabra a aula.");
    try{next=await api.insert(newBody);}catch(error){next=await api.read(p.newId!);if(!next)throw error;}
  }
  if(!next||next.extendedProperties?.private?.[operationKey]!==op||!timePatchConfirmed(next,newBody))throw new TimeChangeError("A nova série está diferente da versão preparada. Revise a operação pendente.");
  if(journal.createdEtag&&journal.createdEtag!==next.etag)throw new TimeChangeError("A nova série foi alterada fora desta operação. Confira no Google.");
  journal.created=true;journal.createdEtag=next.etag;await save(journal);
  // Copy only real exceptions, including cancellations, before trimming the source.
  // Unbounded weekly instances are never turned into individual events.
  for(const exception of p.exceptions){
    const original=new Date(Date.parse(exception.originalStartTime.dateTime)+p.delta!).toISOString();
    const matches=(await api.list({originalStart:original,showDeleted:"true"},"/"+encodeURIComponent(p.newId!)+"/instances")).filter(e=>Date.parse(e.originalStartTime?.dateTime)===Date.parse(original));
    if(matches.length!==1)throw new TimeChangeError("Não foi possível localizar uma exceção na nova série.",502);
    let current=matches[0];const body=exceptionTimePatch(p,exception);
    if(!timePatchConfirmed(current,body)){
      if(journal.exceptionVersions?.[exception.id])throw new TimeChangeError("Uma exceção mudou durante a operação. Revise a agenda.");
      current=await api.patch(current.id,body,current.etag);
    }
    journal.exceptionVersions={...journal.exceptionVersions,[exception.id]:current.etag};await save(journal);
  }
  const parent=await api.read(p.parent!.id);
  if(!parent)throw new TimeChangeError("A série original não está disponível.");
  if(!timePatchConfirmed(parent,{recurrence:p.trimmed})){
    if(parent.etag!==p.parent!.etag)throw new TimeChangeError("A série original mudou. A operação precisa de revisão.");
    // Never discard an exception edited by somebody else since the plan was saved.
    for(const exception of p.exceptions){const current=await api.read(exception.id);if(!current||current.etag!==exception.etag)throw new TimeChangeError("Uma ocorrência mudou. A série original foi preservada.");}
    await api.patch(parent.id,{recurrence:p.trimmed},parent.etag);
  }
  const finalSeries=await api.read(p.newId!);
  if(!finalSeries||!timePatchConfirmed(finalSeries,newBody))throw new TimeChangeError("Confira a operação pendente antes de alterar novamente.");
  journal.done=true;await save(journal);
}

export async function cancelTimePlan(journal:TimeJournal,api:ReturnType<typeof calendarTimeApi>,save:(journal:TimeJournal)=>Promise<void>){
  if(journal.cancelled)return;
  if(journal.done)throw new TimeChangeError("A alteração já foi concluída. Atualize a agenda.");
  const p=journal.plan,target=p.parent||p.event,current=await api.read(target.id);
  if(!current)throw new TimeChangeError("A agenda já mudou. Retome a alteração para confirmar seu resultado.");
  if(p.newId&&p.trimmed){
    const created=await api.read(p.newId);
    if(created&&created.status!=="cancelled"){
      if(!timePatchConfirmed(current,{recurrence:target.recurrence}))throw new TimeChangeError("A série original já mudou. Retome a alteração para confirmar seu resultado.");
      if(created.extendedProperties?.private?.[operationKey]!==p.command.operationId||journal.createdEtag&&created.etag!==journal.createdEtag)throw new TimeChangeError("A nova série recebeu outra alteração. Revise no Google.");
      const exceptions=(await api.list({singleEvents:"false",showDeleted:"true"})).filter(e=>e.recurringEventId===p.newId);
      for(const exception of exceptions){
        const original=p.exceptions.find(e=>Date.parse(e.originalStartTime.dateTime)+(p.delta!)===Date.parse(exception.originalStartTime?.dateTime));
        if(!original||!timePatchConfirmed(exception,exceptionTimePatch(p,original)))throw new TimeChangeError("Uma exceção foi alterada. A agenda foi preservada para revisão.");
      }
      await api.remove(p.newId,created.etag);
      const check=await api.read(p.newId);if(check&&check.status!=="cancelled")throw new TimeChangeError("Cancelamento ainda não confirmado.",502);
    }
  }else if(current.extendedProperties?.private?.[operationKey]===p.command.operationId){
    throw new TimeChangeError("O horário já foi recebido pelo Google. Retome para concluir a confirmação.");
  }
  journal.done=true;journal.cancelled=true;await save(journal);
}
