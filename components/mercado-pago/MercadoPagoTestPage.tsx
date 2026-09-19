"use client";

import {useEffect,useMemo,useRef,useState} from "react";
import styles from "./MercadoPagoTestPage.module.css";

type Status="AUTO_READY"|"REVIEW"|"PROCESSED"|"IGNORED"|"TECHNICAL"|"HISTORICAL";
type Filter="ALL"|"REVIEW"|"PROCESSED"|"IN_DAY"|"OUT_DAY"|"IN_MONTH"|"OUT_MONTH"|"TECHNICAL"|"HISTORICAL";
type Target="EXTRA"|"PERSONAL"|"DS"|"EXPENSE"|"TRANSFER"|"IGNORE";
type RuleChoice="ONCE"|"SUGGEST"|"AUTO";
type Move={
  id:string;fingerprint:string;sourceId?:string;date:string;dateKey:string;description:string;detail:string;operation?:string;kind:"IN"|"OUT";amount:number;
  category:string;expenseName?:string;confidence:number;reason:string;technical:boolean;status:Status;suggestedTarget:Target;suggestedTargetName?:string;ruleMode?:"SUGGEST"|"AUTO";
  processedAutomatic?:boolean;historical:boolean;canLearn:boolean;learningLabel:string;
};
type LearnedRule={key:string;label:string;kind:"IN"|"OUT";target:Target;category?:string;targetName?:string;expenseName?:string;mode:"SUGGEST"|"AUTO";approvals:number;updatedAt:string};
type ReportState={id?:string|number|null;status?:string;generatedAt?:string|null;fileName?:string|null}|null;
type FinanceContext={
  competence:string|null;categories:string[];
  personal:Array<{id:string;studentName:string;expectedAmount:number;paid:number;remaining:number}>;
  expenses:Array<{id:string;name:string;expectedAmount:number;paid:number;remaining:number}>;
};
type ApiData={
  connected:boolean;needsSetup:boolean;configured:{settlement:boolean;release:boolean};configurationOptimized:boolean;pending:boolean;
  balance:number|null;balanceSource:string|null;lastSync:string|null;movements:Move[];classificationVersion?:string;cutoverDate:string;
  counts:{review:number;autoReady:number;processed:number;automatic:number;technical:number;historical:number};
  reports:{settlement:ReportState;release:ReportState};firstCollectionNotice:boolean;learnedRuleCount:number;learnedRules:LearnedRule[];
  financeContext:FinanceContext;financeConnected:boolean;
};
type Choice={target:Target;category:string;expenseName:string;targetId:string;targetName:string;ruleChoice:RuleChoice};

type Props={onFinanceChanged?:()=>void|Promise<void>;onBalanceChanged?:(value:number|null)=>void};

const money=new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"});
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
function cutoverLabel(v:string){const [y,m,d]=v.split("-");return `${d}/${m}/${y}`;}
function localDateKey(value=new Date()){return `${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,"0")}-${String(value.getDate()).padStart(2,"0")}`;}
function reportStatus(value?:string){
  const s=(value||"").toLowerCase();
  if(!s)return "Sem relatório";
  if(["processed","ready","done","completed","generated"].some(x=>s.includes(x)))return "Pronto";
  if(["pending","processing","in_process","in_progress","preparing"].some(x=>s.includes(x)))return "Em processamento";
  return value||"Desconhecido";
}
function statusLabel(move:Move){
  if(move.status==="PROCESSED")return move.processedAutomatic?"Automático":"Confirmado";
  if(move.status==="IGNORED")return "Resolvido";
  if(move.status==="TECHNICAL")return "Técnico";
  if(move.status==="HISTORICAL")return "Histórico";
  if(move.status==="AUTO_READY")return "Automatizável";
  return "Revisar";
}
function targetLabel(target:Target,kind:"IN"|"OUT"){
  const labels:Record<Target,string>={
    EXTRA:"Gasto extra",PERSONAL:"Recebimento Personal",DS:"Recebimento DS",EXPENSE:"Conta do plano",
    TRANSFER:kind==="IN"?"Transferência própria":"Transferência / repasse",IGNORE:"Ignorar",
  };
  return labels[target];
}
function ruleTarget(rule:LearnedRule){
  const base=targetLabel(rule.target,rule.kind);
  if(rule.target==="EXTRA")return [base,rule.category,rule.expenseName].filter(Boolean).join(" · ");
  if((rule.target==="PERSONAL"||rule.target==="EXPENSE")&&rule.targetName)return `${base} · ${rule.targetName}`;
  return base;
}

