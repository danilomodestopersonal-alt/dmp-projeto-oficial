"use client";
import { useEffect, useRef, useState } from 'react';
import type { KidsClass, KidsStudent, KidsCategory } from '@/types/kids';
import { classDefinition, type KidsClassChange } from '@/lib/kids/class-history';
import styles from './KidsPage.module.css';
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const tomorrow=()=>new Date(Date.parse(today()+'T12:00:00Z')+86400000).toISOString().slice(0,10);
const days=['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
export default function PermanentClassForm({group,students,semesterEnd,disabled,onChange,onSave}:{group:KidsClass;students:KidsStudent[];semesterEnd:string;disabled:boolean;onChange:(value:KidsClassChange|null)=>void;onSave:(change:KidsClassChange)=>Promise<boolean>}){
 const [draft,setDraft]=useState<KidsClass>(()=>structuredClone(group));
 const [effectiveFrom,setEffectiveFrom]=useState(()=>{const last=group.history?.map(v=>v.from).sort().at(-1);return last&&last>=tomorrow()?new Date(Date.parse(last+'T12:00:00Z')+86400000).toISOString().slice(0,10):tomorrow();});
 const [studentId,setStudentId]=useState('');const [message,setMessage]=useState('');
 const baseline=useRef(JSON.stringify(classDefinition(group)));
 const signature=JSON.stringify(classDefinition(draft)),dirty=signature!==baseline.current;
 useEffect(()=>{onChange(dirty?{group:draft,effectiveFrom}:null);},[signature,effectiveFrom,dirty,onChange]);
 const edit=(patch:Partial<KidsClass>)=>{setMessage('');setDraft(current=>({...current,...patch}));};
 return <div className={styles.permanentClass}>
  <div className={styles.cancelBox}><strong>Turma permanente · aulas futuras</strong><p>Reposição pontual é adicionada na aba Chamada. As alterações abaixo só entram na data escolhida; chamadas antigas e aulas com registros serão preservadas.</p></div>
  <fieldset disabled={disabled}><div className={styles.formGrid}>
   <label>Vigência a partir de<input type="date" min={tomorrow()} max={semesterEnd} value={effectiveFrom} onChange={e=>setEffectiveFrom(e.target.value)}/></label>
   <label>Nome da turma<input value={draft.name} onChange={e=>edit({name:e.target.value})}/></label>
   <label>Professor<input value={draft.teacher} onChange={e=>edit({teacher:e.target.value})}/></label>
   <label>Dia da semana<select value={draft.weekday} onChange={e=>edit({weekday:Number(e.target.value)})}>{days.map((day,i)=><option value={i} key={day}>{day}</option>)}</select></label>
   <label>Início<input type="time" value={draft.startTime} onChange={e=>edit({startTime:e.target.value})}/></label>
   <label>Fim<input type="time" value={draft.endTime} onChange={e=>edit({endTime:e.target.value})}/></label>
   <label>Categoria<select value={draft.category} onChange={e=>edit({category:e.target.value as KidsCategory})}>{Object.entries({RED:'Vermelha',ORANGE:'Laranja',GREEN:'Verde',YELLOW:'Amarela'}).map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>
  </div><h3>Crianças da turma fixa</h3>
  <div className={styles.permanentMembers}>{draft.students.filter(s=>s.active).map(student=><div key={student.id}><span>{student.name}</span><button type="button" onClick={()=>{if(window.confirm(`Retirar ${student.name} da turma fixa a partir de ${effectiveFrom}? O histórico será preservado.`))edit({students:draft.students.map(s=>s.id===student.id?{...s,active:false}:s)});}}>Retirar das futuras</button></div>)}</div>
  <div className={styles.inlineActions}><select aria-label="Adicionar criança à turma fixa" value={studentId} onChange={e=>setStudentId(e.target.value)}><option value="">Selecione uma criança cadastrada</option>{students.filter(s=>s.active&&!draft.students.some(m=>m.id===s.id&&m.active)).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select><button type="button" disabled={!studentId} onClick={()=>{const student=students.find(s=>s.id===studentId);if(!student)return;edit({students:[...draft.students.filter(s=>s.id!==student.id),{...student,active:true,startDate:effectiveFrom}]});setStudentId('');}}>Incluir na turma fixa</button></div>
  <button type="button" className={styles.primary} disabled={!dirty||!effectiveFrom||effectiveFrom<=today()} onClick={()=>void(async()=>{setMessage('');const change={group:{...draft,name:draft.name.trim(),teacher:draft.teacher.trim(),updatedAt:new Date().toISOString()},effectiveFrom};const saved=await onSave(change);if(saved){setDraft(change.group);baseline.current=JSON.stringify(classDefinition(change.group));onChange(null);setEffectiveFrom(new Date(Date.parse(effectiveFrom+'T12:00:00Z')+86400000).toISOString().slice(0,10));setMessage('Turma salva para as aulas futuras. A chamada em edição foi preservada.');}else setMessage('Alteração não confirmada. Confira o aviso da página; os campos continuam aqui.');})()}>Salvar turma para as futuras</button>
  </fieldset>{message?<p role="status">{message}</p>:null}
 </div>;
}
