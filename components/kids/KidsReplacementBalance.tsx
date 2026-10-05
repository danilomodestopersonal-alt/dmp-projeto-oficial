"use client";

import { useEffect, useMemo, useState } from "react";
import type { KidsData, KidsLesson } from "@/types/kids";
import {
  KIDS_REPLACEMENT_BALANCE_START,
  computeKidsReplacementBalances,
  computeKidsStudentReplacementBalance,
  isKidsFifthMonthlyLesson,
  kidsBalanceSigned,
  type KidsReplacementBalance,
  type KidsReplacementBalanceEvent,
} from "@/lib/kids/replacement-balance";
import {bindReplacementModalBack} from "@/lib/kids/modal-back";
import styles from "./KidsReplacementBalance.module.css";

function fmtDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

type ReplacementReportRow={name:string;quantity:number;details:string[]};
function replacementReportTone(title:string,detail:string){
  const attendanceView=/quem já realizou|faltas nas reposições|presenças e faltas/i.test(title);
  if(attendanceView&&/falta/i.test(detail))return "absent";
  if(/crédito antecipado:|presença ainda não confirmada/i.test(detail))return "anticipated";
  if(/a repor|pendente/i.test(detail)&&!/saldo|crédito[s]? gerado/i.test(detail))return "pending";
  if(/reposta|reposição|5ª aula/i.test(detail))return "resolved";
  return "neutral";
}

function reportPeriodLabel(period:OperationPeriod,data:KidsData){
  if(period==="month")return new Date(`${dateKey().slice(0,7)}-01T12:00:00`).toLocaleDateString("pt-BR",{month:"long",year:"numeric"});
  return `${fmtDate(data.semesterStart)} a ${fmtDate(data.semesterEnd)}`;
}

function reportFileName(period:OperationPeriod,extension:"pdf"|"png"){
  const periodName=period==="month"
    ? new Date().toLocaleDateString("pt-BR",{month:"long",year:"numeric"}).replace(/\s+de\s+/g,"_")
    :"Semestre_2026";
  return `Reposicoes_Kids_${periodName.replace(/^./,letter=>letter.toUpperCase()).replace(/\s+/g,"_")}.${extension}`;
}

function reportEscape(value:string){
  return value.replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]||char));
}

function exportReplacementPdf(title:string,periodLabel:string,summary:string,rows:ReplacementReportRow[],fileName:string){
  const popup=window.open("","_blank");
  if(!popup){window.alert("Permita a abertura de janelas para gerar o PDF.");return;}
  const html=`<!doctype html><html><head><meta charset="utf-8"><title>${reportEscape(fileName.replace(/\.pdf$/i,""))}</title><style>@page{size:A4;margin:13mm}*{box-sizing:border-box}body{margin:0;color:#173d37;font-family:Arial,sans-serif}header{border-bottom:4px solid #b6dd39;padding-bottom:12px}header small{font-weight:800;color:#71803f;letter-spacing:.08em}h1{margin:5px 0;font-size:24px}header p{margin:3px 0;color:#66726c}.summary{margin:16px 0;padding:12px 14px;border-radius:10px;background:#203a29;color:#fff;font-weight:700}.row{break-inside:avoid;border:1px solid #dfe7dc;border-radius:10px;margin:0 0 8px;padding:10px}.row h2{display:flex;justify-content:space-between;margin:0 0 6px;font-size:15px}.row h2 b{display:grid;place-items:center;min-width:28px;height:28px;border-radius:50%;background:#203a29;color:#fff}.anticipated{color:#946100}.resolved{color:#237940}.pending,.absent{color:#ad392a}.row ul{margin:0;padding-left:18px;color:#5f6d66;font-size:11px;line-height:1.45}footer{margin-top:20px;border-top:1px solid #dfe5db;padding-top:8px;color:#77827c;font-size:10px}@media print{button{display:none}}</style></head><body><header><small>REPOSIÇÕES KIDS · DMP</small><h1>${reportEscape(title)}</h1><p>Período: ${reportEscape(periodLabel)}</p></header><div class="summary">${reportEscape(summary)}</div>${rows.map(row=>`<section class="row"><h2><span>${reportEscape(row.name)}</span><b>${row.quantity}</b></h2><ul>${row.details.map(detail=>`<li class="${replacementReportTone(title,detail)}">${reportEscape(detail)}</li>`).join("")||"<li>Sem registros detalhados.</li>"}</ul></section>`).join("")||"<p>Nenhum registro neste período.</p>"}<footer>Emitido em ${new Date().toLocaleString("pt-BR")} · Danilo Modesto Personal Trainer</footer><script>window.onload=()=>setTimeout(()=>window.print(),300)<\/script></body></html>`;
  popup.document.open();popup.document.write(html);popup.document.close();
}