export default function MercadoPagoTestPage({onFinanceChanged,onBalanceChanged}:Props){
  const [data,setData]=useState<ApiData|null>(null);
  const [filter,setFilter]=useState<Filter>("ALL");
  const [q,setQ]=useState("");
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [autoChecking,setAutoChecking]=useState(false);
  const [error,setError]=useState("");
  const [savingId,setSavingId]=useState("");
  const [message,setMessage]=useState("");
  const [choices,setChoices]=useState<Record<string,Choice>>({});
  const pollRef=useRef<number|null>(null);
  const autoRef=useRef<number|null>(null);
  const mountedRef=useRef(true);

  async function load(silent=false){
    if(!silent)setLoading(true);
    try{
      const response=await fetch("/api/mercado-pago",{cache:"no-store"});
      const payload=await response.json();
      if(!response.ok||!payload?.ok)throw new Error(payload?.error||"Falha ao consultar Mercado Pago.");
      const next=payload as ApiData;
      if(!mountedRef.current)return null;
      setData(next);setError("");onBalanceChanged?.(typeof next.balance==="number"?next.balance:null);
      return next;
    }catch(err){if(mountedRef.current)setError(err instanceof Error?err.message:"Não foi possível consultar o Mercado Pago.");return null;}
    finally{if(!silent&&mountedRef.current)setLoading(false);}
  }

  async function processAuto(silent=false){
    if(!silent)setAutoChecking(true);
    try{
      const response=await fetch("/api/mercado-pago",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"process-auto"})});
      const payload=await response.json();
      if(!response.ok||!payload?.ok)throw new Error(payload?.error||"Não foi possível processar as regras automáticas.");
      if(Number(payload.processed||0)>0){
        await onFinanceChanged?.();
        setMessage(`${payload.processed} movimentação${Number(payload.processed)===1?"":"ões"} processada${Number(payload.processed)===1?"":"s"} automaticamente no Financeiro.`);
      }
      await load(true);
      return payload;
    }catch(err){if(!silent)setError(err instanceof Error?err.message:"Falha na automação Mercado Pago.");return null;}
    finally{if(!silent)setAutoChecking(false);}
  }

  function startPolling(){
    if(pollRef.current)window.clearInterval(pollRef.current);
    let tries=0;
    pollRef.current=window.setInterval(async()=>{
      tries++;
      const next=await load(true);
      if(!next?.pending||tries>=18){
        if(pollRef.current)window.clearInterval(pollRef.current);
        pollRef.current=null;setBusy(false);
        if(next&&!next.pending)await processAuto(true);
      }
    },10000);
  }

  async function sync(manual=false){
    if(manual)setBusy(true);else setAutoChecking(true);
    setError("");
    try{
      const response=await fetch("/api/mercado-pago",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:data?.needsSetup?"setup":"sync",force:manual})});
      const payload=await response.json();
      if(!response.ok||!payload?.ok)throw new Error(payload?.error||"Não foi possível iniciar a sincronização.");
      if(Number(payload?.auto?.processed||0)>0)await onFinanceChanged?.();
      const next=await load(true);
      if(next?.pending)startPolling();else{setBusy(false);await processAuto(true);}
    }catch(err){setBusy(false);setError(err instanceof Error?err.message:"Não foi possível iniciar a sincronização.");}
    finally{if(!manual)setAutoChecking(false);}
  }

  useEffect(()=>{
    mountedRef.current=true;
    void (async()=>{
      const next=await load();
      if(next){await processAuto(true);await sync(false);}
    })();
    autoRef.current=window.setInterval(()=>{void sync(false);},5*60*1000);
    return()=>{
      mountedRef.current=false;
      if(pollRef.current)window.clearInterval(pollRef.current);
      if(autoRef.current)window.clearInterval(autoRef.current);
    };
  },[]);

  function defaultChoice(move:Move):Choice{
    const target=move.suggestedTarget||(move.kind==="IN"?"PERSONAL":"EXTRA");
    let targetId="";
    let targetName=move.suggestedTargetName||"";
    if(target==="PERSONAL"&&targetName){
      const found=data?.financeContext.personal.find(item=>item.studentName.toLocaleLowerCase("pt-BR")===targetName.toLocaleLowerCase("pt-BR"));
      if(found)targetId=found.id;
    }
    if(target==="EXPENSE"&&targetName){
      const found=data?.financeContext.expenses.find(item=>item.name.toLocaleLowerCase("pt-BR")===targetName.toLocaleLowerCase("pt-BR"));
      if(found)targetId=found.id;
    }
    return {target,category:move.category||"Outros",expenseName:move.expenseName||move.description,targetId,targetName,ruleChoice:move.ruleMode||"ONCE"};
  }
  function choiceFor(move:Move){return choices[move.fingerprint]||defaultChoice(move);}
  function patchChoice(move:Move,patch:Partial<Choice>){setChoices(current=>({...current,[move.fingerprint]:{...choiceFor(move),...patch}}));}
  function changeTarget(move:Move,target:Target){patchChoice(move,{target,targetId:"",targetName:"",expenseName:move.expenseName||move.description,ruleChoice:"ONCE"});}

  async function decide(move:Move){
    const choice=choiceFor(move);
    if(choice.target==="PERSONAL"&&!choice.targetId){setError("Escolha o aluno do Personal para este recebimento.");return;}
    if(choice.target==="EXPENSE"&&!choice.targetId){setError("Escolha a conta do plano para este pagamento.");return;}
    if(choice.target==="EXTRA"&&!choice.category){setError("Escolha a categoria do gasto extra.");return;}
    if(choice.ruleChoice==="AUTO"){
      const detail=choice.target==="EXTRA"?` · ${choice.category} · ${choice.expenseName||move.description}`:choice.targetName?` · ${choice.targetName}`:"";
      if(!window.confirm(`Criar regra automática?\n\n${move.learningLabel||move.description} → ${targetLabel(choice.target,move.kind)}${detail}\n\nAs próximas movimentações com esta identificação poderão entrar automaticamente no Financeiro.`))return;
    }
    setSavingId(move.id);setMessage("");setError("");
    try{
      let targetName=choice.targetName;
      if(choice.target==="PERSONAL")targetName=data?.financeContext.personal.find(item=>item.id===choice.targetId)?.studentName||"";
      if(choice.target==="EXPENSE")targetName=data?.financeContext.expenses.find(item=>item.id===choice.targetId)?.name||"";
      const response=await fetch("/api/mercado-pago",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
        action:"decision",fingerprint:move.fingerprint,target:choice.target,category:choice.category,expenseName:choice.expenseName,targetId:choice.targetId,targetName,ruleChoice:choice.ruleChoice,
      })});
      const payload=await response.json();
      if(!response.ok||!payload?.ok)throw new Error(payload?.error||"Não foi possível conciliar esta movimentação.");
      if(payload.financeChanged)await onFinanceChanged?.();
      setMessage(choice.target==="TRANSFER"||choice.target==="IGNORE"
        ?"Movimentação resolvida sem gerar receita ou despesa."
        :choice.ruleChoice==="AUTO"?"Movimentação lançada e regra automática autorizada para as próximas ocorrências."
        :choice.ruleChoice==="SUGGEST"?"Movimentação lançada. O DMP vai sugerir este tratamento nas próximas ocorrências."
        :"Movimentação lançada no Financeiro. A decisão vale somente para esta ocorrência.");
      setChoices(current=>{const next={...current};delete next[move.fingerprint];return next;});
      await load(true);
    }catch(err){setError(err instanceof Error?err.message:"Não foi possível salvar sua decisão.");}
    finally{setSavingId("");}
  }

  async function deleteRule(rule:LearnedRule){
    if(!window.confirm(`Apagar a regra “${rule.label} → ${ruleTarget(rule)}”?`))return;
    setSavingId(`rule:${rule.key}`);setMessage("");
    try{
      const response=await fetch("/api/mercado-pago",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"delete-rule",key:rule.key})});
      const payload=await response.json();
      if(!response.ok||!payload?.ok)throw new Error(payload?.error||"Não foi possível apagar a regra.");
      setMessage("Regra removida. As próximas movimentações deixam de usar essa associação.");await load(true);
    }catch(err){setError(err instanceof Error?err.message:"Não foi possível apagar a regra.");}
    finally{setSavingId("");}
  }

  const moves=data?.movements||[];
  const operational=moves.filter(x=>!x.historical&&!x.technical);
  const todayKey=localDateKey();
  const monthKey=todayKey.slice(0,7);
  const summary=useMemo(()=>({
    incomingDay:operational.filter(x=>x.kind==="IN"&&x.dateKey===todayKey).reduce((s,x)=>s+x.amount,0),
    outgoingDay:operational.filter(x=>x.kind==="OUT"&&x.dateKey===todayKey).reduce((s,x)=>s+x.amount,0),
    incomingMonth:operational.filter(x=>x.kind==="IN"&&x.dateKey.startsWith(monthKey)).reduce((s,x)=>s+x.amount,0),
    outgoingMonth:operational.filter(x=>x.kind==="OUT"&&x.dateKey.startsWith(monthKey)).reduce((s,x)=>s+x.amount,0),
    review:operational.filter(x=>x.status==="REVIEW").length,
    processed:operational.filter(x=>x.status==="PROCESSED"||x.status==="IGNORED").length,
    automatic:operational.filter(x=>x.status==="PROCESSED"&&x.processedAutomatic).length,
    technical:moves.filter(x=>x.technical).length,historical:moves.filter(x=>x.historical).length,
  }),[moves,todayKey,monthKey]);
  const visible=useMemo(()=>{
    const n=q.trim().toLocaleLowerCase("pt-BR");
    return moves.filter(x=>{
      if(filter==="ALL"&&(x.technical||x.historical))return false;
      if(filter==="REVIEW"&&x.status!=="REVIEW"&&x.status!=="AUTO_READY")return false;
      if(filter==="PROCESSED"&&!(["PROCESSED","IGNORED"] as Status[]).includes(x.status))return false;
      if(filter==="IN_DAY"&&(x.kind!=="IN"||x.technical||x.historical||x.dateKey!==todayKey))return false;
      if(filter==="OUT_DAY"&&(x.kind!=="OUT"||x.technical||x.historical||x.dateKey!==todayKey))return false;
      if(filter==="IN_MONTH"&&(x.kind!=="IN"||x.technical||x.historical||!x.dateKey.startsWith(monthKey)))return false;
      if(filter==="OUT_MONTH"&&(x.kind!=="OUT"||x.technical||x.historical||!x.dateKey.startsWith(monthKey)))return false;
      if(filter==="TECHNICAL"&&!x.technical)return false;
      if(filter==="HISTORICAL"&&!x.historical)return false;
      return !n||`${x.description} ${x.detail} ${x.category} ${x.reason}`.toLocaleLowerCase("pt-BR").includes(n);
    });
  },[moves,filter,q]);

  const connected=Boolean(data?.connected&&!error);
  const setupReady=Boolean(data&&!data.needsSetup);
  const categories=data?.financeContext.categories?.length?data.financeContext.categories:["Alimentação","Mercado","Transporte","Saúde","Lazer","Compras","Filho","Taxas bancárias","Outros"];

  return <section className={styles.page}>
    <section className={styles.moduleHead}>
      <div><div className={styles.kicker}><span>CONCILIAÇÃO FINANCEIRA</span><b>OFICIAL</b></div><h2>Mercado Pago</h2><p>O que é seguro entra sozinho. O que depende de contexto espera sua aprovação.</p></div>
      <div className={`${styles.connection} ${connected?styles.connected:""}`}><i/><span><strong>{connected?"Conta conectada":"Conexão indisponível"}</strong><small>{connected?"Verificação a cada 5 min · relatório automático a cada 6 h.":"Confira a mensagem abaixo."}</small></span></div>
    </section>

    {error?<section className={styles.errorBox}><strong>⚠ Atenção</strong><span>{error}</span><button className="secondary" onClick={()=>void load()}>Tentar novamente</button></section>:null}
    {message?<div className={styles.learningMessage}>{message}</div>:null}

    <section className={styles.balanceHero}>
      <div className={styles.balanceIcon}>$</div>
      <div className={styles.balanceMain}><span>Saldo disponível Mercado Pago</span><strong>{loading?"Carregando...":typeof data?.balance==="number"?money.format(data.balance):"Aguardando Liberações"}</strong><small>{typeof data?.balance==="number"?"Este saldo também compõe o Saldo projetado do Resumo.":"O DMP continua acompanhando o relatório de Liberações até o saldo ficar disponível."}</small></div>
      <div className={styles.balanceSync}><span>Última sincronização</span><strong>{dateTime(data?.lastSync||null)}</strong><button className="secondary" disabled={loading||busy||!connected} onClick={()=>void sync(true)}>{busy||data?.pending?"Sincronizando...":"Atualizar agora"}</button><em>{autoChecking&&!busy?"verificação automática em andamento":"automático · 6 h | manual · 1 h"}</em></div>
    </section>

    <section className={styles.cutover}>
      <div><b>✓</b><span><strong>Operação oficial desde {cutoverLabel(data?.cutoverDate||"2026-09-18")}</strong><small>Tudo anterior ao corte ficou arquivado como histórico e não gera lançamento nem pendência.</small></span></div>
      <button className="secondary" onClick={()=>setFilter("HISTORICAL")}>{summary.historical} históricos</button>
    </section>

    <div className={styles.kpis}>
      <article><span>Receitas do dia</span><strong className={styles.green}>{money.format(summary.incomingDay)}</strong><small>Entradas operacionais de hoje</small></article>
      <article><span>Despesas do dia</span><strong className={styles.red}>{money.format(summary.outgoingDay)}</strong><small>Saídas operacionais de hoje</small></article>
      <article><span>Receitas do mês</span><strong className={styles.green}>{money.format(summary.incomingMonth)}</strong><small>Entradas operacionais do mês</small></article>
      <article><span>Despesas do mês</span><strong className={styles.red}>{money.format(summary.outgoingMonth)}</strong><small>Saídas operacionais do mês</small></article>
    </div>

    <section className={styles.attention}>
      <b>{summary.review?"!":"✓"}</b><span><small>PAINEL OPERACIONAL</small><strong>{summary.review?`${summary.review} movimentações aguardam sua decisão`:"Nenhuma pendência no momento"}</strong><em>Processadas automaticamente: {summary.automatic} · Histórico: {summary.historical} · Última sincronização: {dateTime(data?.lastSync||null)}</em></span>
      <button className="primary" disabled={!summary.review} onClick={()=>setFilter("REVIEW")}>{summary.review?"Revisar agora":"Sem pendências"}</button>
    </section>

    <div className={styles.grid}>
      <section className={`panel ${styles.statement}`}>
        <div className={styles.statementHead}><span><small>MOVIMENTAÇÕES REAIS</small><h2>Conciliação Mercado Pago</h2><em>Escolha o destino financeiro apenas quando o DMP não tiver certeza suficiente.</em></span><span className={styles.sync}><small>Status Mercado Pago</small><strong>{data?.pending?"Relatório em preparação":setupReady?"Pronto para uso":"Aguardando ativação"}</strong><em>{data?.reports?.settlement?.status?`Dinheiro em conta: ${reportStatus(data.reports.settlement.status)}`:""}</em></span></div>
        <div className={styles.toolbar}><div>{([ ["ALL","Atuais"],["REVIEW",`Revisar · ${summary.review}`],["PROCESSED",`Processadas · ${summary.processed}`],["IN_DAY","Receitas do dia"],["OUT_DAY","Despesas do dia"],["IN_MONTH","Receitas do mês"],["OUT_MONTH","Despesas do mês"],["HISTORICAL",`Histórico · ${summary.historical}`],["TECHNICAL",`Técnicos · ${summary.technical}`] ] as [Filter,string][]).map(([k,l])=><button key={k} className={filter===k?styles.active:""} onClick={()=>setFilter(k)}>{l}</button>)}</div><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar movimentação..."/></div>
        <div>{visible.map(move=>{
          const choice=choiceFor(move);
          const resolved=move.status==="PROCESSED"||move.status==="IGNORED";
          return <article className={`${styles.move} ${move.status==="REVIEW"||move.status==="AUTO_READY"?styles.review:""} ${move.technical?styles.technicalMove:""} ${move.historical?styles.historicalMove:""}`} key={move.id}>
            <div className={`${styles.icon} ${move.technical||move.historical?styles.iconTechnical:move.kind==="IN"?styles.iconIn:styles.iconOut}`}>{move.historical?"◷":move.technical?"⚙":move.kind==="IN"?"↓":"↑"}</div>
            <div className={styles.info}>
              <div><strong>{move.description}</strong><span className={`${styles.badge} ${styles[move.status]}`}>{statusLabel(move)}</span></div>
              <small>{date(move.date)}{move.detail?` · ${move.detail}`:""}</small>
              {move.historical?<div className={styles.technicalReason}><b>Somente histórico</b><span>{move.reason}</span></div>:move.technical?<div className={styles.technicalReason}><b>Sem ação</b><span>{move.reason}</span></div>:resolved?<div className={styles.resolvedLine}><b>{targetLabel(move.suggestedTarget,move.kind)}</b><span>{move.category&&move.suggestedTarget==="EXTRA"?` · ${move.category}`:""}{move.expenseName?` · ${move.expenseName}`:""}{move.suggestedTargetName&&!move.expenseName?` · ${move.suggestedTargetName}`:""} · {move.reason}</span></div>:<div className={styles.reconcileBox}>
                <div className={styles.reconcileGrid}>
                  <label><span>Tratar como</span><select value={choice.target} onChange={e=>changeTarget(move,e.target.value as Target)}>{move.kind==="OUT"?<><option value="EXTRA">Gasto extra</option><option value="EXPENSE">Conta do plano</option><option value="TRANSFER">Transferência / repasse</option><option value="IGNORE">Ignorar</option></>:<><option value="PERSONAL">Recebimento Personal</option><option value="DS">Recebimento DS</option><option value="TRANSFER">Transferência própria</option><option value="IGNORE">Ignorar</option></>}</select></label>
                  {choice.target==="EXTRA"?<label><span>Categoria</span><select value={choice.category} onChange={e=>patchChoice(move,{category:e.target.value})}>{categories.map(c=><option key={c} value={c}>{c}</option>)}</select></label>:null}
                  {choice.target==="EXTRA"?<label><span>Nome do gasto (opcional)</span><input value={choice.expenseName} onChange={e=>patchChoice(move,{expenseName:e.target.value})} placeholder="Ex.: Cachorro-quente"/></label>:null}
                  {choice.target==="PERSONAL"?<label><span>Aluno Personal</span><select value={choice.targetId} onChange={e=>{const item=data?.financeContext.personal.find(x=>x.id===e.target.value);patchChoice(move,{targetId:e.target.value,targetName:item?.studentName||""});}}><option value="">Selecione...</option>{data?.financeContext.personal.map(item=><option key={item.id} value={item.id}>{item.studentName} · {money.format(item.remaining)} em aberto</option>)}</select></label>:null}
                  {choice.target==="EXPENSE"?<label><span>Conta do plano</span><select value={choice.targetId} onChange={e=>{const item=data?.financeContext.expenses.find(x=>x.id===e.target.value);patchChoice(move,{targetId:e.target.value,targetName:item?.name||""});}}><option value="">Selecione...</option>{data?.financeContext.expenses.map(item=><option key={item.id} value={item.id}>{item.name} · {money.format(item.remaining)} em aberto</option>)}</select></label>:null}
                  {choice.target==="DS"?<div className={styles.dsHint}><span>Recebimento DS</span><strong>{move.description} · {money.format(move.amount)}</strong><small>Registra pagador, valor e data. Não vincula a aluno Kids.</small></div>:null}
                  {(choice.target==="TRANSFER"||choice.target==="IGNORE")?<div className={styles.dsHint}><span>Sem efeito financeiro</span><strong>{choice.target==="TRANSFER"?"Transferência / repasse":"Ignorar esta movimentação"}</strong><small>Não cria receita, gasto extra ou baixa de conta.</small></div>:null}
                  <div className={`${styles.learningChoice} ${choice.target==="EXTRA"?"":styles.fullField}`}><label><span>Nas próximas vezes com “{move.learningLabel||move.description}”</span><select value={choice.ruleChoice} disabled={!move.canLearn} onChange={e=>patchChoice(move,{ruleChoice:e.target.value as RuleChoice})}><option value="ONCE">Só esta movimentação</option><option value="SUGGEST">Sugerir e pedir confirmação</option><option value="AUTO">Automatizar sem perguntar</option></select></label><small>{move.canLearn?"Usa esta pessoa ou estabelecimento.":"Sem identificação repetível; vale somente agora."}</small></div>
                </div>
                <div className={styles.suggestionNote}>{move.confidence}% · {move.reason}</div>
              </div>}
            </div>
            <div className={styles.value}><strong className={move.kind==="IN"?styles.green:styles.red}>{move.kind==="IN"?"+ ":"− "}{money.format(move.amount)}</strong>{!move.technical&&!move.historical&&!resolved?<button className="primary" disabled={savingId===move.id} onClick={()=>void decide(move)}>{savingId===move.id?"Salvando...":"Confirmar"}</button>:null}</div>
          </article>;
        })}{!loading&&!visible.length?<div className={styles.empty}><strong>{data?.pending?"O Mercado Pago está preparando a nova leitura.":"Nada encontrado neste filtro."}</strong><span>{filter==="ALL"&&summary.historical?"O histórico anterior ao corte fica separado para não poluir sua operação diária.":""}</span></div>:null}</div>
      </section>

      <aside className={styles.side}>
        <section className="panel"><small className={styles.cap}>CONEXÃO REAL</small><h3>Status dos relatórios</h3><p className="muted">O saldo e as movimentações são lidos diretamente da sua conta.</p>
          <div className={styles.reportRow}><span><strong>Dinheiro em conta</strong><small>Movimentações</small></span><b className={data?.reports?.settlement?.status&&reportStatus(data.reports.settlement.status)==="Pronto"?styles.okTag:styles.waitTag}>{data?.reports?.settlement?.status?reportStatus(data.reports.settlement.status):data?.configured.settlement?"Configurado":"Pendente"}</b></div>
          <div className={styles.reportRow}><span><strong>Liberações</strong><small>Saldo disponível</small></span><b className={data?.reports?.release?.status&&reportStatus(data.reports.release.status)==="Pronto"?styles.okTag:styles.waitTag}>{data?.reports?.release?.status?reportStatus(data.reports.release.status):data?.configured.release?"Configurado":"Pendente"}</b></div>
          <div className={styles.reportRow}><span><strong>Verificação</strong><small>Consulta tarefas e dados prontos</small></span><b className={styles.okTag}>5 min</b></div>
          <div className={styles.reportRow}><span><strong>Relatório automático</strong><small>Intervalo mínimo de segurança</small></span><b className={styles.okTag}>6 h</b></div>
          <div className={styles.reportRow}><span><strong>Atualização manual</strong><small>Disponível pelo botão quando necessário</small></span><b className={styles.okTag}>1 h</b></div>
        </section>
        <section className="panel"><small className={styles.cap}>REGRAS DE SEGURANÇA</small><h3>O que entra sozinho</h3>
          <div className={styles.smartRule}><span>🛒</span><div><strong>Estabelecimentos inequívocos</strong><small>Mercados como Infunger/Covabra, iFood/restaurantes, pedágios/postos e drogarias podem ir direto para a categoria segura.</small></div></div>
          <div className={styles.smartRule}><span>👤</span><div><strong>PIX para pessoa</strong><small>Nunca vira uma regra automática nova sem sua autorização explícita.</small></div></div>
          <div className={styles.smartRule}><span>↔</span><div><strong>Transferência / repasse</strong><small>Pode ser resolvida sem criar receita ou despesa, evitando duplicidade.</small></div></div>
          <div className={styles.smartRule}><span>🎾</span><div><strong>DS</strong><small>Registra nome do pagador, valor e data; não tenta conciliar com aluno Kids.</small></div></div>
        </section>
        <section className="panel"><small className={styles.cap}>MEMÓRIA DO DMP</small><h3>Regras aprendidas</h3><p className="muted">Sugestões e automatizações que você autorizou ficam salvas.</p>
          {data?.learnedRules?.length?<div className={styles.learnedRules}>{data.learnedRules.map(rule=><div className={styles.learnedRule} key={rule.key}><span><strong>{rule.label}</strong><small>{rule.mode==="AUTO"?"Automático":"Sugestão"} · {ruleTarget(rule)}</small></span><button disabled={savingId===`rule:${rule.key}`} onClick={()=>void deleteRule(rule)}>×</button></div>)}</div>:<div className={styles.ruleEmpty}>Nenhuma regra pessoal criada ainda. O DMP já começa com apenas algumas regras comerciais de alta segurança.</div>}
        </section>
        <section className={styles.future}><small>INTEGRAÇÃO OFICIAL</small><strong>Mercado Pago → Financeiro DMP</strong><span>Gasto extra, Personal, DS e conta do plano passam a atualizar o Financeiro após regra segura ou sua confirmação. Cada transação só pode afetar o Financeiro uma vez.</span></section>
      </aside>
    </div>
    <p className={styles.note}>Mercado Pago V6.8 · corte oficial em 18/09/2026 · leitura unificada com proteção contra duplicidade.</p>
  </section>;
}
