"use client";
import {useRef,useState} from 'react';
import type {FinanceData} from '@/types/financeiro';
import {cancellationRevision} from '@/lib/financeiro/invoice-cancellation';

export function InvoiceCancellation({data,disabled,onSaving,onSaved}:{data:FinanceData;disabled:boolean;onSaving:(value:boolean)=>void;onSaved:()=>Promise<void>}) {
  const [selected,setSelected]=useState(''),[reason,setReason]=useState(''),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const inFlight=useRef(false);
  const [selectedRevision,setSelectedRevision]=useState('');
  const rows=data.personalInvoices.filter(item=>item.competence===data.currentCompetence && (!item.excludedFromTotals || item.cancellation?.active));
  const invoice=rows.find(item=>item.id===selected);
  const restoring=!!invoice?.cancellation?.active;
  const editable=['OPEN','REOPENED'].includes(data.competences[data.currentCompetence]?.status);
  const audit=(data.invoiceCancellationAudit||[]).filter(item=>item.competence===data.currentCompetence).slice().reverse();
  async function save() {
    if (!invoice || cancellationRevision(invoice)!==selectedRevision || disabled || inFlight.current || !confirmed || reason.trim().length<5) return;
    inFlight.current=true;setBusy(true);setMessage('');onSaving(true);
    try {
      const response=await fetch('/api/finance/invoice-cancellation',{method:'POST',headers:{'Content-Type':'application/json','x-dmp-action':'invoice-cancellation','x-dmp-expected-updated-at':sessionStorage.getItem('dmp_finance_cloud_updated_at')||''},body:JSON.stringify({invoiceId:invoice.id,action:restoring?'RESTORE':'CANCEL',reason:reason.trim(),confirmed:true,operationId:crypto.randomUUID(),expectedInvoice:selectedRevision})});
      const result=await response.json();
      if (!response.ok) throw new Error(result.error||'Não foi possível concluir.');
      await onSaved();setSelected('');setReason('');setConfirmed(false);setMessage(restoring?'Cobrança restaurada.':'Cobrança cancelada.');
    } catch(error) {setMessage(error instanceof Error?error.message:'Não foi possível concluir. Atualize para conferir.');}
    finally {inFlight.current=false;setBusy(false);onSaving(false);}
  }
  return <details><summary>Cancelar cobrança / consultar cancelamentos</summary>
    <fieldset disabled={disabled||busy||!editable}>
      <label>Mensalidade<select value={selected} onChange={event=>{setSelected(event.target.value);setSelectedRevision(rows.find(row=>row.id===event.target.value)?cancellationRevision(rows.find(row=>row.id===event.target.value)!):'');setReason('');setConfirmed(false);setMessage('');}}><option value="">Selecione a cobrança</option>{rows.map(row=><option key={row.id} value={row.id}>{row.studentName} · {row.competence} · {row.expectedAmount.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}{row.cancellation?.active?' · Cancelada':''}</option>)}</select></label>
      {invoice?<>{selectedRevision!==cancellationRevision(invoice)?<p>A cobrança mudou. Selecione novamente para conferir.</p>:null}<p>{invoice.studentName} · {invoice.competence} · Vencimento dia {invoice.dueDay} · {invoice.expectedAmount.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</p>
        {invoice.payments.length?<p>Existem recebimentos nesta cobrança. Solicite revisão.</p>:<>
          <label>Motivo obrigatório<textarea value={reason} onChange={event=>setReason(event.target.value)} minLength={5} maxLength={500}/></label>
          <label><input type="checkbox" checked={confirmed} onChange={event=>setConfirmed(event.target.checked)}/> Confirmo {restoring?'restaurar':'cancelar'} esta cobrança de {invoice.studentName}, competência {invoice.competence}.</label>
          <button type="button" className="secondary" disabled={!confirmed||reason.trim().length<5||selectedRevision!==cancellationRevision(invoice)} onClick={()=>void save()}>{busy?'Salvando...':restoring?'Restaurar cobrança':'Cancelar cobrança'}</button>
        </>}
      </>:null}
    </fieldset>
    {message?<p role="status">{message}</p>:null}
    {audit.length?<div><h3>Histórico de cancelamentos e restaurações</h3>{audit.map(item=><p key={item.operationId}><strong>{data.personalInvoices.find(row=>row.id===item.invoiceId)?.studentName||item.invoiceId} · {item.action==='CANCEL'?'Cancelada':'Restaurada'}</strong><br/>{new Date(item.occurredAt).toLocaleString('pt-BR')} · {item.operator}<br/>{item.reason}</p>)}</div>:null}
  </details>;
}