function exportReplacementPng(title:string,periodLabel:string,summary:string,rows:ReplacementReportRow[],fileName:string){
  const width=1200;const canvas=document.createElement("canvas");const ctx=canvas.getContext("2d");
  if(!ctx){window.alert("Não foi possível gerar a imagem.");return;}
  const wrap=(text:string,font:string,maxWidth:number)=>{
    ctx.font=font;const lines:string[]=[];let line="";
    for(const word of text.split(/\s+/)){const next=line?`${line} ${word}`:word;if(line&&ctx.measureText(next).width>maxWidth){lines.push(line);line=word;}else line=next;}
    if(line)lines.push(line);return lines;
  };
  const summaryLines=wrap(summary,"20px Arial",width-110);
  const blocks=rows.map(row=>({row,nameLines:wrap(row.name,"700 23px Arial",width-170),details:(row.details.length?row.details:["Sem registros detalhados."]).flatMap(detail=>wrap(`• ${detail}`,"18px Arial",width-145).map(text=>({text,tone:replacementReportTone(title,detail)})))}));
  const headerHeight=155+summaryLines.length*26;
  const height=Math.max(500,headerHeight+60+blocks.reduce((sum,b)=>sum+35+b.nameLines.length*28+b.details.length*26,0));
  canvas.width=width;canvas.height=height;ctx.fillStyle="#f8fbf5";ctx.fillRect(0,0,width,height);
  ctx.fillStyle="#203a29";ctx.fillRect(0,0,width,headerHeight);ctx.fillStyle="#d8ee52";ctx.font="700 20px Arial";ctx.fillText("REPOSIÇÕES KIDS · DMP",55,40);
  ctx.fillStyle="#fff";ctx.font="700 34px Arial";ctx.fillText(title,55,86,width-110);ctx.font="20px Arial";ctx.fillText(`Período: ${periodLabel}`,55,122);
  summaryLines.forEach((line,index)=>ctx.fillText(line,55,151+index*26));let y=headerHeight+20;
  blocks.forEach(({row,nameLines,details})=>{
    const blockHeight=23+nameLines.length*28+details.length*26;
    ctx.fillStyle="#fff";ctx.strokeStyle="#dce5d8";ctx.lineWidth=2;ctx.beginPath();ctx.roundRect(40,y,width-80,blockHeight,14);ctx.fill();ctx.stroke();
    ctx.fillStyle="#173d37";ctx.font="700 23px Arial";nameLines.forEach((line,index)=>ctx.fillText(line,62,y+28+index*28));
    ctx.fillStyle="#203a29";ctx.beginPath();ctx.arc(width-75,y+25,22,0,Math.PI*2);ctx.fill();ctx.fillStyle="#fff";ctx.font="700 18px Arial";ctx.textAlign="center";ctx.fillText(String(row.quantity),width-75,y+31);ctx.textAlign="left";
    ctx.font="18px Arial";details.forEach(({text,tone},index)=>{ctx.fillStyle=tone==="anticipated"?"#946100":tone==="resolved"?"#237940":tone==="absent"||tone==="pending"?"#ad392a":"#66736c";ctx.fillText(text,62,y+29+nameLines.length*28+index*26);});
    y+=blockHeight+12;
  });
  ctx.fillStyle="#77827c";ctx.font="16px Arial";ctx.fillText(`Emitido em ${new Date().toLocaleString("pt-BR")}`,45,height-12);
  canvas.toBlob(blob=>{if(!blob)return;const link=document.createElement("a");link.href=URL.createObjectURL(blob);link.download=fileName;link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);},"image/png");
}

const KIDS_WEEKDAY_ORDER = ["segunda", "terca", "quarta", "quinta", "sexta", "sabado", "domingo"];

function classScheduleOrder(name: string) {
  const normalized = normalizeSearch(name);
  const foundDay = KIDS_WEEKDAY_ORDER.findIndex(day => normalized.includes(day));
  const timeMatch = normalized.match(/(?:^|[,\s])(\d{1,2})(?::(\d{2}))?\s*h\b/);
  const hour = timeMatch ? Number(timeMatch[1]) : 99;
  const minute = timeMatch?.[2] ? Number(timeMatch[2]) : 0;
  return { day: foundDay >= 0 ? foundDay : 99, minutes: hour * 60 + minute };
}

function compareClassSchedule(a: string, b: string) {
  const left = classScheduleOrder(a);
  const right = classScheduleOrder(b);
  return left.day - right.day || left.minutes - right.minutes || a.localeCompare(b, "pt-BR");
}

function categoryTextColor(category?: string) {
  if (category === "RED") return "#c62828";
  if (category === "ORANGE") return "#d85b00";
  if (category === "GREEN") return "#238b45";
  if (category === "YELLOW") return "#9a7200";
  return "inherit";
}

function EventList({title,events,empty}:{title:string;events:KidsReplacementBalanceEvent[];empty:string}) {
  return <div className={styles.eventColumn}>
    <strong>{title} <span>{events.length}</span></strong>
    {events.length ? <div className={styles.eventList}>{events.map(event =>
      <div className={styles.eventRow} key={event.id}>
        <b>{fmtDate(event.date)}</b>
        <small>{event.className} · {event.label}</small>
      </div>
    )}</div> : <small className={styles.empty}>{empty}</small>}
  </div>;
}

function Metrics({balance}:{balance:KidsReplacementBalance}) {
  return <div className={styles.metrics}>
    <div><span>Aulas a repor</span><strong>{balance.due}</strong></div>
    <div><span>Aulas repostas</span><strong>{balance.replaced}</strong></div>
    <div className={balance.balance > 0 ? styles.positive : balance.balance < 0 ? styles.negative : styles.neutral}>
      <span>Saldo</span><strong>{kidsBalanceSigned(balance.balance)}</strong>
    </div>
  </div>;
}

// DMP_KIDS_EXTRATO_CREDITOS_REPOSICAO_V615_20260919
type OperationPeriod = "semester" | "month";
type OperationDetail = "generated" | "performed" | "pending" | "absent" | "advance" | "attendance" | "attention";
type CreditLedgerItem = {
  credit:KidsReplacementBalanceEvent;
  replacement?:KidsReplacementBalanceEvent;
  status:"RESOLVED"|"ANTICIPATED"|"PENDING";
};
type DetailEvent = {
  date:string;
  label:string;
  className?:string;
  tone?:"resolved"|"anticipated"|"pending"|"absent";
  section?:string;
};

