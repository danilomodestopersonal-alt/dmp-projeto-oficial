"use client";
import {useEffect,useRef,useState,type FormEvent} from 'react';
import type {AppointmentDeletion} from '@/lib/calendar/appointment-delete';
import type {CalendarEvent} from '@/types/models';
import styles from './CalendarAppointmentDetails.module.css';

type Draft={summary:string;start:string;end:string;location:string;description:string};
type Checked={event:CalendarEvent;canEdit:boolean;reason:string;parentEtag:string};
const dayAfter=(value:string,offset:number)=>new Date(Date.parse(value+'T12:00:00Z')+offset*86400000).toISOString().slice(0,10);
const local=(value:string)=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value)).replace(' ','T');
export function appointmentDraft(e:CalendarEvent):Draft{return {summary:e.summary,start:e.allDay?e.start.slice(0,10):local(e.start),end:e.allDay?dayAfter(e.end.slice(0,10),-1):local(e.end),location:e.location||'',description:e.description||''};}
export function appointmentBody(e:CalendarEvent,d:Draft,parentEtag:string,operationId:string){return {id:e.id,etag:e.etag||'',parentEtag,operationId,allDay:Boolean(e.allDay),summary:d.summary.trim(),location:d.location,description:d.description,start:e.allDay?d.start:d.start+':00-03:00',end:e.allDay?dayAfter(d.end,1):d.end+':00-03:00'};}
export default function CalendarAppointmentDetails({event,onClose,onSaved}:{event:CalendarEvent;onClose:()=>void;onSaved?:()=>void}){
 const [checked,setChecked]=useState<Checked>({event,canEdit:false,reason:'',parentEtag:''});
 const [draft,setDraft]=useState(()=>appointmentDraft(event)),[editing,setEditing]=useState(false),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState(''),[conflict,setConflict]=useState(false),[success,setSuccess]=useState(false);
 const [pending,setPending]=useState<ReturnType<typeof appointmentBody>|null>(null);
 const [deleting,setDeleting]=useState(false),[deletePending,setDeletePending]=useState<AppointmentDeletion|null>(null),[canReconfirm,setCanReconfirm]=useState(false);
 const deletionKey='dmp.appointment.delete:'+event.id;
 useEffect(()=>{try{const raw=sessionStorage.getItem(deletionKey);if(raw){const c=JSON.parse(raw);if(c.id===event.id){setDeletePending(c);setDeleting(true);}}}catch{}},[event.id]);
 const close=useRef<HTMLButtonElement>(null),title=useRef<HTMLInputElement>(null),busy=useRef(false);
 useEffect(()=>{const previous=document.activeElement as HTMLElement|null;close.current?.focus();return()=>{if(previous?.isConnected)previous.focus();};},[]);
 useEffect(()=>{if(editing)title.current?.focus();},[editing]);
 async function reload(signal?:AbortSignal){setLoading(true);setError('');try{const r=await fetch('/api/google/appointment?id='+encodeURIComponent(event.id),{cache:'no-store',signal});const data=await r.json();if(!r.ok)throw Error(data.message||'Não foi possível conferir o compromisso.');setChecked(data);setDraft(appointmentDraft(data.event));setConflict(false);setPending(null);setEditing(false);}catch(e){if(!signal?.aborted)setError(e instanceof Error?e.message:'Falha na consulta.');}finally{if(!signal?.aborted)setLoading(false);}}
 useEffect(()=>{const abort=new AbortController();void reload(abort.signal);return()=>abort.abort();},[event.id]);
 const current=checked.event;
 const googleLink=(()=>{try{const u=new URL(current.htmlLink||'');return u.protocol==='https:'&&['www.google.com','calendar.google.com'].includes(u.hostname)?u.href:null;}catch{return null;}})();
 const change=(key:keyof Draft,value:string)=>{setSuccess(false);setDraft(d=>({...d,[key]:value}));};
 async function save(e:FormEvent){e.preventDefault();if(busy.current||conflict||!checked.canEdit)return;
  if(!draft.summary.trim()||!draft.start||!draft.end||(current.allDay?draft.end<draft.start:draft.end<=draft.start)){setError('Confira o título e informe um término posterior ao início.');return;}
  busy.current=true;setSaving(true);setError('');setSuccess(false);
  const command=pending||appointmentBody(current,draft,checked.parentEtag,crypto.randomUUID());setPending(command);
  try{const r=await fetch('/api/google/appointment',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(command)});const data=await r.json();if(!r.ok||data.confirmed!==true){if(r.status>=400&&r.status<500){setPending(null);if(r.status===409)setConflict(true);}throw Error(data.message||'Não foi possível confirmar a alteração.');}setChecked(data);setDraft(appointmentDraft(data.event));setPending(null);setEditing(false);setSuccess(true);onSaved?.();}
  catch(e){setError(e instanceof Error?e.message:'A resposta não chegou.');if(e instanceof TypeError)setPending(command);}
  finally{busy.current=false;setSaving(false);}
 }
 async function remove(){
  if(busy.current||(!checked.canEdit&&!deletePending))return;
  busy.current=true;setSaving(true);setError('');
  const c:AppointmentDeletion=deletePending||{operationId:crypto.randomUUID(),calendarId:'primary',id:current.id,etag:current.etag||'',parentEtag:checked.parentEtag,scope:'single',confirmed:true};
  setDeletePending(c);try{sessionStorage.setItem(deletionKey,JSON.stringify(c));}catch{}
  try{
   const r=await fetch('/api/google/appointment/delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(c)}),d=await r.json();
   if(!r.ok||d.confirmed!==true){setCanReconfirm(d.canReconfirm===true);if(!d.pending&&r.status>=400&&r.status<500){setDeletePending(null);sessionStorage.removeItem(deletionKey);}throw Error(d.message||'Não foi possível confirmar a exclusão.');}
   sessionStorage.removeItem(deletionKey);setDeletePending(null);onSaved?.();onClose();
  }catch(e){setError(e instanceof Error?e.message:'Confira o resultado antes de repetir.');}
  finally{busy.current=false;setSaving(false);}
 }
 const dateLabel=(value:string)=>new Date(current.allDay?value.slice(0,10)+'T12:00:00Z':value).toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo',weekday:'short',day:'2-digit',month:'long'});
 const lastDay=current.allDay?dayAfter(current.end.slice(0,10),-1):local(current.end).slice(0,10);
 const firstDay=current.allDay?current.start.slice(0,10):local(current.start).slice(0,10);
 const duration=current.allDay?'Dia inteiro':local(current.start).slice(11)+'–'+local(current.end).slice(11);
 const dismiss=()=>{if(!saving){if(pending||deletePending)onSaved?.();onClose();}};
 return <div className={styles.backdrop} onMouseDown={e=>{if(e.target===e.currentTarget&&!editing)dismiss();}}><section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="appointment-title" onKeyDown={e=>{if(e.key==='Escape'&&!editing)dismiss();if(e.key==='Tab'){const nodes=Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),textarea:not(:disabled)'));const first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}}}>
  <header className={styles.header}><div className={styles.icon} aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 2v6m10-6v6M3 11h18"/></svg></div><div className={styles.heading}><span className={styles.eyebrow}>Compromisso · Google Calendar</span><h2 id="appointment-title">{editing?'Editar compromisso':current.summary}</h2></div><button ref={close} type="button" className={styles.close} aria-label="Fechar compromisso" disabled={saving} onClick={dismiss}>×</button></header>
  {deleting?<div className={styles.form}><h3>Excluir compromisso?</h3><p><strong>{current.summary}</strong></p><p>{dateLabel(current.start)} · {duration}</p><p>Origem: Google Calendar. Este compromisso será excluído do Google Calendar.</p>{current.recurringEventId?<p className={styles.hint}>Alcance: <strong>somente esta ocorrência</strong>. As demais datas da série serão mantidas. A exclusão da série inteira continua no Google.</p>:null}{deletePending?<p role="status" className={styles.hint}>A solicitação pode ter sido recebida. Confira o resultado; o DMP não repetirá a exclusão às cegas.</p>:null}{error?<p role="alert" className={styles.error}>{error}</p>:null}<footer className={styles.actions}><button type="button" className={styles.secondary} disabled={saving||Boolean(deletePending)} onClick={()=>{setDeleting(false);setError('');}}>Voltar</button>{canReconfirm?<button type="button" className={styles.secondary} disabled={saving||loading} onClick={()=>{sessionStorage.removeItem(deletionKey);setDeletePending(null);setCanReconfirm(false);setDeleting(false);void reload();}}>Reabrir para revisar</button>:null}<button type="button" className={styles.danger} disabled={saving||loading||(!checked.canEdit&&!deletePending)} onClick={()=>void remove()}>{saving?'Conferindo…':deletePending?'Conferir resultado':current.recurringEventId?'Excluir somente esta ocorrência':'Confirmar exclusão'}</button></footer></div>:editing?<form onSubmit={save} className={styles.form}>
   <label>Título<input ref={title} required maxLength={300} value={draft.summary} disabled={saving||Boolean(pending)} onChange={e=>change('summary',e.target.value)}/></label>
   <div className={styles.dates}><label>{current.allDay?'Data inicial':'Início'}<input type={current.allDay?'date':'datetime-local'} required value={draft.start} disabled={saving||Boolean(pending)} onInput={e=>change('start',e.currentTarget.value)} onChange={e=>change('start',e.target.value)}/></label><label>{current.allDay?'Último dia':'Término'}<input type={current.allDay?'date':'datetime-local'} required value={draft.end} disabled={saving||Boolean(pending)} onInput={e=>change('end',e.currentTarget.value)} onChange={e=>change('end',e.target.value)}/></label></div>
   <label>Local <span className={styles.optional}>opcional</span><input maxLength={1000} placeholder="Adicionar local" value={draft.location} disabled={saving||Boolean(pending)} onChange={e=>change('location',e.target.value)}/></label>
   <label>Observações <span className={styles.optional}>opcional</span><textarea rows={3} maxLength={8000} placeholder="Detalhes do compromisso" value={draft.description} disabled={saving||Boolean(pending)} onChange={e=>change('description',e.target.value)}/></label>
   <p className={styles.hint}>{current.recurringEventId?'A alteração vale somente para esta ocorrência. As demais datas da série serão mantidas.':'As alterações serão salvas neste compromisso do Google Calendar.'} Horários de São Paulo.</p>
   {error?<p role="alert" className={styles.error}>{error}</p>:null}
   {pending?<p className={styles.hint}>A alteração pode ter sido recebida. Confira a mesma operação antes de editar novamente.</p>:null}
   <footer className={styles.actions}>{conflict?<button type="button" className={styles.primary} disabled={loading} onClick={()=>void reload()}>Recarregar compromisso</button>:<button type="submit" className={styles.primary} disabled={saving||loading}>{saving?'Salvando…':pending?'Conferir e concluir':'Salvar alterações'}</button>}<button type="button" className={styles.secondary} disabled={saving||Boolean(pending)} onClick={()=>{setDraft(appointmentDraft(current));setEditing(false);setError('');}}>Cancelar</button></footer>
  </form>:<>
   <div className={styles.schedule}><strong>{dateLabel(current.start)}{lastDay!==firstDay?' — '+dateLabel(current.allDay?lastDay:lastDay+'T12:00:00-03:00'):''}</strong><span>{duration}</span></div>
   {current.recurringEventId?<p className={styles.recurring}>Compromisso recorrente · edição por ocorrência</p>:null}
   {current.location?<p className={styles.detail}><strong>Local</strong>{current.location}</p>:null}
   {current.description?.trim()?<div className={styles.detail}><strong>Observações</strong><p>{current.description}</p></div>:null}
   {success?<p role="status" className={styles.success}>Alterações salvas no Google Calendar.</p>:null}
   {error?<p role="alert" className={styles.error}>{error} <button className={styles.inline} onClick={()=>void reload()}>Tentar novamente</button></p>:null}
   {!loading&&!checked.canEdit&&checked.reason?<p className={styles.hint}>{checked.reason}</p>:null}
   <footer className={styles.actions}><button type="button" className={styles.primary} disabled={loading||!checked.canEdit} onClick={()=>{setEditing(true);setSuccess(false);setError('');}}>{loading?'Conferindo…':'Editar compromisso'}</button>{googleLink?<a className={styles.secondary} href={googleLink} target="_blank" rel="noreferrer">Abrir no Google</a>:null}</footer>{!loading&&checked.canEdit?<div className={styles.deleteArea}><button type="button" className={styles.deleteLink} onClick={()=>{setError('');setDeleting(true);}}>Excluir compromisso</button></div>:null}
  </>}
 </section></div>;
}
