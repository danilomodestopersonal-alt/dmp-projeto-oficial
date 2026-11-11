"use client";
import {useEffect,useRef} from "react";
import type {CalendarEvent} from "@/types/models";

export default function CalendarAppointmentDetails({event,onClose}:{event:CalendarEvent;onClose:()=>void}){
 const close=useRef<HTMLButtonElement>(null);
 useEffect(()=>{const previous=document.activeElement as HTMLElement|null;close.current?.focus();return()=>previous?.focus();},[]);
 const time=(value:string)=>new Date(value).toLocaleString("pt-BR",{timeZone:"America/Sao_Paulo",dateStyle:"short",...(event.allDay?{}:{timeStyle:"short"})});
 return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="appointment-title" onKeyDown={e=>{if(e.key==="Escape")onClose();if(e.key==="Tab"){const nodes=e.currentTarget.querySelectorAll<HTMLElement>('button,a[href]');const first=nodes[0],last=nodes[nodes.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}}}>
  <div className="modal-head"><h2 id="appointment-title">{event.summary}</h2><button ref={close} type="button" className="text-button" onClick={onClose}>Fechar</button></div>
  <p className="muted">Compromisso · {event.allDay?"Dia inteiro":`${time(event.start)} — ${time(event.end)}`}</p>
  {event.location?<p>Local: {event.location}</p>:null}
  {event.description?.trim()?<p>{event.description}</p>:null}
  {event.htmlLink?<a className="secondary button-link" href={event.htmlLink} target="_blank" rel="noreferrer">Abrir no Google Calendar</a>:null}
 </section></div>;
}
