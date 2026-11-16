"use client";
import {useEffect,useRef,useState} from 'react';
import type {FinanceData,PersonalInvoice} from '@/types/financeiro';
import {cancellationRevision,type CancellationCommand} from '@/lib/financeiro/invoice-cancellation';
import {dueDateFor} from '@/lib/financeiro/calculos';
import styles from './InvoiceCancellation.module.css';

const money=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
const month=(value:string)=>{const [y,m]=value.split('-').map(Number);return new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric'}).format(new Date(y,m-1,1));};
const date=(value:string)=>value.split('-').reverse().join('/');

export function InvoiceCancelButton({invoice,disabled,onCancel}:{invoice:PersonalInvoice;disabled:boolean;onCancel:()=>void}) {
  if(invoice.excludedFromTotals||invoice.cancellation?.active||invoice.payments.length)return null;
  return <button type="button" className={styles.cancelLink} disabled={disabled} onClick={onCancel} aria-label={`Cancelar cobrança de ${invoice.studentName}`}>Cancelar cobrança</button>;
}

export function InvoiceCancellationHistory({data,disabled,onRestore}:{data:FinanceData;disabled:boolean;onRestore:(invoice:PersonalInvoice)=>void}) {
  const audit=(data.invoiceCancellationAudit||[]).filter(item=>item.competence===data.currentCompetence).slice().reverse();
  const cancelled=data.personalInvoices.filter(item=>item.competence===data.currentCompetence&&item.cancellation?.active);
  return <details className={styles.history}><summary>Cancelamentos e histórico{cancelled.length?` · ${cancelled.length} cancelada${cancelled.length===1?'':'s'}`:''}</summary>
    {cancelled.map(invoice=><div className={styles.cancelled} key={invoice.id}><span><strong>{invoice.studentName}</strong><small>Cancelada · {month(invoice.competence)} · {money.format(invoice.expectedAmount)}</small></span><button type="button" className="secondary" disabled={disabled} onClick={()=>onRestore(invoice)}>Restaurar cobrança</button></div>)}
    {audit.length?<ol className={styles.audit}>{audit.map(item=><li key={item.operationId}><strong>{data.personalInvoices.find(row=>row.id===item.invoiceId)?.studentName||item.invoiceId} · {item.action==='CANCEL'?'Cancelada':'Restaurada'}</strong><span>{item.reason}</span><small>{new Date(item.occurredAt).toLocaleString('pt-BR')} · {item.operator}</small></li>)}</ol>:<p className="muted">Nenhum cancelamento nesta competência.</p>}
  </details>;
}

export function InvoiceCancellation({data,invoice,action,disabled,onSaving,onSaved,onClose}:{data:FinanceData;invoice:PersonalInvoice;action:'CANCEL'|'RESTORE';disabled:boolean;onSaving:(value:boolean)=>void;onSaved:(data:FinanceData,updatedAt:string,message:string)=>void;onClose:()=>void}) {
  const [reason,setReason]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[uncertain,setUncertain]=useState(false);
  const inFlight=useRef(false),attempt=useRef<CancellationCommand|null>(null),dialog=useRef<HTMLFormElement>(null);
  const [revision]=useState(()=>cancellationRevision(invoice));
  const current=data.personalInvoices.find(item=>item.id===invoice.id);
  const restoring=action==='RESTORE';
  const changed=!current||cancellationRevision(current)!==revision;
  const editable=['OPEN','REOPENED'].includes(data.competences[invoice.competence]?.status);
  const blocked=changed?'A cobrança mudou. Volte e abra novamente para conferir.':!editable?'Esta competência está fechada. Reabra o mês antes de alterar.':invoice.payments.length?'Esta cobrança tem recebimentos. O cancelamento simples não está disponível.':!restoring&&(invoice.cancellation?.active||invoice.excludedFromTotals)?'Esta cobrança já está cancelada. Consulte o histórico.':'';
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement|null,overflow=document.body.style.overflow;
    document.body.style.overflow='hidden';dialog.current?.querySelector<HTMLTextAreaElement>('textarea')?.focus();
    return ()=>{document.body.style.overflow=overflow;if(previous?.isConnected)previous.focus();};
  },[]);
  async function save() {
    if(inFlight.current)return;
    if(disabled||blocked){setMessage(blocked||'Aguarde a sincronização do Financeiro antes de confirmar.');return;}
    if(!uncertain&&(reason.trim().length<5||reason.trim().length>500)){setMessage(restoring?'Informe o motivo da restauração, com 5 a 500 caracteres.':'Informe o motivo do cancelamento, com 5 a 500 caracteres.');dialog.current?.querySelector<HTMLTextAreaElement>('textarea')?.focus();return;}
    const command=uncertain&&attempt.current?attempt.current:{invoiceId:invoice.id,action,reason:reason.trim(),confirmed:true,operationId:crypto.randomUUID(),expectedInvoice:revision};
    attempt.current=command;inFlight.current=true;setBusy(true);setMessage('');onSaving(true);
    let accepted=false;
    try {
      const response=await fetch('/api/finance/invoice-cancellation',{method:'POST',headers:{'Content-Type':'application/json','x-dmp-action':'invoice-cancellation','x-dmp-expected-updated-at':sessionStorage.getItem('dmp_finance_cloud_updated_at')||''},body:JSON.stringify(command)});
      const result=await response.json().catch(()=>null);
      if(!response.ok){
        setUncertain(response.status>=500);
        setMessage(typeof result?.error==='string'?result.error:response.status===401?'Sua sessão expirou. Entre novamente no DMP.':'Não foi possível concluir. Confira sua conexão e tente novamente.');
        return;
      }
      if(result?.ok!==true||result?.data?.version!==1||!Array.isArray(result.data.personalInvoices)||!result.data.invoiceCancellationAudit?.some((item:{operationId:string})=>item.operationId===command.operationId)||typeof result.updatedAt!=='string'||!Number.isFinite(Date.parse(result.updatedAt)))throw new Error('Resposta incompleta');
      accepted=true;
      const latest=result.data.personalInvoices.find((item:PersonalInvoice)=>item.id===invoice.id);
      const matches=!!latest?.cancellation?.active===(action==='CANCEL');
      onSaved(result.data,result.updatedAt,matches?(restoring?'Cobrança restaurada. Totais atualizados.':'Cobrança cancelada. Totais atualizados.'):'Operação já registrada. A situação atual da cobrança foi carregada.');
      onClose();
    } catch {
      setUncertain(true);
      setMessage(accepted?'A operação foi registrada, mas a tela não pôde ser atualizada. Tente novamente para conferir o resultado.':'Não foi possível confirmar o resultado. Confira sua conexão e tente novamente; a mesma operação será consultada sem duplicar o cancelamento.');
    } finally {inFlight.current=false;setBusy(false);onSaving(false);}
  }
  return <div className={styles.backdrop}><form ref={dialog} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="invoice-cancellation-title" aria-busy={busy} noValidate onSubmit={event=>{event.preventDefault();void save();}} onKeyDown={event=>{
    if(event.key==='Escape'&&!inFlight.current){event.preventDefault();onClose();}
    if(event.key==='Tab'){const items=Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),textarea:not(:disabled)')||[]);const first=items[0],last=items.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}
  }}>
    <h2 id="invoice-cancellation-title">{restoring?'Restaurar cobrança':'Cancelar cobrança'}</h2>
    <dl className={styles.details}><div><dt>Aluno</dt><dd>{invoice.studentName}</dd></div><div><dt>Referência</dt><dd>{month(invoice.competence)}</dd></div><div><dt>Mensalidade</dt><dd>{money.format(invoice.expectedAmount)}</dd></div><div><dt>Vencimento</dt><dd>{date(dueDateFor(invoice.competence,invoice.dueDay))}</dd></div></dl>
    <label className={styles.reason}>Motivo {restoring?'da restauração':'do cancelamento'}<textarea value={reason} disabled={busy||uncertain} required minLength={5} maxLength={500} aria-describedby="invoice-cancellation-hint" onChange={event=>{setReason(event.target.value);setMessage('');}}/></label>
    <small id="invoice-cancellation-hint" className={styles.hint}>Obrigatório · de 5 a 500 caracteres.</small>
    {blocked?<p role="alert" className={styles.error}>{blocked}</p>:null}
    {disabled&&!busy&&!blocked?<p role="status" className={styles.hint}>Aguarde a sincronização do Financeiro antes de confirmar.</p>:null}
    {message?<p role="alert" className={styles.error}>{message}</p>:null}
    <div className={styles.actions}><button type="button" className="secondary" disabled={busy} onClick={onClose}>Voltar</button><button type="submit" className={styles.confirm} disabled={busy||disabled||!!blocked}>{busy?'Processando…':uncertain?'Tentar novamente':restoring?'Confirmar restauração':'Confirmar cancelamento'}</button></div>
  </form></div>;
}
