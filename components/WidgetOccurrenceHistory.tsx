"use client";
import type {Student} from "@/types/models";
import {widgetOccurrenceHistory} from "@/lib/widget/occurrence-history";
const time=(value:string)=>new Intl.DateTimeFormat("pt-BR",{timeZone:"America/Sao_Paulo",hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date(value));

/** A historical card must never open an editor that could recreate a cancelled Google occurrence. */
export default function WidgetOccurrenceHistory({eventId,date,students,onOpenStudent}:{eventId:string;date:string;students:Student[];onOpenStudent:(id:string)=>void}){
 const projection=widgetOccurrenceHistory(students,[],date),item=projection.occurrences.find(o=>o.event.id===eventId);
 if(!item)return <section className="panel" role="status"><h2>Histórico da aula</h2><p>Não foi possível identificar esta ocorrência com segurança. Confira o histórico dos alunos; nenhum horário ou participante foi reconstruído.</p></section>;
 return <section className="panel" aria-label="Histórico da aula"><h2>{time(item.event.start)}–{time(item.event.end)} · {date.split("-").reverse().join("/")}</h2><p>Aula preservada no histórico do DMP. Esta consulta não altera a agenda Google.</p><ul>{item.students.map((s,i)=>{const state=item.states[i]?.state,label=state==="absent"?"Ausência registrada":state==="present"?"Presença registrada":state==="pending"?"Sem confirmação":"Registro a conferir";return <li key={s.id}><span aria-hidden="true">{state==="absent"?"❌":state==="present"?"✅":"❔"} </span><strong>{s.name}</strong> · {label} <button type="button" className="secondary" onClick={()=>onOpenStudent(s.id)}>Abrir cadastro do aluno</button></li>;})}</ul></section>;
}
