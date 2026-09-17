"use client";

import { useMemo, useState } from "react";
import type { KidsData } from "@/types/kids";
import {
  KIDS_REPLACEMENT_BALANCE_START,
  computeKidsReplacementBalances,
  computeKidsStudentReplacementBalance,
  kidsBalanceSigned,
  type KidsReplacementBalance,
  type KidsReplacementBalanceEvent,
} from "@/lib/kids/replacement-balance";
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

// DMP_KIDS_VISAO_REAL_REPOSICOES_V8_20260917
type KidsReplacementOperationMetrics = {
  classCancelled:number;
  classReplaced:number;
  classPending:number;
  classAdvance:number;
  classCoverage:number;
  classPendingPercent:number;
  creditsGenerated:number;
  creditsPerformed:number;
  creditsPending:number;
  creditsAdvance:number;
  creditsCoverage:number;
  creditsPendingPercent:number;
  activeStudents:number;
};

function operationPercent(resolved:number,total:number){
  if(total<=0)return 100;
  return Math.max(0,Math.min(100,Math.round((resolved/total)*100)));
}

function computeKidsReplacementOperationMetrics(data:KidsData):KidsReplacementOperationMetrics {
  const classBalances=computeKidsReplacementBalances(data)
    .filter(item=>data.classes.find(group=>group.id===item.classId)?.active!==false||item.events.length>0);
  const classCancelled=classBalances.reduce((sum,item)=>sum+item.due,0);
  const classReplaced=classBalances.reduce((sum,item)=>sum+item.replaced,0);
  const classPending=classBalances.reduce((sum,item)=>sum+Math.max(item.due-item.replaced,0),0);
  const classAdvance=classBalances.reduce((sum,item)=>sum+Math.max(item.replaced-item.due,0),0);
  const classResolved=classBalances.reduce((sum,item)=>sum+Math.min(item.due,item.replaced),0);

  const studentIds=Array.from(new Set(
    data.classes.flatMap(group=>group.students.filter(student=>student.active).map(student=>student.id))
  ));
  const studentBalances=studentIds.map(studentId=>computeKidsStudentReplacementBalance(data,studentId));
  const creditsGenerated=studentBalances.reduce((sum,item)=>sum+item.due,0);
  const creditsPerformed=studentBalances.reduce((sum,item)=>sum+item.replaced,0);
  const creditsPending=studentBalances.reduce((sum,item)=>sum+Math.max(item.due-item.replaced,0),0);
  const creditsAdvance=studentBalances.reduce((sum,item)=>sum+Math.max(item.replaced-item.due,0),0);
  const creditsResolved=studentBalances.reduce((sum,item)=>sum+Math.min(item.due,item.replaced),0);

  return {
    classCancelled,
    classReplaced,
    classPending,
    classAdvance,
    classCoverage:operationPercent(classResolved,classCancelled),
    classPendingPercent:classCancelled?Math.max(0,Math.min(100,Math.round((classPending/classCancelled)*100))):0,
    creditsGenerated,
    creditsPerformed,
    creditsPending,
    creditsAdvance,
    creditsCoverage:operationPercent(creditsResolved,creditsGenerated),
    creditsPendingPercent:creditsGenerated?Math.max(0,Math.min(100,Math.round((creditsPending/creditsGenerated)*100))):0,
    activeStudents:studentIds.length,
  };
}

function OperationProgress({value}:{value:number}){
  return <div aria-label={`${value}% compensado`} style={{height:8,borderRadius:999,background:"#e9edf3",overflow:"hidden",marginTop:10}}>
    <span style={{display:"block",height:"100%",width:`${value}%`,borderRadius:999,background:value>=100?"#238b45":value>=70?"#c18a00":"#c62828",transition:"width .2s ease"}}/>
  </div>;
}

