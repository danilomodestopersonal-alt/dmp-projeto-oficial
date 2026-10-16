"use client";
import {useEffect,useRef,type ReactNode} from "react";
export default function TaskDialog({children,onClose,modern}:{children:ReactNode;onClose:()=>void;modern:boolean}){
 const ref=useRef<HTMLElement>(null);const close=useRef(onClose);close.current=onClose;
 useEffect(()=>{
  if(!modern)return;
  const prior=document.activeElement as HTMLElement|null;
  const host=ref.current;if(!host)return;
  const focusable=()=>Array.from(host.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),a[href],[tabindex="0"]')).filter(e=>e.getClientRects().length>0);
  (host.querySelector<HTMLElement>('.note-modal-title')||focusable()[0])?.focus();
  const handler=(e:KeyboardEvent)=>{
   if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close.current();}
   if(e.key==='Tab'){const list=focusable();const first=list[0],last=list[list.length-1];if(!first){e.preventDefault();host.focus();return;}if(e.shiftKey&&(document.activeElement===first||!host.contains(document.activeElement))){e.preventDefault();last.focus();}else if(!e.shiftKey&&(document.activeElement===last||!host.contains(document.activeElement))){e.preventDefault();first.focus();}}
  };
  document.addEventListener('keydown',handler,true);
  return()=>{document.removeEventListener('keydown',handler,true);if(prior?.isConnected)prior.focus({preventScroll:true});};
 },[modern]);
 return <section ref={ref} className="note-modal todoist-edit-modal" role="dialog" aria-modal="true" aria-label="Editar tarefa do Todoist" tabIndex={-1} onMouseDown={e=>e.stopPropagation()}>{children}</section>;
}
