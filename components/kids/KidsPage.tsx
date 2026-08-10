"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./KidsPage.module.css";
import { createKidsSeed } from "@/lib/kids/seed";
import type { KidsAttendanceStatus, KidsCategory, KidsClass, KidsData, KidsLesson } from "@/types/kids";

type KidsTab="dashboard"|"agenda"|"classes"|"reports";
type AgendaFilter="ALL"|"COMPLETED"|"CANCELLED"|"REPLACEMENTS";
const categoryLabel:Record<KidsCategory,string>={RED:"Vermelha",ORANGE:"Laranja",GREEN:"Verde",YELLOW:"Amarela",PURPLE:"Roxa"};
const weekdayLabel=["domingo","segunda","terça","quarta","quinta","sexta","sábado"];
const statusLabel={SCHEDULED:"Agendada",COMPLETED:"Realizada",CANCELLED:"Cancelada",HOLIDAY:"Feriado"};
const localeCompare=(a:string,b:string)=>a.localeCompare(b,"pt-BR");
const formatDate=(value:string)=>new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR");
const currentMonth=()=>new Date().toISOString().slice(0,7);

export default function KidsPage({onBack}:{onBack:()=>void}){
  const [data,setData]=useState<KidsData|null>(null);
  const [tab,setTab]=useState<KidsTab>("dashboard");
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [notice,setNotice]=useState("");
  const [month,setMonth]=useState(currentMonth());
  const [lessonId,setLessonId]=useState<string|null>(null);
  const [classId,setClassId]=useState<string|null>(null);
  const [studentId,setStudentId]=useState<string|null>(null);
  const [reportKind,setReportKind]=useState<"student"|"class">("student");
  const [reportId,setReportId]=useState("");
  const [agendaFilter,setAgendaFilter]=useState<AgendaFilter>("ALL");

  useEffect(()=>{void load();},[]);
  async function load(){
    setLoading(true);
    try{const response=await fetch("/api/kids",{cache:"no-store"});const payload=await response.json();if(!response.ok)throw new Error(payload.error);const next:KidsData=payload.data||createKidsSeed();setData(next);if(!payload.data)await persist(next);}
    catch{setNotice("Não foi possível carregar o Tênis Kids.");}
    finally{setLoading(false);}
  }
  async function persist(next:KidsData,message="Alterações salvas."){
    const stamped={...next,updatedAt:new Date().toISOString()};setData(stamped);setSaving(true);
    try{const response=await fetch("/api/kids",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(stamped)});if(!response.ok)throw new Error();setNotice(message);}
    catch{setNotice("Erro ao salvar. Tente novamente.");}
    finally{setSaving(false);}
  }
  const classes=data?.classes||[];
  const lessons=data?.lessons||[];
  const monthLessons=useMemo(()=>lessons.filter(item=>item.date.startsWith(month)).sort((a,b)=>a.date.localeCompare(b.date)||classTime(a.classId).localeCompare(classTime(b.classId))),[lessons,month,classes]);
  const allKids=useMemo(()=>{const map=new Map<string,{id:string;name:string;categories:KidsCategory[];classIds:string[]}>();classes.forEach(group=>group.students.filter(student=>student.active).forEach(student=>{const current=map.get(student.id);if(current){if(!current.categories.includes(group.category))current.categories.push(group.category);current.classIds.push(group.id);}else map.set(student.id,{id:student.id,name:student.name,categories:[group.category],classIds:[group.id]});}));return [...map.values()].sort((a,b)=>localeCompare(a.name,b.name));},[classes]);
  function classTime(id:string){return classes.find(item=>item.id===id)?.startTime||"";}
  function group(id:string){return classes.find(item=>item.id===id);}
  function openLesson(id:string){setLessonId(id);setClassId(null);}
  function openClass(id:string){setClassId(id);setLessonId(null);setStudentId(null);}
  function openStudent(id:string){setStudentId(id);setClassId(null);setLessonId(null);}
  function openAgenda(filter:AgendaFilter){setAgendaFilter(filter);setTab("agenda");}
  function updateLesson(next:KidsLesson){if(!data)return;void persist({...data,lessons:data.lessons.map(item=>item.id===next.id?next:item)},"Aula salva com sucesso.");setLessonId(null);}
  function updateClass(next:KidsClass){if(!data)return;void persist({...data,classes:data.classes.map(item=>item.id===next.id?next:item)},"Turma atualizada.");setClassId(null);}
  function updateStudentClasses(nextClasses:KidsClass[]){if(!data)return;void persist({...data,classes:nextClasses},"Cadastro da criança atualizado.");setStudentId(null);}

  const today=new Date().toISOString().slice(0,10);
  const todayLessons=lessons.filter(item=>item.date===today).sort((a,b)=>classTime(a.classId).localeCompare(classTime(b.classId)));
  const completed=lessons.filter(item=>item.status==="COMPLETED").length;
  const cancelled=lessons.filter(item=>item.status==="CANCELLED").length;
  const pending=lessons.filter(item=>item.replacementStatus==="PENDING"||item.replacementStatus==="SCHEDULED").length;
  const displayedLessons=(agendaFilter==="ALL"?monthLessons:lessons.filter(item=>agendaFilter==="COMPLETED"?item.status==="COMPLETED":agendaFilter==="CANCELLED"?item.status==="CANCELLED":item.replacementStatus==="PENDING"||item.replacementStatus==="SCHEDULED")).slice().sort((a,b)=>b.date.localeCompare(a.date)||classTime(a.classId).localeCompare(classTime(b.classId)));

  if(loading)return <section className={styles.loading}><img src="/logo-ctds.png" alt="CT DS Tennis"/><strong>Carregando Aulas Kids...</strong></section>;
  if(!data)return <section className={styles.loading}><strong>Não foi possível abrir o módulo.</strong><button onClick={()=>void load()}>Tentar novamente</button></section>;

  return <div className={styles.page}>
    <header className={styles.hero}><div><button className={styles.back} onClick={onBack}>← Voltar ao DMP</button><p>CT DS TENNIS · GESTÃO PEDAGÓGICA</p><h1>Aulas Kids</h1><span>Semestre de {formatDate(data.semesterStart)} a {formatDate(data.semesterEnd)}</span></div><img src="/logo-ctds.png" alt="CT DS Tennis"/></header>
    <nav className={styles.tabs}>{([['dashboard','Visão geral'],['agenda','Agenda'],['classes','Turmas'],['reports','Relatórios']] as [KidsTab,string][]).map(([value,label])=><button key={value} className={tab===value?styles.active:""} onClick={()=>setTab(value)}>{label}</button>)}</nav>
    {notice?<div className={styles.notice}>{notice}<button onClick={()=>setNotice("")}>×</button></div>:null}
    {saving?<div className={styles.saving}>Salvando...</div>:null}

    {tab==="dashboard"?<>
      <section className={styles.stats}><Stat label="Turmas ativas" value={classes.filter(item=>item.active).length} icon="🎾" onClick={()=>setTab("classes")}/><Stat label="Aulas realizadas" value={completed} icon="✅" onClick={()=>openAgenda("COMPLETED")}/><Stat label="Canceladas" value={cancelled} icon="🌧️" onClick={()=>openAgenda("CANCELLED")}/><Stat label="Reposições pendentes" value={pending} icon="↻" onClick={()=>openAgenda("REPLACEMENTS")}/></section>
      <section className={styles.panel}><div className={styles.panelHead}><div><h2>Aulas de hoje</h2><p>Abra uma aula para registrar presença, objetivo e plano realizado.</p></div><button onClick={()=>setTab("agenda")}>Abrir agenda</button></div>{todayLessons.length?<div className={styles.lessonList}>{todayLessons.map(lesson=><LessonRow key={lesson.id} lesson={lesson} group={group(lesson.classId)} onClick={()=>openLesson(lesson.id)}/>)}</div>:<Empty title="Nenhuma aula Kids hoje" text="Consulte as próximas aulas na agenda do semestre."/>}</section>
      <section className={styles.grid2}><article className={styles.panel}><h2>Próximas aulas</h2><div className={styles.lessonList}>{lessons.filter(item=>item.date>=today&&item.status==="SCHEDULED").sort((a,b)=>a.date.localeCompare(b.date)||classTime(a.classId).localeCompare(classTime(b.classId))).slice(0,6).map(lesson=><LessonRow key={lesson.id} lesson={lesson} group={group(lesson.classId)} onClick={()=>openLesson(lesson.id)}/>)}</div></article><article className={styles.panel}><h2>Todos os alunos</h2><p>Clique na criança para consultar suas turmas e seus dados.</p><div className={styles.kidsRoster}>{allKids.map(student=><button key={student.id} onClick={()=>openStudent(student.id)}><span className={styles.categoryDots}>{student.categories.map(category=><CategoryDot key={category} category={category}/>)}</span><strong>{student.name}</strong><small>{student.classIds.length} turma{student.classIds.length===1?"":"s"}</small><span>›</span></button>)}</div></article></section>
    </>:null}

    {tab==="agenda"?<section className={styles.panel}><div className={styles.panelHead}><div><h2>{agendaFilter==="ALL"?"Agenda do semestre":agendaFilter==="COMPLETED"?"Aulas realizadas":agendaFilter==="CANCELLED"?"Aulas canceladas":"Reposições pendentes"}</h2><p>Aulas, feriados, cancelamentos e reposições em uma única lista.</p></div>{agendaFilter==="ALL"?<input type="month" value={month} min="2026-08" max="2026-12" onChange={event=>setMonth(event.target.value)}/>:<button onClick={()=>setAgendaFilter("ALL")}>Ver agenda completa</button>}</div><div className={styles.lessonList}>{displayedLessons.length?displayedLessons.map(lesson=><LessonRow key={lesson.id} lesson={lesson} group={group(lesson.classId)} onClick={()=>openLesson(lesson.id)}/>):<Empty title="Nenhuma aula encontrada" text={agendaFilter==="ALL"?"Escolha outro mês do semestre.":"Não há registros nesta categoria."}/>}</div></section>:null}

    {tab==="classes"?<section className={styles.panel}><div className={styles.panelHead}><div><h2>Turmas</h2><p>Relação inicial importada da agenda. Confira e edite quando necessário.</p></div></div><div className={styles.classGrid}>{classes.slice().sort((a,b)=>a.weekday-b.weekday||a.startTime.localeCompare(b.startTime)).map(item=><button className={styles.classCard} key={item.id} onClick={()=>openClass(item.id)}><CategoryDot category={item.category}/><span><strong>{item.name}</strong><small>{weekdayLabel[item.weekday]}, {item.startTime} · {item.students.filter(student=>student.active).length} crianças</small></span><b>Editar</b></button>)}</div></section>:null}

    {tab==="reports"?<Reports data={data} kind={reportKind} setKind={setReportKind} reportId={reportId} setReportId={setReportId}/>:null}
    {lessonId?<LessonEditor lesson={lessons.find(item=>item.id===lessonId)!} group={group(lessons.find(item=>item.id===lessonId)!.classId)!} onClose={()=>setLessonId(null)} onSave={updateLesson}/>:null}
    {classId?<ClassEditor group={group(classId)!} semesterStart={data.semesterStart} onClose={()=>setClassId(null)} onSave={updateClass}/>:null}
    {studentId?<StudentEditor studentId={studentId} classes={classes} semesterStart={data.semesterStart} onClose={()=>setStudentId(null)} onOpenClass={openClass} onSave={updateStudentClasses}/>:null}
  </div>;
}

