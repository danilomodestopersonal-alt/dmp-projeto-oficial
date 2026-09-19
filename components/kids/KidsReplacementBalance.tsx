"use client";

import { useMemo, useState } from "react";
import type { KidsData, KidsLesson } from "@/types/kids";
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

// DMP_KIDS_EXTRATO_CREDITOS_REPOSICAO_V615_20260919
type OperationPeriod = "semester" | "month";
type OperationDetail = "generated" | "performed" | "pending" | "scheduled" | "advance" | "attendance";
type CreditLedgerItem = {
  credit:KidsReplacementBalanceEvent;
  replacement?:KidsReplacementBalanceEvent;
  status:"RESOLVED"|"PENDING";
};
type DetailEvent = {
  date:string;
  label:string;
  className?:string;
  tone?:"resolved"|"pending"|"absent";
};

type StudentOperationRow = {
  id:string;
  name:string;
  due:number;
  replaced:number;
  pending:number;
  advance:number;
  dueEvents:KidsReplacementBalanceEvent[];
  replacedEvents:KidsReplacementBalanceEvent[];
  pendingEvents:KidsReplacementBalanceEvent[];
  advanceEvents:KidsReplacementBalanceEvent[];
  scheduledDates:string[];
  attendanceEvents:Array<{date:string;status:"PRESENT"|"ABSENT"}>;
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

function computeKidsReplacementOperationMetrics(data:KidsData,period:OperationPeriod):KidsReplacementOperationMetrics {
  const students=new Map<string,string>();
  data.classes.forEach(group=>group.students.filter(student=>student.active).forEach(student=>{
    if(!students.has(student.id))students.set(student.id,student.name);
  }));
  const studentIds=[...students.keys()];
  const studentIdSet=new Set(studentIds);
  const scheduledByStudent=new Map<string,string[]>();
  const attendanceByStudent=new Map<string,Array<{date:string;status:"PRESENT"|"ABSENT"}>>();

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
        events.push({date:lesson.date,status:lesson.attendance?.[studentId]==="ABSENT"?"ABSENT":"PRESENT"});
        attendanceByStudent.set(studentId,events);
      }
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
      status:index<resolved?"RESOLVED":"PENDING",
    }));
    const dueEvents=allDueEvents.filter(event=>periodIncludes(event.date,period,data));
    const replacedEvents=allReplacedEvents.filter(event=>periodIncludes(event.date,period,data));
    const pendingEvents=creditLedger.filter(item=>item.status==="PENDING"&&periodIncludes(item.credit.date,period,data)).map(item=>item.credit);
    const advanceEvents=allReplacedEvents.slice(resolved).filter(event=>periodIncludes(event.date,period,data));
    return {
      id:studentId,
      name:students.get(studentId)||"Criança",
      due:dueEvents.length,
      replaced:replacedEvents.length,
      pending:pendingEvents.length,
      advance:advanceEvents.length,
      dueEvents,
      replacedEvents,
      pendingEvents,
      advanceEvents,
      scheduledDates:(scheduledByStudent.get(studentId)||[]).sort(),
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

export function KidsReplacementOperationSummary({data,compact=false,onOpen}:{data:KidsData|null;compact?:boolean;onOpen?:()=>void}) {
  const [period,setPeriod]=useState<OperationPeriod>("semester");
  const [detail,setDetail]=useState<OperationDetail|null>(null);
  const [detailSearch,setDetailSearch]=useState("");
  const metric=useMemo(()=>data?computeKidsReplacementOperationMetrics(data,period):null,[data,period]);
  if(!data||!metric)return null;

  const detailMeta:Record<OperationDetail,{eyebrow:string;title:string;description:string}>={
    generated:{eyebrow:"CRÉDITOS GERADOS",title:"Extrato completo das aulas canceladas",description:"Verde identifica o crédito já reposto; vermelho mostra a aula que ainda precisa ser reposta."},
    performed:{eyebrow:"REPOSIÇÕES REALIZADAS",title:"Quem já realizou reposição",description:"Mostra a data da reposição e qual aula cancelada foi compensada, inclusive quando houve falta."},
    pending:{eyebrow:"REPOSIÇÕES PENDENTES",title:"Crianças que ainda precisam repor",description:"Exibe apenas crianças com pendência, mantendo em verde o histórico já resolvido e em vermelho o que falta."},
    scheduled:{eyebrow:"PRÓXIMAS REPOSIÇÕES",title:"Crianças já agendadas",description:"Vagas futuras já reservadas nas aulas de reposição."},
    advance:{eyebrow:"CRÉDITOS ANTECIPADOS",title:"Crianças com saldo positivo",description:"Reposições realizadas além dos créditos gerados até este período."},
    attendance:{eyebrow:"COMPARECIMENTO",title:"Presenças e faltas nas reposições",description:"A falta permanece registrada e também consome a reposição utilizada."},
  };
  const rowValue=(row:StudentOperationRow,kind:OperationDetail)=>kind==="generated"?row.due:kind==="performed"?row.replaced:kind==="pending"?row.pending:kind==="scheduled"?row.scheduledDates.length:kind==="advance"?row.advance:row.attendanceEvents.length;
  const ledgerForPeriod=(row:StudentOperationRow)=>row.creditLedger.filter(item=>periodIncludes(item.credit.date,period,data));
  const ledgerDetail=(item:CreditLedgerItem):DetailEvent=>({
    date:item.credit.date,
    className:item.credit.className,
    label:item.status==="RESOLVED"&&item.replacement
      ? `Reposta em ${fmtDate(item.replacement.date)}${item.replacement.label.toLowerCase().includes("falta")?" · falta registrada":""}`
      :"A repor",
    tone:item.status==="RESOLVED"?"resolved":"pending",
  });
  const rowDates=(row:StudentOperationRow,kind:OperationDetail):DetailEvent[]=>{
    if(kind==="generated"||kind==="pending")return ledgerForPeriod(row).map(ledgerDetail);
    if(kind==="performed")return row.replacedEvents.map(event=>{
      const paired=row.creditLedger.find(item=>item.replacement?.id===event.id);
      return {
        date:event.date,
        className:paired?`Compensou ${fmtDate(paired.credit.date)} · ${paired.credit.className}`:event.className,
        label:event.label,
        tone:event.label.toLowerCase().includes("falta")?"absent":"resolved",
      };
    });
    if(kind==="scheduled")return row.scheduledDates.map(date=>({date,label:"Reposição agendada"}));
    if(kind==="advance")return row.advanceEvents.map(event=>({date:event.date,label:event.label}));
    return row.attendanceEvents.map(event=>({date:event.date,label:event.status==="ABSENT"?"Falta · crédito consumido":"Presença",tone:event.status==="ABSENT"?"absent":undefined}));
  };
  const detailRows=detail?metric.rows
    .filter(row=>rowValue(row,detail)>0&&normalizeSearch(row.name).includes(normalizeSearch(detailSearch)))
    .sort((a,b)=>rowValue(b,detail)-rowValue(a,detail)||a.name.localeCompare(b.name,"pt-BR")):[];
  function openDetail(next:OperationDetail){setDetailSearch("");setDetail(next);}

  return <>
    <section className={`${styles.operationPanel} ${compact?styles.operationCompact:""}`}>
      <div className={styles.operationHeading}>
        <div>
          <span>REPOSIÇÕES KIDS · CONTROLE INDIVIDUAL</span>
          <h2>Painel de Reposições Kids</h2>
          <p>Veja quem precisa repor, quem já está agendado e o histórico real de cada criança.</p>
        </div>
        <div className={styles.operationActions}>
          <div className={styles.periodSwitch} aria-label="Período do painel">
            <button type="button" className={period==="semester"?styles.periodActive:""} onClick={()=>setPeriod("semester")}>Semestre</button>
            <button type="button" className={period==="month"?styles.periodActive:""} onClick={()=>setPeriod("month")}>Este mês</button>
          </div>
          {onOpen?<button type="button" className={styles.openKidsButton} onClick={onOpen}>Abrir Aulas Kids</button>:null}
        </div>
      </div>

      <div className={styles.operationHero}>
        <div><small>SITUAÇÃO ATUAL</small><strong>{metric.creditsPending}</strong><span>{metric.creditsPending===1?"reposição pendente":"reposições pendentes"}</span></div>
        <div className={styles.coverageBlock}><strong>{metric.creditsCoverage}%</strong><span>dos créditos compensados</span><OperationProgress value={metric.creditsCoverage}/><small>{metric.creditsGenerated} gerados · {metric.creditsPerformed} realizados · {metric.creditsPendingPercent}% ainda pendente</small></div>
      </div>

      <div className={styles.operationStats}>
        <button type="button" onClick={()=>openDetail("generated")}><span className={styles.statIcon}>＋</span><small>Créditos gerados</small><strong>{metric.creditsGenerated}</strong><em>Ver alunos e datas →</em></button>
        <button type="button" onClick={()=>openDetail("performed")}><span className={styles.statIcon}>✓</span><small>Reposições feitas</small><strong>{metric.creditsPerformed}</strong><em>Ver histórico →</em></button>
        <button type="button" onClick={()=>openDetail("pending")} className={metric.studentsWaiting?styles.statAttention:""}><span className={styles.statIcon}>!</span><small>Alunos aguardando</small><strong>{metric.studentsWaiting}</strong><em>{metric.creditsPending} créditos pendentes →</em></button>
        <button type="button" onClick={()=>openDetail("scheduled")}><span className={styles.statIcon}>▣</span><small>Já agendados</small><strong>{metric.scheduledStudents}</strong><em>Ver próximas datas →</em></button>
        <button type="button" onClick={()=>openDetail("advance")} className={metric.creditsAdvance?styles.statPositive:""}><span className={styles.statIcon}>↗</span><small>Créditos antecipados</small><strong>{metric.creditsAdvance}</strong><em>Ver saldos positivos →</em></button>
        <button type="button" onClick={()=>openDetail("attendance")}><span className={styles.statIcon}>●</span><small>Comparecimento</small><strong>{metric.attendanceRate}%</strong><em>{metric.attendancePresent} presenças · {metric.attendanceAbsent} faltas →</em></button>
      </div>

      {!compact?<div className={styles.operationAttention}>
        <div><small>PRECISAM DE ATENÇÃO</small><strong>{metric.studentsTwoPlus} criança{metric.studentsTwoPlus===1?"":"s"} com 2 ou mais pendências</strong></div>
        <div><small>CRÉDITO MAIS ANTIGO</small><strong>{metric.oldestPendingDate?fmtDate(metric.oldestPendingDate):"Nenhum pendente"}</strong></div>
        <div><small>BASE ATIVA</small><strong>{metric.activeStudents} aluno{metric.activeStudents===1?"":"s"} ativo{metric.activeStudents===1?"":"s"}</strong></div>
      </div>:null}
      <p className={styles.operationNote}><b>Leitura correta:</b> o saldo é individual. Crédito positivo de uma criança não apaga a pendência de outra.</p>
    </section>

    {detail?<div className={styles.detailBackdrop} onMouseDown={event=>{if(event.currentTarget===event.target)setDetail(null);}}>
      <section className={styles.detailDialog} role="dialog" aria-modal="true" aria-label={detailMeta[detail].title}>
        <header className={styles.detailHead}>
          <div><span>{detailMeta[detail].eyebrow}</span><h3>{detailMeta[detail].title}</h3><p>{detailMeta[detail].description}</p></div>
          <button type="button" onClick={()=>setDetail(null)} aria-label="Fechar detalhamento">×</button>
        </header>
        <div className={styles.detailSummary}><strong>{detailRows.length}</strong><span>criança{detailRows.length===1?"":"s"} na lista</span><b>{detailRows.reduce((sum,row)=>sum+rowValue(row,detail),0)}</b><span>registro{detailRows.reduce((sum,row)=>sum+rowValue(row,detail),0)===1?"":"s"}</span></div>
        <label className={styles.detailSearch}><span>⌕</span><input value={detailSearch} onChange={event=>setDetailSearch(event.target.value)} placeholder="Buscar criança..." autoComplete="off"/></label>
        <div className={styles.detailList}>
          {detailRows.length?detailRows.map(row=><article className={styles.detailRow} key={row.id}>
            <div className={styles.detailStudent}><strong>{row.name}</strong><small>{rowValue(row,detail)} {detail==="attendance"?"registro":detail==="scheduled"?"agendamento":"crédito"}{rowValue(row,detail)===1?"":"s"}</small></div>
            <div className={styles.detailDates}>{rowDates(row,detail).map((event,index)=><span key={`${event.date}-${event.className||"registro"}-${index}`} className={event.tone==="resolved"?styles.detailResolved:event.tone==="pending"?styles.detailPending:event.tone==="absent"?styles.detailAbsent:""}><b>{fmtDate(event.date)}</b><small>{event.className||event.label}</small>{event.className?<em>{event.label}</em>:null}</span>)}</div>
            <b className={styles.detailCount}>{rowValue(row,detail)}</b>
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
        <p>5ª aula da turma conta para todos. Na reposição individual, a vaga utilizada consome o crédito mesmo quando a criança falta.</p>
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
