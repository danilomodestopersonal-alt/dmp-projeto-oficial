"use client";
import {useRef,useState} from 'react';
import type {DsBankLink,FinanceData} from '@/types/financeiro';
const money=(n:number)=>n.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
type Preview={before:number;after:number;amount:number;date:string;competence:string;blocked:string;equivalents:{id:string;date:string;amount:number;note?:string}[]};
export function DsReturnReconciliation({fingerprint,identity,data,disabled,onSaved,link}:{fingerprint?:string;identity?:string;data?:FinanceData;disabled:boolean;onSaved:()=>Promise<void>;link?:DsBankLink}) {
  const [competence,setCompetence]=useState(''),[existingId,setExistingId]=useState(''),[preview,setPreview]=useState<Preview|null>(null),[revision,setRevision]=useState(''),[reason,setReason]=useState(''),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const pending=useRef(false),operation=useRef('');
  function reset(){setPreview(null);setConfirmed(false);operation.current='';setError('');}
  async function send(input:unknown,version='') {
    const response=await fetch('/api/mercado-pago',{method:'POST',headers:{'Content-Type':'application/json','x-dmp-action':'ds-return','x-dmp-expected-updated-at':version},body:JSON.stringify({action:'ds-return',fingerprint,input})});
    const result=await response.json();if(!response.ok)throw new Error(result.error||'Não foi possível concluir.');return result;
  }
  async function readPreview(id=existingId) {
    if(pending.current||disabled)return;pending.current=true;setBusy(true);setError('');setPreview(null);setConfirmed(false);operation.current='';
    try{const result=await send({action:'PREVIEW',competence,existingId:id});setPreview(result.preview);setRevision(result.revision);}catch(e){setError(e instanceof Error?e.message:'Falha na consulta.');}finally{pending.current=false;setBusy(false);}
  }
  async function save() {
    if(pending.current||disabled||!confirmed||reason.trim().length<5||(!link&&(!preview||preview.blocked)))return;
    pending.current=true;setBusy(true);setError('');operation.current ||= crypto.randomUUID();
    try {
      await send(link?{action:'UNDO',linkId:link.id,reason,confirmed:true,operationId:operation.current}:{action:'APPLY',competence,existingId,expectedDebt:preview!.before,confirmedAmount:preview!.amount,reason,confirmed:true,operationId:operation.current},link?(sessionStorage.getItem('dmp_finance_cloud_updated_at')||''):revision);
      await onSaved();reset();setReason('');setError(link?'Vínculo desfeito. O histórico foi preservado.':'Devolução registrada. Nenhuma nova saída bancária foi criada.');
    }catch(e){setError(e instanceof Error?e.message:'Falha ao salvar. Atualize para conferir.');setConfirmed(false);}finally{pending.current=false;setBusy(false);}
  }
  return <details open={!link} style={{gridColumn:"1 / -1",minWidth:0}}><summary>{link?'Corrigir / desfazer vínculo com PIX':'Devolução para DS Tennis'}</summary>
    <fieldset disabled={disabled||busy} style={{minWidth:0}}>
      {link?<p>PIX {money(link.amount)} · {link.date} · acerto {link.competence}. {link.createdReturn?'Desfazer removerá apenas a devolução criada por esta conciliação.':'Desfazer preservará a devolução manual e removerá apenas o vínculo bancário.'} Para corrigir, desfaça e classifique novamente o PIX.</p>:<>
        <p>{identity||'Confira a identificação disponível na movimentação.'}</p>
        <label>Competência do acerto<select value={competence} onChange={e=>{setCompetence(e.target.value);setExistingId('');reset();}}><option value="">Selecione explicitamente</option>{Object.keys(data?.competences||{}).sort().reverse().map(c=><option key={c} value={c}>{c}{data?.competences[c].status==='CLOSED'?' · Fechada':''}</option>)}</select></label>
        <button type="button" className="secondary" disabled={!competence} onClick={()=>void readPreview()}>Conferir dívida e devoluções existentes</button>
        {preview?<><p><strong>PIX: {money(preview.amount)} · {preview.date} · Acerto: {preview.competence}</strong></p><p>Dívida DS antes: {money(preview.before)} → depois: {money(preview.after)}.</p>
          {preview.equivalents.length?<label>Devolução já registrada<select value={existingId} onChange={e=>{setExistingId(e.target.value);void readPreview(e.target.value);}}><option value="">Selecione o registro equivalente</option>{preview.equivalents.map(r=><option key={r.id} value={r.id}>{r.date} · {money(r.amount)} · {r.note||'Devolução manual'}</option>)}</select></label>:null}
          {existingId?<p>Somente vinculação: o abatimento manual já ocorreu e não será repetido.</p>:null}{preview.blocked?<p role="alert">{preview.blocked}</p>:null}
        </>:null}
      </>}
      <p>O dinheiro já saiu do Mercado Pago. Esta ação não altera o saldo bancário nem aprende regras para outros PIX.</p>
      {(link||preview&&!preview.blocked)?<><label>Motivo<textarea minLength={5} maxLength={500} value={reason} onChange={e=>{setReason(e.target.value);setConfirmed(false);operation.current='';}}/></label><label><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/> Confirmo o PIX, o valor e a competência acima{link?' e quero desfazer este vínculo':''}.</label><button type="button" className="primary" disabled={!confirmed||reason.trim().length<5} onClick={()=>void save()}>{busy?'Salvando...':link?'Desfazer classificação':'Confirmar devolução DS'}</button></>:null}
    </fieldset>{error?<p role="status">{error}</p>:null}
  </details>;
}