function Stat({label,value,icon,onClick}:{label:string;value:number;icon:string;onClick:()=>void}){return <button className={styles.stat} onClick={onClick}><span>{icon}</span><div><small>{label}</small><strong>{value}</strong></div><b>›</b></button>}
function Empty({title,text}:{title:string;text:string}){return <div className={styles.empty}><strong>{title}</strong><span>{text}</span></div>}
function CategoryDot({category}:{category:KidsCategory}){return <i className={`${styles.ball} ${styles[category.toLowerCase()]}`} title={`Bola ${categoryLabel[category]}`}/>}
function LessonRow({lesson,group,onClick}:{lesson:KidsLesson;group?:KidsClass;onClick:()=>void}){if(!group)return null;const present=Object.values(lesson.attendance).filter(value=>value==="PRESENT").length;return <button className={styles.lessonRow} onClick={onClick}><CategoryDot category={group.category}/><span><strong>{formatDate(lesson.date)} · {group.startTime} · {group.name}</strong><small>{statusLabel[lesson.status]}{lesson.status==="COMPLETED"?` · ${present}/${group.students.filter(item=>item.active).length} presentes`:""}{lesson.replacementStatus!=="NONE"?` · Reposição ${lesson.replacementStatus.toLowerCase()}`:""}</small></span><b>Abrir</b></button>}

