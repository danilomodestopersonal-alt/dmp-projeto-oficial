"use client";
import {useLayoutEffect,useRef,useState} from "react";
import type {Session} from "@/types/models";
import {LAST_PRESENCE_ENABLED,lastConfirmedPresence} from "@/lib/home/last-presence";
import styles from "./LastPresence.module.css";
export default function LastPresence({sessions}:{sessions:Session[]}){
 const ref=useRef<HTMLSpanElement>(null);const [mode,setMode]=useState(0);
 const today=new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Sao_Paulo"}).format(new Date());
 const date=lastConfirmedPresence(sessions,today);const short=date?date.slice(8)+"/"+date.slice(5,7):"";
 useLayoutEffect(()=>{const span=ref.current,parent=span?.parentElement,name=parent?.querySelector('.calendar-slot-student-name'),row=parent?.closest('.calendar-slot-student');if(!span||!parent||!name||!row)return;
 const measure=()=>{if(window.innerWidth<1000){setMode(0);return;}const occupied=Math.max(...Array.from(row.children).map(e=>e.getBoundingClientRect().right));const free=row.getBoundingClientRect().right-occupied-16;const full=span.querySelector('[data-full]')?.getBoundingClientRect().width||Infinity;const small=span.querySelector('[data-short]')?.getBoundingClientRect().width||Infinity;setMode(free>=full?2:free>=small?1:0);};
 const observer=new ResizeObserver(measure);observer.observe(row);observer.observe(parent);observer.observe(name);window.addEventListener('resize',measure);measure();return()=>{observer.disconnect();window.removeEventListener('resize',measure);};
 },[short]);
 if(!LAST_PRESENCE_ENABLED||!date)return null;
 return <span ref={ref} className={styles.indicator} data-mode={mode} title={'Última presença confirmada: '+short+'/'+date.slice(0,4)} aria-label={'Última presença confirmada: '+short+'/'+date.slice(0,4)} aria-hidden={mode===0}><span data-full>Última presença: {short}</span><span data-short>{short}</span></span>;
}
