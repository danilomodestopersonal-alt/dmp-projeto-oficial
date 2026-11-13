'use client';
import {useState} from 'react';
import {routineToday} from '@/lib/routine/model';
import {useRoutine} from './useRoutine';
import styles from './Routine.module.css';
export default function RoutineToday({onOpen}:{onOpen:()=>void}){
 const api=useRoutine(true),[expanded,setExpanded]=useState(false),state=routineToday(api.data,api.today);
 if(api.loading)return null;
 if(!state.version&&!api.error)return null;
 const time=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date());
 const score=(r:typeof state.rows[number])=>r.mark?.status&&r.mark.status!=='PENDING'?3000:r.item.clock?(r.item.clock>=time?0:1500)+Number(r.item.clock.replace(':','')):1000;
 const scheduled=state.rows.filter(r=>!r.optional).sort((a,b)=>score(a)-score(b)),optional=state.rows.filter(r=>r.optional);
 const render=(row:typeof state.rows[number])=><div className={styles.todayRow} key={row.item.id}><div><small>{row.item.clock||row.item.timing||'Horário não definido'}</small><strong>{row.item.name}</strong><span>{[row.item.quantity,row.item.unit].filter(Boolean).join(' ')}{row.item.condition?' · '+row.item.condition:''}</span>{row.earlier.length?<small className={styles.alertText}>Já houve registro deste item em outra versão hoje. Confira antes de repetir.</small>:null}<details><summary>Detalhes</summary><p>{row.item.instructions}</p><p>{row.item.notes}</p></details></div><label className={styles.markLabel}><span className={styles.srOnly}>Marcação de {row.item.name}</span><select aria-label={'Marcação de '+row.item.name} value={row.mark?.status||'PENDING'} disabled={api.busy||Boolean(api.pending)} onChange={e=>void api.request('mark',{date:api.today,itemId:row.item.id,versionId:row.versionId,status:e.target.value}).catch(()=>{})}><option value="PENDING">Pendente</option><option value="DONE">Realizado</option><option value="SKIPPED">Pulado</option></select>{row.mark?.status==='DONE'?<small>{new Date(row.mark.recordedAt).toLocaleTimeString('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'})}</small>:null}</label></div>;
 return <section className={`panel ${styles.todayCard}`} aria-label="Minha rotina de hoje"><header className={styles.sectionHead}><div><small>ROTINA PESSOAL</small><h2>Minha rotina de hoje</h2></div><button type="button" className={styles.textButton} onClick={onOpen}>Ver rotina completa</button></header>
  {api.error?<p role="alert" className={styles.error}>{api.error}</p>:null}
  {api.pending?<button type="button" disabled={api.busy} onClick={()=>void api.request(api.pending!.action,api.pending!.input,{retry:api.pending!}).catch(()=>{})}>Conferir tentativa anterior</button>:null}
  <div className={styles.todayList}>{(expanded?scheduled:scheduled.slice(0,3)).map(render)}{!scheduled.length?<p className={styles.muted}>Nenhum item obrigatório programado para hoje.</p>:null}</div>
  {scheduled.length>3?<button className={styles.textButton} type="button" onClick={()=>setExpanded(v=>!v)}>{expanded?'Mostrar menos':`Mostrar mais ${scheduled.length-3}`}</button>:null}
  {optional.length?<details className={styles.optional}><summary>Se necessário · {optional.length}</summary>{optional.map(render)}</details>:null}
  {state.history.length?<details><summary>Registros de versões anteriores hoje · {state.history.length}</summary>{state.history.map((m,i)=><p key={i}>{m.itemSnapshot.name} · {m.itemSnapshot.quantity} {m.itemSnapshot.unit} · {m.status==='DONE'?'Realizado':'Pulado'}</p>)}</details>:null}
  {state.version?.warnings.length?<details className={styles.alert}><summary>Ressalvas do plano</summary>{state.version.warnings.map((w,i)=><p key={i}>{w}</p>)}</details>:null}
 </section>;
}
