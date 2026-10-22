import {useRef,useState} from "react";
import {saveHomeAttendance} from "@/lib/kids/home-attendance-client";
import type {CalendarEvent} from "@/types/models";
import type {KidsData} from "@/types/kids";
import {homeKidsCard} from "@/lib/kids/home-card";
import type {KidsLessonOpenRequest} from "@/components/kids/KidsPage";
import styles from "./HomeKidsLessonCard.module.css";

const categories={RED:"Vermelha",ORANGE:"Laranja",GREEN:"Verde",YELLOW:"Amarela"};
export default function HomeKidsLessonCard({event,request,data,onData,onOpen}:{event:CalendarEvent;request:KidsLessonOpenRequest;data:KidsData|null;onData:(data:KidsData)=>void;onOpen:(event:CalendarEvent)=>void}){
  const card=homeKidsCard(data,request);
  const saving=useRef(false);
  const [pending,setPending]=useState<string|null>(null);
  const [error,setError]=useState("");
  async function markAttendance(studentId:string,target:"PRESENT"|"ABSENT"){
    if(saving.current||!card.lessonId)return;
    saving.current=true;setPending(studentId);setError("");
    try{
      const result=await saveHomeAttendance({request,lessonId:card.lessonId,studentId,target,operationId:crypto.randomUUID()});
      if(result.data)onData(result.data);
      if(!result.ok)setError(result.error||"Não foi possível confirmar. Atualize a página.");
    }catch{setError("Não foi possível confirmar. Atualize a página.");}
    finally{saving.current=false;setPending(null);}
  }
  return <article className={`${styles.card} ${styles[request.category.toLowerCase()]}`} data-home-kids-card={event.id} aria-label={`Tênis Kids bola ${categories[request.category]}, ${request.time}`} onClick={e=>e.stopPropagation()}>
    <div className={styles.info}>
      <span className={styles.category}><i aria-hidden="true"/>Tênis Kids · Bola {categories[request.category]}</span>
      <strong className={styles.time}>{request.time}{card.endTime&&card.endTime!==request.time?<small>– {card.endTime}</small>:null}</strong>
      <span className={styles.meta}>{card.lessonId?<span>{card.students.length}{card.capacity?`/${card.capacity}`:""} aluno{card.students.length===1?"":"s"}{card.notice?.startsWith("Há alunos")?(card.students.length===1?" identificado":" identificados"):""}</span>:null}{card.status?<span>{card.status}</span>:null}</span>
      {card.teacher?<span className={styles.teacher}>{card.teacher}</span>:null}
      {event.description&&event.id.startsWith("dmp-kids:")?<small className={styles.description}>{event.description}</small>:null}
      <button type="button" className={styles.open} onClick={()=>onOpen(event)}>Abrir turma e chamada <span aria-hidden="true">›</span></button>
    </div>
    <div className={styles.roster}>
      {card.students.length?<ul className={styles.list}>{card.students.map(student=><li key={student.id} className={styles.student}>
        <span className={styles.identity}><strong>{student.name}</strong><small>{student.inactive?"Inativo · ":""}{student.state==="present"?"Presença registrada":student.state==="absent"?"Ausência registrada":card.status==="Cancelada"||card.status==="Feriado"?"Sem chamada nesta aula":student.presumed?"Presença padrão":"Presença não confirmada"}</small></span>
        <button type="button" className={`${styles.presence} ${student.state==="present"||student.presumed?styles.present:""}`} disabled={!student.canOpenAttendance||student.state!=="absent"||pending!==null} aria-label={student.state==="absent"?`Corrigir falta de ${student.name}`:student.state==="present"?`Presença registrada de ${student.name}`:student.presumed?`Presença padrão de ${student.name}`:`Presença não confirmada de ${student.name}`} onClick={()=>markAttendance(student.id,"PRESENT")}><span aria-hidden="true">✓</span></button>
        <button type="button" className={`${styles.absence} ${student.state==="absent"?styles.absent:""}`} disabled={!student.canOpenAttendance||student.state==="absent"||pending!==null} aria-busy={pending===student.id} title={student.state==="absent"?`Ausência registrada de ${student.name}`:`Registrar falta de ${student.name}`} aria-label={student.state==="absent"?`Ausência registrada de ${student.name}`:`Registrar falta de ${student.name}`} onClick={()=>markAttendance(student.id,"ABSENT")}><span aria-hidden="true">{pending===student.id?"…":"×"}</span></button>
      </li>)}</ul>:<p className={styles.empty}>{card.lessonId?"Nenhum aluno nesta aula.":"Lista disponível na chamada."}</p>}
      {card.notice?<p className={styles.notice}>{card.notice}</p>:null}
      {error?<p className={styles.error} role="alert">{error}</p>:null}
    </div>
  </article>;
}
