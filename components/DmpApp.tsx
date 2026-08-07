"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Assessment, Exercise, Session, Student, Workout } from "@/types/models";
import { importedStudents2026 } from "@/lib/imported-data";
import { loadStudents, resetImportedData, saveStudents } from "@/lib/storage";
import { exportStudentSessionsCsv } from "@/lib/export";

type View = "students" | "student" | "workout-editor" | "planned-session" | "free-session";
type StudentTab = "summary" | "workouts" | "history" | "assessments";

export default function DmpApp() {
  const router = useRouter();
  const [students, setStudents] = useState<Student[]>(importedStudents2026);
  const [view, setView] = useState<View>("students");
  const [tab, setTab] = useState<StudentTab>("summary");
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [selectedWorkoutId, setSelectedWorkoutId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [studentFilter, setStudentFilter] = useState<"ACTIVE" | "ARCHIVED">("ACTIVE");
  const [showStudentForm, setShowStudentForm] = useState(false);
  const [showEditStudentForm, setShowEditStudentForm] = useState(false);
  const [showAssessmentForm, setShowAssessmentForm] = useState(false);

  useEffect(() => setStudents(loadStudents(importedStudents2026)), []);
  useEffect(() => saveStudents(students), [students]);

  const selectedStudent = students.find(student => student.id === selectedStudentId) || null;
  const selectedWorkout =
    selectedStudent?.workouts.find(workout => workout.id === selectedWorkoutId) ||
    selectedStudent?.workouts.find(workout => workout.active) ||
    null;

  const visibleStudents = useMemo(() => {
    const query = search.toLowerCase().trim();
    return students
      .filter(student => student.status === studentFilter)
      .filter(student =>
        [student.name, student.phone, student.goal, student.notes, student.restrictions]
          .join(" ")
          .toLowerCase()
          .includes(query)
      )
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [students, search, studentFilter]);

  function updateStudentRecord(nextStudent: Student) {
    setStudents(current => current.map(student => student.id === nextStudent.id ? nextStudent : student));
  }

  function goStudents() {
    setView("students");
    setSelectedStudentId(null);
    setSelectedWorkoutId(null);
  }

  function openStudent(id: string) {
    setSelectedStudentId(id);
    setTab("summary");
    setView("student");
  }

  function createStudent(payload: StudentFormPayload) {
    setStudents(current => [{
      ...payload,
      id: crypto.randomUUID(),
      status: "ACTIVE",
      workouts: [],
      sessions: [],
      assessments: []
    }, ...current]);
    setShowStudentForm(false);
  }

  function editStudent(payload: StudentFormPayload) {
    if (!selectedStudent) return;
    updateStudentRecord({...selectedStudent, ...payload});
    setShowEditStudentForm(false);
  }

  function toggleArchive() {
    if (!selectedStudent) return;
    updateStudentRecord({...selectedStudent, status: selectedStudent.status === "ACTIVE" ? "ARCHIVED" : "ACTIVE"});
    goStudents();
  }

  function saveWorkout(workout: Workout) {
    if (!selectedStudent) return;
    const exists = selectedStudent.workouts.some(item => item.id === workout.id);
    const workouts = exists
      ? selectedStudent.workouts.map(item => item.id === workout.id ? workout : item)
      : [{...workout, active:true}, ...selectedStudent.workouts.map(item => ({...item, active:false}))];
    updateStudentRecord({...selectedStudent, workouts});
    setSelectedWorkoutId(workout.id);
    setTab("workouts");
    setView("student");
  }

  function duplicateWorkout() {
    if (!selectedStudent || !selectedWorkout) return;
    const duplicated: Workout = {
      ...selectedWorkout,
      id: crypto.randomUUID(),
      name: `${selectedWorkout.name} - Cópia`,
      active: true,
      exercises: selectedWorkout.exercises.map(exercise => ({...exercise, id:crypto.randomUUID()}))
    };
    updateStudentRecord({
      ...selectedStudent,
      workouts: [duplicated, ...selectedStudent.workouts.map(workout => ({...workout, active:false}))]
    });
    setSelectedWorkoutId(duplicated.id);
    setView("workout-editor");
  }

  function saveSession(session: Session) {
    if (!selectedStudent) return;
    updateStudentRecord({...selectedStudent, sessions:[session, ...selectedStudent.sessions]});
    setTab("history");
    setView("student");
  }

  function saveAssessment(assessment: Assessment) {
    if (!selectedStudent) return;
    updateStudentRecord({...selectedStudent, assessments:[assessment, ...selectedStudent.assessments]});
    setShowAssessmentForm(false);
    setTab("assessments");
  }

  async function logout() {
    await fetch("/api/auth/logout", {method:"POST"});
    router.push("/login");
    router.refresh();
  }

  function resetData() {
    if (!confirm("Restaurar os dados importados de 2026? Alterações locais serão apagadas.")) return;
    resetImportedData();
    setStudents(importedStudents2026);
  }

  if (view === "students") {
    const activeCount = students.filter(student => student.status === "ACTIVE").length;
    const sessionCount = students.reduce((total, student) => total + student.sessions.length, 0);
    const assessmentCount = students.reduce((total, student) => total + student.assessments.length, 0);

    return (
      <main className="dashboard-shell">
        <Sidebar logout={logout} />
        <div className="dashboard-main">
          <header className="dashboard-topbar">
            <div>
              <p className="dashboard-eyebrow">Painel de atendimento</p>
              <h1>Alunos</h1>
              <p>Histórico de 2026 importado da sua planilha.</p>
            </div>
            <div className="hero-actions">
              <button className="secondary" onClick={resetData}>Restaurar importação</button>
              <button className="primary" onClick={() => setShowStudentForm(true)}>+ Novo aluno</button>
            </div>
          </header>

          <section className="dashboard-content">
            <div className="dashboard-stats">
              <Stat icon="👥" label="Alunos ativos" value={activeCount} />
              <Stat icon="✅" label="Sessões de 2026" value={sessionCount} />
              <Stat icon="📏" label="Avaliações" value={assessmentCount} />
            </div>

            <div className="student-toolbar dashboard-toolbar">
              <input className="search" placeholder="Pesquisar por nome, telefone ou objetivo..." value={search} onChange={event => setSearch(event.target.value)} />
              <div className="student-filters">
                <button className={studentFilter === "ACTIVE" ? "filter-active" : "secondary"} onClick={() => setStudentFilter("ACTIVE")}>Ativos</button>
                <button className={studentFilter === "ARCHIVED" ? "filter-active" : "secondary"} onClick={() => setStudentFilter("ARCHIVED")}>Arquivados</button>
              </div>
            </div>

            <div className="student-grid dashboard-student-grid">
              {visibleStudents.map(student => {
                const lastSession = student.sessions[0];
                const lastAssessment = student.assessments[0];
                return (
                  <article className="student-card dashboard-student-card" key={student.id}>
                    <div className="student-card-top">
                      <div className="student-avatar">{student.name.slice(0,1).toUpperCase()}</div>
                      <div>
                        <div className="student-name-row"><span className={`dot ${student.status.toLowerCase()}`} /><h2>{student.name}</h2></div>
                        <p>{student.goal || "Objetivo não informado"}</p>
                      </div>
                    </div>
                    <div className="student-card-meta">
                      <span><strong>Última sessão</strong>{lastSession ? formatDate(lastSession.date) : "Sem sessões"}</span>
                      <span><strong>Última avaliação</strong>{lastAssessment ? formatDate(lastAssessment.date) : "Sem avaliação"}</span>
                    </div>
                    <div className="student-workflow-badge">{student.workouts.some(workout => workout.active) ? "✓ Com ficha ativa" : "⚡ Sem ficha — registro rápido"}</div>
                    <div className="card-actions">
                      <button className="secondary" onClick={() => openStudent(student.id)}>Abrir aluno</button>
                      {student.workouts.some(workout => workout.active) ? (
                        <button className="primary" onClick={() => {
                          const workout = student.workouts.find(item => item.active);
                          setSelectedStudentId(student.id);
                          setSelectedWorkoutId(workout?.id || null);
                          setView("planned-session");
                        }}>▶ Iniciar ficha</button>
                      ) : (
                        <button className="primary" onClick={() => {setSelectedStudentId(student.id); setView("free-session");}}>✍ Registrar o que fez</button>
                      )}
                    </div>
                    {student.workouts.some(workout => workout.active) ? <button className="quick-text-action" onClick={() => {setSelectedStudentId(student.id); setView("free-session");}}>Sem usar a ficha hoje? Registrar treino realizado</button> : null}
                  </article>
                );
              })}
            </div>
          </section>
        </div>

        {showStudentForm ? <StudentForm title="Novo aluno" onClose={() => setShowStudentForm(false)} onSave={createStudent} /> : null}
      </main>
    );
  }

  if (!selectedStudent) return null;

  if (view === "student") {
    const activeWorkout = selectedStudent.workouts.find(workout => workout.active);
    return (
      <main className="app-page">
        <Header title={selectedStudent.name} back={goStudents} />
        <section className="content student-profile-page">
          <div className="hero student-profile-hero">
            <div>
              <span className={`status-pill ${selectedStudent.status === "ARCHIVED" ? "archived" : ""}`}>{selectedStudent.status === "ACTIVE" ? "Ativo" : "Arquivado"}</span>
              <h1>{selectedStudent.name}</h1>
              <p>{selectedStudent.goal || "Objetivo não informado"}</p>
            </div>
            <div className="hero-actions">
              {activeWorkout ? <button className="primary" onClick={() => {setSelectedWorkoutId(activeWorkout.id); setView("planned-session");}}>▶ Iniciar ficha</button> : null}
              <button className={activeWorkout ? "secondary" : "primary"} onClick={() => setView("free-session")}>✍ Registrar treino realizado</button>
              <button className="secondary" onClick={() => setShowEditStudentForm(true)}>Editar aluno</button>
              <button className="secondary" onClick={toggleArchive}>{selectedStudent.status === "ACTIVE" ? "Arquivar" : "Reativar"}</button>
            </div>
          </div>

          <nav className="profile-tabs">
            {(["summary","workouts","history","assessments"] as StudentTab[]).map(item => (
              <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>{tabLabel(item)}</button>
            ))}
          </nav>

          <section className={`workflow-strip ${activeWorkout ? "has-workout" : "no-workout"}`}>
            <div>
              <strong>{activeWorkout ? `Ficha ativa: ${activeWorkout.name}` : "Aluno sem ficha ativa"}</strong>
              <span>{activeWorkout ? "Você pode acompanhar a ficha ou simplesmente registrar no final o que foi feito." : "Dê a aula normalmente e, no final, registre por voz ou texto o que foi realizado."}</span>
            </div>
            <div className="workflow-strip-actions">
              {activeWorkout ? <button className="primary" onClick={() => {setSelectedWorkoutId(activeWorkout.id); setView("planned-session");}}>Iniciar ficha</button> : null}
              <button className="secondary" onClick={() => setView("free-session")}>Registrar depois</button>
            </div>
          </section>

          {tab === "summary" ? <StudentSummary student={selectedStudent} activeWorkout={activeWorkout} /> : null}
          {tab === "workouts" ? (
            <section className="panel">
              <div className="panel-head"><h2>Treinos planejados</h2><div className="hero-actions"><button className="secondary" onClick={() => {setSelectedWorkoutId(activeWorkout?.id || null); setView("workout-editor");}}>{activeWorkout ? "Editar treino" : "Criar treino"}</button>{activeWorkout ? <button className="secondary" onClick={duplicateWorkout}>Duplicar treino</button> : null}{activeWorkout ? <button className="primary" onClick={() => {setSelectedWorkoutId(activeWorkout.id); setView("planned-session");}}>Iniciar treino</button> : null}</div></div>
              {selectedStudent.workouts.length ? selectedStudent.workouts.map(workout => <div className="timeline" key={workout.id}><strong>{workout.name}{workout.active ? " — ativo" : ""}</strong><p>{workout.exercises.length} exercícios</p></div>) : <p className="muted">Nenhum treino planejado. Você ainda pode registrar uma sessão livre.</p>}
            </section>
          ) : null}
          {tab === "history" ? <HistoryPanel student={selectedStudent} /> : null}
          {tab === "assessments" ? <AssessmentPanel student={selectedStudent} onNew={() => setShowAssessmentForm(true)} /> : null}
        </section>

        {showEditStudentForm ? <StudentForm title="Editar aluno" initialStudent={selectedStudent} onClose={() => setShowEditStudentForm(false)} onSave={editStudent} /> : null}
        {showAssessmentForm ? <AssessmentForm onClose={() => setShowAssessmentForm(false)} onSave={saveAssessment} /> : null}
      </main>
    );
  }

  if (view === "workout-editor") return <WorkoutEditor student={selectedStudent} workout={selectedWorkout} onBack={() => setView("student")} onSave={saveWorkout} />;
  if (view === "planned-session") return <PlannedSession student={selectedStudent} workout={selectedWorkout} onBack={() => setView("student")} onSave={saveSession} />;
  return <FreeSessionScreen student={selectedStudent} onBack={() => setView("student")} onSave={saveSession} />;
}

function Sidebar({logout}:{logout:()=>void}) {
  return <aside className="dashboard-sidebar"><div className="dashboard-logo-card"><img src="/logo-danilo.jpg" alt="Danilo Modesto Personal Trainer" className="dashboard-sidebar-logo" /></div><nav className="dashboard-nav"><button className="dashboard-nav-item active">👥 Alunos</button><button className="dashboard-nav-item" disabled>🏋️ Treinos</button><button className="dashboard-nav-item" disabled>📋 Sessões</button></nav><button className="dashboard-logout" onClick={logout}>Sair</button></aside>;
}
function Stat({icon,label,value}:{icon:string;label:string;value:number}) { return <article className="stat-card"><div className="stat-card-icon">{icon}</div><div><span>{label}</span><strong>{value}</strong></div></article>; }
function Header({title,back}:{title:string;back?:()=>void}) { return <header className="topbar"><div className="header-left">{back ? <button className="text-button" onClick={back}>← Voltar</button> : null}<img src="/logo-danilo.jpg" alt="Danilo Modesto" className="header-logo" /><strong>{title}</strong></div></header>; }

function StudentSummary({student,activeWorkout}:{student:Student;activeWorkout?:Workout}) {
  const age = calculateAge(student.birthDate);
  const months = monthsSince(student.startDate);
  return <div className="detail-grid"><article className="panel"><h2>Resumo rápido</h2><dl className="summary-list"><div><dt>Aluno desde</dt><dd>{student.startDate ? formatDate(student.startDate) : "Não informado"}</dd></div><div><dt>Tempo com você</dt><dd>{months === null ? "Não informado" : formatMonths(months)}</dd></div><div><dt>Nascimento</dt><dd>{student.birthDate ? `${formatDate(student.birthDate)}${age !== null ? ` (${age} anos)` : ""}` : "Não informado"}</dd></div><div><dt>Telefone</dt><dd>{student.phone || "Não informado"}</dd></div><div><dt>Treino ativo</dt><dd>{activeWorkout?.name || "Sem treino ativo"}</dd></div></dl></article><article className="panel"><h2>Cuidados e observações</h2><p>{student.restrictions || student.notes || "Nenhuma restrição registrada."}</p></article></div>;
}

function HistoryPanel({student}:{student:Student}) {
  return <section className="panel"><div className="panel-head"><h2>Histórico de sessões</h2><button className="secondary" onClick={() => exportStudentSessionsCsv(student)}>Exportar CSV</button></div>{student.sessions.length ? student.sessions.map(session => <details className="history-item" key={session.id}><summary><span><strong>{formatDate(session.date)}</strong> — {session.workoutName}</span><small>{session.source === "IMPORTED" ? "Importado da planilha" : session.source === "FREE" ? "Sessão livre" : "Treino planejado"}</small></summary><ul className="simple-list">{session.completedExercises.map(exercise => <li key={exercise.id}>{exercise.block ? `${exercise.block} · ` : ""}{exercise.name}{exercise.sets || exercise.reps ? ` — ${exercise.sets}×${exercise.reps}` : ""}{exercise.load ? ` — ${exercise.load}` : ""}</li>)}</ul><p>{session.notes || "Sem observações."}</p></details>) : <p className="muted">Nenhuma sessão registrada.</p>}</section>;
}

function AssessmentPanel({student,onNew}:{student:Student;onNew:()=>void}) {
  return <section className="panel"><div className="panel-head"><h2>Avaliações</h2><button className="primary" onClick={onNew}>+ Nova avaliação</button></div>{student.assessments.length ? student.assessments.map(assessment => <article className="assessment-card" key={assessment.id}><div><strong>{formatDate(assessment.date)}</strong><p>Peso: {displayNumber(assessment.weight,"kg")} · Gordura: {displayNumber(assessment.bodyFatPercent,"%")} · Massa magra: {displayNumber(assessment.leanMass,"kg")}</p></div>{assessment.photos.length ? <div className="assessment-photos">{assessment.photos.map((photo,index) => <img key={index} src={photo} alt={`Avaliação ${index+1}`} />)}</div> : null}</article>) : <p className="muted">Nenhuma avaliação registrada.</p>}</section>;
}

type StudentFormPayload = Pick<Student,"name"|"phone"|"goal"|"notes"|"restrictions"|"startDate"|"birthDate">;
function StudentForm({title,initialStudent,onClose,onSave}:{title:string;initialStudent?:Student;onClose:()=>void;onSave:(payload:StudentFormPayload)=>void}) {
  const [form,setForm]=useState<StudentFormPayload>({name:initialStudent?.name||"",phone:initialStudent?.phone||"",goal:initialStudent?.goal||"",notes:initialStudent?.notes||"",restrictions:initialStudent?.restrictions||"",startDate:initialStudent?.startDate||"",birthDate:initialStudent?.birthDate||""});
  function submit(event:FormEvent){event.preventDefault();if(!form.name.trim())return;onSave({...form,name:form.name.trim()});}
  return <div className="modal-backdrop"><section className="modal modal-large"><div className="modal-head"><h2>{title}</h2><button className="text-button" onClick={onClose}>Fechar</button></div><form className="form-grid" onSubmit={submit}><label>Nome<input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} required /></label><label>Telefone<input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} /></label><label>Data de início<input type="date" value={form.startDate} onChange={e=>setForm({...form,startDate:e.target.value})} /></label><label>Data de nascimento<input type="date" value={form.birthDate} onChange={e=>setForm({...form,birthDate:e.target.value})} /></label><label className="full">Objetivo<input value={form.goal} onChange={e=>setForm({...form,goal:e.target.value})} /></label><label className="full">Restrições / lesões<textarea rows={3} value={form.restrictions} onChange={e=>setForm({...form,restrictions:e.target.value})} /></label><label className="full">Observações<textarea rows={3} value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} /></label><button className="primary full">Salvar aluno</button></form></section></div>;
}