function LessonEditor({lesson,group,onClose,onSave}:{lesson:KidsLesson;group:KidsClass;onClose:()=>void;onSave:(next:KidsLesson)=>void}){
  const [draft,setDraft]=useState({...lesson,attendance:{...lesson.attendance}});
  const students=group.students.filter(item=>item.active&&(!item.startDate||item.startDate<=lesson.date)).sort((a,b)=>localeCompare(a.name,b.name));
  useEffect(()=>{if(draft.status!=="HOLIDAY"&&Object.keys(draft.attendance).length===0)setDraft(current=>({...current,attendance:Object.fromEntries(students.map(item=>[item.id,"PRESENT"]))}));},[]);
  function toggle(id:string){setDraft(current=>({...current,attendance:{...current.attendance,[id]:current.attendance[id]==="ABSENT"?"PRESENT":"ABSENT"}}));}
  function allPresent(){setDraft(current=>({...current,attendance:Object.fromEntries(students.map(item=>[item.id,"PRESENT"]))}));}
  async function imageFile(file?:File){if(!file)return;const dataUrl=await compressImage(file);setDraft(current=>({...current,image:{name:file.name,dataUrl}}));}
  function status(value:KidsLesson["status"]){setDraft(current=>({...current,status:value,replacementEligible:value==="CANCELLED"?current.replacementEligible:false,replacementStatus:value==="CANCELLED"?current.replacementStatus:"NONE"}));}
  return <div className={styles.modalBackdrop}><section className={styles.modal}><div className={styles.modalHead}><div><CategoryDot category={group.category}/><h2>{group.name}</h2><p>{formatDate(draft.date)} · {group.startTime} · Bola {categoryLabel[group.category]}</p></div><button onClick={onClose}>×</button></div>
    {draft.status==="HOLIDAY"?<div className={styles.holiday}>Feriado — aula cancelada sem direito à reposição.</div>:<>
      <label>Situação<select value={draft.status} onChange={event=>status(event.target.value as KidsLesson["status"])}><option value="SCHEDULED">Agendada</option><option value="COMPLETED">Realizada</option><option value="CANCELLED">Aula cancelada</option></select></label>
      {draft.status==="CANCELLED"?<div className={styles.cancelBox}><label><input type="checkbox" checked={draft.replacementEligible} onChange={event=>setDraft(current=>({...current,replacementEligible:event.target.checked,replacementStatus:event.target.checked&&current.replacementStatus==="NONE"?"PENDING":event.target.checked?current.replacementStatus:"NONE"}))}/> Aula com direito à reposição</label>{draft.replacementEligible?<><label>Situação da reposição<select value={draft.replacementStatus} onChange={event=>setDraft(current=>({...current,replacementStatus:event.target.value as KidsLesson["replacementStatus"]}))}><option value="PENDING">Pendente</option><option value="SCHEDULED">Agendada</option><option value="COMPLETED">Realizada</option></select></label><label>Data da reposição<input type="date" value={draft.replacementDate||""} onChange={event=>setDraft(current=>({...current,replacementDate:event.target.value}))}/></label></>:null}</div>:null}
      <div className={styles.attendanceHead}><h3>Chamada</h3><button onClick={allPresent}>Todos presentes</button></div><div className={styles.attendance}>{students.map(student=>{const value=(draft.attendance[student.id]||"PRESENT") as KidsAttendanceStatus;return <button key={student.id} className={value==="PRESENT"?styles.present:styles.absent} onClick={()=>toggle(student.id)}><span>{value==="PRESENT"?"✓":"×"}</span><strong>{student.name}</strong><small>{value==="PRESENT"?"Presente":"Falta"}</small></button>})}</div>
      <div className={styles.formGrid}><label>Objetivo da aula<textarea rows={2} value={draft.objective} onChange={event=>setDraft(current=>({...current,objective:event.target.value}))}/></label><label>Plano previsto<textarea rows={2} value={draft.plannedPlan} onChange={event=>setDraft(current=>({...current,plannedPlan:event.target.value}))}/></label><label>Plano realizado<textarea rows={3} value={draft.actualPlan} onChange={event=>setDraft(current=>({...current,actualPlan:event.target.value}))}/></label><label>Observações<textarea rows={3} value={draft.notes} onChange={event=>setDraft(current=>({...current,notes:event.target.value}))}/></label></div>
      <div className={styles.imageBox}><strong>Imagem do plano de aula</strong>{draft.image?<><img src={draft.image.dataUrl} alt={draft.image.name}/><div><label className={styles.fileButton}>Substituir<input type="file" accept="image/*" onChange={event=>void imageFile(event.target.files?.[0])}/></label><button onClick={()=>setDraft(current=>({...current,image:undefined}))}>Excluir imagem</button></div></>:<label className={styles.fileButton}>Anexar imagem<input type="file" accept="image/*" onChange={event=>void imageFile(event.target.files?.[0])}/></label>}</div>
    </>}
    <div className={styles.modalActions}><button onClick={onClose}>Cancelar</button><button className={styles.primary} onClick={()=>onSave({...draft,updatedAt:new Date().toISOString()})}>Salvar aula</button></div>
  </section></div>;
}

