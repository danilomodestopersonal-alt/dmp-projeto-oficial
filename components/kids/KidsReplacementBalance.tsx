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
        return <article className={styles.classLine} key={balance.classId}>
          <button type="button" className={styles.classLineButton} onClick={()=>setExpanded(current=>current===balance.classId?null:balance.classId)} aria-expanded={open}>
            <strong>{balance.className}</strong>
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