function WorkoutEditor({student,workout,onBack,onSave}:{student:Student;workout:Workout|null;onBack:()=>void;onSave:(workout:Workout)=>void}) {
  const [name,setName]=useState(workout?.name||"Treino A"); const [week,setWeek]=useState(workout?.week||1); const [exercises,setExercises]=useState<Exercise[]>(workout?.exercises||[]);
  return <main className="app-page"><Header title={`Treino de ${student.name}`} back={onBack}/><section className="content narrow"><div className="panel form-stack"><label>Nome do treino<input value={name} onChange={e=>setName(e.target.value)} /></label><label>Semana<input type="number" min="1" value={week} onChange={e=>setWeek(Number(e.target.value))}/></label><div className="exercise-editor-list">{exercises.map((exercise,index)=><div className="exercise-editor-row" key={exercise.id}><strong>{index+1}</strong><input placeholder="Bloco" value={exercise.block||""} onChange={e=>setExercises(current=>current.map(item=>item.id===exercise.id?{...item,block:e.target.value}:item))}/><input placeholder="Exercício" value={exercise.name} onChange={e=>setExercises(current=>current.map(item=>item.id===exercise.id?{...item,name:e.target.value}:item))}/><input placeholder="Séries" value={exercise.sets} onChange={e=>setExercises(current=>current.map(item=>item.id===exercise.id?{...item,sets:e.target.value}:item))}/><input placeholder="Reps" value={exercise.reps} onChange={e=>setExercises(current=>current.map(item=>item.id===exercise.id?{...item,reps:e.target.value}:item))}/><input placeholder="Carga" value={exercise.load} onChange={e=>setExercises(current=>current.map(item=>item.id===exercise.id?{...item,load:e.target.value}:item))}/><button className="danger-link" onClick={()=>setExercises(current=>current.filter(item=>item.id!==exercise.id))}>Remover</button></div>)}</div><button className="secondary" onClick={()=>setExercises(current=>[...current,{id:crypto.randomUUID(),block:"",name:"",sets:"3",reps:"12",load:""}])}>+ Adicionar exercício</button><button className="primary" onClick={()=>onSave({id:workout?.id||crypto.randomUUID(),name:name.trim()||"Treino",week,active:true,exercises:exercises.filter(exercise=>exercise.name.trim())})}>Salvar treino</button></div></section></main>;
}

