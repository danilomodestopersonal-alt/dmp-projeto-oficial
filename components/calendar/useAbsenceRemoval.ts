"use client";
import {useEffect,useRef,useState,type Dispatch,type SetStateAction} from "react";
import type {CalendarEvent,Student} from "@/types/models";
import type {AbsenceOperation} from "@/lib/calendar/absence-removal";
export function useAbsenceRemoval(setStudents:Dispatch<SetStateAction<Student[]>>,onCalendarChange:(event?:CalendarEvent)=>Promise<void>){
 const [operations,setOperations]=useState<AbsenceOperation[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const revision=useRef(0);const queue=useRef(Promise.resolve());const active=useRef(new Set<string>());
 useEffect(()=>{let alive=true;fetch("/api/google/absence",{cache:"no-store"}).then(r=>{if(!r.ok)throw Error();return r.json();}).then(data=>{if(alive&&revision.current===0)setOperations(data.operations||[]);}).catch(()=>{if(alive)setError("Não foi possível consultar as retiradas pendentes. Atualize a página quando a conexão voltar.");});return()=>{alive=false;};},[]);
 async function run(student:Student,event:CalendarEvent,action:"register"|"retry",reviewed=false){
  const identity=JSON.stringify([student.id,event.id]);if(active.current.has(identity))return;active.current.add(identity);revision.current++;setBusy(true);
  const execute=async()=>{setError("");try{
   const r=await fetch("/api/google/absence",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({studentId:student.id,event,action,reviewed}),signal:AbortSignal.timeout(90000)});
   const data=await r.json();if(!r.ok||!data.saved||!data.session)throw Error(data.message||"Não foi possível confirmar a ausência. Consulte o histórico antes de repetir.");
   setStudents(current=>current.map(s=>s.id!==student.id||s.sessions.some(a=>a.id===data.session.id)?s:{...s,sessions:[data.session,...s.sessions]}));
   setOperations(current=>[...current.filter(o=>o.key!==data.operation.key),...(data.operation.state==="confirmed"?[]:[data.operation])]);
   if(data.operation.state==="confirmed")await onCalendarChange(data.event);
  }catch(e){setError(e instanceof Error?e.message:"Falha de conexão. A confirmação pode ter sido salva: atualize a página e confira as pendências.");}finally{active.current.delete(identity);setBusy(active.current.size>0);}};
  queue.current=queue.current.then(execute,execute);await queue.current;
 }
 return{operations,busy,error,register:(student:Student,event:CalendarEvent)=>run(student,event,"register"),retry:(student:Student,event:CalendarEvent,reviewed=false)=>run(student,event,"retry",reviewed)};
}