type StudentOperationRow = {
  id:string;
  name:string;
  due:number;
  replaced:number;
  pending:number;
  advance:number;
  netBalance:number;
  dueEvents:KidsReplacementBalanceEvent[];
  replacedEvents:KidsReplacementBalanceEvent[];
  pendingEvents:KidsReplacementBalanceEvent[];
  advanceEvents:KidsReplacementBalanceEvent[];
  allAdvanceEvents:KidsReplacementBalanceEvent[];
  scheduledDates:string[];
  absentReplacementEvents:KidsReplacementBalanceEvent[];
  attendanceEvents:Array<{date:string;status:"PRESENT"|"ABSENT";source:"REPLACEMENT"|"FIFTH_CLASS";className:string}>;
  creditLedger:CreditLedgerItem[];
};

type KidsReplacementOperationMetrics = {
  creditsGenerated:number;
  creditsPerformed:number;
  creditsPending:number;
  creditsAdvance:number;
  creditsCoverage:number;
  creditsPendingPercent:number;
  activeStudents:number;
  studentsWaiting:number;
  studentsTwoPlus:number;
  scheduledStudents:number;
  absentReplacements:number;
  attendancePresent:number;
  attendanceAbsent:number;
  attendanceRate:number;
  oldestPendingDate:string;
  rows:StudentOperationRow[];
};

function operationPercent(resolved:number,total:number){
  if(total<=0)return 100;
  return Math.max(0,Math.min(100,Math.round((resolved/total)*100)));
}

function dateKey(date=new Date()){
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
}

function periodIncludes(date:string,period:OperationPeriod,data:KidsData){
  if(period==="month")return date.startsWith(dateKey().slice(0,7));
  return date>=data.semesterStart&&date<=data.semesterEnd;
}

function replacementLessonOccurred(lesson:KidsLesson,data:KidsData){
  if(lesson.status==="COMPLETED")return true;
  if(lesson.status!=="SCHEDULED")return false;
  const group=data.classes.find(item=>item.id===lesson.classId);
  const end=lesson.replacementEndTime||lesson.replacementStartTime||group?.endTime||group?.startTime||"23:59";
  return new Date(`${lesson.date}T${end}:00`).getTime()<=Date.now();
}