function PlannedSession({student,workout,onBack,onSave}:{student:Student;workout:Workout|null;onBack:()=>void;onSave:(session:Session)=>void}) {
  const [exercises,setExercises]=useState<Exercise[]>((workout?.exercises||[]).map(ex=>({...ex})));
  const [completed,setCompleted]=useState<Record<string,boolean>>(() => Object.fromEntries((workout?.exercises||[]).map(ex=>[ex.id,true])));
  const [notes,setNotes]=useState("");
  const [sessionDate,setSessionDate]=useState(today());
  function updateExercise(id:string, patch:Partial<Exercise>){setExercises(current=>current.map(item=>item.id===id?{...item,...patch}:item));}
  const completedCount=exercises.filter(ex=>completed[ex.id]).length;
  return <main className="app-page"><Header title={`${student.name} — Ficha`} back={onBack}/><section className="content narrow">
    <div className="session-mode-banner"><span>📋 Ficha ativa</span><strong>{workout?.name||"Treino planejado"}</strong><small>{completedCount}/{exercises.length} exercícios marcados</small></div>
    <div className="session-list">{exercises.map(ex=><article className={`session-exercise planned-row ${completed[ex.id]?"is-done":""}`} key={ex.id}>
      <label className="exercise-check"><input type="checkbox" checked={completed[ex.id]??true} onChange={e=>setCompleted(current=>({...current,[ex.id]:e.target.checked}))}/><span>Feito</span></label>
      <div className="planned-exercise-main"><input className="planned-name" value={ex.name} onChange={e=>updateExercise(ex.id,{name:e.target.value})}/><div className="planned-fields"><input placeholder="Bloco" value={ex.block||""} onChange={e=>updateExercise(ex.id,{block:e.target.value})}/><input placeholder="Séries" value={ex.sets} onChange={e=>updateExercise(ex.id,{sets:e.target.value})}/><input placeholder="Reps" value={ex.reps} onChange={e=>updateExercise(ex.id,{reps:e.target.value})}/><input placeholder="Carga" value={ex.load} onChange={e=>updateExercise(ex.id,{load:e.target.value})}/></div></div>
    </article>)}</div>
    <div className="panel form-stack"><label>Data<input type="date" value={sessionDate} onChange={e=>setSessionDate(e.target.value)}/></label><label>Alterações / observações<textarea rows={6} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Ex.: troquei o C1, bloco 4 não foi feito, aumentar carga no próximo..."/></label><button className="primary finish-button" onClick={()=>onSave({id:crypto.randomUUID(),date:sessionDate,workoutName:workout?.name||"Treino planejado",notes,completedExercises:exercises.filter(ex=>completed[ex.id]),source:"PLANNED"})}>✓ Finalizar e salvar treino</button></div>
  </section></main>;
}

