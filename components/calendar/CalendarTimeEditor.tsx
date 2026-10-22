"use client";
import {useRef,useState,type FormEvent} from "react";
import type {CalendarEvent} from "@/types/models";
import type {TimeCommand} from "@/lib/calendar/time-change";
import styles from "./CalendarTimeEditor.module.css";
const local=(value:string)=>new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date(value)).replace(" ","T");
export default function CalendarTimeEditor({event,onClose,onSaved}:{event:CalendarEvent;onClose:()=>void;onSaved:()=>void}){
  const [start,setStart]=useState(local(event.start).slice(11)),[end,setEnd]=useState(local(event.end).slice(11));
  const [scope,setScope]=useState<"single"|"following">("single"),[error,setError]=useState(""),[saving,setSaving]=useState(false);
  const [resume,setResume]=useState<TimeCommand|null>(null),busy=useRef(false),operation=useRef<string|null>(null);
  async function save(e:FormEvent){
    e.preventDefault();if(busy.current)return;busy.current=true;setSaving(true);setError("");
    const date=local(event.start).slice(0,10);operation.current??=crypto.randomUUID();
    const command=resume||{id:event.id,etag:event.etag||"",start:`${date}T${start}:00-03:00`,end:`${date}T${end}:00-03:00`,scope,operationId:operation.current};
    try{
      const response=await fetch("/api/google/event-time",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(command)});
      const body=await response.json();
      if(response.ok&&body.confirmed===true){onSaved();return;}
      if(body.resume){setResume(body.resume);setStart(local(body.resume.start).slice(11));setEnd(local(body.resume.end).slice(11));setScope(body.resume.scope);}
      else if(!body.pending)operation.current=null;
      setError(body.error||"Não foi possível confirmar o horário.");
    }catch{setResume(command);setError("A resposta não chegou. Retome a mesma alteração para conferir no servidor.");}
    finally{busy.current=false;setSaving(false);}
  }
  async function cancelPending(){
    if(!resume||busy.current)return;busy.current=true;setSaving(true);setError("");
    try{const response=await fetch("/api/google/event-time",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...resume,cancel:true})});const body=await response.json();if(response.ok&&body.cancelled===true){onSaved();return;}setError(body.error||"Cancelamento não confirmado.");}catch{setError("Não foi possível confirmar o cancelamento. Tente novamente.");}finally{busy.current=false;setSaving(false);}
  }
  return <div className={styles.backdrop}><section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="calendar-time-title"><header><h2 id="calendar-time-title">Alterar horário</h2><button type="button" aria-label="Fechar alteração de horário" disabled={saving} onClick={onClose}>×</button></header><p>{event.summary}</p><p>{local(event.start).slice(0,10).split("-").reverse().join("/")}</p><form onSubmit={save}><div className={styles.times}><label>Início<input type="time" required value={start} disabled={saving||Boolean(resume)} onChange={e=>{operation.current=null;setStart(e.target.value);}}/></label><label>Fim<input type="time" required value={end} disabled={saving||Boolean(resume)} onChange={e=>{operation.current=null;setEnd(e.target.value);}}/></label></div><label>Aplicar a<select value={scope} disabled={saving||Boolean(resume)} onChange={e=>{operation.current=null;setScope(e.target.value as "single"|"following");}}><option value="single">Somente esta aula</option>{event.recurringEventId?<option value="following">Esta aula e as próximas</option>:null}</select></label>{scope==="following"?<small>Conflitos verificados nos próximos 12 meses. Aulas anteriores ficam preservadas.</small>:null}{error?<p role="alert" className={styles.error}>{error}</p>:null}<button type="submit" className="primary" disabled={saving||!event.etag}>{saving?"Conferindo…":resume?"Retomar alteração":"Salvar horário"}</button>{resume?<button type="button" className="secondary" disabled={saving} onClick={()=>void cancelPending()}>Cancelar alteração pendente</button>:null}</form></section></div>;
}
