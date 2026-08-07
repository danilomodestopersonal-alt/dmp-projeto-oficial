"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Assessment, CalendarEvent, Exercise, Session, Student, Workout } from "@/types/models";
import { importedStudents2026 } from "@/lib/imported-data";
import { loadStudents, resetImportedData, saveStudents } from "@/lib/storage";
import { exportStudentSessionsCsv } from "@/lib/export";

type View = "today" | "students" | "workouts-overview" | "history-overview" | "agenda" | "data" | "student" | "workout-editor" | "planned-session" | "free-session" | "attendance-session";
type StudentTab = "summary" | "workouts" | "history" | "assessments";

export default function DmpApp() {
  const router = useRouter();
  const [students, setStudents] = useState<Student[]>(importedStudents2026);
  const [view, setView] = useState<View>("today");
  const [tab, setTab] = useState<StudentTab>("summary");
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [selectedWorkoutId, setSelectedWorkoutId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [studentFilter, setStudentFilter] = useState<"ACTIVE" | "ARCHIVED">("ACTIVE");
  const [showStudentForm, setShowStudentForm] = useState(false);
  const [showEditStudentForm, setShowEditStudentForm] = useState(false);
  const [showAssessmentForm, setShowAssessmentForm] = useState(false);
  const [calendarStatus, setCalendarStatus] = useState<{configured:boolean;connected:boolean}>({configured:false,connected:false});
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [historySearch, setHistorySearch] = useState("");
  const [historySource, setHistorySource] = useState<"ALL"|"PLANNED"|"FREE"|"ATTENDANCE"|"IMPORTED">("ALL");
  const [showGoogleEventForm, setShowGoogleEventForm] = useState(false);

  useEffect(() => setStudents(loadStudents(importedStudents2026)), []);
  useEffect(() => saveStudents(students), [students]);
  useEffect(() => {
    fetch("/api/google/status").then(r=>r.json()).then(setCalendarStatus).catch(()=>{});
  }, []);
  useEffect(() => {
    if (!(view === "today" || view === "agenda") || !calendarStatus.connected) return;
    setCalendarLoading(true);
    fetch(`/api/google/calendar?date=${today()}`)
      .then(async r => r.ok ? r.json() : Promise.reject(await r.json()))
      .then(data => setCalendarEvents(matchCalendarEvents(data.events || [], students)))
      .catch(()=>setCalendarEvents([]))
      .finally(()=>setCalendarLoading(false));
  }, [view, calendarStatus.connected, students]);

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

  if (["today","students","workouts-overview","history-overview","agenda","data"].includes(view)) {
    const activeCount = students.filter(student => student.status === "ACTIVE").length;
    const sessionCount = students.reduce((total, student) => total + student.sessions.length, 0);
    const assessmentCount = students.reduce((total, student) => total + student.assessments.length, 0);
    const todayKey = today();
    const todaySessions = students.flatMap(student => student.sessions.filter(session => session.date === todayKey).map(session => ({student, session})));
    const plannedCount = students.filter(student => student.status === "ACTIVE" && student.workouts.some(workout => workout.active)).length;
    const birthdayStudents = students.filter(student => student.status === "ACTIVE" && isBirthdayToday(student.birthDate));
    const reassessmentDue = students.filter(student => student.status === "ACTIVE" && assessmentDue(student));
    const allHistory = students.flatMap(student=>student.sessions.map(session=>({student,session}))).sort((a,b)=>b.session.date.localeCompare(a.session.date));
    const filteredHistory = allHistory.filter(({student,session}) => { const q=normalizeName(historySearch); const matchText=!q || normalizeName(`${student.name} ${session.workoutName} ${session.notes} ${session.completedExercises.map(ex=>ex.name).join(" ")}`).includes(q); const matchSource=historySource==="ALL" || (session.source||"PLANNED")===historySource; return matchText&&matchSource; });

    return (
      <main className="dashboard-shell">
        <Sidebar current={view} onNavigate={target => setView(target)} logout={logout} />
        <div className="dashboard-main">
          {view === "today" ? <>
            <header className="dashboard-topbar"><div><p className="dashboard-eyebrow">Sua central do dia</p><h1>Hoje</h1><p>{formatLongDate(todayKey)}</p></div><div className="hero-actions"><button className="secondary" onClick={() => setView("students")}>Ver alunos</button><button className="primary" onClick={() => setShowStudentForm(true)}>+ Novo aluno</button></div></header>
            <section className="dashboard-content">
              <div className="dashboard-stats"><Stat icon="👥" label="Alunos ativos" value={activeCount}/><Stat icon="✅" label="Registros hoje" value={todaySessions.length}/><Stat icon="📋" label="Com ficha ativa" value={plannedCount}/></div>
              <CalendarTodayPanel status={calendarStatus} events={calendarEvents} loading={calendarLoading} students={students} todaySessions={todaySessions} onOpenAgenda={() => setView("agenda")} onOpenStudent={openStudent} onStartStudent={(studentId,mode) => { const student=students.find(item=>item.id===studentId); if(!student)return; setSelectedStudentId(studentId); if(mode==="attendance") { setView("attendance-session"); return; } const active=student.workouts.find(item=>item.active); if(active){ setSelectedWorkoutId(active.id); setView("planned-session"); } else { setView("free-session"); } }} />
              <section className="panel today-panel"><div className="panel-head"><div><h2>Atendimentos de hoje</h2><p className="muted">Tudo que já foi salvo hoje aparece aqui.</p></div></div>
                {todaySessions.length ? <div className="today-session-list">{todaySessions.map(({student,session}) => <button className="today-session-row" key={session.id} onClick={() => openStudent(student.id)}><span className="student-avatar small">{student.name.slice(0,1).toUpperCase()}</span><span><strong>{student.name}</strong><small>{sessionSourceLabel(session)}</small></span><span className="today-session-status">✓ Salvo</span></button>)}</div> : <div className="empty-review"><strong>Nenhum atendimento registrado ainda</strong><span>Quando você salvar uma ficha, um treino livre ou uma presença, ele aparecerá aqui.</span></div>}
              </section>
              <section className="panel"><div className="panel-head"><div><h2>Acesso rápido aos alunos</h2><p className="muted">Escolha o aluno e registre a sessão do jeito que aconteceu.</p></div><button className="secondary" onClick={() => setView("students")}>Ver todos</button></div><div className="quick-student-list">{students.filter(student=>student.status==="ACTIVE").slice().sort((a,b)=>a.name.localeCompare(b.name,"pt-BR")).slice(0,12).map(student => <button key={student.id} className="quick-student-row" onClick={() => openStudent(student.id)}><span className="student-avatar small">{student.name.slice(0,1).toUpperCase()}</span><span><strong>{student.name}</strong><small>{student.workouts.some(w=>w.active)?"Com ficha":"Sem ficha"}</small></span><span>›</span></button>)}</div></section>
              {(birthdayStudents.length || reassessmentDue.length) ? <section className="panel smart-alerts"><div className="panel-head"><div><h2>Lembretes inteligentes</h2><p className="muted">O que merece sua atenção hoje.</p></div></div><div className="smart-alert-grid">{birthdayStudents.map(student=><button key={`b-${student.id}`} className="smart-alert-card birthday" onClick={()=>openStudent(student.id)}><span>🎂</span><strong>Aniversário: {student.name}</strong><small>{calculateAge(student.birthDate)} anos hoje</small></button>)}{reassessmentDue.slice(0,8).map(student=><button key={`r-${student.id}`} className="smart-alert-card" onClick={()=>openStudent(student.id)}><span>📏</span><strong>Reavaliar {student.name}</strong><small>{student.assessments[0]?`Última em ${formatDate(student.assessments[0].date)}`:"Sem avaliação registrada"}</small></button>)}</div></section>:null}
            </section>
          </> : null}

          {view === "students" ? <>
            <header className="dashboard-topbar"><div><p className="dashboard-eyebrow">Painel de atendimento</p><h1>Alunos</h1><p>Cadastros, fichas, observações, restrições e histórico.</p></div><div className="hero-actions"><button className="secondary" onClick={resetData}>Restaurar importação</button><button className="primary" onClick={() => setShowStudentForm(true)}>+ Novo aluno</button></div></header>
            <section className="dashboard-content"><div className="dashboard-stats"><Stat icon="👥" label="Alunos ativos" value={activeCount}/><Stat icon="✅" label="Sessões registradas" value={sessionCount}/><Stat icon="📏" label="Avaliações" value={assessmentCount}/></div>
              <div className="student-toolbar dashboard-toolbar"><input className="search" placeholder="Pesquisar por nome, telefone ou objetivo..." value={search} onChange={event => setSearch(event.target.value)} /><div className="student-filters"><button className={studentFilter === "ACTIVE" ? "filter-active" : "secondary"} onClick={() => setStudentFilter("ACTIVE")}>Ativos</button><button className={studentFilter === "ARCHIVED" ? "filter-active" : "secondary"} onClick={() => setStudentFilter("ARCHIVED")}>Arquivados</button></div></div>
              <div className="student-grid dashboard-student-grid">{visibleStudents.map(student => { const lastSession=student.sessions[0]; const lastAssessment=student.assessments[0]; return <article className="student-card dashboard-student-card" key={student.id}><div className="student-card-top"><div className="student-avatar">{student.name.slice(0,1).toUpperCase()}</div><div><div className="student-name-row"><span className={`dot ${student.status.toLowerCase()}`}/><h2>{student.name}</h2></div><p>{student.goal || "Objetivo não informado"}</p></div></div>{student.restrictions ? <div className="restriction-mini">⚠ {student.restrictions}</div> : null}<div className="student-card-meta"><span><strong>Última sessão</strong>{lastSession ? formatDate(lastSession.date) : "Sem sessões"}</span><span><strong>Última avaliação</strong>{lastAssessment ? formatDate(lastAssessment.date) : "Sem avaliação"}</span></div><div className="student-workflow-badge">{student.workouts.some(workout => workout.active) ? "✓ Com ficha ativa" : "⚡ Sem ficha — registro rápido"}</div><div className="card-actions three-actions"><button className="secondary" onClick={() => openStudent(student.id)}>Abrir</button>{student.workouts.some(workout => workout.active) ? <button className="primary" onClick={() => {const workout=student.workouts.find(item=>item.active);setSelectedStudentId(student.id);setSelectedWorkoutId(workout?.id||null);setView("planned-session");}}>▶ Ficha</button> : <button className="primary" onClick={()=>{setSelectedStudentId(student.id);setView("free-session");}}>✍ Treino</button>}<button className="secondary" onClick={()=>{setSelectedStudentId(student.id);setView("attendance-session");}}>✓ Presença</button></div></article>;})}</div>
            </section>
          </> : null}

          {view === "workouts-overview" ? <><header className="dashboard-topbar"><div><p className="dashboard-eyebrow">Biblioteca por aluno</p><h1>Treinos</h1><p>Veja rapidamente quem tem ficha ativa e entre para criar ou editar.</p></div></header><section className="dashboard-content"><div className="dashboard-stats"><Stat icon="📋" label="Com ficha ativa" value={plannedCount}/><Stat icon="⚡" label="Sem ficha ativa" value={activeCount-plannedCount}/><Stat icon="👥" label="Alunos ativos" value={activeCount}/></div><div className="overview-list">{students.filter(s=>s.status==="ACTIVE").sort((a,b)=>a.name.localeCompare(b.name,"pt-BR")).map(student => {const active=student.workouts.find(w=>w.active);return <button className="overview-row" key={student.id} onClick={()=>openStudent(student.id)}><span><strong>{student.name}</strong><small>{active ? `${active.name} · ${active.exercises.length} exercícios` : "Sem ficha ativa"}</small></span><span className={active?"status-chip ok":"status-chip"}>{active?"Ficha ativa":"Sem ficha"}</span></button>})}</div></section></> : null}

          {view === "history-overview" ? <><header className="dashboard-topbar"><div><p className="dashboard-eyebrow">Linha do tempo</p><h1>Histórico</h1><p>Pesquise qualquer sessão por aluno, exercício, observação ou tipo de registro.</p></div></header><section className="dashboard-content"><div className="history-toolbar"><input className="search" placeholder="Buscar aluno, exercício ou observação..." value={historySearch} onChange={e=>setHistorySearch(e.target.value)}/><select value={historySource} onChange={e=>setHistorySource(e.target.value as any)}><option value="ALL">Todos os tipos</option><option value="PLANNED">Ficha concluída</option><option value="FREE">Treino registrado</option><option value="ATTENDANCE">Presença</option><option value="IMPORTED">Importado</option></select><span className="status-chip ok">{filteredHistory.length} registro{filteredHistory.length===1?"":"s"}</span></div><div className="overview-list">{filteredHistory.slice(0,500).map(({student,session})=><button className="overview-row" key={session.id} onClick={()=>openStudent(student.id)}><span><strong>{formatDate(session.date)} · {student.name}</strong><small>{session.workoutName}{session.notes?` — ${session.notes}`:""}</small></span><span className="status-chip ok">{sessionSourceLabel(session)}</span></button>)}</div></section></> : null}

          {view === "agenda" ? <><header className="dashboard-topbar"><div><p className="dashboard-eyebrow">Central do dia</p><h1>Agenda</h1><p>Seus compromissos do Google Calendar dentro do DMP.</p></div></header><section className="dashboard-content"><CalendarAgenda status={calendarStatus} events={calendarEvents} loading={calendarLoading} students={students} onOpenStudent={openStudent} onStatusChange={setCalendarStatus} onRefresh={()=>{setCalendarLoading(true);fetch(`/api/google/calendar?date=${today()}`).then(r=>r.json()).then(data=>setCalendarEvents(matchCalendarEvents(data.events||[],students))).finally(()=>setCalendarLoading(false));}} onNewEvent={()=>setShowGoogleEventForm(true)} /></section></> : null}
          {view === "data" ? <DataCenter students={students} onReplace={setStudents} /> : null}
        </div>
        {showStudentForm ? <StudentForm title="Novo aluno" onClose={() => setShowStudentForm(false)} onSave={createStudent} /> : null}
        {showGoogleEventForm ? <GoogleEventForm students={students} onClose={()=>setShowGoogleEventForm(false)} onSaved={()=>{setShowGoogleEventForm(false);setCalendarLoading(true);fetch(`/api/google/calendar?date=${today()}`).then(r=>r.json()).then(data=>setCalendarEvents(matchCalendarEvents(data.events||[],students))).finally(()=>setCalendarLoading(false));}} /> : null}
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
              <button className={activeWorkout ? "secondary" : "primary"} onClick={() => setView("free-session")}>✍ Registrar treino realizado</button><button className="secondary" onClick={() => setView("attendance-session")}>✓ Registrar presença</button>
              <button className="secondary" onClick={() => setShowEditStudentForm(true)}>Editar aluno</button>
              <button className="secondary" onClick={toggleArchive}>{selectedStudent.status === "ACTIVE" ? "Arquivar" : "Reativar"}</button>
            </div>
          </div>

          <StudentProfileSnapshot student={selectedStudent} activeWorkout={activeWorkout} />

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
              <button className="secondary" onClick={() => setView("free-session")}>Registrar depois</button><button className="secondary" onClick={() => setView("attendance-session")}>Só presença</button>
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
  if (view === "attendance-session") return <AttendanceSessionScreen student={selectedStudent} onBack={() => setView("student")} onSave={saveSession} />;
  return <FreeSessionScreen student={selectedStudent} onBack={() => setView("student")} onSave={saveSession} />;
}


function CalendarTodayPanel({status,events,loading,students,todaySessions,onOpenAgenda,onOpenStudent,onStartStudent}:{status:{configured:boolean;connected:boolean};events:CalendarEvent[];loading:boolean;students:Student[];todaySessions:{student:Student;session:Session}[];onOpenAgenda:()=>void;onOpenStudent:(id:string)=>void;onStartStudent:(id:string,mode:"session"|"attendance")=>void}) {
  const completedIds = new Set(todaySessions.map(item=>item.student.id));
  return <section className="panel calendar-today-panel"><div className="panel-head"><div><h2>Agenda de hoje</h2><p className="muted">Sua agenda oficial do Google, agora ligada ao fluxo do DMP.</p></div><button className="secondary" onClick={onOpenAgenda}>Abrir agenda</button></div>
    {!status.configured ? <div className="calendar-empty"><strong>Integração pronta no aplicativo</strong><span>Falta apenas configurar as credenciais do Google para conectar sua agenda.</span></div> : !status.connected ? <div className="calendar-empty"><strong>Google Agenda ainda não conectado</strong><span>Abra a aba Agenda e toque em “Conectar Google”.</span></div> : loading ? <div className="calendar-empty"><span>Carregando compromissos...</span></div> : events.length ? <div className="calendar-preview-list">{events.slice(0,10).map(event=>{const student=students.find(item=>item.id===event.matchedStudentId);const done=Boolean(student&&completedIds.has(student.id));return <article key={event.id} className={`calendar-preview-row central-row ${done?"event-done":""}`}><span className="calendar-time">{formatCalendarTime(event)}</span><button className="calendar-event-main" onClick={()=>student?onOpenStudent(student.id):onOpenAgenda()}><strong>{event.summary}</strong><small>{student?`${student.name} · ${student.workouts.some(w=>w.active)?"com ficha":"sem ficha"}`:"Compromisso da agenda"}</small></button>{student?<div className="calendar-row-actions"><span className={done?"status-chip ok":"status-chip waiting"}>{done?"✓ Finalizado":calendarEventStatus(event)}</span>{!done?<><button className="primary compact-action" onClick={()=>onStartStudent(student.id,"session")}>{student.workouts.some(w=>w.active)?"▶ Iniciar":"✍ Registrar"}</button><button className="secondary compact-action" onClick={()=>onStartStudent(student.id,"attendance")}>✓ Presença</button></>:null}</div>:<span className="status-chip">Agenda</span>}</article>})}</div> : <div className="calendar-empty"><strong>Nenhum compromisso hoje</strong><span>Sua agenda Google está conectada.</span></div>}
  </section>;
}

function CalendarAgenda({status,events,loading,students,onOpenStudent,onStatusChange,onRefresh,onNewEvent}:{status:{configured:boolean;connected:boolean};events:CalendarEvent[];loading:boolean;students:Student[];onOpenStudent:(id:string)=>void;onStatusChange:(value:{configured:boolean;connected:boolean})=>void;onRefresh:()=>void;onNewEvent:()=>void}) {
  async function disconnect(){await fetch("/api/google/disconnect",{method:"POST"});onStatusChange({...status,connected:false});}
  async function removeEvent(id:string){if(!confirm("Excluir este compromisso do Google Calendar?"))return;const r=await fetch(`/api/google/events?id=${encodeURIComponent(id)}`,{method:"DELETE"});if(r.ok)onRefresh();else alert("Não foi possível excluir o compromisso.");}
  return <>
    <section className="panel agenda-connect"><div className="agenda-icon">📅</div><div className="agenda-connect-main"><h2>Google Calendar</h2><p>O Google continua sendo a agenda oficial, mas o DMP pode ler, criar e excluir compromissos ligados ao seu fluxo de atendimento.</p><div className="agenda-roadmap"><span>✓ Leitura da agenda</span><span>✓ Identificação automática do aluno</span><span>✓ Abrir ficha pelo compromisso</span><span>✓ Criar compromisso pelo DMP</span><span>✓ Excluir compromisso pelo DMP</span></div></div><div className="agenda-actions">{!status.configured?<span className="status-chip">Configuração pendente</span>:status.connected?<><span className="status-chip ok">Conectado</span><button className="primary" onClick={onNewEvent}>+ Compromisso</button><button className="secondary" onClick={onRefresh}>Atualizar</button><button className="secondary" onClick={disconnect}>Desconectar</button></>:<a className="primary button-link" href="/api/google/auth">Conectar Google</a>}</div></section>
    {!status.configured?<section className="panel setup-panel"><h2>Uma configuração única</h2><p>Para ativar, crie as credenciais OAuth no Google Cloud e configure <code>GOOGLE_CLIENT_ID</code>, <code>GOOGLE_CLIENT_SECRET</code> e <code>APP_URL</code>. Depois o mesmo login funciona no computador e no celular.</p></section>:null}
    {status.connected?<section className="panel"><div className="panel-head"><div><h2>Compromissos de hoje</h2><p className="muted">{formatLongDate(today())}</p></div><span className="status-chip ok">{events.length} evento{events.length===1?"":"s"}</span></div>{loading?<div className="calendar-empty">Carregando agenda...</div>:events.length?<div className="agenda-event-list">{events.map(event=>{const matched=students.find(s=>s.id===event.matchedStudentId);return <article className="agenda-event-row" key={event.id}><div className="agenda-event-time">{formatCalendarTime(event)}</div><div className="agenda-event-body"><strong>{event.summary}</strong>{event.location?<small>📍 {event.location}</small>:null}{event.description?<small>{event.description}</small>:null}{matched?<button className="calendar-student-link" onClick={()=>onOpenStudent(matched.id)}>👤 Abrir {matched.name}</button>:<small className="muted">Sem aluno correspondente no DMP</small>}</div><div className="agenda-event-actions">{event.htmlLink?<a className="secondary button-link compact-action" href={event.htmlLink} target="_blank" rel="noreferrer">Google</a>:null}<button className="danger-link" onClick={()=>removeEvent(event.id)}>Excluir</button></div></article>})}</div>:<div className="calendar-empty">Nenhum compromisso encontrado para hoje.</div>}</section>:null}
  </>;
}

function GoogleEventForm({students,onClose,onSaved}:{students:Student[];onClose:()=>void;onSaved:()=>void}) {
  const [studentId,setStudentId]=useState("");
  const [summary,setSummary]=useState("");
  const [description,setDescription]=useState("");
  const [location,setLocation]=useState("");
  const [date,setDate]=useState(today());
  const [startTime,setStartTime]=useState("08:00");
  const [endTime,setEndTime]=useState("09:00");
  const [saving,setSaving]=useState(false);
  function chooseStudent(id:string){setStudentId(id);const st=students.find(s=>s.id===id);if(st&&!summary)setSummary(st.name);}
  async function save(event:FormEvent){event.preventDefault();if(!summary.trim())return;setSaving(true);const start=`${date}T${startTime}:00-03:00`;const end=`${date}T${endTime}:00-03:00`;const response=await fetch("/api/google/events",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({summary,description,location,start,end})});setSaving(false);if(response.ok)onSaved();else alert("Não foi possível criar o compromisso. Confira a conexão com o Google.");}
  return <div className="modal-backdrop"><section className="modal"><div className="modal-head"><div><h2>Novo compromisso</h2><p className="muted">Cria diretamente no Google Calendar.</p></div><button className="text-button" onClick={onClose}>Fechar</button></div><form className="form-grid" onSubmit={save}><label className="full">Aluno opcional<select value={studentId} onChange={e=>chooseStudent(e.target.value)}><option value="">Sem aluno vinculado</option>{students.filter(s=>s.status==="ACTIVE").sort((a,b)=>a.name.localeCompare(b.name,"pt-BR")).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label><label className="full">Título<input value={summary} onChange={e=>setSummary(e.target.value)} required/></label><label>Data<input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label><label>Local<input value={location} onChange={e=>setLocation(e.target.value)} placeholder="Academia, DS Tennis..."/></label><label>Início<input type="time" value={startTime} onChange={e=>setStartTime(e.target.value)}/></label><label>Fim<input type="time" value={endTime} onChange={e=>setEndTime(e.target.value)}/></label><label className="full">Observação<textarea rows={3} value={description} onChange={e=>setDescription(e.target.value)}/></label><button className="primary full" disabled={saving}>{saving?"Salvando...":"Salvar no Google Calendar"}</button></form></section></div>;
}

function DataCenter({students,onReplace}:{students:Student[];onReplace:(students:Student[])=>void}) {
  const sessions=students.reduce((sum,s)=>sum+s.sessions.length,0);
  const assessments=students.reduce((sum,s)=>sum+s.assessments.length,0);
  function exportBackup(){const payload={version:1,exportedAt:new Date().toISOString(),students};downloadText(`DMP_backup_${today()}.json`,JSON.stringify(payload,null,2),"application/json");}
  async function importBackup(files:FileList|null){const file=files?.[0];if(!file)return;try{const parsed=JSON.parse(await file.text());const incoming=Array.isArray(parsed)?parsed:parsed.students;if(!Array.isArray(incoming))throw new Error();if(!confirm(`Restaurar ${incoming.length} alunos deste backup? Os dados atuais serão substituídos.`))return;onReplace(incoming);}catch{alert("Arquivo de backup inválido.");}}
  function exportAllCsv(){const header=["Aluno","Data","Tipo","Treino","Exercício","Séries","Repetições","Carga","Observações"];const rows=students.flatMap(student=>student.sessions.flatMap(session=>session.completedExercises.length?session.completedExercises.map(ex=>[student.name,session.date,sessionSourceLabel(session),session.workoutName,ex.name,ex.sets,ex.reps,ex.load,session.notes]):[[student.name,session.date,sessionSourceLabel(session),session.workoutName,"","","","",session.notes]]));const csv=[header,...rows].map(row=>row.map(v=>`"${String(v??"").replaceAll('"','""')}"`).join(";")).join("\n");downloadText(`DMP_historico_${today()}.csv`,"\ufeff"+csv,"text/csv;charset=utf-8");}
  return <><header className="dashboard-topbar"><div><p className="dashboard-eyebrow">Segurança e portabilidade</p><h1>Dados</h1><p>Backup, restauração e exportação do seu histórico.</p></div></header><section className="dashboard-content"><div className="dashboard-stats"><Stat icon="👥" label="Alunos" value={students.length}/><Stat icon="✅" label="Sessões" value={sessions}/><Stat icon="📏" label="Avaliações" value={assessments}/></div><div className="data-grid"><article className="panel"><h2>Backup completo</h2><p>Salva alunos, fichas, sessões, avaliações, observações e restrições em um arquivo JSON.</p><button className="primary" onClick={exportBackup}>⬇ Baixar backup</button></article><article className="panel"><h2>Restaurar backup</h2><p>Use um arquivo gerado pelo próprio DMP. A restauração substitui os dados locais atuais.</p><label className="secondary button-link file-button">Selecionar backup<input type="file" accept="application/json,.json" onChange={e=>importBackup(e.target.files)}/></label></article><article className="panel"><h2>Exportar histórico</h2><p>Gera um CSV único com todas as sessões de todos os alunos.</p><button className="secondary" onClick={exportAllCsv}>Exportar CSV geral</button></article><article className="panel"><h2>Importação de planilhas</h2><p>Estrutura reservada para a migração das planilhas históricas. Não altera os dados atuais até você confirmar a importação.</p><span className="status-chip">Próxima etapa</span></article></div></section></>;
}

function Sidebar({current,onNavigate,logout}:{current:View;onNavigate:(view:View)=>void;logout:()=>void}) {
  const items:{view:View;icon:string;label:string}[]=[{view:"today",icon:"🏠",label:"Hoje"},{view:"students",icon:"👥",label:"Alunos"},{view:"workouts-overview",icon:"🏋️",label:"Treinos"},{view:"history-overview",icon:"📋",label:"Histórico"},{view:"agenda",icon:"📅",label:"Agenda"},{view:"data",icon:"💾",label:"Dados"}];
  return <aside className="dashboard-sidebar"><div className="dashboard-logo-card"><img src="/logo-danilo.jpg" alt="Danilo Modesto Personal Trainer" className="dashboard-sidebar-logo" /></div><nav className="dashboard-nav">{items.map(item=><button key={item.view} className={`dashboard-nav-item ${current===item.view?"active":""}`} onClick={()=>onNavigate(item.view)}>{item.icon} {item.label}</button>)}</nav><button className="dashboard-logout" onClick={logout}>Sair</button></aside>;
}
function Stat({icon,label,value}:{icon:string;label:string;value:number}) { return <article className="stat-card"><div className="stat-card-icon">{icon}</div><div><span>{label}</span><strong>{value}</strong></div></article>; }
function Header({title,back}:{title:string;back?:()=>void}) { return <header className="topbar"><div className="header-left">{back ? <button className="text-button" onClick={back}>← Voltar</button> : null}<img src="/logo-danilo.jpg" alt="Danilo Modesto" className="header-logo" /><strong>{title}</strong></div></header>; }

function StudentProfileSnapshot({student,activeWorkout}:{student:Student;activeWorkout?:Workout}) {
  const age=calculateAge(student.birthDate);
  const lastSession=student.sessions[0];
  const alerts=[student.restrictions,student.injuries].filter(Boolean);
  return <section className="profile-snapshot"><div className="snapshot-card"><span>Idade</span><strong>{age!==null?`${age} anos`:"—"}</strong></div><div className="snapshot-card"><span>Modalidade</span><strong>{student.modality||"—"}</strong></div><div className="snapshot-card"><span>Ficha ativa</span><strong>{activeWorkout?.name||"Sem ficha"}</strong></div><div className="snapshot-card"><span>Última sessão</span><strong>{lastSession?formatDate(lastSession.date):"—"}</strong></div>{alerts.length?<div className="snapshot-alert"><span>⚠ Lembretes importantes</span><strong>{alerts.join(" · ")}</strong></div>:<div className="snapshot-alert clear"><span>✓ Cuidados</span><strong>Nenhuma restrição ou dor registrada</strong></div>}</section>;
}

function StudentSummary({student,activeWorkout}:{student:Student;activeWorkout?:Workout}) {
  const age = calculateAge(student.birthDate);
  const months = monthsSince(student.startDate);
  return <div className="detail-grid"><article className="panel"><h2>Resumo rápido</h2><dl className="summary-list"><div><dt>Aluno desde</dt><dd>{student.startDate ? formatDate(student.startDate) : "Não informado"}</dd></div><div><dt>Tempo com você</dt><dd>{months === null ? "Não informado" : formatMonths(months)}</dd></div><div><dt>Nascimento</dt><dd>{student.birthDate ? `${formatDate(student.birthDate)}${age !== null ? ` (${age} anos)` : ""}` : "Não informado"}</dd></div><div><dt>Telefone</dt><dd>{student.phone || "Não informado"}</dd></div><div><dt>E-mail</dt><dd>{student.email || "Não informado"}</dd></div><div><dt>Profissão</dt><dd>{student.profession || "Não informado"}</dd></div><div><dt>Modalidade</dt><dd>{student.modality || "Não informado"}</dd></div><div><dt>Frequência</dt><dd>{student.weeklyFrequency || "Não informado"}</dd></div><div><dt>Treino ativo</dt><dd>{activeWorkout?.name || "Sem treino ativo"}</dd></div></dl></article><article className="panel safety-panel"><h2>⚠ Cuidados do aluno</h2><div className="safety-block important"><strong>Restrições / cuidados</strong><p>{student.restrictions || "Nenhuma restrição registrada."}</p></div><div className="safety-block"><strong>Lesões / dores</strong><p>{student.injuries || "Nenhuma lesão ou dor registrada."}</p></div><div className="safety-block"><strong>Medicações / informações relevantes</strong><p>{student.medications || "Nenhuma informação registrada."}</p></div><div className="safety-block"><strong>Observações gerais</strong><p>{student.notes || "Nenhuma observação registrada."}</p></div>{student.emergencyContact||student.emergencyPhone?<div className="safety-block"><strong>Contato de emergência</strong><p>{[student.emergencyContact,student.emergencyPhone].filter(Boolean).join(" · ")}</p></div>:null}</article></div>;
}

function HistoryPanel({student}:{student:Student}) {
  return <section className="panel"><div className="panel-head"><h2>Histórico de sessões</h2><button className="secondary" onClick={() => exportStudentSessionsCsv(student)}>Exportar CSV</button></div>{student.sessions.length ? student.sessions.map(session => <details className="history-item" key={session.id}><summary><span><strong>{formatDate(session.date)}</strong> — {session.workoutName}</span><small>{sessionSourceLabel(session)}</small></summary>{session.completedExercises.length ? <ul className="simple-list">{session.completedExercises.map(exercise => <li key={exercise.id}>{exercise.block ? `${exercise.block} · ` : ""}{exercise.name}{exercise.sets || exercise.reps ? ` — ${exercise.sets}×${exercise.reps}` : ""}{exercise.load ? ` — ${exercise.load}` : ""}</li>)}</ul> : <p className="muted">Presença registrada sem detalhamento de exercícios.</p>}<p>{session.notes || "Sem observações."}</p></details>) : <p className="muted">Nenhuma sessão registrada.</p>}</section>;
}

function AssessmentPanel({student,onNew}:{student:Student;onNew:()=>void}) {
  return <section className="panel"><div className="panel-head"><h2>Avaliações</h2><button className="primary" onClick={onNew}>+ Nova avaliação</button></div>{student.assessments.length ? student.assessments.map(assessment => <article className="assessment-card" key={assessment.id}><div><strong>{formatDate(assessment.date)}</strong><p>Peso: {displayNumber(assessment.weight,"kg")} · Gordura: {displayNumber(assessment.bodyFatPercent,"%")} · Massa magra: {displayNumber(assessment.leanMass,"kg")}</p></div>{assessment.photos.length ? <div className="assessment-photos">{assessment.photos.map((photo,index) => <img key={index} src={photo} alt={`Avaliação ${index+1}`} />)}</div> : null}</article>) : <p className="muted">Nenhuma avaliação registrada.</p>}</section>;
}

type StudentFormPayload = Pick<Student,"name"|"phone"|"email"|"goal"|"profession"|"modality"|"weeklyFrequency"|"notes"|"restrictions"|"injuries"|"medications"|"emergencyContact"|"emergencyPhone"|"startDate"|"birthDate">;
function StudentForm({title,initialStudent,onClose,onSave}:{title:string;initialStudent?:Student;onClose:()=>void;onSave:(payload:StudentFormPayload)=>void}) {
  const [form,setForm]=useState<StudentFormPayload>({name:initialStudent?.name||"",phone:initialStudent?.phone||"",email:initialStudent?.email||"",goal:initialStudent?.goal||"",profession:initialStudent?.profession||"",modality:initialStudent?.modality||"",weeklyFrequency:initialStudent?.weeklyFrequency||"",notes:initialStudent?.notes||"",restrictions:initialStudent?.restrictions||"",injuries:initialStudent?.injuries||"",medications:initialStudent?.medications||"",emergencyContact:initialStudent?.emergencyContact||"",emergencyPhone:initialStudent?.emergencyPhone||"",startDate:initialStudent?.startDate||"",birthDate:initialStudent?.birthDate||""});
  const age=calculateAge(form.birthDate);
  function submit(event:FormEvent){event.preventDefault();if(!form.name.trim())return;onSave({...form,name:form.name.trim()});}
  return <div className="modal-backdrop"><section className="modal modal-large"><div className="modal-head"><div><h2>{title}</h2><p className="muted">Cadastro completo para atendimento e segurança.</p></div><button className="text-button" onClick={onClose}>Fechar</button></div><form className="form-grid" onSubmit={submit}>
    <label>Nome<input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} required /></label><label>Telefone<input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} /></label>
    <label>E-mail<input type="email" value={form.email||""} onChange={e=>setForm({...form,email:e.target.value})} /></label><label>Profissão<input value={form.profession||""} onChange={e=>setForm({...form,profession:e.target.value})} /></label>
    <label>Data de início<input type="date" value={form.startDate} onChange={e=>setForm({...form,startDate:e.target.value})} /></label><label>Data de nascimento<input type="date" value={form.birthDate} onChange={e=>setForm({...form,birthDate:e.target.value})} />{age!==null?<small>Idade atual: {age} anos</small>:null}</label>
    <label>Modalidade<input value={form.modality||""} onChange={e=>setForm({...form,modality:e.target.value})} placeholder="Ex.: musculação, tênis, corrida" /></label><label>Frequência semanal<input value={form.weeklyFrequency||""} onChange={e=>setForm({...form,weeklyFrequency:e.target.value})} placeholder="Ex.: 2x por semana" /></label>
    <label className="full">Objetivo<input value={form.goal} onChange={e=>setForm({...form,goal:e.target.value})} /></label>
    <label className="full">⚠ Restrições / cuidados importantes<textarea rows={3} value={form.restrictions} onChange={e=>setForm({...form,restrictions:e.target.value})} placeholder="O que você precisa lembrar antes de prescrever ou iniciar a aula." /></label>
    <label className="full">Lesões / dores<textarea rows={3} value={form.injuries||""} onChange={e=>setForm({...form,injuries:e.target.value})} /></label>
    <label className="full">Medicações / informações relevantes<textarea rows={2} value={form.medications||""} onChange={e=>setForm({...form,medications:e.target.value})} /></label>
    <label>Contato de emergência<input value={form.emergencyContact||""} onChange={e=>setForm({...form,emergencyContact:e.target.value})} /></label><label>Telefone emergência<input value={form.emergencyPhone||""} onChange={e=>setForm({...form,emergencyPhone:e.target.value})} /></label>
    <label className="full">Observações gerais<textarea rows={4} value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} /></label><button className="primary full">Salvar aluno</button></form></section></div>;
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
  const [lessonMode,setLessonMode]=useState(false);
  const [currentIndex,setCurrentIndex]=useState(0);
  const [startedAt]=useState(()=>new Date().toISOString());
  function updateExercise(id:string, patch:Partial<Exercise>){setExercises(current=>current.map(item=>item.id===id?{...item,...patch}:item));}
  const completedCount=exercises.filter(ex=>completed[ex.id]).length;
  const currentExercise=exercises[currentIndex];
  if(lessonMode && currentExercise){
    const previous=findPreviousExercise(student,currentExercise.name);
    return <main className="app-page lesson-mode-page"><Header title={`${student.name} — Modo aula`} back={()=>setLessonMode(false)}/><section className="content lesson-mode-content">
      {student.restrictions||student.injuries?<div className="session-alert"><strong>⚠ Atenção com {student.name}</strong><span>{[student.restrictions,student.injuries].filter(Boolean).join(" · ")}</span></div>:null}
      <div className="lesson-progress"><span>Exercício {currentIndex+1} de {exercises.length}</span><div><i style={{width:`${((currentIndex+1)/Math.max(1,exercises.length))*100}%`}}/></div></div>
      <article className="panel lesson-card"><div className="lesson-card-top"><span className="status-chip">{currentExercise.block||`#${currentIndex+1}`}</span><label className="exercise-check"><input type="checkbox" checked={completed[currentExercise.id]??true} onChange={e=>setCompleted(current=>({...current,[currentExercise.id]:e.target.checked}))}/><span>Realizado</span></label></div><h1>{currentExercise.name}</h1>{previous?<div className="previous-load"><span>Última execução</span><strong>{previous.sets&&previous.reps?`${previous.sets}×${previous.reps}`:""}{previous.load?` · ${previous.load}`:""}</strong><small>{formatDate(previous.date)}</small></div>:<div className="previous-load muted">Sem execução anterior encontrada.</div>}<div className="planned-fields lesson-fields"><label>Séries<input value={currentExercise.sets} onChange={e=>updateExercise(currentExercise.id,{sets:e.target.value})}/></label><label>Repetições<input value={currentExercise.reps} onChange={e=>updateExercise(currentExercise.id,{reps:e.target.value})}/></label><label>Carga<input value={currentExercise.load} onChange={e=>updateExercise(currentExercise.id,{load:e.target.value})}/></label></div><div className="lesson-actions"><button className="secondary" disabled={currentIndex===0} onClick={()=>setCurrentIndex(i=>Math.max(0,i-1))}>← Anterior</button><button className="primary" onClick={()=>{setCompleted(current=>({...current,[currentExercise.id]:true}));setCurrentIndex(i=>Math.min(exercises.length-1,i+1));}}>{currentIndex===exercises.length-1?"✓ Último exercício":"Concluir e próximo →"}</button></div></article>
      <button className="secondary" onClick={()=>setLessonMode(false)}>Voltar para ficha completa</button>
    </section></main>;
  }
  return <main className="app-page"><Header title={`${student.name} — Ficha`} back={onBack}/><section className="content narrow">
    {student.restrictions||student.injuries ? <div className="session-alert"><strong>⚠ Atenção com {student.name}</strong><span>{[student.restrictions,student.injuries].filter(Boolean).join(" · ")}</span></div> : null}<div className="session-mode-banner"><span>📋 Ficha ativa</span><strong>{workout?.name||"Treino planejado"}</strong><small>{completedCount}/{exercises.length} exercícios marcados</small><button className="secondary compact-button" onClick={()=>setLessonMode(true)}>▶ Modo aula</button></div>
    <div className="session-list">{exercises.map(ex=>{const previous=findPreviousExercise(student,ex.name);return <article className={`session-exercise planned-row ${completed[ex.id]?"is-done":""}`} key={ex.id}>
      <label className="exercise-check"><input type="checkbox" checked={completed[ex.id]??true} onChange={e=>setCompleted(current=>({...current,[ex.id]:e.target.checked}))}/><span>Feito</span></label>
      <div className="planned-exercise-main"><input className="planned-name" value={ex.name} onChange={e=>updateExercise(ex.id,{name:e.target.value})}/>{previous?<small className="last-load-inline">Última: {previous.sets&&previous.reps?`${previous.sets}×${previous.reps}`:""}{previous.load?` · ${previous.load}`:""} · {formatDate(previous.date)}</small>:null}<div className="planned-fields"><input placeholder="Bloco" value={ex.block||""} onChange={e=>updateExercise(ex.id,{block:e.target.value})}/><input placeholder="Séries" value={ex.sets} onChange={e=>updateExercise(ex.id,{sets:e.target.value})}/><input placeholder="Reps" value={ex.reps} onChange={e=>updateExercise(ex.id,{reps:e.target.value})}/><input placeholder="Carga" value={ex.load} onChange={e=>updateExercise(ex.id,{load:e.target.value})}/></div></div>
    </article>})}</div>
    <div className="panel form-stack"><label>Data<input type="date" value={sessionDate} onChange={e=>setSessionDate(e.target.value)}/></label><label>Alterações / observações<textarea rows={6} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Ex.: troquei o C1, bloco 4 não foi feito, aumentar carga no próximo..."/></label><button className="primary finish-button" onClick={()=>onSave({id:crypto.randomUUID(),date:sessionDate,workoutName:workout?.name||"Treino planejado",notes,completedExercises:exercises.filter(ex=>completed[ex.id]),source:"PLANNED",startedAt,finishedAt:new Date().toISOString()})}>✓ Finalizar e salvar treino</button></div>
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
    <article className="panel form-stack quick-register-panel">{student.restrictions ? <div className="session-alert"><strong>⚠ Atenção com {student.name}</strong><span>{student.restrictions}</span></div> : null}<div className="session-mode-banner free"><span>⚡ Sem precisar de ficha</span><strong>Registre depois da aula</strong><small>Fale ou escreva exatamente como você costuma me contar o treino.</small></div><label>Data<input type="date" value={sessionDate} onChange={e=>setSessionDate(e.target.value)}/></label><label>Nome / foco da sessão<input value={focus} onChange={e=>setFocus(e.target.value)} placeholder="Ex.: Peito + core, Full body, MMII..."/></label><label>O que foi feito<textarea rows={10} value={transcript} onChange={e=>setTranscript(e.target.value)} placeholder={'Ex.: Bloco 1: supino reto 4x12 com 18 kg; agachamento goblet 4x15.\nBloco 2: remada baixa 4x12 45 kg; prancha até a falha.'}/></label><div className="hero-actions"><button className="secondary" onClick={listen}>{listening?"Ouvindo...":"🎤 Falar"}</button><button className="primary" onClick={organize}>Organizar para revisão</button></div></article>
    <article className="panel"><div className="panel-head"><div><h2>Revise antes de salvar</h2><p className="muted">Você pode corrigir bloco, exercício, séries, repetições e carga.</p></div><button className="secondary" onClick={()=>setExercises(current=>[...current,{id:crypto.randomUUID(),block:"",name:"",sets:"",reps:"",load:""}])}>+ Exercício</button></div>{exercises.length? <div className="review-list">{exercises.map(ex=><div className="review-row enhanced" key={ex.id}><input placeholder="Bloco" value={ex.block||""} onChange={e=>updateExercise(ex.id,{block:e.target.value})}/><input className="review-name" placeholder="Exercício" value={ex.name} onChange={e=>updateExercise(ex.id,{name:e.target.value})}/><input placeholder="Séries" value={ex.sets} onChange={e=>updateExercise(ex.id,{sets:e.target.value})}/><input placeholder="Reps" value={ex.reps} onChange={e=>updateExercise(ex.id,{reps:e.target.value})}/><input placeholder="Carga" value={ex.load} onChange={e=>updateExercise(ex.id,{load:e.target.value})}/><button className="danger-link" onClick={()=>setExercises(current=>current.filter(item=>item.id!==ex.id))}>×</button></div>)}</div>:<div className="empty-review"><strong>Ainda não organizado</strong><span>Escreva ou fale o treino e toque em “Organizar para revisão”.</span></div>}<label className="form-stack">Observações / próximos ajustes<textarea rows={4} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Ex.: não fizemos bloco 4; trocar exercício no próximo treino..."/></label><button className="primary finish-button" disabled={!exercises.some(ex=>ex.name.trim())} onClick={()=>onSave({id:crypto.randomUUID(),date:sessionDate,workoutName:focus||"Treino realizado",notes,completedExercises:exercises.filter(ex=>ex.name.trim()),source:"FREE"})}>✓ Salvar no histórico</button></article>
  </section></main>;
}