function FreeSessionScreen({student,onBack,onSave}:{student:Student;onBack:()=>void;onSave:(session:Session)=>void}) {
  const [transcript,setTranscript]=useState("");
  const [focus,setFocus]=useState("Treino realizado");
  const [notes,setNotes]=useState("");
  const [sessionDate,setSessionDate]=useState(today());
  const [exercises,setExercises]=useState<Exercise[]>([]);
  const [listening,setListening]=useState(false);
  function organize(){setExercises(parseTranscript(transcript));}
  function updateExercise(id:string,patch:Partial<Exercise>){setExercises(current=>current.map(item=>item.id===id?{...item,...patch}:item));}
  function listen(){const SpeechRecognition=(window as any).SpeechRecognition||(window as any).webkitSpeechRecognition;if(!SpeechRecognition){alert("O reconhecimento de voz não está disponível neste navegador. Use o campo de texto.");return;}const recognition=new SpeechRecognition();recognition.lang="pt-BR";recognition.interimResults=false;recognition.onstart=()=>setListening(true);recognition.onend=()=>setListening(false);recognition.onresult=(event:any)=>setTranscript(current=>`${current} ${event.results[0][0].transcript}`.trim());recognition.start();}
  return <main className="app-page"><Header title={`${student.name} — Registro rápido`} back={onBack}/><section className="content free-session-layout">
    <article className="panel form-stack quick-register-panel"><div className="session-mode-banner free"><span>⚡ Sem precisar de ficha</span><strong>Registre depois da aula</strong><small>Fale ou escreva exatamente como você costuma me contar o treino.</small></div><label>Data<input type="date" value={sessionDate} onChange={e=>setSessionDate(e.target.value)}/></label><label>Nome / foco da sessão<input value={focus} onChange={e=>setFocus(e.target.value)} placeholder="Ex.: Peito + core, Full body, MMII..."/></label><label>O que foi feito<textarea rows={10} value={transcript} onChange={e=>setTranscript(e.target.value)} placeholder={'Ex.: Bloco 1: supino reto 4x12 com 18 kg; agachamento goblet 4x15.\nBloco 2: remada baixa 4x12 45 kg; prancha até a falha.'}/></label><div className="hero-actions"><button className="secondary" onClick={listen}>{listening?"Ouvindo...":"🎤 Falar"}</button><button className="primary" onClick={organize}>Organizar para revisão</button></div></article>
    <article className="panel"><div className="panel-head"><div><h2>Revise antes de salvar</h2><p className="muted">Você pode corrigir bloco, exercício, séries, repetições e carga.</p></div><button className="secondary" onClick={()=>setExercises(current=>[...current,{id:crypto.randomUUID(),block:"",name:"",sets:"",reps:"",load:""}])}>+ Exercício</button></div>{exercises.length? <div className="review-list">{exercises.map(ex=><div className="review-row enhanced" key={ex.id}><input placeholder="Bloco" value={ex.block||""} onChange={e=>updateExercise(ex.id,{block:e.target.value})}/><input className="review-name" placeholder="Exercício" value={ex.name} onChange={e=>updateExercise(ex.id,{name:e.target.value})}/><input placeholder="Séries" value={ex.sets} onChange={e=>updateExercise(ex.id,{sets:e.target.value})}/><input placeholder="Reps" value={ex.reps} onChange={e=>updateExercise(ex.id,{reps:e.target.value})}/><input placeholder="Carga" value={ex.load} onChange={e=>updateExercise(ex.id,{load:e.target.value})}/><button className="danger-link" onClick={()=>setExercises(current=>current.filter(item=>item.id!==ex.id))}>×</button></div>)}</div>:<div className="empty-review"><strong>Ainda não organizado</strong><span>Escreva ou fale o treino e toque em “Organizar para revisão”.</span></div>}<label className="form-stack">Observações / próximos ajustes<textarea rows={4} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Ex.: não fizemos bloco 4; trocar exercício no próximo treino..."/></label><button className="primary finish-button" disabled={!exercises.some(ex=>ex.name.trim())} onClick={()=>onSave({id:crypto.randomUUID(),date:sessionDate,workoutName:focus||"Treino realizado",notes,completedExercises:exercises.filter(ex=>ex.name.trim()),source:"FREE"})}>✓ Salvar no histórico</button></article>
  </section></main>;
}