function computeKidsReplacementOperationMetrics(data:KidsData,period:OperationPeriod,includeAll=false):KidsReplacementOperationMetrics {
  const students=new Map<string,string>();
  data.classes.filter(group=>includeAll||group.active!==false).forEach(group=>group.students.filter(student=>includeAll||student.active).forEach(student=>{
    if(!students.has(student.id))students.set(student.id,student.name);
  }));
  const studentIds=[...students.keys()];
  const studentIdSet=new Set(studentIds);
  const scheduledByStudent=new Map<string,string[]>();
  const attendanceByStudent=new Map<string,Array<{date:string;status:"PRESENT"|"ABSENT";source:"REPLACEMENT"|"FIFTH_CLASS";className:string}>>();

  data.lessons.filter(lesson=>lesson.kind==="REPLACEMENT"&&periodIncludes(lesson.date,period,data)).forEach(lesson=>{
    const occurred=replacementLessonOccurred(lesson,data);
    (lesson.replacementStudentIds||[]).filter(id=>studentIdSet.has(id)).forEach(studentId=>{
      if(lesson.status==="SCHEDULED"&&!occurred){
        const dates=scheduledByStudent.get(studentId)||[];
        if(!dates.includes(lesson.date))dates.push(lesson.date);
        scheduledByStudent.set(studentId,dates);
      }
      if(occurred){
        const events=attendanceByStudent.get(studentId)||[];
        events.push({
          date:lesson.date,
          status:lesson.attendance?.[studentId]==="ABSENT"?"ABSENT":"PRESENT",
          source:"REPLACEMENT",
          className:lesson.replacementName||data.classes.find(item=>item.id===lesson.classId)?.name||"Aula de reposição",
        });
        attendanceByStudent.set(studentId,events);
      }
    });
  });

  // A 5ª aula do mês já funciona como reposição para todos. Quando ela
  // acontece, a chamada também precisa compor o indicador de comparecimento,
  // sem alterar a regra de crédito: presença e falta contam igualmente como
  // reposição realizada.
  data.lessons
    .filter(lesson=>lesson.kind!=="REPLACEMENT"&&periodIncludes(lesson.date,period,data))
    .filter(lesson=>isKidsFifthMonthlyLesson(data,lesson)&&replacementLessonOccurred(lesson,data))
    .forEach(lesson=>{
      const group=data.classes.find(item=>item.id===lesson.classId);
      if(!group)return;
      group.students
        .filter(student=>student.active&&(!student.startDate||student.startDate<=lesson.date)&&studentIdSet.has(student.id))
        .forEach(student=>{
          const events=attendanceByStudent.get(student.id)||[];
          events.push({
            date:lesson.date,
            status:lesson.attendance?.[student.id]==="ABSENT"?"ABSENT":"PRESENT",
            source:"FIFTH_CLASS",
            className:group.name,
          });
          attendanceByStudent.set(student.id,events);
        });
    });

  const rows=studentIds.map((studentId):StudentOperationRow=>{
    const balance=computeKidsStudentReplacementBalance(data,studentId);
    const allDueEvents=balance.events.filter(event=>event.type==="DUE").sort((a,b)=>a.date.localeCompare(b.date));
    const allReplacedEvents=balance.events.filter(event=>event.type==="REPLACED").sort((a,b)=>a.date.localeCompare(b.date));
    const resolved=Math.min(allDueEvents.length,allReplacedEvents.length);
    const creditLedger:CreditLedgerItem[]=allDueEvents.map((credit,index)=>({
      credit,
      replacement:index<resolved?allReplacedEvents[index]:undefined,
      status:index<resolved
        ? allReplacedEvents[index].stage==="ANTICIPATED"?"ANTICIPATED":"RESOLVED"
        :"PENDING",
    }));
    const dueEvents=allDueEvents.filter(event=>periodIncludes(event.date,period,data));
    const replacedEvents=allReplacedEvents.filter(event=>periodIncludes(event.date,period,data)&&event.stage!=="ANTICIPATED");
    const pendingEvents=creditLedger.filter(item=>item.status==="PENDING"&&periodIncludes(item.credit.date,period,data)).map(item=>item.credit);
    const advanceEvents=allReplacedEvents.slice(resolved).filter(event=>periodIncludes(event.date,period,data));
    return {
      id:studentId,
      name:students.get(studentId)||"Criança",
      due:dueEvents.length,
      replaced:replacedEvents.length,
      pending:pendingEvents.length,
      advance:advanceEvents.length,
      netBalance:balance.due-balance.replaced,
      dueEvents,
      replacedEvents,
      pendingEvents,
      advanceEvents,
      allAdvanceEvents:allReplacedEvents.slice(resolved),
      scheduledDates:(scheduledByStudent.get(studentId)||[]).sort(),
      absentReplacementEvents:replacedEvents.filter(event=>
        event.label.toLowerCase().includes("falta")||data.lessons.find(lesson=>lesson.id===event.lessonId)?.attendance?.[studentId]==="ABSENT"
      ).filter((event,index,events)=>events.findIndex(other=>other.lessonId===event.lessonId)===index),
      attendanceEvents:(attendanceByStudent.get(studentId)||[]).sort((a,b)=>a.date.localeCompare(b.date)),
      creditLedger,
    };
  }).sort((a,b)=>a.name.localeCompare(b.name,"pt-BR"));

  const creditsGenerated=rows.reduce((sum,item)=>sum+item.due,0);
  const creditsPerformed=rows.reduce((sum,item)=>sum+item.replaced,0);
  const creditsPending=rows.reduce((sum,item)=>sum+item.pending,0);
  const creditsAdvance=rows.reduce((sum,item)=>sum+item.advance,0);
  const creditsResolved=Math.max(creditsGenerated-creditsPending,0);
  const attendancePresent=rows.reduce((sum,item)=>sum+item.attendanceEvents.filter(event=>event.status==="PRESENT").length,0);
  const attendanceAbsent=rows.reduce((sum,item)=>sum+item.attendanceEvents.filter(event=>event.status==="ABSENT").length,0);
  const attendanceTotal=attendancePresent+attendanceAbsent;
  const pendingDates=rows.flatMap(item=>item.pendingEvents.map(event=>event.date)).sort();

  return {
    creditsGenerated,
    creditsPerformed,
    creditsPending,
    creditsAdvance,
    creditsCoverage:operationPercent(creditsResolved,creditsGenerated),
    creditsPendingPercent:creditsGenerated?Math.max(0,Math.min(100,Math.round((creditsPending/creditsGenerated)*100))):0,
    activeStudents:studentIds.length,
    studentsWaiting:rows.filter(item=>item.pending>0).length,
    studentsTwoPlus:rows.filter(item=>item.pending>=2).length,
    scheduledStudents:rows.filter(item=>item.scheduledDates.length>0).length,
    absentReplacements:rows.reduce((sum,row)=>sum+row.absentReplacementEvents.length,0),
    attendancePresent,
    attendanceAbsent,
    attendanceRate:attendanceTotal?Math.round((attendancePresent/attendanceTotal)*100):0,
    oldestPendingDate:pendingDates[0]||"",
    rows,
  };
}

function OperationProgress({value}:{value:number}){
  return <div className={styles.operationProgress} aria-label={`${value}% compensado`}>
    <span style={{width:`${value}%`}}/>
  </div>;
}

