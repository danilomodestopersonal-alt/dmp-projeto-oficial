"use client";
import {useRef,useState} from 'react';
import type {FinanceData,PriorPlanning as Row} from '@/types/financeiro';
import {changePlanning,planningAmount} from '@/lib/financeiro/prior-planning';
import {financeSummary} from '@/lib/financeiro/calculos';
const money=(n:number)=>n.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const names:Record<Row['kind'],string>={DS_CREDIT:'DS a receber',DS_DEBT:'DS a devolver',PERSONAL:'Mensalidade atrasada',EXPENSE:'Conta não paga',OTHER_CREDIT:'Outro ajuste a receber',OTHER_DEBT:'Outro ajuste a pagar'};
export function PriorPlanning({data,competence,disabled,onSaved}:{data:FinanceData;competence:string;disabled:boolean;onSaved:()=>Promise<void>}) {
  const [id,setId]=useState(''),[action,setAction]=useState<'ADD'|'EDIT'|'REVERSE'>('ADD'),[origin,setOrigin]=useState(''),[kind,setKind]=useState<Row['kind']>('PERSONAL'),[source,setSource]=useState(''),[amount,setAmount]=useState(''),[reason,setReason]=useState(''),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const pending=useRef(false),operation=useRef('');
  const editable=['OPEN','REOPENED'].includes(data.competences[competence]?.status);
  const rows=(data.priorPlanning||[]).filter(r=>r.competence===competence);
  function change(){setConfirmed(false);operation.current='';setMessage('');}
  const input={action,id,competence,originCompetence:origin,kind,sourceId:source,amount:Number(amount.replace(',','.')),reason,confirmed:true,operationId:'preview-operation-0001'};
  let preview:ReturnType<typeof financeSummary>|null=null,previewError='';
  try {if(reason.trim().length>=5)preview=financeSummary(changePlanning(data,input,'prévia',new Date().toISOString()),competence);}catch(e){previewError=e instanceof Error?e.message:'Confira os campos.';}
  const current=financeSummary(data,competence);
  function select(row:Row,mode:'EDIT'|'REVERSE') {setId(row.id);setAction(mode);setOrigin(row.originCompetence);setKind(row.kind);setSource(row.sourceId);setAmount(String(row.amount).replace('.',','));setReason('');change();}
  async function save() {
    if(disabled||pending.current||!confirmed||!preview)return;pending.current=true;setBusy(true);setMessage('');operation.current ||=crypto.randomUUID();
    try {
      const response=await fetch('/api/finance/prior-planning',{method:'POST',headers:{'Content-Type':'application/json','x-dmp-action':'prior-planning','x-dmp-expected-updated-at':sessionStorage.getItem('dmp_finance_cloud_updated_at')||''},body:JSON.stringify({...input,operationId:operation.current})});
      const result=await response.json();if(!response.ok)throw new Error(result.error||'Não foi possível salvar.');
      await onSaved();setAction('ADD');setId('');setSource('');setAmount('');setReason('');change();setMessage('Inclusão manual atualizada com histórico. Nenhum movimento bancário foi criado.');
    }catch(e){setMessage(e instanceof Error?e.message:'Atualize e confira o resultado.');setConfirmed(false);}finally{pending.current=false;setBusy(false);}
  }
  if(competence<'2026-11')return null;
  return <details><summary>Adicionar pendência anterior / consultar inclusões manuais</summary>
    <p>O mês começa sem transporte automático da DS ou de dívidas antigas. As recorrências próprias do mês continuam. Esta inclusão altera somente o planejamento.</p>
    <fieldset disabled={disabled||busy||!editable} style={{minWidth:0}}>
      {action!=='ADD'?<p>{action==='REVERSE'?'Desfazer':'Editar'} inclusão existente <button type="button" onClick={()=>{setAction('ADD');setId('');change();}}>Nova inclusão</button></p>:null}
      <label>Origem<select disabled={action==='REVERSE'} value={origin} onChange={e=>{setOrigin(e.target.value);setSource('');change();}}><option value="">Selecione</option>{Object.keys(data.competences).filter(c=>c<competence).sort().map(c=><option key={c}>{c}</option>)}</select></label>
      <p>Destino: {competence}</p>
      <label>Natureza<select disabled={action==='REVERSE'} value={kind} onChange={e=>{setKind(e.target.value as Row['kind']);setSource('');change();}}>{Object.entries(names).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
      {kind==='PERSONAL'||kind==='EXPENSE'?<label>Obrigação original<select disabled={action==='REVERSE'} value={source} onChange={e=>{setSource(e.target.value);change();}}><option value="">Selecione</option>{(kind==='PERSONAL'?data.personalInvoices.filter(r=>r.competence===origin&&!r.excludedFromTotals).map(r=>({id:r.id,name:r.studentName})):data.expenses.filter(r=>r.competence===origin).map(r=>({id:r.id,name:r.name}))).map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>:kind.startsWith('OTHER_')?<label>Identificação da obrigação<input maxLength={200} disabled={action==='REVERSE'} value={source} onChange={e=>{setSource(e.target.value);change();}}/></label>:<p>O vínculo será com o acerto DS de {origin||'origem'}. Registre quitações na competência de origem, com a data real do pagamento; a pendência vinculada diminui sem criar outra obrigação.</p>}
      <label>Valor<input disabled={action==='REVERSE'} inputMode="decimal" value={amount} onChange={e=>{setAmount(e.target.value);change();}}/></label>
      <label>Motivo<textarea minLength={5} maxLength={500} value={reason} onChange={e=>{setReason(e.target.value);change();}}/></label>
      {preview?<><p>Acerto DS: {money(current.dsBalance)} → {money(preview.dsBalance)}.<br/>A receber: {money(current.receivable)} → {money(preview.receivable)}.<br/>A pagar: {money(current.payable)} → {money(preview.payable)}.<br/>Saldo projetado das contas: {money(current.projectedResult)} → {money(preview.projectedResult)}.<br/>Saldo bancário e valores realizados: sem alteração.</p><label><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/> Confirmo origem, destino, valor e efeito no planejamento.</label><button type="button" className="secondary" disabled={!confirmed} onClick={()=>void save()}>{action==='REVERSE'?'Desfazer inclusão':action==='EDIT'?'Salvar correção':'Incluir pendência'}</button></>:null}
      {previewError?<p role="alert">{previewError}</p>:null}
    </fieldset>
    {message?<p role="status">{message}</p>:null}
    {rows.map(r=><p key={r.id}>{names[r.kind]} · origem {r.originCompetence} · incluído {money(r.amount)} · pendente vinculado {money(planningAmount(data,r))} · {r.reason}{!r.active?' · Desfeito':<><button type="button" disabled={disabled||busy||!editable} onClick={()=>select(r,'EDIT')}>Editar</button><button type="button" disabled={disabled||busy||!editable} onClick={()=>select(r,'REVERSE')}>Desfazer</button></>}</p>)}
    <details><summary>Histórico auditável</summary>{(data.priorPlanningAudit||[]).filter(a=>a.competence===competence).slice().reverse().map(a=><p key={a.operationId}>{a.occurredAt} · {a.operator} · {a.action} · {a.reason}</p>)}</details>
  </details>;
}
