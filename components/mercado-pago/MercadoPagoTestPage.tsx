"use client";

import {useEffect,useMemo,useRef,useState} from "react";
import styles from "./MercadoPagoTestPage.module.css";

type Status="AUTO"|"REVIEW"|"MATCHED"|"IGNORED"|"TECHNICAL";
type Filter="ALL"|"IN"|"OUT"|"REVIEW"|"TECHNICAL";
type Move={id:string;sourceId?:string;date:string;description:string;detail:string;operation?:string;kind:"IN"|"OUT";amount:number;category:string;confidence:number;reason?:string;technical?:boolean;status:Status};
type ReportState={id?:string|number|null;status?:string;beginDate?:string|null;endDate?:string|null;generatedAt?:string|null;fileName?:string|null}|null;
type ApiData={
  connected:boolean;needsSetup:boolean;configured:{settlement:boolean;release:boolean};configurationOptimized:boolean;pending:boolean;
  balance:number|null;balanceSource:string|null;lastSync:string|null;movements:Move[];technicalCount:number;classificationVersion?:string;
  reports:{settlement:ReportState;release:ReportState};firstCollectionNotice:boolean;readOnly:boolean;
};

const money=new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"});
const categories=["Alimentação","Mercado","Transporte","Saúde","Lazer","Compras","Filho","Taxas bancárias","Recebimento","Outros"];

function date(v:string){
  if(!v)return "Data não informada";
  const d=new Date(v);
  if(Number.isNaN(d.getTime()))return v;
  return d.toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit"})+" · "+d.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"});
}
function dateTime(v:string|null){
  if(!v)return "Ainda não sincronizado";
  const d=new Date(v);
  if(Number.isNaN(d.getTime()))return v;
  return d.toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit"})+" · "+d.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"});
}
function statusLabel(s:Status){return s==="AUTO"?"Sugestão":s==="MATCHED"?"Aprovado":s==="IGNORED"?"Ignorado":s==="TECHNICAL"?"Técnico":"Revisar";}
function confidenceLabel(value:number){return value>=90?"alta":value>=70?"média":"baixa";}
function reportStatus(value?:string){
  const s=(value||"").toLowerCase();
  if(!s)return "Sem relatório";
  if(["processed","ready","done","completed","generated"].some(x=>s.includes(x)))return "Pronto";
  if(["pending","processing","in_process","in_progress","preparing"].some(x=>s.includes(x)))return "Em processamento";
  return value||"Desconhecido";
}

