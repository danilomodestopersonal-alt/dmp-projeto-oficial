"use client";

import {useMemo,useState} from "react";
import styles from "./MercadoPagoTestPage.module.css";

type Status="AUTO"|"REVIEW"|"MATCHED"|"IGNORED";
type Filter="ALL"|"IN"|"OUT"|"REVIEW";
type Move={id:string;date:string;description:string;detail:string;kind:"IN"|"OUT";amount:number;category:string;confidence:number;status:Status};
const money=new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"});
const categories=["Alimentação","Mercado","Transporte","Saúde","Lazer","Compras","Filho","Taxas bancárias","Recebimento","Outros"];
const seed:Move[]=[
{id:"1",date:"2026-09-18T06:31:00",description:"PIX recebido",detail:"Entrada encontrada no extrato",kind:"IN",amount:600,category:"Recebimento",confidence:99,status:"MATCHED"},
{id:"2",date:"2026-09-17T19:42:00",description:"COVABRA",detail:"Pagamento no cartão",kind:"OUT",amount:187.32,category:"Mercado",confidence:98,status:"AUTO"},
{id:"3",date:"2026-09-17T13:18:00",description:"iFood",detail:"Pagamento online",kind:"OUT",amount:49.90,category:"Alimentação",confidence:99,status:"AUTO"},
{id:"4",date:"2026-09-17T08:02:00",description:"CONECTCAR",detail:"Pagamento automático",kind:"OUT",amount:14.30,category:"Transporte",confidence:99,status:"AUTO"},
{id:"5",date:"2026-09-16T17:54:00",description:"MP*ABC SERVIÇOS",detail:"Descrição ainda não reconhecida",kind:"OUT",amount:84.90,category:"Outros",confidence:42,status:"REVIEW"},
{id:"6",date:"2026-09-16T11:22:00",description:"PIX recebido",detail:"Entrada sem correspondência encontrada",kind:"IN",amount:350,category:"Recebimento",confidence:61,status:"REVIEW"},
{id:"7",date:"2026-09-15T18:36:00",description:"DROGARIA",detail:"Pagamento no cartão",kind:"OUT",amount:95.39,category:"Saúde",confidence:96,status:"AUTO"},
{id:"8",date:"2026-09-15T09:10:00",description:"Taxa Mercado Pago",detail:"Tarifa da conta",kind:"OUT",amount:6.45,category:"Taxas bancárias",confidence:100,status:"AUTO"}
];
function date(v:string){const d=new Date(v);return d.toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit"})+" · "+d.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"});}
function status(s:Status){return s==="AUTO"?"Identificado":s==="MATCHED"?"Conciliado":s==="IGNORED"?"Ignorado":"Revisar";}