export function KidsReplacementOperationSummary({data,compact=false,onOpen}:{data:KidsData|null;compact?:boolean;onOpen?:()=>void}) {
  if(!data)return null;
  const metric=computeKidsReplacementOperationMetrics(data);
  const sectionStyle={background:"#fff",border:"1px solid #e4e8ef",borderRadius:18,padding:compact?14:18,boxShadow:"0 8px 24px rgba(17,24,39,.05)",marginBottom:compact?12:18} as const;
  const cardStyle={border:"1px solid #e6eaf0",borderRadius:16,padding:compact?13:16,background:"#fbfcfe"} as const;
  const statGrid={display:"grid",gridTemplateColumns:compact?"repeat(2,minmax(0,1fr))":"repeat(3,minmax(0,1fr))",gap:8,marginTop:12} as const;
  const statStyle={padding:10,borderRadius:12,background:"#fff",border:"1px solid #edf0f4"} as const;

  return <section style={sectionStyle}>
    <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
      <div>
        <span style={{fontSize:11,fontWeight:800,letterSpacing:1.1,color:"#687386"}}>REPOSIÇÕES KIDS · VISÃO REAL</span>
        <h2 style={{fontSize:compact?18:21,margin:"4px 0 4px"}}>Turmas e créditos dos alunos</h2>
        <p style={{margin:0,fontSize:13,color:"#687386",maxWidth:760}}>Aulas coletivas e créditos individuais são medidos separadamente. Assim, reposições feitas em outras turmas aparecem na situação real das crianças sem apagar pendências de outra turma ou de outro aluno.</p>
      </div>
      {onOpen?<button type="button" onClick={onOpen} style={{border:"1px solid #d7dde7",background:"#fff",borderRadius:12,padding:"9px 12px",fontWeight:700,cursor:"pointer"}}>Abrir Aulas Kids</button>:null}
    </div>

    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))",gap:12,marginTop:14}}>
      <article style={cardStyle}>
        <div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"baseline"}}>
          <div><small style={{fontWeight:800,color:"#687386"}}>AULAS DAS TURMAS</small><div style={{fontSize:compact?18:20,fontWeight:800,marginTop:2}}>{metric.classPending} a repor</div></div>
          <div style={{textAlign:"right"}}><strong style={{fontSize:compact?21:24}}>{metric.classCoverage}%</strong><small style={{display:"block",color:"#687386"}}>compensado</small></div>
        </div>
        <OperationProgress value={metric.classCoverage}/>
        <div style={statGrid}>
          <div style={statStyle}><small style={{display:"block",color:"#687386"}}>Canceladas</small><strong>{metric.classCancelled}</strong></div>
          <div style={statStyle}><small style={{display:"block",color:"#687386"}}>Repostas</small><strong>{metric.classReplaced}</strong></div>
          {!compact?<div style={statStyle}><small style={{display:"block",color:"#687386"}}>Pendente</small><strong>{metric.classPendingPercent}%</strong></div>:null}
        </div>
        {metric.classAdvance>0?<small style={{display:"block",marginTop:9,color:"#238b45",fontWeight:700}}>+{metric.classAdvance} crédito{metric.classAdvance===1?"":"s"} coletivo{metric.classAdvance===1?"":"s"} antecipado{metric.classAdvance===1?"":"s"}</small>:null}
      </article>

      <article style={cardStyle}>
        <div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"baseline"}}>
          <div><small style={{fontWeight:800,color:"#687386"}}>CRÉDITOS DOS ALUNOS</small><div style={{fontSize:compact?18:20,fontWeight:800,marginTop:2}}>{metric.creditsPending} pendente{metric.creditsPending===1?"":"s"}</div></div>
          <div style={{textAlign:"right"}}><strong style={{fontSize:compact?21:24}}>{metric.creditsCoverage}%</strong><small style={{display:"block",color:"#687386"}}>compensado</small></div>
        </div>
        <OperationProgress value={metric.creditsCoverage}/>
        <div style={statGrid}>
          <div style={statStyle}><small style={{display:"block",color:"#687386"}}>Gerados</small><strong>{metric.creditsGenerated}</strong></div>
          <div style={statStyle}><small style={{display:"block",color:"#687386"}}>Reposições feitas</small><strong>{metric.creditsPerformed}</strong></div>
          {!compact?<div style={statStyle}><small style={{display:"block",color:"#687386"}}>Pendente</small><strong>{metric.creditsPendingPercent}%</strong></div>:null}
        </div>
        <small style={{display:"block",marginTop:9,color:metric.creditsAdvance>0?"#238b45":"#687386",fontWeight:metric.creditsAdvance>0?700:500}}>
          {metric.creditsAdvance>0?`+${metric.creditsAdvance} crédito${metric.creditsAdvance===1?"":"s"} antecipado${metric.creditsAdvance===1?"":"s"} · `:""}{metric.activeStudents} aluno{metric.activeStudents===1?"":"s"} ativo{metric.activeStudents===1?"":"s"}
        </small>
      </article>
    </div>

    {!compact?<p style={{margin:"12px 0 0",fontSize:12,color:"#687386"}}><b>Leitura correta:</b> crédito positivo de uma criança não compensa a dívida de outra. O percentual dos alunos considera cada saldo individual antes de somar o total.</p>:null}
  </section>;
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
        <p>4 aulas por mês · 5ª aula realizada conta como reposta · cálculo retroativo desde {fmtDate(KIDS_REPLACEMENT_BALANCE_START)}.</p>
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
        <p>5ª aula da turma conta para todos. Reposição individual soma só para a criança quando a aula é realizada.</p>
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