export function KidsReplacementOperationSummary({data,compact=false,onOpen,onOpenStudent}:{data:KidsData|null;compact?:boolean;onOpen?:()=>void;onOpenStudent?:(studentId:string)=>void}) {
  const [period,setPeriod]=useState<OperationPeriod>("semester");
  const [detail,setDetail]=useState<OperationDetail|null>(null);
  const [detailSearch,setDetailSearch]=useState("");
  const [expandedStudent,setExpandedStudent]=useState<string|null>(null);
  const metric=useMemo(()=>data?computeKidsReplacementOperationMetrics(data,period):null,[data,period]);
  const allMetric=useMemo(()=>data?computeKidsReplacementOperationMetrics(data,period):null,[data,period]);
  useEffect(()=>{if(detail===null)return;return bindReplacementModalBack(()=>setDetail(null));},[detail!==null]);
  if(!data||!metric||!allMetric)return null;
  const reportData=data;
  const reportMetric=metric;
  const reportAllMetric=allMetric;

  const detailMeta:Record<OperationDetail,{eyebrow:string;title:string;description:string}>={
    generated:{eyebrow:"CONTROLE GERAL",title:"Controle de reposições por aluno",description:"Verde: compensada. Vermelho: ainda a repor. Amarelo: crédito antecipado sem vínculo ou aula futura, já contabilizado. Saldo a repor = canceladas − reposições, desde a base oficial; registros abaixo seguem o período selecionado."},
    performed:{eyebrow:"REPOSIÇÕES REALIZADAS",title:"Quem já realizou reposição",description:"🟢 Verde: presença na reposição | 🔴 Vermelho: falta na reposição (crédito consumido). Mostra a data e a aula compensada."},
    pending:{eyebrow:"ALUNOS AGUARDANDO REPOSIÇÃO",title:"Crianças que ainda precisam repor",description:"Exibe apenas crianças com pendência, mantendo em verde o histórico já resolvido e em vermelho o que falta."},
    absent:{eyebrow:"REPOSIÇÕES COM FALTA",title:"Faltas nas reposições realizadas",description:"Ocorrências reais no período: falta na reposição — crédito consumido. Inclui a 5ª aula efetivamente realizada; não inclui faltas regulares."},
    advance:{eyebrow:"CRÉDITOS ANTECIPADOS",title:"Crianças com saldo positivo",description:"Mostra o histórico completo da criança: aulas canceladas, reposições já feitas e créditos positivos, incluindo a 5ª aula do mês."},
    attendance:{eyebrow:"COMPARECIMENTO",title:"Presenças e faltas nas reposições",description:"Inclui aulas avulsas e a 5ª aula do mês. A falta permanece registrada e também consome a reposição utilizada."},
    attention:{eyebrow:"PRECISAM DE ATENÇÃO",title:"Crianças com 2 ou mais pendências",description:"Lista somente as pendências reais que ainda precisam ser repostas."},
  };
  const rowValue=(row:StudentOperationRow,kind:OperationDetail)=>kind==="generated"?row.due:kind==="performed"?row.replaced:kind==="pending"||kind==="attention"?row.pending:kind==="absent"?row.absentReplacementEvents.length:kind==="advance"?row.advance:row.attendanceEvents.length;
  const rowDisplayValue=(row:StudentOperationRow,kind:OperationDetail)=>kind==="generated"?row.netBalance:rowValue(row,kind);
  const ledgerForPeriod=(row:StudentOperationRow)=>row.creditLedger.filter(item=>periodIncludes(item.credit.date,period,data));
  const ledgerDetail=(item:CreditLedgerItem,studentId?:string):DetailEvent=>{
    const replacementAbsent=item.replacement?.label.toLowerCase().includes("falta")||Boolean(studentId&&item.replacement&&data.lessons.find(lesson=>lesson.id===item.replacement?.lessonId)?.attendance?.[studentId]==="ABSENT");
    const replacementSource=item.replacement?.source==="FIFTH_CLASS"?" · 5ª aula do mês":"";
    return {
      date:item.credit.date,
      className:`Aula perdida: ${fmtDate(item.credit.date)} · ${item.credit.className}`,
      label:item.status!=="PENDING"&&item.replacement
        ? item.status==="ANTICIPATED"
          ? `5ª aula agendada — crédito antecipado: ${fmtDate(item.replacement.date)}${replacementSource} · já contabilizado · presença ainda não confirmada`
          : `Reposta em ${fmtDate(item.replacement.date)}${replacementSource}${replacementAbsent?" · falta registrada":""}`
        :"A repor",
      tone:item.status==="ANTICIPATED"?"anticipated":item.status==="RESOLVED"?"resolved":"pending",
    };
  };
  const rowDates=(row:StudentOperationRow,kind:OperationDetail):DetailEvent[]=>{
    if(kind==="generated")return [
      ...ledgerForPeriod(row).map(item=>ledgerDetail(item,row.id)),
      ...row.creditLedger.filter(item=>!periodIncludes(item.credit.date,period,data)).map(item=>({...ledgerDetail(item,row.id),section:"Origem do saldo fora do período selecionado"})),
      ...row.allAdvanceEvents.map(event=>({date:event.date,className:event.className,label:`Crédito antecipado: ${fmtDate(event.date)} · ${event.stage==="ANTICIPATED"?"5ª aula agendada — crédito antecipado · já contabilizado · presença ainda não confirmada":event.label} · ainda sem cancelamento vinculado`,tone:"anticipated" as const,section:event.stage==="ANTICIPATED"?"5ª aula agendada ainda sem cancelamento vinculado":"Reposições antecipadas ainda sem cancelamento vinculado"})),
    ].filter((event,index,events)=>events.findIndex(other=>other.date===event.date&&other.className===event.className&&other.label===event.label)===index);
    if(kind==="pending")return ledgerForPeriod(row).filter(item=>item.status==="PENDING").map(item=>ledgerDetail(item,row.id));
    if(kind==="attention")return ledgerForPeriod(row).filter(item=>item.status==="PENDING").map(item=>ledgerDetail(item,row.id));
    if(kind==="performed")return row.replacedEvents.map(event=>{
      const paired=row.creditLedger.find(item=>item.replacement?.id===event.id);
      return {
        date:event.date,
        className:paired?`Aula perdida: ${fmtDate(paired.credit.date)} · ${paired.credit.className}`:event.className,
        label:`Reposta em: ${fmtDate(event.date)} · ${event.label}${row.absentReplacementEvents.some(item=>item.id===event.id)&&!event.label.toLowerCase().includes("falta")?" · falta registrada, crédito consumido":""}`,
        tone:row.absentReplacementEvents.some(item=>item.id===event.id)?"absent":"resolved",
      };
    });
    if(kind==="absent")return row.absentReplacementEvents.map(event=>({date:event.date,className:event.className,label:`Reposição em: ${fmtDate(event.date)} · Falta na reposição — crédito consumido${event.source==="FIFTH_CLASS"?" · 5ª aula do mês":""}`,tone:"absent"}));
    if(kind==="advance")return row.advanceEvents.map(event=>({date:event.date,className:event.className,label:`Crédito antecipado: ${fmtDate(event.date)} · ${event.stage==="ANTICIPATED"?"5ª aula agendada — crédito antecipado · já contabilizado · presença ainda não confirmada":event.label} · ainda sem cancelamento vinculado`,tone:"anticipated"}));
    return row.attendanceEvents.map(event=>({
      date:event.date,
      className:event.source==="FIFTH_CLASS"?`5ª aula do mês · ${event.className}`:event.className,
      label:`Reposição em: ${fmtDate(event.date)} · ${event.status==="ABSENT"?"Falta · crédito consumido":"Presença"}`,
      tone:event.status==="ABSENT"?"absent":"resolved",
    }));
  };
  const detailRows=detail?(detail==="generated"?allMetric:metric).rows
    .filter(row=>(detail==="generated"?true:detail==="attention"?row.pending>=2:rowValue(row,detail)>0&&(detail!=="pending"||row.netBalance>0)&&(detail!=="advance"||row.netBalance<0))&&normalizeSearch(row.name).includes(normalizeSearch(detailSearch)))
    .sort((a,b)=>a.name.localeCompare(b.name,"pt-BR")):[];
  function openDetail(next:OperationDetail){setDetailSearch("");setExpandedStudent(null);setDetail(next);}
  const toReportRows=(kind:OperationDetail,rows:StudentOperationRow[]):ReplacementReportRow[]=>rows.map(row=>({
    name:row.name,
    quantity:rowDisplayValue(row,kind),
    details:rowDates(row,kind).sort((a,b)=>a.date.localeCompare(b.date)).map(event=>
      `${event.section?event.section+": ":""}${fmtDate(event.date)} · ${event.className||event.label}${event.className?` · ${event.label}`:""}`,
    ),
  }));
  function exportDetailReport(format:"pdf"|"png"){
    if(!detail)return;
    const title=detailMeta[detail].title;
    const rows=toReportRows(detail,detailRows);
    const total=detailRows.reduce((sum,row)=>sum+(detail==="generated"?rowDates(row,detail).length:rowValue(row,detail)),0);
    const summary=`${rows.length} crianças · ${total} registros. ${detailMeta[detail].description}`;
    const fileName=reportFileName(period,format);
    if(format==="pdf")exportReplacementPdf(title,reportPeriodLabel(period,reportData),summary,rows,fileName);
    else exportReplacementPng(title,reportPeriodLabel(period,reportData),summary,rows,fileName);
  }
  function exportPanelReport(format:"pdf"|"png"){
    const rows=reportAllMetric.rows.map(row=>({
      name:row.name,
      quantity:row.netBalance,
      details:[
        `${row.due} crédito${row.due===1?" gerado":"s gerados"}`,
        `${row.replaced} reposição${row.replaced===1?" realizada":"ões realizadas"}`,
        `Saldo atual a repor: ${row.netBalance}`,
        ...rowDates(row,"generated").map(event=>`${event.section?event.section+": ":""}${fmtDate(event.date)} · ${event.className||"Turma"} · ${event.label}`),
      ],
    })).sort((a,b)=>a.name.localeCompare(b.name,"pt-BR"));
    const summary=`Verde: compensada; vermelho: a repor; amarelo: crédito antecipado. Saldo desde a base oficial. ${reportMetric.creditsPending} pendentes · ${reportMetric.creditsGenerated} gerados · ${reportMetric.creditsPerformed} realizados · ${reportMetric.creditsCoverage}% compensados`;
    const fileName=reportFileName(period,format);
    if(format==="pdf")exportReplacementPdf("Painel Geral de Reposições Kids",reportPeriodLabel(period,reportData),summary,rows,fileName);
    else exportReplacementPng("Painel Geral de Reposições Kids",reportPeriodLabel(period,reportData),summary,rows,fileName);
  }

  return <>
    <section className={`${styles.operationPanel} ${compact?styles.operationCompact:""}`}>
      <div className={styles.operationHeading}>
        <div>
          <span>REPOSIÇÕES KIDS · CONTROLE INDIVIDUAL</span>
          <h2>Painel de Reposições Kids</h2>
          <p>Consulte pendências, reposições com falta e o histórico real de cada criança.</p>
        </div>
        <div className={styles.operationActions}>
          <div className={styles.periodSwitch} aria-label="Período do painel">
            <button type="button" className={period==="semester"?styles.periodActive:""} onClick={()=>setPeriod("semester")}>Semestre</button>
            <button type="button" className={period==="month"?styles.periodActive:""} onClick={()=>setPeriod("month")}>Este mês</button>
          </div>
          <button type="button" className={styles.exportButton} onClick={()=>exportPanelReport("pdf")}>Exportar PDF</button>
          <button type="button" className={styles.exportButton} onClick={()=>exportPanelReport("png")}>Exportar imagem</button>
          {onOpen?<button type="button" className={styles.openKidsButton} onClick={onOpen}>Abrir Aulas Kids</button>:null}
        </div>
      </div>

      <div className={styles.operationHero}>
        <div><small>SITUAÇÃO ATUAL</small><strong>{metric.creditsPending}</strong><span>{metric.creditsPending===1?"reposição pendente":"reposições pendentes"}</span></div>
        <div className={styles.coverageBlock}><strong>{metric.creditsCoverage}%</strong><span>dos créditos compensados</span><OperationProgress value={metric.creditsCoverage}/><small>{metric.creditsGenerated} gerados · {metric.creditsPerformed} realizados · {metric.creditsPendingPercent}% ainda pendente</small></div>
      </div>

      <div className={styles.operationStats}>
        <button type="button" className={styles.primaryCreditCard} onClick={()=>openDetail("pending")}><span className={styles.statIcon}>＋</span><small>Créditos pendentes de reposição</small><strong>{metric.creditsPending}</strong><em>{metric.studentsWaiting} alunos com pendências · Ver créditos →</em></button>
        <button type="button" onClick={()=>openDetail("performed")}><span className={styles.statIcon}>✓</span><small>Reposições feitas</small><strong>{metric.creditsPerformed}</strong><em>Ver histórico →</em></button>
        <button type="button" onClick={()=>openDetail("absent")}><span className={styles.statIcon}>!</span><small>Reposições com falta</small><strong>{metric.absentReplacements}</strong><em>Ver ocorrências e buscar criança →</em></button>
        <button type="button" onClick={()=>openDetail("advance")} className={metric.creditsAdvance?styles.statPositive:""}><span className={styles.statIcon}>↗</span><small>Créditos antecipados</small><strong>{metric.creditsAdvance}</strong><em>Ver saldos positivos →</em></button>
        <button type="button" onClick={()=>openDetail("attendance")}><span className={styles.statIcon}>●</span><small>Comparecimento</small><strong>{metric.attendanceRate}%</strong><em>{metric.attendancePresent} presenças · {metric.attendanceAbsent} faltas →</em></button>
      </div>

      <button type="button" className={styles.studentControlButton} onClick={()=>openDetail("generated")}><span><strong>Controle de reposições por aluno</strong><small>Todos os alunos ativos · busca por nome · saldo e histórico individual</small></span><b aria-hidden="true">→</b></button>

      {!compact?<div className={styles.operationAttention}>
        <button type="button" className={styles.operationAttentionButton} onClick={()=>openDetail("attention")}><small>PRECISAM DE ATENÇÃO</small><strong>{metric.studentsTwoPlus} criança{metric.studentsTwoPlus===1?"":"s"} com 2 ou mais pendências</strong><span>Abrir lista →</span></button>
        <div><small>CRÉDITO MAIS ANTIGO</small><strong>{metric.oldestPendingDate?fmtDate(metric.oldestPendingDate):"Nenhum pendente"}</strong></div>
        <div><small>BASE ATIVA</small><strong>{metric.activeStudents} aluno{metric.activeStudents===1?"":"s"} ativo{metric.activeStudents===1?"":"s"}</strong></div>
      </div>:null}
      <p className={styles.operationNote}><b>Leitura correta:</b> o saldo é individual. Crédito positivo de uma criança não apaga a pendência de outra.</p>
    </section>

    {detail?<div className={styles.detailBackdrop} onMouseDown={event=>{if(event.currentTarget===event.target)setDetail(null);}}>
      <section className={styles.detailDialog} role="dialog" aria-modal="true" aria-label={detailMeta[detail].title} onKeyDown={event=>{if(event.key==="Escape")setDetail(null);}}>
        <header className={styles.detailHead}>
          <div><span>{detailMeta[detail].eyebrow}</span><h3>{detailMeta[detail].title}</h3><p>{detailMeta[detail].description}</p></div>
          <div className={styles.detailHeadActions}><button type="button" onClick={()=>exportDetailReport("pdf")}>PDF</button><button type="button" onClick={()=>exportDetailReport("png")}>Imagem</button><button type="button" className={styles.detailClose} onClick={()=>setDetail(null)} aria-label="Fechar detalhamento">× Fechar</button></div>
        </header>
        <div className={styles.detailSummary}><strong>{detailRows.length}</strong><span>criança{detailRows.length===1?"":"s"} na lista</span><b>{detailRows.reduce((sum,row)=>sum+(detail==="generated"?rowDates(row,detail).length:rowValue(row,detail)),0)}</b><span>registro{detailRows.reduce((sum,row)=>sum+(detail==="generated"?rowDates(row,detail).length:rowValue(row,detail)),0)===1?"":"s"}</span></div>
        <label className={styles.detailSearch}><span>⌕</span><input value={detailSearch} onChange={event=>{setDetailSearch(event.target.value);setExpandedStudent(null);}} placeholder="Buscar criança..." autoComplete="off"/></label>
        <div className={styles.detailList}>
          {detailRows.length?detailRows.map(row=><article className={`${styles.detailRow} ${detail==="generated"?styles.studentControlRow:""}`} key={row.id}>
            <div className={styles.detailStudent}>
              {detail==="generated"?<button type="button" className={styles.studentHistoryButton} onClick={()=>setExpandedStudent(current=>current===row.id?null:row.id)} aria-expanded={expandedStudent===row.id} aria-controls={`replacement-history-${row.id}`}><strong>{row.name}</strong><span>{expandedStudent===row.id?"Recolher histórico −":"Ver histórico +"}</span></button>:onOpenStudent?<button type="button" className={styles.detailStudentLink} onClick={()=>{setDetail(null);onOpenStudent(row.id);}}><strong>{row.name}</strong></button>:<strong>{row.name}</strong>}
              <small>{detail==="generated"?`${row.due} aula${row.due===1?"":"s"} cancelada${row.due===1?"":"s"} · saldo ${row.netBalance}`:`${rowValue(row,detail)} ${detail==="attendance"?"registro":detail==="absent"?"falta na reposição":"crédito"}${rowValue(row,detail)===1?"":"s"}`}</small>
            </div>
            {detail!=="generated"||expandedStudent===row.id?<div className={styles.detailDates} id={`replacement-history-${row.id}`}>{[undefined,...new Set(rowDates(row,detail).map(event=>event.section).filter(Boolean))].map(section=>{
              const events=rowDates(row,detail).filter(event=>event.section===section).sort((a,b)=>a.date.localeCompare(b.date));
              const content=events.map((event,index)=><span key={`${event.date}-${event.className||"registro"}-${index}`} className={event.tone==="resolved"?styles.detailResolved:event.tone==="anticipated"?styles.detailAnticipated:event.tone==="pending"?styles.detailPending:event.tone==="absent"?styles.detailAbsent:""}><b>{fmtDate(event.date)}</b><small>{event.className||event.label}</small>{event.className?<em>{event.label}</em>:null}</span>);
              return section?<section className={styles.detailExtraGroup} key={section}><h4>{section}</h4><div className={styles.detailDates}>{content}</div></section>:content;
            })}{rowDates(row,detail).length===0?<small>Sem eventos no período; saldo oficial preservado.</small>:null}{detail==="generated"&&onOpenStudent?<button type="button" className={styles.detailStudentLink} onClick={()=>{setDetail(null);onOpenStudent(row.id);}}>Abrir cadastro do aluno →</button>:null}</div>:null}
            <b className={styles.detailCount}>{rowDisplayValue(row,detail)}</b>
          </article>):<div className={styles.detailEmpty}>Nenhuma criança encontrada neste indicador.</div>}
        </div>
      </section>
    </div>:null}
  </>;
}

