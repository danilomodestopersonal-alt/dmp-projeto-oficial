"use client";
import {useEffect,useRef,useState} from "react";
import {FreeSessionScreen,PlannedSession} from "./DmpApp";
import {actionTarget,existingOccurrence,selectedOccurrence,type StudentActionTarget} from "@/lib/widget/student-action";
import type {CalendarEvent,Session,Student} from "@/types/models";
const labels={register:"Registrar treino",presence:"Confirmar presença",absence:"Confirmar ausência"};
export default function WidgetStudentAction({target:raw}:{target:unknown}){
 const [target]=useState(()=>actionTarget(raw));const [data,setData]=useState<{students:Student[];events:CalendarEvent[]}|null>(null);
 const [workoutId,setWorkoutId]=useState("");const [nextEventId,setNextEventId]=useState<string|null>(null);
 const [error,setError]=useState("");const [busy,setBusy]=useState(false);const [done,setDone]=useState(false);const [editing,setEditing]=useState(false);const [retry,setRetry]=useState(0);const submitting=useRef(false);
 useEffect(()=>{let active=true;setData(null);setError("");async function load(){try{
  const [students,calendar]=await Promise.all([fetch("/api/data",{cache:"no-store"}),fetch("/api/google/calendar?date="+target.date+"&days=1",{cache:"no-store"})]);
  if(students.status===401){const login=new URL("/login",location.origin);login.searchParams.set("next",location.pathname+location.search);location.replace(login);return;}
  if(calendar.status===401)throw new Error("Conexão com a Agenda Google indisponível. Abra o DMP e confira a conexão.");
  if(!students.ok||!calendar.ok)throw new Error("Não foi possível conferir a aula. Verifique sua conexão e a Agenda Google.");
  const s=await students.json(),e=await calendar.json();if(!Array.isArray(s.data)||!Array.isArray(e.events))throw new Error("Dados indisponíveis.");
  selectedOccurrence(s.data,e.events,target);if(active)setData({students:s.data,events:e.events});
 }catch(e){if(active)setError(e instanceof Error?e.message:"Não foi possível carregar a aula.");}}void load();return()=>{active=false;};},[target,retry]);
 async function save(session?:Session){if(submitting.current)return;submitting.current=true;setBusy(true);setError("");try{
  const response=await fetch("/api/widget/student-action",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({target,session})});
  const result=await response.json();if(!response.ok||!result.ok)throw new Error(result.message||"Registro não confirmado. Tente novamente.");
  setNextEventId(result.occurrenceComplete&&typeof result.nextEventId==="string"?result.nextEventId:null);setDone(true);setEditing(false);
 }catch(e){setError(e instanceof Error?e.message:"Não foi possível confirmar o registro.");}finally{submitting.current=false;setBusy(false);}}
 let selected:ReturnType<typeof selectedOccurrence>|null=null;try{if(data)selected=selectedOccurrence(data.students,data.events,target);}catch{}
 const workouts=selected?.student.workouts.filter(w=>w.active!==false&&!w.archivedAt)||[];
 const workout=workouts.find(w=>w.id===workoutId);
 const settled=selected?existingOccurrence(selected.student,target):null;
 return <main style={{maxWidth:760,margin:"0 auto",padding:20}}>
  <a href="/app?home=1">← Voltar ao DMP</a>
  <h1>{labels[target.action]}</h1>
  <p>{target.date.split("-").reverse().join("/")} · {target.time}</p>
  {selected?<><h2>{selected.student.name}</h2><p>{selected.event.summary}</p></>:null}
  {error?<p role="alert">{error}</p>:null}
  {done?<><p role="status">{target.action==="absence"?"Ausência registrada.":target.action==="presence"?"Presença registrada.":"Treino registrado."}</p><p><a className="primary" href="dmp-widget://refresh">Atualizar widgets e voltar à tela inicial</a></p><p>Se o Android não abrir o aplicativo DMP, volte à tela inicial e toque em ↻ no widget. O estado muda após a sincronização.</p>{nextEventId?<a className="primary" href={"/app?"+new URLSearchParams({widget:"event",date:target.date,id:nextEventId})}>Chamada concluída · próximo atendimento</a>:null}</>:settled?<p role="status">Este aluno já possui registro nesta ocorrência. Consulte o histórico para corrigir.</p>:selected?<>
   {editing?<fieldset disabled={busy} style={{border:0,padding:0}}>{workout?<PlannedSession key={workout.id} student={selected.student} workout={workout} onBack={()=>setEditing(false)} onSave={(session,cycle)=>{if(cycle){setError("Este registro altera somente a sessão. Edite o ciclo pela ficha do aluno.");return;}void save(session);}}/>:<FreeSessionScreen key={target.id+target.studentId+target.date} student={selected.student} onBack={()=>setEditing(false)} onSave={session=>void save(session)}/>}</fieldset>:<>
    {target.action==="register"?<label>Ficha deste aluno<select value={workoutId} onChange={e=>setWorkoutId(e.target.value)}><option value="">{workouts.length?"Escolha a ficha ou registre sem ficha":"Nenhuma ficha ativa · registro livre"}</option>{workouts.map(w=><option key={w.id} value={w.id}>{w.slot?`Treino ${w.slot} · `:""}{w.name}</option>)}</select></label>:null}
    <p>Esta ação vale somente para <strong>{selected.student.name}</strong>, nesta aula. Os demais alunos permanecem como estão.</p>
    <button className={target.action==="absence"?"danger":"primary"} disabled={busy} onClick={()=>target.action==="register"?setEditing(true):void save()}>{busy?"Confirmando…":labels[target.action]}</button>
   </>}
  </>:!error?<p role="status">Conferindo aluno e aula…</p>:null}
  {error&&!busy?<button className="secondary" onClick={()=>setRetry(n=>n+1)}>Conferir novamente</button>:null}
 </main>;
}
