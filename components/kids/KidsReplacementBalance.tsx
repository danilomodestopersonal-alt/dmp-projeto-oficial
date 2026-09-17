"use client";

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

function BalanceDetails({balance}:{balance:KidsReplacementBalance}) {
  const due = balance.events.filter(item => item.type === "DUE");
  const replaced = balance.events.filter(item => item.type === "REPLACED");
  return <>
    <Metrics balance={balance}/>
    <div className={styles.twoColumns}>
      <EventList title="A repor" events={due} empty="Nenhuma aula a repor."/>
      <EventList title="Repostas" events={replaced} empty="Nenhuma aula reposta ainda."/>
    </div>
  </>;
}

export function KidsReplacementBalanceOverview({data}:{data:KidsData}) {
  const balances = computeKidsReplacementBalances(data)
    .filter(item => data.classes.find(group => group.id === item.classId)?.active !== false || item.events.length > 0);
  const total: KidsReplacementBalance = {
    classId: "all",
    className: "Todas as turmas",
    due: balances.reduce((sum,item)=>sum+item.due,0),
    replaced: balances.reduce((sum,item)=>sum+item.replaced,0),
    balance: balances.reduce((sum,item)=>sum+item.balance,0),
    events: balances.flatMap(item=>item.events).sort((a,b)=>b.date.localeCompare(a.date)),
  };

  return <section className={styles.overview}>
    <div className={styles.heading}>
      <div>
        <span>CONTROLE AUTOMÁTICO</span>
        <h2>Saldo de reposições das turmas</h2>
        <p>4 aulas por mês · 5ª aula realizada conta como reposta · cálculo retroativo desde {fmtDate(KIDS_REPLACEMENT_BALANCE_START)}.</p>
      </div>
    </div>
    <Metrics balance={total}/>
    <div className={styles.classGrid}>
      {balances.map(balance => <article className={styles.classCard} key={balance.classId}>
        <header><strong>{balance.className}</strong><small>Saldo {kidsBalanceSigned(balance.balance)}</small></header>
        <BalanceDetails balance={balance}/>
      </article>)}
    </div>
  </section>;
}

export function KidsStudentReplacementBalance({data,studentId}:{data:KidsData;studentId:string}) {
  const balance = computeKidsStudentReplacementBalance(data, studentId);
  return <section className={styles.studentBox}>
    <div className={styles.heading}>
      <div>
        <span>REPOSIÇÕES DA TURMA</span>
        <h3>Saldo de aulas da criança</h3>
        <p>O crédito pertence à turma: uma 5ª aula realizada conta mesmo se a criança faltou.</p>
      </div>
    </div>
    <BalanceDetails balance={balance}/>
  </section>;
}