function AttendanceSessionScreen({student,onBack,onSave}:{student:Student;onBack:()=>void;onSave:(session:Session)=>void}) {
  const [sessionDate,setSessionDate]=useState(today());
  const [notes,setNotes]=useState("");
  return <main className="app-page"><Header title={`${student.name} — Presença`} back={onBack}/><section className="content narrow">
    {student.restrictions ? <div className="session-alert"><strong>⚠ Atenção com {student.name}</strong><span>{student.restrictions}</span></div> : null}
    <article className="panel attendance-panel"><div className="attendance-hero"><div className="attendance-check">✓</div><div><span>Registro simples</span><h1>Marcar que treinou</h1><p>Use quando você quer registrar somente a presença, sem detalhar exercícios.</p></div></div><div className="form-stack"><label>Data<input type="date" value={sessionDate} onChange={e=>setSessionDate(e.target.value)}/></label><label>Observação opcional<textarea rows={5} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Ex.: sessão curta, chegou atrasado, jogou tênis depois..."/></label><button className="primary finish-button" onClick={()=>onSave({id:crypto.randomUUID(),date:sessionDate,workoutName:"Presença",notes,completedExercises:[],source:"ATTENDANCE"})}>✓ Salvar presença</button></div></article>
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


function isBirthdayToday(value:string){if(!value)return false;const [y,m,d]=value.split("-").map(Number);const now=new Date();return m===now.getMonth()+1&&d===now.getDate();}
function assessmentDue(student:Student){const last=student.assessments[0];if(!last)return true;const date=new Date(`${last.date}T12:00:00`);return Date.now()-date.getTime()>1000*60*60*24*90;}
function downloadText(filename:string,content:string,type:string){const blob=new Blob([content],{type});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=filename;a.click();URL.revokeObjectURL(url);}

function findPreviousExercise(student:Student,name:string){const target=normalizeName(name);for(const session of student.sessions){const found=session.completedExercises.find(ex=>normalizeName(ex.name)===target);if(found)return {...found,date:session.date};}return null;}
function normalizeName(value:string){return value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9 ]/g," ").replace(/\s+/g," ").trim();}
function matchCalendarEvents(events:CalendarEvent[],students:Student[]):CalendarEvent[]{return events.map(event=>{const title=normalizeName(`${event.summary} ${event.description||""}`);const match=students.filter(student=>student.status==="ACTIVE").find(student=>{const full=normalizeName(student.name);const parts=full.split(" ").filter(part=>part.length>2);return title.includes(full)||(parts.length>=2&&title.includes(`${parts[0]} ${parts[parts.length-1]}`))||(parts[0]?.length>=4&&title.includes(parts[0]));});return {...event,matchedStudentId:match?.id||null};});}
function formatCalendarTime(event:CalendarEvent){if(event.allDay)return"Dia todo";if(!event.start)return"—";const date=new Date(event.start);return date.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"});}

function calendarEventStatus(event:CalendarEvent){
  if(event.allDay)return"Hoje";
  const start=new Date(event.start).getTime();
  const now=Date.now();
  if(Number.isNaN(start))return"Agendado";
  const diff=Math.round((start-now)/60000);
  if(diff < -60)return"Horário passou";
  if(diff < 0)return"Agora";
  if(diff <= 30)return`Em ${diff} min`;
  return"Agendado";
}

function sessionSourceLabel(session:Session){return session.source==="ATTENDANCE"?"Presença":session.source==="IMPORTED"?"Importado":session.source==="FREE"?"Treino registrado":"Ficha concluída";}
function formatLongDate(value:string){const d=new Date(`${value}T12:00:00`);return d.toLocaleDateString("pt-BR",{weekday:"long",day:"2-digit",month:"long",year:"numeric"});}
function fileToDataUrl(file:File):Promise<string>{return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=reject;reader.readAsDataURL(file);});}
function num(value:string){return value===""?null:Number(value);}
function today(){return new Date().toISOString().slice(0,10);}
function formatDate(value:string){if(!value)return"—";const [year,month,day]=value.split("-");return `${day}/${month}/${year}`;}
function calculateAge(value:string){if(!value)return null;const birth=new Date(`${value}T12:00:00`);const now=new Date();let age=now.getFullYear()-birth.getFullYear();if(now.getMonth()<birth.getMonth()||(now.getMonth()===birth.getMonth()&&now.getDate()<birth.getDate()))age--;return age;}
function monthsSince(value:string){if(!value)return null;const start=new Date(`${value}T12:00:00`);const now=new Date();return Math.max(0,(now.getFullYear()-start.getFullYear())*12+now.getMonth()-start.getMonth());}
function formatMonths(months:number){const years=Math.floor(months/12);const rest=months%12;return [years?`${years} ano${years>1?"s":""}`:"",rest?`${rest} ${rest===1?"mês":"meses"}`:""].filter(Boolean).join(" e ")||"menos de 1 mês";}
function displayNumber(value:number|null|undefined,suffix:string){return value===null||value===undefined?"—":`${Number(value).toLocaleString("pt-BR",{maximumFractionDigits:1})} ${suffix}`;}
function tabLabel(tab:StudentTab){return({summary:"Resumo",workouts:"Treinos",history:"Histórico",assessments:"Avaliações"})[tab];}