function AssessmentForm({onClose,onSave}:{onClose:()=>void;onSave:(assessment:Assessment)=>void}) {
  const [values,setValues]=useState<any>({date:today(),weight:"",height:"",bodyFatPercent:"",fatMass:"",leanMass:"",notes:"",measurements:{},photos:[]});
  const measurementFields:[string,string][]=[["neck","Pescoço"],["shoulders","Ombros"],["chest","Tórax"],["waist","Cintura"],["abdomen","Abdômen"],["hips","Quadril"],["rightArm","Braço direito"],["leftArm","Braço esquerdo"],["rightForearm","Antebraço direito"],["leftForearm","Antebraço esquerdo"],["rightThigh","Coxa direita"],["leftThigh","Coxa esquerda"],["rightCalf","Panturrilha direita"],["leftCalf","Panturrilha esquerda"]];
  async function photos(files:FileList|null){if(!files)return;const selected=Array.from(files).slice(0,4);const urls=await Promise.all(selected.map(file=>fileToDataUrl(file)));setValues((current:any)=>({...current,photos:[...current.photos,...urls].slice(0,4)}));}
  return <div className="modal-backdrop"><section className="modal assessment-modal"><div className="modal-head"><h2>Nova avaliação</h2><button className="text-button" onClick={onClose}>Fechar</button></div><div className="form-grid"><label>Data<input type="date" value={values.date} onChange={e=>setValues({...values,date:e.target.value})}/></label><label>Peso (kg)<input type="number" step="0.1" value={values.weight} onChange={e=>setValues({...values,weight:e.target.value})}/></label><label>Altura (cm)<input type="number" step="0.1" value={values.height} onChange={e=>setValues({...values,height:e.target.value})}/></label><label>% de gordura<input type="number" step="0.1" value={values.bodyFatPercent} onChange={e=>setValues({...values,bodyFatPercent:e.target.value})}/></label><label>Peso de gordura (kg)<input type="number" step="0.1" value={values.fatMass} onChange={e=>setValues({...values,fatMass:e.target.value})}/></label><label>Massa magra (kg)<input type="number" step="0.1" value={values.leanMass} onChange={e=>setValues({...values,leanMass:e.target.value})}/></label>{measurementFields.map(([key,label])=><label key={key}>{label} (cm)<input value={values.measurements[key]||""} onChange={e=>setValues({...values,measurements:{...values.measurements,[key]:e.target.value}})}/></label>)}<label className="full">Fotos / relatório<input type="file" accept="image/*" multiple onChange={e=>photos(e.target.files)}/><small>Até 4 imagens. Revise antes de salvar.</small></label><label className="full">Observações<textarea rows={4} value={values.notes} onChange={e=>setValues({...values,notes:e.target.value})}/></label><button className="primary full" onClick={()=>onSave({id:crypto.randomUUID(),date:values.date,weight:num(values.weight),height:num(values.height),bodyFatPercent:num(values.bodyFatPercent),fatMass:num(values.fatMass),leanMass:num(values.leanMass),measurements:values.measurements,notes:values.notes,photos:values.photos})}>Salvar avaliação</button></div></section></div>;
}