export default function MercadoPagoTestPage(){
 const [moves,setMoves]=useState(seed);const [filter,setFilter]=useState<Filter>("ALL");const [q,setQ]=useState("");
 const summary=useMemo(()=>{const a=moves.filter(x=>x.status!=="IGNORED");return{incoming:a.filter(x=>x.kind==="IN").reduce((s,x)=>s+x.amount,0),outgoing:a.filter(x=>x.kind==="OUT").reduce((s,x)=>s+x.amount,0),review:a.filter(x=>x.status==="REVIEW").length,ok:a.filter(x=>x.status==="AUTO"||x.status==="MATCHED").length}},[moves]);
 const visible=useMemo(()=>{const n=q.trim().toLowerCase();return moves.filter(x=>(filter==="ALL"||filter===x.kind||(filter==="REVIEW"&&x.status==="REVIEW"))&&(!n||`${x.description} ${x.detail} ${x.category}`.toLowerCase().includes(n)))},[moves,filter,q]);
 const patch=(id:string,c:Partial<Move>)=>setMoves(m=>m.map(x=>x.id===id?{...x,...c}:x));
 return <>
 <header className={`dashboard-topbar ${styles.topbar}`}><div><div className={styles.kicker}><p className="dashboard-eyebrow">Conciliação bancária</p><span>MODO TESTE</span></div><h1>Mercado Pago</h1><p>Módulo isolado · nenhuma movimentação altera o Financeiro oficial.</p></div><div className={styles.connection}><i/><span><strong>Conexão real ainda não ativada</strong><small>Prévia operacional com dados demonstrativos.</small></span></div></header>
 <section className={`dashboard-content ${styles.page}`}>
  <section className={styles.safe}><div><b>🛡️</b><span><strong>Ambiente seguro de teste</strong><small>Aprovar, classificar ou ignorar aqui não grava nada no Financeiro atual.</small></span></div><button className="secondary" disabled>Conectar Mercado Pago · próxima etapa</button></section>
  <div className={styles.kpis}><article><span>Entradas</span><strong className={styles.green}>{money.format(summary.incoming)}</strong><small>Demonstração do mês</small></article><article><span>Saídas</span><strong className={styles.red}>{money.format(summary.outgoing)}</strong><small>Demonstração do mês</small></article><article><span>Identificadas</span><strong>{summary.ok}</strong><small>Sem precisar perguntar</small></article><article className={summary.review?styles.warn:""}><span>Precisa de você</span><strong>{summary.review}</strong><small>Aguardando revisão</small></article></div>
  <section className={styles.attention}><b>!</b><span><small>CENTRO DE ATENÇÃO</small><strong>{summary.review?`${summary.review} movimentações precisam da sua revisão`:"Nenhuma movimentação pendente"}</strong><em>É aqui que o DMP vai chamar você somente quando não tiver segurança para decidir sozinho.</em></span><button className="primary" onClick={()=>setFilter("REVIEW")}>{summary.review?"Revisar agora":"Conferido ✓"}</button></section>
  <div className={styles.grid}>
   <section className={`panel ${styles.statement}`}><div className={styles.statementHead}><span><small>EXTRATO INTELIGENTE</small><h2>Movimentações</h2><em>Extrato + classificação + conciliação.</em></span><span className={styles.sync}><small>Última leitura</small><strong>Hoje · 06:38</strong><em>dados demonstrativos</em></span></div>
    <div className={styles.toolbar}><div>{([["ALL","Todas"],["IN","Entradas"],["OUT","Saídas"],["REVIEW","Revisar"]] as [Filter,string][]).map(([k,l])=><button key={k} className={filter===k?styles.active:""} onClick={()=>setFilter(k)}>{l}{k==="REVIEW"&&summary.review?` · ${summary.review}`:""}</button>)}</div><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar movimentação..."/></div>
    <div>{visible.map(x=><article className={`${styles.move} ${x.status==="REVIEW"?styles.review:""}`} key={x.id}><div className={`${styles.icon} ${x.kind==="IN"?styles.iconIn:styles.iconOut}`}>{x.kind==="IN"?"↓":"↑"}</div><div className={styles.info}><div><strong>{x.description}</strong><span className={`${styles.badge} ${styles[x.status]}`}>{status(x.status)}</span></div><small>{date(x.date)} · {x.detail}</small><label><span>Categoria</span><select value={x.category} onChange={e=>patch(x.id,{category:e.target.value,status:"REVIEW"})}>{categories.map(c=><option key={c}>{c}</option>)}</select><em>{x.confidence}% confiança</em></label></div><div className={styles.value}><strong className={x.kind==="IN"?styles.green:styles.red}>{x.kind==="IN"?"+ ":"− "}{money.format(x.amount)}</strong>{x.status==="REVIEW"?<span><button className="primary" onClick={()=>patch(x.id,{status:x.kind==="IN"?"MATCHED":"AUTO",confidence:100})}>Aprovar</button><button className="secondary" onClick={()=>patch(x.id,{status:"IGNORED"})}>Ignorar</button></span>:null}</div></article>)}{!visible.length?<div className={styles.empty}>Nada por aqui.</div>:null}</div>
   </section>
   <aside className={styles.side}><section className="panel"><small className={styles.cap}>APRENDIZADO</small><h3>Regras reconhecidas</h3><p className="muted">No futuro, o sistema aprende com suas aprovações.</p>{[["CONECTCAR","Transporte","12×"],["iFood","Alimentação","9×"],["COVABRA","Mercado","7×"],["DROGARIA","Saúde","5×"]].map(r=><div className={styles.rule} key={r[0]}><span><strong>{r[0]}</strong><small>{r[1]}</small></span><b>{r[2]}</b></div>)}</section><section className="panel"><small className={styles.cap}>COMO VAI FUNCIONAR</small><h3>Da conta para o DMP</h3><ol className={styles.flow}><li><b>1</b><span><strong>Mercado Pago lê</strong><small>Entradas e saídas chegam automaticamente.</small></span></li><li><b>2</b><span><strong>DMP interpreta</strong><small>Reconhece valor, descrição e categoria provável.</small></span></li><li><b>3</b><span><strong>Você vê só exceções</strong><small>Notificação apenas quando faltar certeza.</small></span></li><li><b>4</b><span><strong>Integração vem depois</strong><small>Gastos extras continuam intocados nesta fase.</small></span></li></ol></section><section className={styles.future}><small>PRÓXIMA ETAPA</small><strong>Conectar dados reais</strong><span>Depois que você aprovar esta experiência, trocamos a demonstração pelo extrato real — ainda sem alimentar o Financeiro.</span></section></aside>
  </div>
  <p className={styles.note}>Prévia V1: qualquer aprovação feita nesta tela é temporária e volta ao estado inicial ao atualizar a página.</p>
 </section></>;
}