function ClassEditor({group,semesterStart,onClose,onSave}:{group:KidsClass;semesterStart:string;onClose:()=>void;onSave:(next:KidsClass)=>void}){
  const [draft,setDraft]=useState({...group,students:group.students.map(item=>({...item,startDate:item.startDate||semesterStart}))});const [name,setName]=useState("");const [startDate,setStartDate]=useState(semesterStart);
  function add(){const clean=name.trim();if(!clean)return;setDraft(current=>({...current,students:[...current.students,{id:`kid-${crypto.randomUUID()}`,name:clean,active:true,startDate}].sort((a,b)=>localeCompare(a.name,b.name))}));setName("");}
  return <div className={styles.modalBackdrop}><section className={styles.modal}><div className={styles.modalHead}><div><CategoryDot category={draft.category}/><h2>Editar turma</h2><p>{draft.name}</p></div><button onClick={onClose}>×</button></div><div className={styles.formGrid}><label>Nome da turma<input value={draft.name} onChange={event=>setDraft(current=>({...current,name:event.target.value}))}/></label><label>Professor<input value={draft.teacher} onChange={event=>setDraft(current=>({...current,teacher:event.target.value}))}/></label><label>Dia<select value={draft.weekday} onChange={event=>setDraft(current=>({...current,weekday:Number(event.target.value)}))}>{weekdayLabel.map((label,index)=><option value={index} key={label}>{label}</option>)}</select></label><label>Horário<input type="time" value={draft.startTime} onChange={event=>setDraft(current=>({...current,startTime:event.target.value}))}/></label><label>Categoria<select value={draft.category} onChange={event=>setDraft(current=>({...current,category:event.target.value as KidsCategory}))}>{Object.entries(categoryLabel).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label></div><h3>Crianças</h3><div className={styles.studentEdit}>{draft.students.map(student=><div key={student.id}><input value={student.name} onChange={event=>setDraft(current=>({...current,students:current.students.map(item=>item.id===student.id?{...item,name:event.target.value}:item)}))}/><input aria-label={`Início de ${student.name}`} title="Início na turma" type="date" min={semesterStart} value={student.startDate||semesterStart} onChange={event=>setDraft(current=>({...current,students:current.students.map(item=>item.id===student.id?{...item,startDate:event.target.value}:item)}))}/><label><input type="checkbox" checked={student.active} onChange={event=>setDraft(current=>({...current,students:current.students.map(item=>item.id===student.id?{...item,active:event.target.checked}:item)}))}/> Ativo</label></div>)}</div><div className={styles.addStudent}><input value={name} onChange={event=>setName(event.target.value)} placeholder="Nome da criança" onKeyDown={event=>{if(event.key==="Enter"){event.preventDefault();add();}}}/><label>Início na turma<input type="date" min={semesterStart} value={startDate} onChange={event=>setStartDate(event.target.value)}/></label><button onClick={add}>+ Adicionar</button></div><div className={styles.modalActions}><button onClick={onClose}>Cancelar</button><button className={styles.primary} onClick={()=>onSave({...draft,updatedAt:new Date().toISOString()})}>Salvar turma</button></div></section></div>;
}

function StudentEditor({studentId,classes,semesterStart,onClose,onOpenClass,onSave}:{studentId:string;classes:KidsClass[];semesterStart:string;onClose:()=>void;onOpenClass:(id:string)=>void;onSave:(classes:KidsClass[])=>void}){
  const [draft,setDraft]=useState(classes.map(group=>({...group,students:group.students.map(student=>({...student}))})));
  const source=classes.flatMap(group=>group.students).find(student=>student.id===studentId);
  const [name,setName]=useState(source?.name||"");
  const [newClassId,setNewClassId]=useState("");
  const [newStartDate,setNewStartDate]=useState(semesterStart);
  const memberships=draft.filter(group=>group.students.some(student=>student.id===studentId&&student.active));
  const available=draft.filter(group=>!group.students.some(student=>student.id===studentId&&student.active));
  function patchMembership(groupId:string,patch:{startDate?:string;active?:boolean}){setDraft(current=>current.map(group=>group.id===groupId?{...group,students:group.students.map(student=>student.id===studentId?{...student,...patch}:student)}:group));}
  function addMembership(){if(!newClassId||!source)return;setDraft(current=>current.map(group=>{if(group.id!==newClassId)return group;const existing=group.students.find(student=>student.id===studentId);return {...group,students:existing?group.students.map(student=>student.id===studentId?{...student,name,startDate:newStartDate,active:true}:student):[...group.students,{...source,name,startDate:newStartDate,active:true}].sort((a,b)=>localeCompare(a.name,b.name))};}));setNewClassId("");}
  function save(){const updated=draft.map(group=>({...group,students:group.students.map(student=>student.id===studentId?{...student,name:name.trim()||student.name}:student),updatedAt:new Date().toISOString()}));onSave(updated);}
  return <div className={styles.modalBackdrop}><section className={styles.modal}><div className={styles.modalHead}><div><span className={styles.categoryDots}>{memberships.map(group=><CategoryDot key={group.id} category={group.category}/>)}</span><h2>Dados da criança</h2><p>{memberships.length} turma{memberships.length===1?"":"s"} ativa{memberships.length===1?"":"s"}</p></div><button onClick={onClose}>×</button></div><label>Nome da criança<input value={name} onChange={event=>setName(event.target.value)}/></label><h3>Turmas da criança</h3><div className={styles.enrollmentList}>{memberships.map(group=>{const student=group.students.find(item=>item.id===studentId)!;return <article key={group.id}><CategoryDot category={group.category}/><span><strong>{group.name}</strong><small>{weekdayLabel[group.weekday]}, {group.startTime} · Bola {categoryLabel[group.category]}</small></span><label>Início<input type="date" min={semesterStart} value={student.startDate||semesterStart} onChange={event=>patchMembership(group.id,{startDate:event.target.value})}/></label><button onClick={()=>onOpenClass(group.id)}>Abrir turma</button><button className={styles.removeEnrollment} onClick={()=>{if(confirm(`Retirar ${name} de ${group.name}?`))patchMembership(group.id,{active:false});}}>Retirar</button></article>})}</div>{available.length?<div className={styles.addEnrollment}><h3>Adicionar em outra turma</h3><select value={newClassId} onChange={event=>setNewClassId(event.target.value)}><option value="">Selecione a turma</option>{available.map(group=><option key={group.id} value={group.id}>{group.name}</option>)}</select><label>Início na turma<input type="date" min={semesterStart} value={newStartDate} onChange={event=>setNewStartDate(event.target.value)}/></label><button onClick={addMembership} disabled={!newClassId}>+ Adicionar turma</button></div>:null}<div className={styles.modalActions}><button onClick={onClose}>Cancelar</button><button className={styles.primary} onClick={save}>Salvar criança</button></div></section></div>;
}

function Reports({data,kind,setKind,reportId,setReportId}:{data:KidsData;kind:"student"|"class";setKind:(value:"student"|"class")=>void;reportId:string;setReportId:(value:string)=>void}){
  const students=useMemo(()=>{const map=new Map<string,string>();data.classes.forEach(group=>group.students.filter(item=>item.active).forEach(item=>map.set(item.id,item.name)));return [...map].sort((a,b)=>localeCompare(a[1],b[1]));},[data.classes]);
  const options=kind==="student"?students:data.classes.map(item=>[item.id,item.name] as [string,string]).sort((a,b)=>localeCompare(a[1],b[1]));
  const selected=reportId||options[0]?.[0]||"";const report=buildReport(data,kind,selected);
  function print(){const win=window.open("","_blank","width=900,height=900");if(!win)return;win.document.write(reportHtml(report));win.document.close();win.focus();setTimeout(()=>win.print(),300);}
  async function share(){if(navigator.share){await navigator.share({title:report.title,text:report.text});}else print();}
  return <section className={styles.panel}><div className={styles.panelHead}><div><h2>Relatórios</h2><p>Relatórios profissionais com a identidade CT DS Tennis.</p></div></div><div className={styles.reportToolbar}><select value={kind} onChange={event=>{setKind(event.target.value as "student"|"class");setReportId("");}}><option value="student">Relatório individual</option><option value="class">Relatório da turma</option></select><select value={selected} onChange={event=>setReportId(event.target.value)}>{options.map(([id,name])=><option value={id} key={id}>{name}</option>)}</select><button onClick={print}>Imprimir / PDF</button><button className={styles.primary} onClick={()=>void share()}>Compartilhar</button></div><article className={styles.report}><img src="/logo-ctds.png" alt="CT DS Tennis"/><h2>{report.title}</h2><p>{report.subtitle}</p><div dangerouslySetInnerHTML={{__html:report.body}}/></article></section>;
}

type Report={title:string;subtitle:string;body:string;text:string};
function buildReport(data:KidsData,kind:"student"|"class",id:string):Report{
  const eligible=(lesson:KidsLesson)=>lesson.status!=="HOLIDAY";
  if(kind==="class"){
    const group=data.classes.find(item=>item.id===id);if(!group)return {title:"Relatório",subtitle:"",body:"",text:""};const lessons=data.lessons.filter(item=>item.classId===id);const completed=lessons.filter(item=>item.status==="COMPLETED");const cancelled=lessons.filter(item=>item.status==="CANCELLED");const holiday=lessons.filter(item=>item.status==="HOLIDAY");const rows=group.students.filter(item=>item.active).sort((a,b)=>localeCompare(a.name,b.name)).map(student=>{const present=completed.filter(item=>item.attendance[student.id]==="PRESENT").length;const absent=completed.filter(item=>item.attendance[student.id]==="ABSENT").length;const rate=present+absent?Math.round(present/(present+absent)*100):0;return `<tr><td>${escapeHtml(student.name)}</td><td>${present}</td><td>${absent}</td><td>${rate}%</td></tr>`}).join("");const body=`<div class="metrics"><b>${completed.length}<small>Aulas dadas</small></b><b>${cancelled.length}<small>Canceladas</small></b><b>${holiday.length}<small>Feriados</small></b><b>${lessons.filter(item=>item.replacementStatus==="COMPLETED").length}<small>Reposições</small></b></div><table><thead><tr><th>Aluno</th><th>Presenças</th><th>Faltas</th><th>Frequência</th></tr></thead><tbody>${rows}</tbody></table>`;return {title:group.name,subtitle:`Bola ${categoryLabel[group.category]} · ${weekdayLabel[group.weekday]}, ${group.startTime}`,body,text:`${group.name}: ${completed.length} aulas dadas, ${cancelled.length} canceladas e ${holiday.length} feriados.`};
  }
  const occurrences=data.classes.flatMap(group=>group.students.filter(student=>student.id===id).map(student=>({group,student})));const name=occurrences[0]?.student.name||"Aluno";const lessonSet=data.lessons.filter(lesson=>occurrences.some(item=>item.group.id===lesson.classId&&(!item.student.startDate||item.student.startDate<=lesson.date))&&eligible(lesson));const completed=lessonSet.filter(item=>item.status==="COMPLETED");const present=completed.filter(item=>item.attendance[id]==="PRESENT").length;const absent=completed.filter(item=>item.attendance[id]==="ABSENT").length;const rate=present+absent?Math.round(present/(present+absent)*100):0;const replacements=lessonSet.filter(item=>item.replacementStatus!=="NONE");const contents=completed.filter(item=>item.objective||item.actualPlan).sort((a,b)=>b.date.localeCompare(a.date)).map(item=>`<li><b>${formatDate(item.date)}</b> — ${escapeHtml(item.objective||item.actualPlan)}</li>`).join("");const body=`<div class="metrics"><b>${present}<small>Presenças</small></b><b>${absent}<small>Faltas</small></b><b>${rate}%<small>Frequência</small></b><b>${replacements.filter(item=>item.replacementStatus==="COMPLETED").length}<small>Reposições</small></b></div><h3>Turmas</h3><p>${occurrences.map(item=>escapeHtml(item.group.name)).join(" · ")}</p><h3>Objetivos e conteúdos</h3><ul>${contents||"<li>Nenhum conteúdo registrado.</li>"}</ul>`;return {title:`Relatório de ${name}`,subtitle:`Período: ${formatDate(data.semesterStart)} a ${formatDate(data.semesterEnd)}`,body,text:`${name}: ${present} presenças, ${absent} faltas e ${rate}% de frequência.`};
}
function reportHtml(report:Report){return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(report.title)}</title><style>body{font-family:Arial,sans-serif;color:#173d37;max-width:850px;margin:30px auto;padding:24px}header{display:flex;justify-content:space-between;border-bottom:4px solid #ef7d00;padding-bottom:18px}img{width:160px;object-fit:contain}h1{margin:0}.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:28px 0}.metrics b{border:1px solid #ddd;border-radius:14px;padding:18px;font-size:24px}.metrics small{display:block;font-size:12px;color:#666;margin-top:5px}table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:10px;border-bottom:1px solid #ddd}@media print{body{margin:0}}</style></head><body><header><div><h1>${escapeHtml(report.title)}</h1><p>${escapeHtml(report.subtitle)}</p></div><img src="${location.origin}/logo-ctds.png"></header>${report.body}</body></html>`;}
function escapeHtml(value:string){return value.replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[char]!));}
function compressImage(file:File):Promise<string>{return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=reject;reader.onload=()=>{const image=new Image();image.onerror=reject;image.onload=()=>{const max=1600;const ratio=Math.min(1,max/Math.max(image.width,image.height));const canvas=document.createElement("canvas");canvas.width=Math.round(image.width*ratio);canvas.height=Math.round(image.height*ratio);canvas.getContext("2d")?.drawImage(image,0,0,canvas.width,canvas.height);resolve(canvas.toDataURL("image/jpeg",.82));};image.src=String(reader.result);};reader.readAsDataURL(file);});}
