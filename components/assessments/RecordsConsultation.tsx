"use client";
import styles from "./RecordsConsultation.module.css";
export type ConsultationRecord={id:string;date:string;title:string;notes?:string;lines?:string[]};
export default function RecordsConsultation({title,records,onClose}:{title:string;records:ConsultationRecord[];onClose:()=>void}){
 return <div className={styles.backdrop} onMouseDown={event=>{if(event.currentTarget===event.target)onClose();}}><section className={styles.dialog} role="dialog" aria-modal="true" aria-label={title}><header><div><small>ORIGEM DO INDICADOR</small><h3>{title}</h3><p>{records.length} registros · últimos 30 dias</p></div><button type="button" onClick={onClose}>Fechar</button></header><div className={styles.list}>{records.length?records.map(record=><details key={record.id}><summary><b>{record.date.split("-").reverse().join("/")}</b> · {record.title}</summary><p>{record.notes||"Sem observações adicionais."}</p>{record.lines?.length?<ul>{record.lines.map((line,index)=><li key={index}>{line}</li>)}</ul>:null}</details>):<p>Nenhum registro no período deste indicador.</p>}</div></section></div>;
}