export function KidsReplacementBalanceOverview({data}:{data:KidsData}) {
  const [search,setSearch]=useState("");
  const [expanded,setExpanded]=useState<string|null>(null);
  const balances = computeKidsReplacementBalances(data)
    .filter(item => data.classes.find(group => group.id === item.classId)?.active !== false || item.events.length > 0)
    .sort((a,b)=>compareClassSchedule(a.className,b.className));
  const total: KidsReplacementBalance = {
    classId: "all",
    className: "Todas as turmas",
    due: balances.reduce((sum,item)=>sum+item.due,0),
    replaced: balances.reduce((sum,item)=>sum+item.replaced,0),
    balance: balances.reduce((sum,item)=>sum+item.balance,0),
    events: balances.flatMap(item=>item.events).sort((a,b)=>b.date.localeCompare(a.date)),
  };
  const filtered=useMemo(()=>{
    const query=normalizeSearch(search);
    if(!query)return balances;
    return balances.filter(balance=>normalizeSearch(balance.className).includes(query));
  },[balances,search]);

  return <section className={styles.overview}>
    <div className={styles.heading}>
      <div>
        <span>CONTROLE AUTOMÁTICO</span>
        <h2>Saldo de reposições das turmas</h2>
        <p>4 aulas por mês · a 5ª aula agendada já conta como reposição desde o início do mês · cálculo retroativo desde {fmtDate(KIDS_REPLACEMENT_BALANCE_START)}.</p>
      </div>
    </div>
    <Metrics balance={total}/>
    <label className={styles.searchBox}>
      <span>⌕</span>
      <input value={search} onChange={event=>setSearch(event.target.value)} placeholder="Pesquisar aula, dia ou horário..." autoComplete="off" />
    </label>
    <div className={styles.compactList}>
      <div className={styles.listHeader}>
        <span>Aula</span><span>A repor</span><span>Repostas</span><span>Saldo</span><span></span>
      </div>
      {filtered.length ? filtered.map(balance=>{
        const open=expanded===balance.classId;
        const due=balance.events.filter(item=>item.type==="DUE");
        const replaced=balance.events.filter(item=>item.type==="REPLACED");
        const category=data.classes.find(group=>group.id===balance.classId)?.category;
        return <article className={styles.classLine} key={balance.classId}>
          <button type="button" className={styles.classLineButton} onClick={()=>setExpanded(current=>current===balance.classId?null:balance.classId)} aria-expanded={open}>
            <strong style={{color:categoryTextColor(category)}}>{balance.className}</strong>
            <span>{balance.due}</span>
            <span>{balance.replaced}</span>
            <b className={balance.balance>0?styles.balancePositive:balance.balance<0?styles.balanceNegative:styles.balanceNeutral}>{kidsBalanceSigned(balance.balance)}</b>
            <i>{open?"−":"+"}</i>
          </button>
          {open?<div className={styles.lineDetails}>
            <EventList title="A repor" events={due} empty="Nenhuma aula a repor."/>
            <EventList title="Repostas" events={replaced} empty="Nenhuma aula reposta ainda."/>
          </div>:null}
        </article>;
      }):<div className={styles.noResults}>Nenhuma aula encontrada para “{search}”.</div>}
    </div>
  </section>;
}

