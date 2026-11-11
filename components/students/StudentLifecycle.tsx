'use client';
import {useEffect,useState,useRef} from 'react';
import type {Student} from '@/types/models';
import {currentPause,pauseLabel,saoPauloDate} from '@/lib/students/lifecycle';
import type {LifecycleCommand,ReturnSlot} from '@/lib/students/lifecycle-calendar';
import styles from './StudentLifecycle.module.css';
const display=(date:string)=>new Date(date).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short'});
export default function StudentLifecycle({student,onSaved}:{student:Student;onSaved:(students:Student[])=>void}){
 const dialog=useRef<HTMLElement>(null),trigger=useRef<HTMLButtonElement>(null);
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[preview,setPreview]=useState<any>(null),[operationId,setOperationId]=useState(''),[pending,setPending]=useState(false);
 const [command,setCommand]=useState<LifecycleCommand>(()=>initial());
 function initial():LifecycleCommand{const from=saoPauloDate();return student.status==='ARCHIVED'?{kind:'resume',studentId:student.id,from,financialActive:student.financialActive!==false,monthlyAmount:student.monthlyAmount||0,dueDay:student.financeDueDay||5,billingFrom:from.slice(0,7),slots:[slot(from)]}:{kind:'pause',studentId:student.id,from};}
 function slot(date:string):ReturnSlot{const end=new Date(date+'T12:00:00Z');end.setUTCMonth(end.getUTCMonth()+3);return {date,start:'08:00',end:'09:00',until:end.toISOString().slice(0,10)};}
 function change(p:Partial<LifecycleCommand>){setCommand(c=>({...c,...p}));setPreview(null);setError('');}
 async function readPending(){const r=await fetch('/api/students/lifecycle?studentId='+encodeURIComponent(student.id),{cache:'no-store'});const d=await r.json();if(!r.ok)throw Error(d.message);if(d.pending){setCommand(d.pending.command);setPreview(d.pending.preview);setOperationId(d.pending.operationId);setPending(true);}}
 useEffect(()=>{if(!open){trigger.current?.focus();return;}const focusable=()=>Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href]')||[]).filter(e=>!e.closest('fieldset:disabled'));if(!dialog.current?.contains(document.activeElement))focusable()[0]?.focus();const key=(e:KeyboardEvent)=>{if(e.key==='Escape'&&!busy)setOpen(false);if(e.key==='Tab'){const items=focusable(),first=items[0],last=items.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[open,busy]);
 async function begin(){setCommand(initial());setPreview(null);setPending(false);setOperationId(crypto.randomUUID());setError('');setOpen(true);setBusy(true);try{await readPending();}catch(e){setError(String(e instanceof Error?e.message:e));}finally{setBusy(false);}}
 async function run(action:'preview'|'execute'){
  setBusy(true);setError('');
  try{
   const r=await fetch('/api/students/lifecycle',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,command,operationId,digest:preview?.digest,confirmed:action==='execute'})});const d=await r.json();
   if(!r.ok){if(d.pending){setPending(true);await readPending();const data=await fetch('/api/data',{cache:'no-store'}).then(r=>r.json());if(Array.isArray(data.data))onSaved(data.data);}throw Error(d.message);}
   if(action==='preview')setPreview(d.preview);else{onSaved(d.data);setOpen(false);}
  }catch(e){setError(e instanceof Error?e.message:'Não foi possível confirmar. Reabra este caderno para conferir a operação.');if(action==='execute')await readPending().catch(()=>{});}
  finally{setBusy(false);}
 }
 const pause=currentPause(student),label=pauseLabel(student);
 return <div className={styles.root}>
  {label?<strong className={styles.status}>{label}{pause?.expectedReturn?' · previsão '+pause.expectedReturn.split('-').reverse().join('/'):''}</strong>:null}
  <button ref={trigger} type="button" className="secondary" onClick={()=>void begin()}>{student.lifecycle?.pending?'Concluir operação pendente':student.status==='ARCHIVED'?'Reativar aluno':'Inativar aluno'}</button>
  {open?<div className={styles.backdrop}><section ref={dialog} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="lifecycle-title">
   <header><h2 id="lifecycle-title">{command.kind==='pause'?'Inativar aluno':'Reativar aluno'} · {student.name}</h2><button type="button" aria-label="Fechar" disabled={busy} onClick={()=>setOpen(false)}>×</button></header>
   <p>{command.kind==='pause'?'O cadastro ficará Inativo.':'O cadastro voltará a ficar Ativo após a confirmação da agenda.'} Histórico, treinos, avaliações, arquivos e cobranças já emitidas serão preservados.</p>
   {pending?<p role="status" className={styles.notice}>A operação foi registrada. As alterações confirmadas serão preservadas ao tentar novamente. A mensalidade continua suspensa até a conclusão do retorno.</p>:null}
   <fieldset disabled={busy||pending}>
    <div className={styles.fields}><label>{command.kind==='pause'?'Retirar das aulas a partir de':'Data do retorno'}<input autoFocus type="date" min={saoPauloDate()} value={command.from} onChange={e=>change({from:e.target.value})}/></label>
    {command.kind==='pause'?<label>Previsão de retorno (opcional)<input type="date" min={command.from} value={command.expectedReturn||''} onChange={e=>change({expectedReturn:e.target.value})}/></label>:<>
     <label>Mensalidade (R$)<input type="number" min="0" step="0.01" value={command.monthlyAmount} onChange={e=>change({monthlyAmount:Number(e.target.value)})}/></label>
     <label>Dia de vencimento<input type="number" min="1" max="31" value={command.dueDay} onChange={e=>change({dueDay:Number(e.target.value)})}/></label>
     <label>Primeiro mês de cobrança<input type="month" min={command.from.slice(0,7)} value={command.billingFrom} onChange={e=>change({billingFrom:e.target.value})}/></label>
     <label><input type="checkbox" checked={command.financialActive} onChange={e=>change({financialActive:e.target.checked})}/> Gerar novas mensalidades</label>
    </>}</div>
    {command.kind==='resume'?<><h3>Horários semanais do retorno</h3><p>Confira os horários anteriores: {student.trainingSchedule||'não informados'}. A prévia mostrará quando entrar em uma aula existente ou criar uma série. Não serão recriadas aulas passadas.</p>
     {command.slots?.map((s,index)=><div className={styles.slot} key={index}>
      {(['date','start','end','until'] as const).map(key=><label key={key}>{{date:'Primeira aula',start:'Início',end:'Fim',until:'Repetir até'}[key]}<input type={key==='date'||key==='until'?'date':'time'} value={s[key]} min={key==='date'?command.from:key==='until'?s.date:undefined} onChange={e=>change({slots:command.slots!.map((x,i)=>i===index?{...x,[key]:e.target.value}:x)})}/></label>)}
      <button type="button" disabled={command.slots!.length===1} onClick={()=>change({slots:command.slots!.filter((_,i)=>i!==index)})}>Remover horário</button>
     </div>)}<button type="button" disabled={(command.slots?.length||0)>=6} onClick={()=>change({slots:[...command.slots!,slot(command.from)]})}>Adicionar horário</button>
    </>:<p>A previsão não reativa o aluno automaticamente. Novas mensalidades automáticas ficam suspensas enquanto o cadastro estiver Inativo; as já emitidas continuam disponíveis.</p>}
   </fieldset>
   {error?<p role="alert" className={styles.error}>{error}</p>:null}
   {preview?<div className={styles.preview}><h3>Confira antes de confirmar</h3><p>{preview.lessons.length} aula(s) na prévia · {preview.issued} cobrança(s) existente(s) preservada(s).</p>{command.kind==='pause'&&preview.series?<p>A remoção vale também para as próximas ocorrências das {preview.series} séries, até um retorno confirmado. A lista mostra até um ano de ocorrências.</p>:null}
    <ul>{preview.lessons.map((l:any)=><li key={l.id}><strong>{display(l.start)}</strong> · {l.label}<br/><span>{l.action}</span></li>)}</ul>{!preview.lessons.length?<p>Nenhuma aula futura identificada para retirar. A inativação ainda suspende novas mensalidades.</p>:null}
   </div>:null}
   <footer><button type="button" disabled={busy} onClick={()=>setOpen(false)}>Fechar</button>{!pending?<button type="button" className="secondary" disabled={busy} onClick={()=>void run('preview')}>Conferir prévia</button>:null}{preview?<button type="button" className="primary" disabled={busy} onClick={()=>void run('execute')}>{busy?'Conferindo…':pending?'Tentar concluir novamente':command.kind==='pause'?'Confirmar inativação':'Confirmar reativação'}</button>:null}</footer>
  </section></div>:null}
 </div>;
}