export default function MercadoPagoTestPage(){
 const [data,setData]=useState<ApiData|null>(null);
 const [moves,setMoves]=useState<Move[]>([]);
 const [filter,setFilter]=useState<Filter>("ALL");
 const [q,setQ]=useState("");
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const pollRef=useRef<number|null>(null);

 async function load(silent=false){
  if(!silent)setLoading(true);
  try{
    const response=await fetch("/api/mercado-pago",{cache:"no-store"});
    const payload=await response.json();
    if(!response.ok||!payload?.ok)throw new Error(payload?.error||"Falha ao consultar Mercado Pago.");
    const next:ApiData={
      connected:Boolean(payload.connected),needsSetup:Boolean(payload.needsSetup),configured:payload.configured||{settlement:false,release:false},
      configurationOptimized:Boolean(payload.configurationOptimized),pending:Boolean(payload.pending),balance:typeof payload.balance==="number"?payload.balance:null,
      balanceSource:payload.balanceSource||null,lastSync:payload.lastSync||null,movements:Array.isArray(payload.movements)?payload.movements:[],
      technicalCount:Number(payload.technicalCount||0),classificationVersion:payload.classificationVersion||"",
      reports:payload.reports||{settlement:null,release:null},firstCollectionNotice:Boolean(payload.firstCollectionNotice),readOnly:true
    };
    setData(next);setMoves(next.movements);setError("");return next;
  }catch(err){setError(err instanceof Error?err.message:"Não foi possível consultar o Mercado Pago.");return null;}
  finally{if(!silent)setLoading(false);}
 }

 useEffect(()=>{void load();return()=>{if(pollRef.current)window.clearInterval(pollRef.current);};},[]);
 function startPolling(){
  if(pollRef.current)window.clearInterval(pollRef.current);
  let tries=0;
  pollRef.current=window.setInterval(async()=>{
    tries++;
    const next=await load(true);
    if(!next?.pending||tries>=12){if(pollRef.current)window.clearInterval(pollRef.current);pollRef.current=null;setBusy(false);}
  },10000);
 }
 async function sync(){
  setBusy(true);setError("");
  try{
    const response=await fetch("/api/mercado-pago",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:data?.needsSetup?"setup":"sync"})});
    const payload=await response.json();
    if(!response.ok||!payload?.ok)throw new Error(payload?.error||"Não foi possível iniciar a sincronização.");
    await load(true);startPolling();
  }catch(err){setBusy(false);setError(err instanceof Error?err.message:"Não foi possível iniciar a sincronização.");}
 }

 const summary=useMemo(()=>{
   const active=moves.filter(x=>x.status!=="IGNORED");
   const operational=active.filter(x=>!x.technical&&x.status!=="TECHNICAL");
   return{
     incoming:active.filter(x=>x.kind==="IN").reduce((s,x)=>s+x.amount,0),
     outgoing:active.filter(x=>x.kind==="OUT").reduce((s,x)=>s+x.amount,0),
     review:operational.filter(x=>x.status==="REVIEW").length,
     suggested:operational.filter(x=>x.status==="AUTO"||x.status==="MATCHED").length,
     technical:active.filter(x=>x.technical||x.status==="TECHNICAL").length
   };
 },[moves]);

 const visible=useMemo(()=>{
   const n=q.trim().toLowerCase();
   return moves.filter(x=>{
     const technical=Boolean(x.technical||x.status==="TECHNICAL");
     if(filter==="ALL"&&technical)return false;
     if(filter==="IN"&&(x.kind!=="IN"||technical))return false;
     if(filter==="OUT"&&(x.kind!=="OUT"||technical))return false;
     if(filter==="REVIEW"&&x.status!=="REVIEW")return false;
     if(filter==="TECHNICAL"&&!technical)return false;
     return !n||`${x.description} ${x.detail} ${x.category} ${x.reason||""} ${x.operation||""}`.toLowerCase().includes(n);
   });
 },[moves,filter,q]);

 const patch=(id:string,c:Partial<Move>)=>setMoves(m=>m.map(x=>x.id===id?{...x,...c}:x));
 const connected=Boolean(data?.connected&&!error);
 const setupReady=Boolean(data&&!data.needsSetup);

 return <section className={styles.page}>
  <section className={styles.moduleHead}>
    <div>
      <div className={styles.kicker}><span>CONCILIAÇÃO BANCÁRIA</span><b>SOMENTE LEITURA</b></div>
      <h2>Mercado Pago</h2>
      <p>Dados reais da conta, isolados do Financeiro oficial enquanto validamos a integração.</p>
    </div>
    <div className={`${styles.connection} ${connected?styles.connected:""}`}><i/><span><strong>{connected?"Credencial de produção conectada":"Conexão indisponível"}</strong><small>{connected?setupReady?"Relatórios reais disponíveis para leitura.":"Token reconhecido · falta iniciar os relatórios.":"Confira a mensagem abaixo."}</small></span></div>
  </section>

  {error?<section className={styles.errorBox}><strong>⚠ Não foi possível conectar</strong><span>{error}</span><button className="secondary" onClick={()=>void load()}>Tentar novamente</button></section>:null}

  <section className={styles.balanceHero}>
    <div className={styles.balanceIcon}>$</div>
    <div className={styles.balanceMain}>
      <span>Saldo disponível Mercado Pago</span>
      <strong>{loading?"Carregando...":data?.balance!==null&&data?.balance!==undefined?money.format(data.balance):"Aguardando relatório"}</strong>
      <small>{data?.balance!==null&&data?.balance!==undefined?"Último saldo sincronizado pelo relatório de Liberações.":data?.reports?.release?.status?`Liberações: ${reportStatus(data.reports.release.status)}.`:"O saldo aparecerá quando o relatório de Liberações ficar pronto."}</small>
    </div>
    <div className={styles.balanceSync}>
      <span>Última sincronização</span><strong>{dateTime(data?.lastSync||null)}</strong>
      <button className="secondary" disabled={loading||busy||!connected} onClick={()=>void sync()}>{busy||data?.pending?"Sincronizando...":data?.needsSetup?"Ativar sincronização real":"Atualizar agora"}</button>
    </div>
  </section>

  <section className={styles.safe}>
    <div><b>🛡️</b><span><strong>Financeiro oficial protegido</strong><small>Nenhuma movimentação vira Gasto extra, receita ou despesa automaticamente.</small></span></div>
    <span className={styles.readOnlyTag}>READ ONLY</span>
  </section>

  {!loading&&data&&!data.needsSetup&&!data.configurationOptimized?<section className={styles.smartUpgrade}>
    <div><b>✨</b><span><strong>Leitura inteligente aprimorada pronta</strong><small>Incluímos mais campos do relatório para reconhecer estabelecimentos, taxas, PIX e movimentos técnicos. Clique em Atualizar agora para o Mercado Pago gerar a nova leitura.</small></span></div>
    <button className="primary" disabled={busy||data.pending} onClick={()=>void sync()}>{busy||data.pending?"Gerando...":"Atualizar agora"}</button>
  </section>:null}

  {data?.firstCollectionNotice?<section className={styles.noticeBox}><strong>Primeira coleta do Dinheiro em conta</strong><span>O relatório começa a registrar dados depois da configuração e da primeira execução. A coleta pode não recuperar o período anterior.</span></section>:null}

  <div className={styles.kpis}>
    <article><span>Entradas no saldo</span><strong className={styles.green}>{money.format(summary.incoming)}</strong><small>Todos os movimentos de entrada</small></article>
    <article><span>Saídas do saldo</span><strong className={styles.red}>{money.format(summary.outgoing)}</strong><small>Todos os movimentos de saída</small></article>
    <article><span>Reconhecidas</span><strong>{summary.suggested}</strong><small>Classificação de alta confiança</small></article>
    <article className={summary.review?styles.warn:""}><span>Precisa de você</span><strong>{summary.review}</strong><small>{summary.review?"Pendências reais de classificação":"Nada pendente"}</small></article>
  </div>

  <section className={styles.attention}>
    <b>{summary.review?"!":"✓"}</b>
    <span><small>CENTRO DE ATENÇÃO</small><strong>{summary.review?`${summary.review} movimentações realmente precisam da sua revisão`:moves.length?"Nenhuma movimentação precisa de você":"Aguardando movimentos reais"}</strong><em>{summary.technical?`${summary.technical} movimentos técnicos foram separados automaticamente e não entram nas pendências.`:"Movimentos técnicos não inflam sua fila de revisão."}</em></span>
    <button className="primary" disabled={!summary.review} onClick={()=>setFilter("REVIEW")}>{summary.review?"Revisar agora":"Tudo certo"}</button>
  </section>

  <div className={styles.grid}>
   <section className={`panel ${styles.statement}`}>
    <div className={styles.statementHead}>
      <span><small>EXTRATO INTELIGENTE</small><h2>Movimentações reais</h2><em>Com separação de movimentos técnicos e regras de classificação.</em></span>
      <span className={styles.sync}><small>Status Mercado Pago</small><strong>{data?.pending?"Relatório em preparação":setupReady?"Pronto para leitura":"Aguardando ativação"}</strong><em>{data?.reports?.settlement?.status?`Dinheiro em conta: ${reportStatus(data.reports.settlement.status)}`:""}</em></span>
    </div>

    <div className={styles.toolbar}>
      <div>{([ ["ALL","Todas"],["IN","Entradas"],["OUT","Saídas"],["REVIEW",`Revisar · ${summary.review}`],["TECHNICAL",`Técnicos · ${summary.technical}`] ] as [Filter,string][]).map(([k,l])=><button key={k} className={filter===k?styles.active:""} onClick={()=>setFilter(k)}>{l}</button>)}</div>
      <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar movimentação..."/>
    </div>

    <div>{visible.map(x=>{
      const technical=Boolean(x.technical||x.status==="TECHNICAL");
      return <article className={`${styles.move} ${x.status==="REVIEW"?styles.review:""} ${technical?styles.technicalMove:""}`} key={x.id}>
        <div className={`${styles.icon} ${technical?styles.iconTechnical:x.kind==="IN"?styles.iconIn:styles.iconOut}`}>{technical?"⚙":x.kind==="IN"?"↓":"↑"}</div>
        <div className={styles.info}>
          <div><strong>{x.description}</strong><span className={`${styles.badge} ${styles[x.status]}`}>{statusLabel(x.status)}</span></div>
          <small>{date(x.date)}{x.detail?` · ${x.detail}`:""}</small>
          {technical?<div className={styles.technicalReason}><b>Não exige categoria</b><span>{x.reason||"Movimento técnico do Mercado Pago."}</span></div>:<label><span>Categoria sugerida</span><select value={x.category} onChange={e=>patch(x.id,{category:e.target.value,status:"REVIEW"})}>{categories.map(c=><option key={c}>{c}</option>)}</select><em>{x.confidence}% · confiança {confidenceLabel(x.confidence)}{x.reason?` · ${x.reason}`:""}</em></label>}
        </div>
        <div className={styles.value}>
          <strong className={x.kind==="IN"?styles.green:styles.red}>{x.kind==="IN"?"+ ":"− "}{money.format(x.amount)}</strong>
          {x.status==="REVIEW"?<span><button className="primary" onClick={()=>patch(x.id,{status:"MATCHED",confidence:100})}>Aprovar</button><button className="secondary" onClick={()=>patch(x.id,{status:"IGNORED"})}>Ignorar</button></span>:null}
        </div>
      </article>;
    })}
    {!loading&&!visible.length?<div className={styles.empty}><strong>{filter==="TECHNICAL"?"Nenhum movimento técnico nesta coleta.":data?.pending?"O Mercado Pago está preparando o relatório.":"Nada encontrado neste filtro."}</strong><span>{filter==="ALL"&&summary.technical?`${summary.technical} movimentos técnicos estão ocultos da visão principal.`:"Nada foi lançado no Financeiro oficial."}</span></div>:null}</div>
   </section>

   <aside className={styles.side}>
    <section className="panel">
      <small className={styles.cap}>CONEXÃO REAL</small><h3>Status dos relatórios</h3><p className="muted">Dados técnicos sem expor sua credencial.</p>
      <div className={styles.reportRow}><span><strong>Dinheiro em conta</strong><small>Movimentações do saldo</small></span><b className={data?.reports?.settlement?.status&&reportStatus(data.reports.settlement.status)==="Pronto"?styles.okTag:styles.waitTag}>{data?.reports?.settlement?.status?reportStatus(data.reports.settlement.status):data?.configured.settlement?"Configurado":"Pendente"}</b></div>
      <div className={styles.reportRow}><span><strong>Liberações</strong><small>Composição do saldo disponível</small></span><b className={data?.reports?.release?.status&&reportStatus(data.reports.release.status)==="Pronto"?styles.okTag:styles.waitTag}>{data?.reports?.release?.status?reportStatus(data.reports.release.status):data?.configured.release?"Configurado":"Pendente"}</b></div>
      <div className={styles.reportRow}><span><strong>Leitura inteligente</strong><small>Campos ampliados para classificação</small></span><b className={data?.configurationOptimized?styles.okTag:styles.waitTag}>{data?.configurationOptimized?"Ativa":"Atualizar"}</b></div>
    </section>
    <section className="panel">
      <small className={styles.cap}>O QUE O DMP JÁ ENTENDE</small><h3>Classificação inteligente</h3>
      <div className={styles.smartRule}><span>🍽️</span><div><strong>Alimentação</strong><small>iFood, restaurantes, churrascarias, padarias, lanches e similares.</small></div></div>
      <div className={styles.smartRule}><span>🛒</span><div><strong>Mercado</strong><small>Covabra, supermercados, mercadinhos e hortifruti.</small></div></div>
      <div className={styles.smartRule}><span>🚗</span><div><strong>Transporte</strong><small>ConectCar, postos, combustível, estacionamento e pedágio.</small></div></div>
      <div className={styles.smartRule}><span>⚙️</span><div><strong>Movimentos técnicos</strong><small>Ajustes, contestações e transferências bancárias operacionais ficam fora das pendências.</small></div></div>
    </section>
    <section className={styles.future}><small>FASE ATUAL</small><strong>Aprender antes de automatizar</strong><span>Primeiro reduzimos as pendências e validamos as regras. Só depois ativaremos memória persistente, notificações e conciliação com Gastos extras.</span></section>
   </aside>
  </div>

  <p className={styles.note}>Mercado Pago V4 · leitura inteligente em modo somente leitura · nenhum dado do Financeiro oficial é alterado.</p>
 </section>;
}