export function KidsStudentReplacementBalance({data,studentId}:{data:KidsData;studentId:string}) {
  const balance = computeKidsStudentReplacementBalance(data, studentId);
  return <section className={styles.studentBox}>
    <div className={styles.heading}>
      <div>
        <span>CONTROLE DE AULAS</span>
        <h3>Canceladas e reposições da criança</h3>
        <p>A 5ª aula agendada do mês já conta para todos. Na reposição individual, a vaga utilizada consome o crédito mesmo quando a criança falta.</p>
      </div>
    </div>
    <div className={styles.studentMetrics}>
      <div><span>Aulas canceladas</span><strong>{balance.due}</strong></div>
      <div><span>Reposições feitas</span><strong>{balance.replaced}</strong></div>
      <div className={balance.balance > 0 ? styles.positive : balance.balance < 0 ? styles.negative : styles.neutral}>
        <span>Saldo</span><strong>{kidsBalanceSigned(balance.balance)}</strong>
      </div>
    </div>
    <div className={styles.historyTable}>
      <div className={styles.historyHead}><span>Data</span><span>Turma</span><span>Tipo</span><span>Observação</span></div>
      {balance.events.length ? balance.events.map(event=><div className={styles.historyRow} key={event.id}>
        <time>{fmtDate(event.date)}</time>
        <strong>{event.className}</strong>
        <span className={event.type==="DUE"?styles.typeCancelled:styles.typeReplaced}>{event.type==="DUE"?"Cancelada":"Reposta"}</span>
        <small>{event.label}</small>
      </div>):<div className={styles.noHistory}>Nenhuma aula cancelada ou reposta desde agosto.</div>}
    </div>
  </section>;
}