function parseTranscript(text:string):Exercise[] {
  let currentBlock="";
  const parts=text.split(/;|\n|\|/).map(part=>part.trim()).filter(Boolean);
  const exercises:Exercise[]=[];
  for(const raw of parts){
    let part=raw;
    const blockMatch=part.match(/^(bloco\s*[a-z0-9]+|[a-e]\d?)\s*[:.-]?\s*/i);
    if(blockMatch){currentBlock=blockMatch[1].replace(/^bloco\s*/i,"Bloco ").trim();part=part.slice(blockMatch[0].length).trim();}
    if(!part) continue;
    const match=part.match(/(\d+)\s*[x×]\s*([\d–—-]+|falha|f)/i);
    const load=part.match(/(?:com|carga|-)?\s*([\d,.]+\s*(?:kg|quilos?|cada lado|kg\/lado))/i);
    let name=part.replace(/\d+\s*[x×]\s*([\d–—-]+|falha|f)/i,"").replace(/(?:com|carga|-)?\s*[\d,.]+\s*(?:kg|quilos?|cada lado|kg\/lado)/i,"").trim().replace(/^[,.-]+|[,.-]+$/g,"").trim();
    exercises.push({id:crypto.randomUUID(),block:currentBlock,name:name||`Exercício ${exercises.length+1}`,sets:match?.[1]||"",reps:match?.[2]||"",load:load?.[1]||""});
  }
  return exercises;
}

