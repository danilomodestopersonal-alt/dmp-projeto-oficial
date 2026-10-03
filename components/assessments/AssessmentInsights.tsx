"use client";
import {useEffect,useState} from "react";
import type {Assessment} from "@/types/models";
import {assessmentInsightMetrics,assessmentInsightSeries,assessmentInsightValue,assessmentInsightDifference,assessmentReminderDate,type InsightMetric} from "@/lib/assessments/insights";
import styles from "./AssessmentInsights.module.css";
const dateLabel=(date:string)=>date.split("-").reverse().join("/");
const numberLabel=(value:number|null)=>value===null?"Não disponível":value.toLocaleString("pt-BR",{maximumFractionDigits:2});
export default function AssessmentInsights({assessments,preferenceKey,onOpenRecord}:{assessments:Assessment[];preferenceKey:string;onOpenRecord:(id:string)=>void}){
  const sorted=[...assessments].sort((a,b)=>a.date.localeCompare(b.date));
  const [metric,setMetric]=useState<InsightMetric>("weight");
  const [aId,setAId]=useState("");const [bId,setBId]=useState("");
  const [interval,setInterval]=useState(0);const [preferenceMessage,setPreferenceMessage]=useState("");
  useEffect(()=>{setAId("");setBId("");setInterval(0);setPreferenceMessage("");try{const value=Number(localStorage.getItem(`dmp_assessment_reminder_v1:${preferenceKey}`));if(Number.isInteger(value)&&value>=0&&value<=730)setInterval(value);}catch{setPreferenceMessage("Preferência indisponível neste navegador.");}},[preferenceKey]);
  function changeInterval(value:number){setInterval(value);try{localStorage.setItem(`dmp_assessment_reminder_v1:${preferenceKey}`,String(value));setPreferenceMessage("");}catch{setPreferenceMessage("Aviso ativo apenas nesta tela; navegador não permitiu salvar a preferência.");}}
  const a=sorted.find(item=>item.id===(aId||sorted.at(-2)?.id||sorted[0]?.id));const b=sorted.find(item=>item.id===(bId||sorted.at(-1)?.id));
  const spec=assessmentInsightMetrics.find(item=>item.key===metric)!;
  const series=assessmentInsightSeries(assessments,metric);
  const min=Math.min(...series.map(p=>p.value)),max=Math.max(...series.map(p=>p.value));
  const first=series.length?Date.parse(series[0].date):0,last=series.length?Date.parse(series.at(-1)!.date):0;
  const points=series.map(p=>({...p,x:45+(Date.parse(p.date)-first)/Math.max(1,last-first)*510,y:135-(p.value-min)/Math.max(1,max-min)*95}));
  const reminder=assessmentReminderDate(assessments,interval);const today=new Date().toLocaleDateString("en-CA");
  const differentSources=a&&b&&((a.sourceFileName||a.sourceUrl||"")!==(b.sourceFileName||b.sourceUrl||""));
  return <section className={styles.insights} aria-label="Evolução e comparação de avaliações">
    <header><div><small>EVOLUÇÃO INDIVIDUAL · EXPERIMENTAL</small><h3>Avaliações em perspectiva</h3></div><button type="button" onClick={()=>sorted[0]&&onOpenRecord(sorted[0].id)} disabled={!sorted.length}>{sorted.length} avaliações · Ver registros</button></header>
    <label className={styles.selector}>Indicador<select value={metric} onChange={e=>setMetric(e.target.value as InsightMetric)}>{assessmentInsightMetrics.map(item=><option value={item.key} key={item.key}>{item.label} ({item.unit})</option>)}</select></label>
    <div className={styles.chart}>
      {points.length?<><svg viewBox="0 0 600 180" role="img" aria-label={`${spec.label} em ${spec.unit}, ${points.length} avaliações registradas`}><text x="8" y="26">{numberLabel(max)} {spec.unit}</text><line x1="40" x2="560" y1="145" y2="145" stroke="#dce5d3"/>{points.length>1?<polyline points={points.map(p=>`${p.x},${p.y}`).join(" ")} fill="none" stroke="#789d29" strokeWidth="3"/>:null}{points.map(p=><circle key={p.id} cx={p.x} cy={p.y} r="5" fill="#527422"><title>{`${dateLabel(p.date)}: ${numberLabel(p.value)} ${spec.unit}`}</title></circle>)}<text x="40" y="170">{dateLabel(series[0].date)}</text><text x="560" y="170" textAnchor="end">{dateLabel(series.at(-1)!.date)}</text></svg><div className={styles.pointLinks}>{series.map(point=><button type="button" key={point.id} onClick={()=>onOpenRecord(point.id)}>{dateLabel(point.date)} · {numberLabel(point.value)} {spec.unit}</button>)}</div></>:<p>Sem valores registrados para {spec.label.toLowerCase()} ({spec.unit}). Nenhum campo ausente foi preenchido.</p>}
      <small>Somente valores originais registrados. A linha conecta as observações; não cria avaliações intermediárias.</small>
    </div>
    <div className={styles.selectors}>{[["Avaliação A",a?.id||"",setAId],["Avaliação B",b?.id||"",setBId]].map(([label,value,setter])=><label key={label as string}>{label as string}<select aria-label={label as string} value={value as string} disabled={!sorted.length} onChange={e=>(setter as (value:string)=>void)(e.target.value)}>{sorted.length?sorted.map(item=><option key={item.id} value={item.id}>{dateLabel(item.date)} · {item.id.slice(-5)}</option>):<option value="">Nenhuma avaliação</option>}</select></label>)}</div>
    {a&&b?<><div className={styles.tableScroll}><table><caption>Diferença B − A, em valores originais</caption><thead><tr><th>Indicador</th><th>{dateLabel(a.date)} (A)</th><th>{dateLabel(b.date)} (B)</th><th>B − A</th></tr></thead><tbody>{assessmentInsightMetrics.map(item=>{const diff=assessmentInsightDifference(a,b,item.key);return <tr key={item.key}><th>{item.label} ({item.unit})</th><td>{numberLabel(assessmentInsightValue(a,item.key))}</td><td>{numberLabel(assessmentInsightValue(b,item.key))}</td><td>{diff===null?"Não disponível":`${diff>0?"+":""}${numberLabel(diff)} ${item.unit==="%"?"p.p.":item.unit}`}</td></tr>;})}</tbody></table></div>{differentSources?<p className={styles.notice}>Arquivos/fontes de origem diferentes. Confira o método de medição antes de interpretar a comparação.</p>:null}<p className={styles.notice}>Variações são descritivas. Valores ausentes ou incompatíveis exigem revisão dos registros; não indicam diagnóstico.</p></>:<p>Registre avaliações para comparar duas datas. Os históricos e importações continuam disponíveis abaixo.</p>}
    <div className={styles.reminder}><label>Aviso de nova avaliação<select value={interval} onChange={e=>changeInterval(Number(e.target.value))}><option value="0">Desativado</option>{[30,45,60,90,120,180,365].map(days=><option key={days} value={days}>A cada {days} dias</option>)}</select></label><p>{!interval?"Ative se quiser acompanhar seu intervalo escolhido.":!reminder?"Sem avaliação anterior para calcular a próxima data.":`${reminder<today?"Período escolhido ultrapassado":"Próxima referência"}: ${dateLabel(reminder)}. Intervalo de ${interval} dias após a última avaliação.`}<small>Preferência deste navegador para este aluno. Sem envios externos; pode ser desativada.</small>{preferenceMessage?<small role="status">{preferenceMessage}</small>:null}</p></div>
  </section>;
}
