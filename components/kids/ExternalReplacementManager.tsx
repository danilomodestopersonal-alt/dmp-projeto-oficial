'use client';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { KidsData, KidsExternalReplacement } from '@/types/kids';
import { externalCategoryLabels, externalStudents, saoPauloDay, type ExternalCommand } from '@/lib/kids/external-replacement';
import styles from './ExternalReplacementManager.module.css';

type Preview={digest:string;updatedAt:string;record:KidsExternalReplacement;before:{due:number;replaced:number;balance:number};after:{due:number;replaced:number;balance:number};outsidePeriod:boolean};
const pendingKey='dmp-kids-external-replacement-pending-v1';
const dateLabel=(date:string)=>date.split('-').reverse().join('/');
const stampLabel=(value:string)=>new Date(value).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'});
const balanceLabel=(value:number)=>value>0?`${value} a repor`:value<0?`${-value} antecipada${value===-1?'':'s'}`:'Zerado';
const id=()=>crypto.randomUUID();
export default function ExternalReplacementManager({data,disabled=false,onSaved}:{data:KidsData;disabled?:boolean;onSaved:(data:KidsData,updatedAt:string,message:string)=>void}){
  const [mode,setMode]=useState<'create'|'view'|'update'|'void'|null>(null);
  const [record,setRecord]=useState<KidsExternalReplacement|null>(null);
  const [command,setCommand]=useState<ExternalCommand>({action:'create',operationId:''});
  const [preview,setPreview]=useState<Preview|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [pending,setPending]=useState<ExternalCommand|null>(null),[uncertain,setUncertain]=useState(false);
  const [search,setSearch]=useState('');
  const dialog=useRef<HTMLDivElement>(null),flight=useRef(false);
  const students=externalStudents(data);
  useEffect(()=>{try{const saved=JSON.parse(sessionStorage.getItem(pendingKey)||'null');if(saved?.operationId)setPending(saved);}catch{}},[]);
  useEffect(()=>{
    if(!mode)return;
    const previous=document.activeElement as HTMLElement|null,overflow=document.body.style.overflow;
    document.body.style.overflow='hidden';dialog.current?.focus();
    return()=>{document.body.style.overflow=overflow;previous?.focus();};
  },[Boolean(mode)]);
  function open(action:'create'|'view'|'update'|'void',item:KidsExternalReplacement|null=null){
    if(disabled||busy)return;
    setRecord(item);setMode(action);setPreview(null);setError('');setUncertain(false);
    setCommand({action:action==='view'?'update':action,operationId:id(),...(item?{recordId:item.id,revision:item.revision,studentId:item.studentId,date:item.date,time:item.time,teacher:item.teacher,category:item.category,notes:item.notes}:{studentId:'',date:saoPauloDay(),time:'',teacher:'',category:undefined,notes:''})});
  }
  function change(patch:Partial<ExternalCommand>){setCommand(c=>({...c,...patch,operationId:id()}));setPreview(null);setError('');}
  function confirmed(payload:{data:KidsData;updatedAt:string}){
    sessionStorage.removeItem(pendingKey);setPending(null);setUncertain(false);setMode(null);setPreview(null);
    onSaved(payload.data,payload.updatedAt,command.action==='void'?'Lançamento desfeito. O saldo foi recalculado.':command.action==='update'?'Reposição corrigida. Histórico e saldo atualizados.':'Reposição com outro professor registrada. Histórico e saldo atualizados.');
  }
  async function send(phase:'preview'|'commit'){
    if(flight.current||disabled)return;flight.current=true;setBusy(true);setError('');
    try{
      if(phase==='commit'){
        if(!preview)throw Error('Confira a prévia antes de confirmar.');
        sessionStorage.setItem(pendingKey,JSON.stringify(command));setPending(command);setUncertain(true);
      }
      const response=await fetch('/api/kids/external-replacements',{method:'POST',headers:{'Content-Type':'application/json',...(preview?{'X-DMP-Expected-Updated-At':preview.updatedAt}:{})},body:JSON.stringify({phase,command,digest:preview?.digest})});
      const result=await response.json();
      if(!response.ok){
        if(response.status<500){sessionStorage.removeItem(pendingKey);setPending(null);setUncertain(false);setPreview(null);}
        throw Error(result.error||'Não foi possível conferir a reposição.');
      }
      if(result.confirmed){confirmed(result);return;}
      setPreview(result.preview);setUncertain(false);
    }catch(e){setError(e instanceof Error?e.message:'A resposta não foi recebida. Confira o resultado antes de repetir.');}
    finally{flight.current=false;setBusy(false);}
  }
  function resume(){if(!pending)return;setCommand(pending);setRecord((data.externalReplacements||[]).find(r=>r.id===pending.recordId)||null);setMode(pending.action);setPreview(null);setError('Confira o resultado da tentativa anterior. Esta consulta não repete o lançamento.');setUncertain(true);}
  const records=[...(data.externalReplacements||[])].sort((a,b)=>b.date.localeCompare(a.date)||b.createdAt.localeCompare(a.createdAt)).filter(r=>[r.studentName,r.teacher,dateLabel(r.date),externalCategoryLabels[r.category]].join(' ').toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')));
  const audit=(data.externalReplacementAudit||[]).filter(a=>a.recordId===record?.id).slice().reverse();
  const current=record?data.externalReplacements?.find(r=>r.id===record.id)||record:null;
  const close=()=>{if(!busy)setMode(null);};
  return <section className={styles.section} aria-label="Reposições com outros professores">
    <header className={styles.sectionHead}><div><h3>Com outros professores</h3><p>Registre a reposição que aconteceu fora da sua agenda Kids.</p></div><button type="button" disabled={disabled||busy||Boolean(pending)} onClick={()=>open('create')}>+ Registrar reposição realizada</button></header>
    {pending?<div className={styles.pending} role="status">Uma tentativa anterior precisa ser conferida. <button type="button" onClick={resume} disabled={busy}>Conferir resultado</button></div>:null}
    {records.length||search?<><label className={styles.search}>Buscar registro<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Aluno, professor ou data"/></label><div className={styles.records}>{records.map(item=><button type="button" className={styles.record} key={item.id} onClick={()=>open('view',item)} disabled={disabled||busy}><time>{dateLabel(item.date)}<small>{item.time||'Horário não informado'}</small></time><span><strong>{item.studentName}</strong><small>{item.teacher} · {externalCategoryLabels[item.category]}</small></span><span className={item.status==='VOID'?styles.void:styles.badge}>{item.status==='VOID'?'Desfeito':'Realizada · outro professor'}</span><span aria-hidden="true">›</span></button>)}</div>{!records.length?<p>Nenhum registro encontrado.</p>:null}</>:<p className={styles.empty}>Os lançamentos e suas correções ficarão disponíveis aqui.</p>}
    {mode&&typeof document!=='undefined'?createPortal(<div className={styles.backdrop}>
      <div ref={dialog} tabIndex={-1} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="external-title" onKeyDown={e=>{
        if(e.key==='Escape'){e.stopPropagation();close();}
        if(e.key==='Tab'){const elements=[...e.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary')].filter(el=>el.getClientRects().length);const first=elements[0],last=elements.at(-1);if(e.shiftKey&&(document.activeElement===first||document.activeElement===dialog.current)){e.preventDefault();last?.focus();}else if(!e.shiftKey&&(document.activeElement===last||document.activeElement===dialog.current)){e.preventDefault();first?.focus();}}
      }}>
        <header className={styles.modalHead}><div><small>KIDS · OUTRO PROFESSOR</small><h2 id="external-title">{mode==='view'?'Reposição realizada':mode==='void'?'Desfazer lançamento':mode==='update'?'Corrigir reposição':'Registrar reposição realizada'}</h2></div><button type="button" onClick={close} disabled={busy} aria-label="Fechar reposição">×</button></header>
        {mode==='view'&&current?<>
          <div className={styles.detail}><h3>{current.studentName}</h3><p><b>{dateLabel(current.date)}{current.time?' · '+current.time:''}</b></p><p>{current.teacher} · Categoria {externalCategoryLabels[current.category]}</p>{current.notes?<p>{current.notes}</p>:null}<small>Registrada em {stampLabel(current.createdAt)} · {current.status==='VOID'?'Desfeita':'Presença realizada'}</small></div>
          <details className={styles.audit}><summary>Alterações e efeitos no saldo ({audit.length})</summary>{audit.map(a=><article key={a.operationId}><strong>{a.action==='create'?'Registro':a.action==='update'?'Correção':'Desfazimento'} · {stampLabel(a.recordedAt)}</strong><p>Saldo a repor: {-a.balanceBefore.balance} → {-a.balanceAfter.balance}</p>{a.before?<small>Antes: {dateLabel(a.before.date)} {a.before.time} · {a.before.teacher} · {externalCategoryLabels[a.before.category]}{a.before.notes?' · '+a.before.notes:''}<br/></small>:null}<small>Depois: {dateLabel(a.after.date)} {a.after.time} · {a.after.teacher} · {externalCategoryLabels[a.after.category]} · {a.after.status==='VOID'?'Desfeito':'Realizado'}{a.after.notes?' · '+a.after.notes:''}</small></article>)}</details>
          {current.status==='ACTIVE'?<footer className={styles.actions}><button type="button" onClick={()=>open('void',current)} disabled={Boolean(pending)} className={styles.danger}>Desfazer lançamento</button><button type="button" onClick={()=>open('update',current)} disabled={Boolean(pending)}>Corrigir dados</button></footer>:null}
        </>:<form onSubmit={e=>{e.preventDefault();void send(preview&&!uncertain?'commit':'preview');}}>
          <fieldset disabled={busy||uncertain} className={styles.fields}>
            {mode==='create'?<label className={styles.wide}>Aluno Kids<select required value={command.studentId||''} onChange={e=>change({studentId:e.target.value})}><option value="">Selecione o aluno</option>{students.map(s=><option key={s.id} value={s.id}>{s.name}{s.active?'':' · inativo'}</option>)}</select></label>:<p className={styles.wide}><b>{record?.studentName||preview?.record.studentName}</b></p>}
            {mode==='void'?<p className={styles.wide}>Desfazer a reposição de {dateLabel(record?.date||'')} com {record?.teacher}. O lançamento será mantido na auditoria.</p>:<>
              <label>Data da reposição<input type="date" required max={saoPauloDay()} value={command.date||''} onChange={e=>change({date:e.target.value})}/></label>
              <label>Horário <small>(opcional)</small><input type="time" value={command.time||''} onChange={e=>change({time:e.target.value})}/></label>
              <label>Professor responsável<input required maxLength={100} value={command.teacher||''} onChange={e=>change({teacher:e.target.value})} placeholder="Quem ministrou a aula"/></label>
              <label>Turma / categoria<select required value={command.category||''} onChange={e=>change({category:e.target.value as KidsExternalReplacement['category']})}><option value="">Selecione</option>{Object.entries(externalCategoryLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
              <label className={styles.wide}>Observação <small>(opcional)</small><textarea rows={2} maxLength={800} value={command.notes||''} onChange={e=>change({notes:e.target.value})}/></label>
            </>}
          </fieldset>
          {preview?<div className={styles.preview} aria-live="polite"><div><small>Saldo atual</small><strong>{balanceLabel(-preview.before.balance)}</strong></div><span aria-hidden="true">→</span><div><small>Após {mode==='void'?'desfazer':'confirmar'}</small><strong>{balanceLabel(-preview.after.balance)}</strong></div><p>{preview.record.studentName} · {dateLabel(preview.record.date)}{preview.record.time?' às '+preview.record.time:''} · {preview.record.teacher} · {externalCategoryLabels[preview.record.category]}<br/>{mode==='void'?'Retirar este consumo de reposição.':'1 reposição realizada com outro professor.'}</p>{preview.outsidePeriod?<p className={styles.warning}>Data fora do período do saldo atual. O histórico será preservado; o cálculo vigente não inclui esse atendimento no saldo atual.</p>:<small>Saldo a repor: {-preview.before.balance} → {-preview.after.balance}. Valor negativo indica reposição antecipada.</small>}</div>:null}
          {error?<p role="alert" className={styles.error}>{error}</p>:null}
          <footer className={styles.actions}><button type="button" onClick={close} disabled={busy}>Fechar</button><button type="submit" className={styles.primary} disabled={busy||disabled}>{busy?'Conferindo…':uncertain?'Conferir resultado':preview?mode==='void'?'Confirmar desfazimento':mode==='update'?'Confirmar correção':'Confirmar reposição realizada':'Conferir saldo e resumo'}</button></footer>
        </form>}
      </div>
    </div>,document.body):null}
  </section>;
}