function fileToDataUrl(file:File):Promise<string>{return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=reject;reader.readAsDataURL(file);});}
function num(value:string){return value===""?null:Number(value);}
function today(){return new Date().toISOString().slice(0,10);}
function formatDate(value:string){if(!value)return"—";const [year,month,day]=value.split("-");return `${day}/${month}/${year}`;}
function calculateAge(value:string){if(!value)return null;const birth=new Date(`${value}T12:00:00`);const now=new Date();let age=now.getFullYear()-birth.getFullYear();if(now.getMonth()<birth.getMonth()||(now.getMonth()===birth.getMonth()&&now.getDate()<birth.getDate()))age--;return age;}
function monthsSince(value:string){if(!value)return null;const start=new Date(`${value}T12:00:00`);const now=new Date();return Math.max(0,(now.getFullYear()-start.getFullYear())*12+now.getMonth()-start.getMonth());}
function formatMonths(months:number){const years=Math.floor(months/12);const rest=months%12;return [years?`${years} ano${years>1?"s":""}`:"",rest?`${rest} ${rest===1?"mês":"meses"}`:""].filter(Boolean).join(" e ")||"menos de 1 mês";}
function displayNumber(value:number|null|undefined,suffix:string){return value===null||value===undefined?"—":`${Number(value).toLocaleString("pt-BR",{maximumFractionDigits:1})} ${suffix}`;}
function tabLabel(tab:StudentTab){return({summary:"Resumo",workouts:"Treinos",history:"Histórico",assessments:"Avaliações"})[tab];}
