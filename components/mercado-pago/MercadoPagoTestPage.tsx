"use client";

import {useEffect,useMemo,useRef,useState} from "react";
import styles from "./MercadoPagoTestPage.module.css";

type Status="AUTO"|"REVIEW"|"MATCHED"|"IGNORED";
type Filter="ALL"|"IN"|"OUT"|"REVIEW";
type Move={id:string;sourceId?:string;date:string;description:string;detail:string;kind:"IN"|"OUT";amount:number;category:string;confidence:number;status:Status};
type ReportState={id?:string|number|null;status?:string;beginDate?:string|null;endDate?:string|null;generatedAt?:string|null;fileName?:string|null}|null;
type ApiData={
  connected:boolean;needsSetup:boolean;configured:{settlement:boolean;release:boolean};pending:boolean;
  balance:number|null;balanceSource:string|null;lastSync:string|null;movements:Move[];
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

function statusLabel(s:Status){return s==="AUTO"?"Sugestão":s==="MATCHED"?"Conciliado":s==="IGNORED"?"Ignorado":"Revisar";}

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
      pending:Boolean(payload.pending),balance:typeof payload.balance==="number"?payload.balance:null,balanceSource:payload.balanceSource||null,
      lastSync:payload.lastSync||null,movements:Array.isArray(payload.movements)?payload.movements:[],reports:payload.reports||{settlement:null,release:null},
      firstCollectionNotice:Boolean(payload.firstCollectionNotice),readOnly:true
    };
    setData(next);setMoves(next.movements);setError("");
    return next;
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
    if(!next?.pending||tries>=12){
      if(pollRef.current)window.clearInterval(pollRef.current);
      pollRef.current=null;
      setBusy(false);
    }
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
   const a=moves.filter(x=>x.status!=="IGNORED");
   return{
     incoming:a.filter(x=>x.kind==="IN").reduce((s,x)=>s+x.amount,0),
     outgoing:a.filter(x=>x.kind==="OUT").reduce((s,x)=>s+x.amount,0),
     review:a.filter(x=>x.status==="REVIEW").length,
     suggested:a.filter(x=>x.status==="AUTO"||x.status==="MATCHED").length
   };
 },[moves]);

 const visible=useMemo(()=>{
   const n=q.trim().toLowerCase();
   return moves.filter(x=>(filter==="ALL"||filter===x.kind||(filter==="REVIEW"&&x.status==="REVIEW"))&&(!n||`${x.description} ${x.detail} ${x.category}`.toLowerCase().includes(n)));
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
    <div className={`${styles.connection} ${connected?styles.connected:""}`}><i/><span><strong>{connected?"Credencial de produção conectada":"Conexão indisponível"}</strong><small>{connected?setupReady?"Relatórios habilitados para sincronização.":"Token reconhecido · falta iniciar os relatórios.":"Confira a mensagem abaixo."}</small></span></div>
  </section>

  {error?<section className={styles.errorBox}><strong>⚠ Não foi possível conectar</strong><span>{error}</span><button className="secondary" onClick={()=>void load()}>Tentar novamente</button></section>:null}

  <section className={styles.balanceHero}>
    <div className={styles.balanceIcon}>$</div>
    <div className={styles.balanceMain}>
      <span>Saldo disponível Mercado Pago</span>
      <strong>{loading?"Carregando...":data?.balance!==null&&data?.balance!==undefined?money.format(data.balance):"Aguardando relatório"}</strong>
      <small>{data?.balance!==null&&data?.balance!==undefined?"Último saldo sincronizado pelo relatório de Liberações.":"O saldo aparecerá assim que o primeiro relatório de Liberações ficar pronto."}</small>
    </div>
    <div className={styles.balanceSync}>
      <span>Última sincronização</span>
      <strong>{dateTime(data?.lastSync||null)}</strong>
      <button className="secondary" disabled={loading||busy||!connected} onClick={()=>void sync()}>{busy||data?.pending?"Sincronizando...":data?.needsSetup?"Ativar sincronização real":"Atualizar agora"}</button>
    </div>
  </section>

  <section className={styles.safe}>
    <div><b>🛡️</b><span><strong>Financeiro oficial protegido</strong><small>Esta fase consulta Mercado Pago em modo leitura. Nenhuma movimentação vira Gasto extra, receita ou despesa automaticamente.</small></span></div>
    <span className={styles.readOnlyTag}>READ ONLY</span>
  </section>

  {data?.needsSetup?<section className={styles.setupBox}><div><strong>Primeira conexão</strong><span>O Access Token já está no servidor. Falta apenas criar as configurações oficiais dos relatórios Dinheiro em conta e Liberações.</span></div><button className="primary" disabled={busy} onClick={()=>void sync()}>{busy?"Ativando...":"Ativar agora"}</button></section>:null}

  {data?.firstCollectionNotice?<section className={styles.noticeBox}><strong>Primeira coleta do Dinheiro em conta</strong><span>O Mercado Pago informa que esse relatório começa a registrar dados depois da configuração e da primeira execução. Por isso, a primeira coleta pode vir vazia e não recupera retroativamente o período anterior.</span></section>:null}

  <div className={styles.kpis}>
    <article><span>Entradas</span><strong className={styles.green}>{money.format(summary.incoming)}</strong><small>Movimentos sincronizados</small></article>
    <article><span>Saídas</span><strong className={styles.red}>{money.format(summary.outgoing)}</strong><small>Movimentos sincronizados</small></article>
    <article><span>Sugestões</span><strong>{summary.suggested}</strong><small>Classificadas pelo DMP</small></article>
    <article className={summary.review?styles.warn:""}><span>Precisa de você</span><strong>{summary.review}</strong><small>{summary.review?"Aguardando revisão":"Nada pendente"}</small></article>
  </div>

  <section className={styles.attention}>
    <b>{summary.review?"!":"✓"}</b>
    <span><small>CENTRO DE ATENÇÃO</small><strong>{summary.review?`${summary.review} movimentações precisam da sua revisão`:moves.length?"Nenhuma movimentação precisa de você":"Aguardando movimentos reais"}</strong><em>{moves.length?"As classificações desta fase ainda são apenas sugestões e não alteram seu Financeiro.":"Depois da primeira coleta, as movimentações reais aparecerão aqui."}</em></span>
    <button className="primary" disabled={!summary.review} onClick={()=>setFilter("REVIEW")}>{summary.review?"Revisar agora":"Tudo certo"}</button>
  </section>

  <div className={styles.grid}>
   <section className={`panel ${styles.statement}`}>
    <div className={styles.statementHead}>
      <span><small>EXTRATO INTELIGENTE</small><h2>Movimentações reais</h2><em>Leitura do relatório Dinheiro em conta.</em></span>
      <span className={styles.sync}><small>Status Mercado Pago</small><strong>{data?.pending?"Relatório em preparação":setupReady?"Pronto para leitura":"Aguardando ativação"}</strong><em>{data?.reports?.settlement?.status?`Dinheiro em conta: ${data.reports.settlement.status}`:""}</em></span>
    </div>

    <div className={styles.toolbar}>
      <div>{([["ALL","Todas"],["IN","Entradas"],["OUT","Saídas"],["REVIEW","Revisar"]] as [Filter,string][]).map(([k,l])=><button key={k} className={filter===k?styles.active:""} onClick={()=>setFilter(k)}>{l}{k==="REVIEW"&&summary.review?` · ${summary.review}`:""}</button>)}</div>
      <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar movimentação..."/>
    </div>

    <div>{visible.map(x=><article className={`${styles.move} ${x.status==="REVIEW"?styles.review:""}`} key={x.id}>
      <div className={`${styles.icon} ${x.kind==="IN"?styles.iconIn:styles.iconOut}`}>{x.kind==="IN"?"↓":"↑"}</div>
      <div className={styles.info}>
        <div><strong>{x.description}</strong><span className={`${styles.badge} ${styles[x.status]}`}>{statusLabel(x.status)}</span></div>
        <small>{date(x.date)}{x.detail?` · ${x.detail}`:""}</small>
        <label><span>Categoria sugerida</span><select value={x.category} onChange={e=>patch(x.id,{category:e.target.value,status:"REVIEW"})}>{categories.map(c=><option key={c}>{c}</option>)}</select><em>{x.confidence}% confiança</em></label>
      </div>
      <div className={styles.value}>
        <strong className={x.kind==="IN"?styles.green:styles.red}>{x.kind==="IN"?"+ ":"− "}{money.format(x.amount)}</strong>
        {x.status==="REVIEW"?<span><button className="primary" onClick={()=>patch(x.id,{status:"AUTO",confidence:100})}>Aprovar</button><button className="secondary" onClick={()=>patch(x.id,{status:"IGNORED"})}>Ignorar</button></span>:null}
      </div>
    </article>)}
    {!loading&&!visible.length?<div className={styles.empty}><strong>{data?.pending?"O Mercado Pago está preparando o relatório.":data?.needsSetup?"Ative a primeira sincronização para começar.":"Ainda não há movimentações disponíveis."}</strong><span>{data?.pending?"A tela verifica novamente automaticamente por alguns minutos.":"Nada foi lançado no Financeiro oficial."}</span></div>:null}</div>
   </section>

   <aside className={styles.side}>
    <section className="panel">
      <small className={styles.cap}>CONEXÃO REAL</small><h3>Status dos relatórios</h3><p className="muted">Dados técnicos sem expor sua credencial.</p>
      <div className={styles.reportRow}><span><strong>Dinheiro em conta</strong><small>Movimentações do saldo</small></span><b className={data?.configured.settlement?styles.okTag:styles.waitTag}>{data?.configured.settlement?"Configurado":"Pendente"}</b></div>
      <div className={styles.reportRow}><span><strong>Liberações</strong><small>Composição do saldo disponível</small></span><b className={data?.configured.release?styles.okTag:styles.waitTag}>{data?.configured.release?"Configurado":"Pendente"}</b></div>
    </section>
    <section className="panel">
      <small className={styles.cap}>FASE ATUAL</small><h3>Somente leitura</h3>
      <ol className={styles.flow}>
        <li><b>1</b><span><strong>Mercado Pago fornece</strong><small>Relatórios reais autenticados pelo backend.</small></span></li>
        <li><b>2</b><span><strong>DMP interpreta</strong><small>Entradas, saídas, saldo e sugestões de categoria.</small></span></li>
        <li><b>3</b><span><strong>Você valida</strong><small>Usamos esta fase para conferir se a leitura está correta.</small></span></li>
        <li><b>4</b><span><strong>Integração vem depois</strong><small>Só depois ligamos isso aos Gastos extras.</small></span></li>
      </ol>
    </section>
    <section className={styles.future}><small>PRÓXIMO PASSO</small><strong>Conferir alguns dias de dados</strong><span>Quando confirmarmos que os valores e descrições estão corretos, ativamos aprendizado persistente, notificações e, por último, conciliação com o Financeiro.</span></section>
   </aside>
  </div>

  <p className={styles.note}>Mercado Pago V3 · conexão real em modo somente leitura · nenhum dado financeiro do DMP é alterado.</p>
 </section>;
}
