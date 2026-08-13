"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Assessment, CalendarEvent, Exercise, Session, Student, TennisCategory, Workout, WorkoutProtocol, WorkoutSlot } from "@/types/models";
import { importedStudents2026 } from "@/lib/imported-data";
import { loadStudents, resetImportedData, saveStudents } from "@/lib/storage";
import { exportStudentSessionsCsv } from "@/lib/export";
import FinanceiroPage from "@/components/financeiro/FinanceiroPage";
import PerformancePage from "@/components/performance/PerformancePage";
import BackupCenter from "@/components/backup/BackupCenter";
import KidsPage, {type KidsLessonOpenRequest} from "@/components/kids/KidsPage";
import type {KidsCategory} from "@/types/kids";
import type {FinanceData} from "@/types/financeiro";

type View = "today" | "students" | "workouts-overview" | "history-overview" | "assessments-overview" | "agenda" | "finance" | "kids" | "performance" | "data" | "weather" | "student" | "workout-editor" | "planned-session" | "free-session" | "attendance-session";
type StudentTab = "summary" | "workouts" | "history" | "assessments";
type DmpNote = { id:string; text:string; done:boolean; createdAt:string; updatedAt:string };
type AgendaRange = "day" | "week" | "month" | "year" | "list";

const FINANCE_UNLOCK_KEY = "dmp_finance_unlocked_until";
const FINANCE_UNLOCK_MS = 10 * 60 * 1000;
const FINANCE_PIN_SHA256 = "6249017f9372350bfc9cf3456c324bbb3661e1bb5a7a10d61912fd1be650d52f";
const STUDENTS_CHANNEL = "dmp_students_sync";

function isPhoneDevice() {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPod|Mobile/i.test(navigator.userAgent);
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await window.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, "0")).join("");
}

export default function DmpApp() {
  const router = useRouter();
  const [students, setStudents] = useState<Student[]>(importedStudents2026);
  const [studentsLoaded, setStudentsLoaded] = useState(false);
const [cloudWritable, setCloudWritable] = useState(false);
  const [view, setView] = useState<View>("today");
  const [tab, setTab] = useState<StudentTab>("summary");
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [selectedWorkoutId, setSelectedWorkoutId] = useState<string | null>(null);
  const [workoutEditorSlot, setWorkoutEditorSlot] = useState<WorkoutSlot>("A");
  const [search, setSearch] = useState("");
  const [globalSearch, setGlobalSearch] = useState("");
  const [studentFilter, setStudentFilter] = useState<"ACTIVE" | "ARCHIVED">("ACTIVE");
  const [showStudentForm, setShowStudentForm] = useState(false);
  const [showEditStudentForm, setShowEditStudentForm] = useState(false);
  const [showAssessmentForm, setShowAssessmentForm] = useState(false);
  const [workoutToCopy, setWorkoutToCopy] = useState<Workout | null>(null);
  const [calendarStatus, setCalendarStatus] = useState<{configured:boolean;connected:boolean}>({configured:false,connected:false});
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [calendarRange,setCalendarRange]=useState<AgendaRange>("week");
  const [calendarAnchor,setCalendarAnchor]=useState(today());
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarLoaded, setCalendarLoaded] = useState(false);
  const [calendarSync, setCalendarSync] = useState<{dailyAt:string;weeklyAt:string;weeklyCount:number}>({dailyAt:"",weeklyAt:"",weeklyCount:0});
  const [historySearch, setHistorySearch] = useState("");
  const [historySource, setHistorySource] = useState<"ALL"|"PLANNED"|"FREE"|"ATTENDANCE"|"IMPORTED">("ALL");
  const [workoutsOnly, setWorkoutsOnly] = useState(false);
  const [showGoogleEventForm, setShowGoogleEventForm] = useState(false);
  const [showFinancePin, setShowFinancePin] = useState(false);
  const [financePin, setFinancePin] = useState("");
  const [financePinError, setFinancePinError] = useState("");
  const [notes, setNotes] = useState<DmpNote[]>([]);
  const [newNote, setNewNote] = useState("");
  const [notesLoaded, setNotesLoaded] = useState(false);
  const [removedNote, setRemovedNote] = useState<{note:DmpNote;index:number}|null>(null);
  const [editingNoteId, setEditingNoteId] = useState<string|null>(null);
  const [editingNoteText, setEditingNoteText] = useState("");
  const [kidsLessonRequest,setKidsLessonRequest]=useState<KidsLessonOpenRequest|null>(null);
  const [showMobileActions,setShowMobileActions]=useState(false);
  const [homeLayoutMode,setHomeLayoutMode]=useState(false);
  const deepLinkHandled = useRef(false);
  const sessionReturnView = useRef<View>("student");

  // Mantém uma entrada de histórico interna para o botão/gesto Voltar do Android.
  useEffect(() => {
    if (!(window.history.state && window.history.state.dmpRoot)) {
      window.history.replaceState({dmpRoot:true}, "", window.location.href);
      window.history.pushState({dmpGuard:true}, "", window.location.href);
    }
    const rearm=()=>window.history.pushState({dmpGuard:true}, "", window.location.href);
    const onPopState=()=>{
      if(showFinancePin){setShowFinancePin(false);rearm();return;}
      if(showStudentForm){setShowStudentForm(false);rearm();return;}
      if(showEditStudentForm){setShowEditStudentForm(false);rearm();return;}
      if(showAssessmentForm){setShowAssessmentForm(false);rearm();return;}
      if(showGoogleEventForm){setShowGoogleEventForm(false);rearm();return;}
      if(view==="workout-editor"&&!confirm("Voltar sem salvar? Alterações feitas nesta montagem podem ser perdidas.")){rearm();return;}
      if(["workout-editor","planned-session","free-session","attendance-session"].includes(view)){setView("student");rearm();return;}
      if(view==="student"){setView("students");rearm();return;}
      if(view!=="today"){setView("today");rearm();return;}
      // Em Hoje, não rearma: um novo Voltar pode sair normalmente.
    };
    window.addEventListener("popstate",onPopState);
    return()=>window.removeEventListener("popstate",onPopState);
  },[view,showFinancePin,showStudentForm,showEditStudentForm,showAssessmentForm,showGoogleEventForm]);

  useEffect(() => setStudents(loadStudents(importedStudents2026)), []);
useEffect(() => {
  let cancelled = false;

  async function loadStudentsFromCloud() {
    const localStudents = loadStudents(importedStudents2026);

    try {
      const response = await fetch("/api/data", { cache: "no-store" });

      if (!response.ok) {
        throw new Error("Falha ao carregar dados da nuvem");
      }

      const result = await response.json();

      if (!Array.isArray(result.data)) {
        throw new Error("Dados da nuvem inválidos");
      }

      if (cancelled) return;

      setStudents(result.data as Student[]);
      saveStudents(result.data as Student[]);
      setCloudWritable(true);
    } catch (error) {
      console.error("Nuvem indisponível; usando backup local:", error);

      if (cancelled) return;

      setStudents(localStudents);
      setCloudWritable(false);
    } finally {
      if (!cancelled) {
        setStudentsLoaded(true);
      }
    }
  }

  void loadStudentsFromCloud();

  return () => {
    cancelled = true;
  };
}, []);

useEffect(() => {
  if (!studentsLoaded) return;

  saveStudents(students);

  if (!cloudWritable) return;

  const timer = window.setTimeout(() => {
    void fetch("/api/data", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(students),
    }).catch(error => {
      console.error("Erro ao salvar na nuvem:", error);
    });
  }, 300);

  return () => window.clearTimeout(timer);
}, [students, studentsLoaded, cloudWritable]);    

useEffect(() => {
  if (!studentsLoaded || deepLinkHandled.current) return;
  deepLinkHandled.current = true;
  const params = new URLSearchParams(window.location.search);
  if (params.get("mode") !== "planned-session") return;
  const studentId = params.get("student");
  const workoutId = params.get("workout");
  const student = students.find(item => item.id === studentId);
  const workout = student?.workouts.find(item => item.id === workoutId && item.active !== false);
  if (!student || !workout) return;
  setSelectedStudentId(student.id);
  setSelectedWorkoutId(workout.id);
  setView("planned-session");
}, [studentsLoaded, students]);

useEffect(() => {
  const channel = new BroadcastChannel(STUDENTS_CHANNEL);
  channel.onmessage = async () => {
    try {
      const response = await fetch("/api/data", {cache:"no-store"});
      const result = await response.json();
      if (response.ok && Array.isArray(result.data)) {
        setStudents(result.data as Student[]);
        saveStudents(result.data as Student[]);
      }
    } catch {}
  };
  return () => channel.close();
}, []);
useEffect(() => {
  let cancelled=false;
  fetch("/api/notes",{cache:"no-store"}).then(r=>r.json()).then(result=>{
    if(!cancelled&&Array.isArray(result.data)){setNotes(result.data);}
  }).catch(()=>{}).finally(()=>{if(!cancelled)setNotesLoaded(true);});
  return()=>{cancelled=true;};
},[]);

useEffect(()=>{
  if(!notesLoaded)return;
  const timer=window.setTimeout(()=>{
    void fetch("/api/notes",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(notes)}).catch(()=>{});
  },350);
  return()=>window.clearTimeout(timer);
},[notes,notesLoaded]);

useEffect(()=>{
  if(view!=="today")return;
  const cards=[...document.querySelectorAll<HTMLElement>(".home-main-content > *")];
  const desktop=window.matchMedia("(min-width: 901px)").matches;
  cards.forEach((card,index)=>{
    const key=`home-card-${index}`;
    card.dataset.homeCardKey=key;
    const saved=desktop?localStorage.getItem(`dmp_${key}_size`):null;
    if(saved){try{const parsed=JSON.parse(saved);if(parsed.width)card.style.width=`${parsed.width}px`;if(parsed.height)card.style.height=`${parsed.height}px`;}catch{}}
    if(!desktop){card.style.width="";card.style.height="";}
  });
  if(!homeLayoutMode)return;
  const observers=cards.map((card)=>{
    const observer=new ResizeObserver(()=>{
      const rect=card.getBoundingClientRect();
      localStorage.setItem(`dmp_${card.dataset.homeCardKey}_size`,JSON.stringify({width:Math.round(rect.width),height:Math.round(rect.height)}));
    });
    observer.observe(card);
    return observer;
  });
  return()=>observers.forEach(observer=>observer.disconnect());
},[view,homeLayoutMode]);

function resetHomeLayout(){
  for(let index=0;index<20;index++)localStorage.removeItem(`dmp_home-card-${index}_size`);
  document.querySelectorAll<HTMLElement>(".home-main-content > *").forEach(card=>{card.style.width="";card.style.height="";});
}

  function addNote(){const text=newNote.trim();if(!text)return;const now=new Date().toISOString();setNotes(current=>[{id:crypto.randomUUID(),text,done:false,createdAt:now,updatedAt:now},...current]);setNewNote("");}
  function patchNote(id:string,patch:Partial<DmpNote>){setNotes(current=>current.map(note=>note.id===id?{...note,...patch,updatedAt:new Date().toISOString()}:note));}
  function removeNote(id:string){if(!confirm("Excluir este recado?"))return;setNotes(current=>{const index=current.findIndex(note=>note.id===id);if(index<0)return current;setRemovedNote({note:current[index],index});return current.filter(note=>note.id!==id);});}
  function undoNoteRemoval(){if(!removedNote)return;setNotes(current=>{const next=[...current];next.splice(Math.min(removedNote.index,next.length),0,removedNote.note);return next;});setRemovedNote(null);}
  function startEditingNote(note:DmpNote){setEditingNoteId(note.id);setEditingNoteText(note.text);}
  function saveEditedNote(){if(!editingNoteId)return;const text=editingNoteText.trim();if(text)patchNote(editingNoteId,{text});setEditingNoteId(null);setEditingNoteText("");}

useEffect(() => {
fetch("/api/google/status").then(r=>r.json()).then(setCalendarStatus).catch(()=>{});
    try {
      const dailyAt=localStorage.getItem("dmp_calendar_daily_sync")||"";
      const weeklyAt=localStorage.getItem("dmp_calendar_weekly_sync")||"";
      const weeklyCount=Number(localStorage.getItem("dmp_calendar_weekly_count")||"0");
      setCalendarSync({dailyAt,weeklyAt,weeklyCount:Number.isFinite(weeklyCount)?weeklyCount:0});
    } catch {}
  }, []);

  async function refreshCalendarDay(force=false) {
    if (!calendarStatus.connected) return;
    const last=readLocalStorage("dmp_calendar_daily_sync");
    if (!force && calendarLoaded && last && Date.now()-new Date(last).getTime()<CALENDAR_AUTO_REFRESH_MS) return;
    setCalendarLoading(true);
    try {
      const response=await fetch(`/api/google/calendar?date=${today()}&days=14`,{cache:"no-store"});
      if (!response.ok) throw new Error("calendar_day_failed");
      const data=await response.json();
      setCalendarEvents(matchCalendarEvents(data.events||[],students));
      setCalendarLoaded(true);
      const now=new Date().toISOString();
      writeLocalStorage("dmp_calendar_daily_sync",now);
      setCalendarSync(current=>({...current,dailyAt:now}));
    } catch {
      if (force) setCalendarEvents([]);
    } finally {
      setCalendarLoading(false);
    }
  }

  async function refreshCalendarWeek(force=false) {
    if (!calendarStatus.connected || !isSundayInSaoPaulo()) return;
    const last=readLocalStorage("dmp_calendar_weekly_sync");
    if (!force && last && sameSaoPauloDate(last,new Date().toISOString())) return;
    try {
      const response=await fetch(`/api/google/calendar?date=${today()}&days=7`,{cache:"no-store"});
      if (!response.ok) return;
      const data=await response.json();
      const events=Array.isArray(data.events)?data.events:[];
      const now=new Date().toISOString();
      writeLocalStorage("dmp_calendar_week_cache",JSON.stringify(events));
      writeLocalStorage("dmp_calendar_weekly_sync",now);
      writeLocalStorage("dmp_calendar_weekly_count",String(events.length));
      setCalendarSync(current=>({...current,weeklyAt:now,weeklyCount:events.length}));
    } catch {}
  }

  async function refreshCalendarAutomatic(forceDay=false) {
    await refreshCalendarDay(forceDay);
    await refreshCalendarWeek(false);
  }

  useEffect(() => {
    if (!(view === "today" || view === "agenda") || !calendarStatus.connected) return;
    void refreshCalendarAutomatic(false);
  }, [view, calendarStatus.connected, calendarLoaded]);

  useEffect(() => {
    if (!calendarLoaded) return;
    setCalendarEvents(current=>matchCalendarEvents(current,students));
  }, [students,calendarLoaded]);

  // Se um aluno ausente for recolocado manualmente no Google Agenda, restaura o atendimento.
  useEffect(()=>{
    if(!calendarLoaded)return;
    setStudents(current=>{
      let changed=false;
      const next=current.map(student=>{
        const restoredDates=new Set(calendarEvents.filter(event=>getCalendarEventStudents(event,current).some(item=>item.id===student.id)).map(calendarEventDate));
        const sessions=student.sessions.filter(session=>{
          const remove=session.source==="ABSENCE"&&restoredDates.has(session.date);
          if(remove)changed=true;
          return !remove;
        });
        return sessions.length===student.sessions.length?student:{...student,sessions};
      });
      return changed?next:current;
    });
  },[calendarEvents,calendarLoaded]);

  useEffect(() => {
    if (!calendarStatus.connected) return;
    const syncWhenActive=()=>{
      if (document.visibilityState!=="visible") return;
      if (view==="today"||view==="agenda") void refreshCalendarAutomatic(false);
    };
    window.addEventListener("focus",syncWhenActive);
    document.addEventListener("visibilitychange",syncWhenActive);
    const timer=window.setInterval(syncWhenActive,CALENDAR_AUTO_REFRESH_MS);
    return()=>{
      window.removeEventListener("focus",syncWhenActive);
      document.removeEventListener("visibilitychange",syncWhenActive);
      window.clearInterval(timer);
    };
  }, [calendarStatus.connected,view,students,calendarLoaded]);

  const selectedStudent = students.find(student => student.id === selectedStudentId) || null;
  const selectedWorkout =
    selectedStudent?.workouts.find(workout => workout.id === selectedWorkoutId) ||
    (selectedStudent ? getStudentWorkoutEntries(selectedStudent)[0]?.workout : null) ||
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

  const exerciseCatalog = useMemo(() => buildExerciseCatalog(students), [students]);

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
    setSelectedWorkoutId(null);
    setWorkoutEditorSlot("A");
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

  function deleteSelectedStudent() {
    if(!selectedStudent)return;
    if(!confirm(`Excluir definitivamente o cadastro de ${selectedStudent.name}?`))return;
    if(!confirm("Esta ação apaga o cadastro, treinos, histórico e avaliações deste aluno. Confirmar exclusão definitiva?"))return;
    setStudents(current=>current.filter(student=>student.id!==selectedStudent.id));
    setSelectedStudentId(null);
    setView("students");
  }

  function saveWorkout(workout: Workout) {
    if (!selectedStudent) return;

    const slot = workout.slot || workoutEditorSlot;
    const entries = getStudentWorkoutEntries(selectedStudent);
    const collision = entries.find(entry => entry.slot === slot && entry.workout.id !== workout.id)?.workout;
    const base = collision
      ? selectedStudent.workouts.filter(item => item.id !== collision.id)
      : selectedStudent.workouts;
    const normalized: Workout = {...workout, slot, active:true};
    const exists = base.some(item => item.id === normalized.id);
    const workouts = exists
      ? base.map(item => item.id === normalized.id ? normalized : item)
      : [...base, normalized];

    updateStudentRecord({...selectedStudent, workouts});
    setSelectedWorkoutId(normalized.id);
    setWorkoutEditorSlot(slot);
    setTab("workouts");
    setView("student");
  }
  function clearWorkout(workout:Workout) {
    if (!selectedStudent || !confirm(`Limpar o Treino ${workout.slot || ""}? O histórico das aulas será preservado.`)) return;
    updateStudentRecord({...selectedStudent, workouts:selectedStudent.workouts.filter(item=>item.id!==workout.id)});
    setSelectedWorkoutId(null);
  }

  function archiveWorkout(workout: Workout) {
    if (!selectedStudent) return;

    const slot = workout.slot || inferWorkoutSlot(workout, 0);
    const confirmed = confirm(`Arquivar o Treino ${slot}? A ficha ficará em Treinos arquivados e a aba ${slot} será liberada. O histórico das aulas não será alterado.`);
    if (!confirmed) return;

    const archivedWorkout: Workout = {
      ...workout,
      slot,
      active: false,
      archivedAt: today()
    };

    updateStudentRecord({
      ...selectedStudent,
      workouts: selectedStudent.workouts.map(item => item.id === workout.id ? archivedWorkout : item)
    });
    setSelectedWorkoutId(null);
    setWorkoutEditorSlot(slot);
    setTab("workouts");
    setView("student");
  }

  function copyWorkoutToStudent(targetStudentId:string,targetSlot:WorkoutSlot) {
    if(!workoutToCopy)return;
    const target=students.find(student=>student.id===targetStudentId);
    if(!target)return;
    const collision=getStudentWorkoutEntries(target).find(entry=>entry.slot===targetSlot)?.workout;
    if(collision&&!confirm(`${target.name} já possui o Treino ${targetSlot}. Substituir essa ficha pela cópia?`))return;
    const copy:Workout={
      ...workoutToCopy,
      id:crypto.randomUUID(),
      slot:targetSlot,
      name:workoutToCopy.name===`Treino ${workoutToCopy.slot||""}`?`Treino ${targetSlot}`:workoutToCopy.name,
      active:true,
      archivedAt:undefined,
      exercises:workoutToCopy.exercises.map(exercise=>({...exercise,id:crypto.randomUUID()}))
    };
    const base=collision?target.workouts.map(item=>item.id===collision.id?{...item,active:false,archivedAt:today()}:item):target.workouts;
    updateStudentRecord({...target,workouts:[...base,copy]});
    setWorkoutToCopy(null);
  }

  function duplicateWorkout() {
    if (!selectedStudent || !selectedWorkout) return;
    const occupied = new Set(getStudentWorkoutEntries(selectedStudent).map(entry => entry.slot));
    const nextSlot = WORKOUT_SLOTS.find(slot => !occupied.has(slot));
    if (!nextSlot) {
      alert("As quatro abas A, B, C e D já possuem treino.");
      return;
    }
    const duplicated: Workout = {
      ...selectedWorkout,
      id: crypto.randomUUID(),
      slot: nextSlot,
      name: `Treino ${nextSlot}`,
      active: true,
      exercises: selectedWorkout.exercises.map(exercise => ({...exercise, id:crypto.randomUUID()}))
    };
    updateStudentRecord({...selectedStudent, workouts:[...selectedStudent.workouts, duplicated]});
    setSelectedWorkoutId(duplicated.id);
    setWorkoutEditorSlot(nextSlot);
    setView("workout-editor");
  }
  async function saveSession(session: Session) {
    if (!selectedStudent) return;
    try {
      const response = await fetch("/api/data", {cache:"no-store"});
      if (!response.ok) throw new Error();
      const result = await response.json();
      if (!Array.isArray(result.data)) throw new Error();
      const latest = result.data as Student[];
      const target = latest.find(student => student.id === selectedStudent.id);
      if (!target) throw new Error();
      const savedSession={...session,finishedAt:session.finishedAt||new Date().toISOString()};
      const updated = {...target,sessions:[savedSession,...target.sessions.filter(item=>item.id!==session.id)]};
      const next = latest.map(student=>student.id===updated.id?updated:student);
      const saveResponse = await fetch("/api/data",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(next)});
      if (!saveResponse.ok) throw new Error();
      setStudents(next);
      saveStudents(next);
      const channel = new BroadcastChannel(STUDENTS_CHANNEL);
      channel.postMessage({type:"refresh"});
      channel.close();
      if(sessionReturnView.current==="today") setView("today");
      else { setTab("history"); setView("student"); }
      sessionReturnView.current="student";
    } catch {
      alert("Não foi possível salvar esta sessão. Confira a conexão e tente novamente.");
    }
  }

  useEffect(()=>{
    if(view!=="agenda"||!calendarStatus.connected)return;
    const request=agendaRequestRange(calendarAnchor,calendarRange);
    let cancelled=false;
    setCalendarLoading(true);
    fetch(`/api/google/calendar?date=${request.date}&days=${request.days}`,{cache:"no-store"}).then(response=>{
      if(!response.ok)throw new Error("calendar_range_failed");
      return response.json();
    }).then(data=>{
      if(!cancelled)setCalendarEvents(matchCalendarEvents(data.events||[],students));
    }).catch(()=>{}).finally(()=>{if(!cancelled)setCalendarLoading(false);});
    return()=>{cancelled=true;};
  },[view,calendarStatus.connected,calendarAnchor,calendarRange,students]);

  function saveAssessment(assessment: Assessment) {
    if (!selectedStudent) return;
    updateStudentRecord({...selectedStudent, assessments:[assessment, ...selectedStudent.assessments]});
    setShowAssessmentForm(false);
    setTab("assessments");
  }

  function startStudentFlow(studentId:string, mode:"session"|"free"|"attendance", returnTo:View="student") {
    const student = students.find(item => item.id === studentId);
    if (!student) return;

    setSelectedStudentId(studentId);
    sessionReturnView.current=returnTo;

    if (mode === "attendance") {
      setView("attendance-session");
      return;
    }

    if (mode === "free") {
      setSelectedWorkoutId(null);
      setView("free-session");
      return;
    }

    const planned = getStudentWorkoutEntries(student);

    if (!planned.length) {
      setView("free-session");
      return;
    }

    if (planned.length === 1) {
      setSelectedWorkoutId(planned[0].workout.id);
      setView("planned-session");
      return;
    }

    setSelectedWorkoutId(null);
    setTab("workouts");
    setView("student");
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

  function financeUnlocked() {
    if (typeof window === "undefined") return false;
    const until = Number(window.sessionStorage.getItem(FINANCE_UNLOCK_KEY) || 0);
    return until > Date.now();
  }

  function navigateMain(target: View) {
    if (target === "finance" && !isPhoneDevice() && !financeUnlocked()) {
      setFinancePin("");
      setFinancePinError("");
      setShowFinancePin(true);
      return;
    }
    if(target==="workouts-overview")setWorkoutsOnly(false);
    setView(target);
  }

  async function registerAbsence(student:Student,event:CalendarEvent){
    const absence:Session={id:crypto.randomUUID(),date:calendarEventDate(event),workoutName:"Ausência",notes:`Ausência informada para ${event.summary}.`,completedExercises:[],source:"ABSENCE",finishedAt:new Date().toISOString(),calendarEvent:{id:event.id,summary:event.summary,description:event.description,start:event.start,end:event.end,allDay:event.allDay,location:event.location}};
    const remaining=getCalendarEventStudents(event,students).filter(item=>item.id!==student.id);
    const nextSummary=remaining.map(item=>calendarStudentDisplayName(item)).join(" ");
    const firstName=student.name.trim().split(/\s+/)[0]||student.name;
    const nextDescription=(event.description||"").split(/\r?\n/).filter(line=>!normalizeName(line).includes(normalizeName(student.name))&&!normalizeName(line).includes(normalizeName(firstName))).join("\n");
    const response=remaining.length
      ?await fetch("/api/google/events",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({id:event.id,summary:nextSummary,description:nextDescription,location:event.location||"",start:event.start,end:event.end})})
      :await fetch(`/api/google/events?id=${encodeURIComponent(event.id)}`,{method:"DELETE"});
    if(!response.ok){alert("Não foi possível atualizar a agenda Google. A ausência não foi salva.");return;}
    updateStudentRecord({...student,sessions:[absence,...student.sessions]});
    setCalendarEvents(current=>remaining.length?current.map(item=>item.id===event.id?{...item,summary:nextSummary,description:nextDescription,matchedStudentIds:remaining.map(value=>value.id)}:item):current.filter(item=>item.id!==event.id));
  }
  async function registerStudentAbsence(student:Student){
    const event=calendarEvents.find(item=>calendarEventDate(item)===today()&&getCalendarEventStudents(item,students).some(value=>value.id===student.id));
    if(event){await registerAbsence(student,event);return;}
    const absence:Session={id:crypto.randomUUID(),date:today(),workoutName:"Ausência",notes:"Ausência informada pelo cadastro do aluno.",completedExercises:[],source:"ABSENCE",finishedAt:new Date().toISOString()};
    updateStudentRecord({...student,sessions:[absence,...student.sessions]});
  }
  function openKidsCalendarEvent(event:CalendarEvent){
    const request=kidsCalendarRequest(event);
    if(!request)return;
    setKidsLessonRequest(request);
    setView("kids");
  }

  async function unlockFinance(event: FormEvent) {
    event.preventDefault();
    const digest = await sha256(financePin);
    if (digest !== FINANCE_PIN_SHA256) {
      setFinancePinError("PIN incorreto.");
      setFinancePin("");
      return;
    }
    window.sessionStorage.setItem(FINANCE_UNLOCK_KEY, String(Date.now() + FINANCE_UNLOCK_MS));
    setFinancePin("");
    setFinancePinError("");
    setShowFinancePin(false);
    setView("finance");
  }

  if (["today","students","workouts-overview","history-overview","assessments-overview","agenda","finance","kids","performance","data","weather"].includes(view)) {
    const activeCount = students.filter(student => student.status === "ACTIVE").length;
    const sessionCount = students.reduce((total, student) => total + student.sessions.length, 0);
    const assessmentCount = students.reduce((total, student) => total + student.assessments.length, 0);
    const todayKey = today();
    const todaySessions = students.flatMap(student => student.sessions.filter(session => session.date === todayKey).map(session => ({student, session}))).sort((a,b)=>(b.session.finishedAt||b.session.startedAt||"").localeCompare(a.session.finishedAt||a.session.startedAt||""));
    const plannedCount = students.filter(student => student.status === "ACTIVE" && getStudentWorkoutEntries(student).length > 0).length;
    const birthdayStudents = students.filter(student => student.status === "ACTIVE" && isBirthdayToday(student.birthDate));
    const allHistory = students.flatMap(student=>student.sessions.map(session=>({student,session}))).sort((a,b)=>b.session.date.localeCompare(a.session.date));
    const allAssessments = students.flatMap(student=>student.assessments.map(assessment=>({student,assessment}))).sort((a,b)=>a.student.name.localeCompare(b.student.name,"pt-BR")||b.assessment.date.localeCompare(a.assessment.date));
    const filteredHistory = allHistory.filter(({student,session}) => { const q=normalizeName(historySearch); const matchText=!q || normalizeName(`${session.date} ${student.name} ${session.workoutName} ${session.notes} ${session.completedExercises.map(ex=>ex.name).join(" ")}`).includes(q); const matchSource=historySource==="ALL" || (session.source||"PLANNED")===historySource; return matchText&&matchSource; });

    return (
      <main className="dashboard-shell">
        <Sidebar current={view} onNavigate={navigateMain} logout={logout} />
        <div className="dashboard-main">
          {view === "today" ? <>
            <header className="dashboard-topbar"><div className="today-heading"><div><p className="dashboard-eyebrow">Sua central do dia</p><h1>{formatWeekday(todayKey)}</h1><p>{formatCalendarDate(todayKey)}</p></div><div className="today-tools"><WeatherWidget onOpen={()=>setView("weather")}/><DigitalClock/><a className="drive-shortcut" href="https://drive.google.com/drive/my-drive" target="_blank" rel="noreferrer" title="Abrir meu Google Drive"><span>▰</span><small>Google</small><strong>Drive</strong></a></div></div></header>
            <div className="home-desktop-layout"><section className={`dashboard-content home-main-content ${homeLayoutMode?"layout-editing":""}`}><div className="home-layout-toolbar"><button className={homeLayoutMode?"filter-active":"secondary"} onClick={()=>setHomeLayoutMode(value=>!value)}>{homeLayoutMode?"✓ Ajustando layout":"↔ Ajustar layout"}</button>{homeLayoutMode?<button className="secondary" onClick={resetHomeLayout}>Restaurar padrão</button>:null}</div>
              <GlobalSearch value={globalSearch} onChange={setGlobalSearch} students={students} events={calendarEvents} onStudent={openStudent} onAgenda={(date)=>{setGlobalSearch("");setCalendarAnchor(date);setView("agenda");}}/>
              <TodayHighlights events={calendarEvents.filter(event=>calendarEventDate(event)===todayKey)} students={students} sessions={todaySessions} notes={notes} onAgenda={(date)=>{setCalendarAnchor(date);setView("agenda");}} onKids={()=>setView("kids")} onNotes={()=>document.querySelector(".notes-panel")?.scrollIntoView({behavior:"smooth"})}/>
              <WeeklySmartSummary students={students} events={calendarEvents}/>
              <CalendarTodayPanel status={calendarStatus} events={calendarEvents.filter(event=>calendarEventDate(event)===todayKey)} loading={calendarLoading} sync={calendarSync} students={students} todaySessions={todaySessions} onOpenAgenda={() => setView("agenda")} onOpenStudent={openStudent} onStartStudent={(id,mode)=>startStudentFlow(id,mode,"today")} onAbsence={registerAbsence} onOpenKids={openKidsCalendarEvent}/>
              <section className="panel notes-panel"><div className="panel-head"><div><h2>Meus recados</h2><p className="muted">Anotações rápidas sincronizadas entre seus dispositivos.</p></div></div><div className="note-create"><input value={newNote} onChange={e=>setNewNote(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")addNote();}} placeholder="Escreva um recado..."/><button className="primary" onClick={addNote}>+ Adicionar</button></div>{notes.length?<div className="note-grid">{notes.map(note=><article className={`note-card ${note.done?"done":""}`} key={note.id}>{editingNoteId===note.id?<textarea aria-label="Editar recado" value={editingNoteText} onChange={e=>setEditingNoteText(e.target.value)}/>:<p>{note.text}</p>}<div className="note-actions"><label><input type="checkbox" checked={note.done} onChange={e=>patchNote(note.id,{done:e.target.checked})}/> Concluído</label><div className="note-edit-actions">{editingNoteId===note.id?<><button onClick={saveEditedNote}>Salvar</button><button onClick={()=>setEditingNoteId(null)}>Cancelar</button></>:<button onClick={()=>startEditingNote(note)}>Editar</button>}<button className="danger-link" onClick={()=>removeNote(note.id)}>Excluir</button></div></div></article>)}</div>:<div className="empty-review compact-empty"><strong>Nenhum recado</strong><span>Use este mural para lembretes rápidos do dia a dia.</span></div>}{removedNote?<div className="undo-strip"><span>Recado excluído.</span><button onClick={undoNoteRemoval}>Desfazer</button></div>:null}</section>
              <section className="panel today-panel"><div className="panel-head"><div><h2>Atendimentos de hoje</h2><p className="muted">Tudo que já foi salvo hoje aparece aqui.</p></div></div>
                {todaySessions.length ? <div className="today-session-list">{todaySessions.map(({student,session}) => <button className="today-session-row" key={session.id} onClick={() => openStudent(student.id)}><span className="student-avatar small">{student.name.slice(0,1).toUpperCase()}</span><span><strong><StudentCategoryDot category={student.tennisCategory}/>{student.name}</strong><small>{sessionSourceLabel(session)}</small></span><span className="today-session-status">✓ Salvo</span></button>)}</div> : <div className="empty-review"><strong>Nenhum atendimento registrado ainda</strong><span>Quando você salvar uma ficha, um treino livre ou uma presença, ele aparecerá aqui.</span></div>}
              </section>
              <section className="panel"><div className="panel-head"><div><h2>Acesso rápido aos alunos</h2><p className="muted">Escolha o aluno e registre a sessão do jeito que aconteceu.</p></div><button className="secondary" onClick={() => setView("students")}>Ver todos</button></div><div className="quick-student-list">{students.filter(student=>student.status==="ACTIVE").slice().sort((a,b)=>a.name.localeCompare(b.name,"pt-BR")).slice(0,12).map(student => <button key={student.id} className="quick-student-row" onClick={() => openStudent(student.id)}><span className="student-avatar small">{student.name.slice(0,1).toUpperCase()}</span><span><strong><StudentCategoryDot category={student.tennisCategory}/>{student.name}</strong><small>{getStudentWorkoutEntries(student).length>0?"Com treino":"Sem treino"}</small></span><span>›</span></button>)}</div></section>
              {birthdayStudents.length ? <section className="panel smart-alerts"><div className="panel-head"><div><h2>Aniversariantes de hoje</h2><p className="muted">Quem está comemorando hoje.</p></div></div><div className="smart-alert-grid">{birthdayStudents.map(student=><button key={`b-${student.id}`} className="smart-alert-card birthday" onClick={()=>openStudent(student.id)}><span>🎂</span><strong>Aniversário: {student.name}</strong><small>{calculateAge(student.birthDate)} anos hoje</small></button>)}</div></section>:null}
            </section><DesktopAgendaRail events={calendarEvents} students={students} onOpenAgenda={(date)=>{setCalendarAnchor(date);setView("agenda");}} onOpenStudent={openStudent}/></div>
            <div className="mobile-header-actions"><button className="mobile-quick-launch" onClick={()=>setShowMobileActions(true)} aria-label="Abrir ações rápidas">＋</button><button className="mobile-voice-launch" onClick={()=>{sessionStorage.setItem("dmp_finance_voice_start","1");navigateMain("finance");}} aria-label="Falar lançamento financeiro">🎤</button></div>
            {showMobileActions?<MobileQuickActions onClose={()=>setShowMobileActions(false)} onNavigate={target=>{if(target==="extra")sessionStorage.setItem("dmp_finance_quick_action","extra");setShowMobileActions(false);navigateMain(target==="extra"||target==="receive"?"finance":target);}}/>:null}
          </> : null}

          {view === "students" ? <>
            <header className="dashboard-topbar"><div><p className="dashboard-eyebrow">Painel de atendimento</p><h1>Alunos</h1><p>Cadastros, fichas, observações, restrições e histórico.</p></div><div className="hero-actions"><button className="secondary" onClick={resetData}>Restaurar importação</button><button className="primary" onClick={() => setShowStudentForm(true)}>+ Novo aluno</button></div></header>
            <section className="dashboard-content"><div className="dashboard-stats"><Stat icon="👥" label="Alunos ativos" value={activeCount}/><Stat icon="✅" label="Sessões registradas" value={sessionCount}/><Stat icon="📏" label="Avaliações" value={assessmentCount}/></div>
              <div className="student-toolbar dashboard-toolbar"><input className="search" placeholder="Pesquisar por nome, telefone ou objetivo..." value={search} onChange={event => setSearch(event.target.value)} /><div className="student-filters"><button className={studentFilter === "ACTIVE" ? "filter-active" : "secondary"} onClick={() => setStudentFilter("ACTIVE")}>Ativos</button><button className={studentFilter === "ARCHIVED" ? "filter-active" : "secondary"} onClick={() => setStudentFilter("ARCHIVED")}>Inativos</button></div></div>
              <div className="student-grid dashboard-student-grid compact-student-grid">{visibleStudents.map(student => { const lastSession=student.sessions[0]; const entries=getStudentWorkoutEntries(student); return <article className="student-card dashboard-student-card compact-student-card" key={student.id}><button className="student-card-open" onClick={() => openStudent(student.id)}><span className="student-avatar">{student.name.slice(0,1).toUpperCase()}</span><span><strong><StudentCategoryDot category={student.tennisCategory}/>{student.name}</strong><small>{student.goal || (lastSession?`Último atendimento: ${formatDate(lastSession.date)}`:"Sem atendimentos")}</small></span><b>›</b></button>{student.restrictions ? <div className="restriction-mini">⚠ {student.restrictions}</div> : null}<div className="card-actions compact-card-actions"><button className="primary" onClick={()=>{setSelectedStudentId(student.id);setView("free-session");}}>✍ Registrar treino</button>{entries.length?<button className="secondary" onClick={() => startStudentFlow(student.id,"session")}>▶ Acompanhar treino</button>:<button className="secondary" onClick={()=>{setSelectedStudentId(student.id);setWorkoutEditorSlot("A");setSelectedWorkoutId(null);setView("workout-editor");}}>+ Montar treino</button>}<button className="secondary" onClick={()=>{setSelectedStudentId(student.id);setView("attendance-session");}}>✓ Presença</button><button className="absence-action" onClick={()=>void registerStudentAbsence(student)}>Ausência</button></div></article>;})}</div>
            </section>
          </> : null}

          {view === "workouts-overview" ? <><header className="dashboard-topbar"><div><p className="dashboard-eyebrow">Biblioteca por aluno</p><h1>Treinos</h1><p>Veja rapidamente as abas A, B, C e D montadas para cada aluno.</p></div></header><section className="dashboard-content"><div className="dashboard-stats"><Stat icon="📋" label="Com treino montado" value={plannedCount}/><Stat icon="⚡" label="Sem treino montado" value={activeCount-plannedCount}/><Stat icon="👥" label="Alunos ativos" value={activeCount}/></div><div className="overview-list">{students.filter(s=>s.status==="ACTIVE"&&(!workoutsOnly||getStudentWorkoutEntries(s).length>0)).sort((a,b)=>a.name.localeCompare(b.name,"pt-BR")).map(student => {const entries=getStudentWorkoutEntries(student);const slots=entries.map(entry=>entry.slot).join(" · ");const exerciseTotal=entries.reduce((sum,entry)=>sum+entry.workout.exercises.length,0);return <button className="overview-row" key={student.id} onClick={()=>{openStudent(student.id);setTab("workouts");}}><span><strong><StudentCategoryDot category={student.tennisCategory}/>{student.name}</strong><small>{entries.length ? `Treinos ${slots} · ${exerciseTotal} exercícios no total` : "Sem treino montado"}</small></span><span className={entries.length?"status-chip ok":"status-chip"}>{entries.length?`${entries.length} aba${entries.length===1?"":"s"}`:"Sem ficha"}</span></button>})}</div></section></> : null}

          {view === "history-overview" ? <><header className="dashboard-topbar"><div><p className="dashboard-eyebrow">Linha do tempo</p><h1>Histórico</h1><p>Pesquise qualquer sessão por aluno, exercício, observação ou tipo de registro.</p></div></header><section className="dashboard-content"><div className="history-toolbar"><input className="search" placeholder="Buscar aluno, exercício ou observação..." value={historySearch} onChange={e=>setHistorySearch(e.target.value)}/><select value={historySource} onChange={e=>setHistorySource(e.target.value as any)}><option value="ALL">Todos os tipos</option><option value="PLANNED">Ficha concluída</option><option value="FREE">Treino registrado</option><option value="ATTENDANCE">Presença</option><option value="IMPORTED">Importado</option></select><span className="status-chip ok">{filteredHistory.length} registro{filteredHistory.length===1?"":"s"}</span></div><div className="overview-list">{filteredHistory.slice(0,500).map(({student,session})=><button className="overview-row" key={session.id} onClick={()=>openStudent(student.id)}><span><strong>{formatDate(session.date)} · {student.name}</strong><small>{session.workoutName}{session.notes?` — ${session.notes}`:""}</small></span><span className="status-chip ok">{sessionSourceLabel(session)}</span></button>)}</div></section></> : null}

          {view === "assessments-overview" ? <><header className="dashboard-topbar"><div><p className="dashboard-eyebrow">Evolução dos alunos</p><h1>Avaliações realizadas</h1><p>Consulte todas as avaliações físicas registradas no DMP.</p></div></header><section className="dashboard-content"><div className="dashboard-stats"><Stat icon="📏" label="Avaliações realizadas" value={assessmentCount}/><Stat icon="👥" label="Alunos avaliados" value={students.filter(student=>student.assessments.length>0).length}/><Stat icon="📅" label="Avaliações neste mês" value={allAssessments.filter(({assessment})=>assessment.date.slice(0,7)===todayKey.slice(0,7)).length}/></div><div className="overview-list">{allAssessments.length?allAssessments.map(({student,assessment})=><button className="overview-row" key={`${student.id}-${assessment.id}`} onClick={()=>{setSelectedStudentId(student.id);setTab("assessments");setView("student");}}><span><strong><StudentCategoryDot category={student.tennisCategory}/>{student.name}</strong><small><b className="assessment-date-emphasis">{formatDate(assessment.date)}</b> · Peso: {displayNumber(assessment.weight,"kg")} · Gordura: {displayNumber(assessment.bodyFatPercent,"%")} · Massa magra: {displayNumber(assessment.leanMass,"kg")}</small></span><span className="status-chip ok">Ver avaliação</span></button>):<div className="empty-review"><strong>Nenhuma avaliação realizada</strong><span>As avaliações cadastradas nos alunos aparecerão aqui.</span></div>}</div></section></> : null}

          {view === "agenda" ? <><header className="dashboard-topbar"><div><p className="dashboard-eyebrow">Agenda de trabalho</p><h1>Agenda</h1><p>Seus compromissos do Google Calendar dentro do DMP.</p></div></header><section className="dashboard-content"><CalendarAgenda status={calendarStatus} events={calendarEvents} loading={calendarLoading} sync={calendarSync} students={students} range={calendarRange} anchor={calendarAnchor} onRange={setCalendarRange} onAnchor={setCalendarAnchor} onOpenStudent={openStudent} onStartStudent={startStudentFlow} onOpenKids={openKidsCalendarEvent} onStatusChange={setCalendarStatus} onRefresh={()=>void refreshCalendarAutomatic(true)} onNewEvent={()=>setShowGoogleEventForm(true)} /></section></> : null}
          {view === "finance" ? <FinanceiroPage /> : null}
          {view === "kids" ? <KidsPage openRequest={kidsLessonRequest} onBack={()=>{setKidsLessonRequest(null);setView("today");}} /> : null}
          {view === "performance" ? <PerformancePage /> : null}
          {view === "data" ? <><DataCenter students={students} onReplace={setStudents} /><BackupCenter /></> : null}
          {view === "weather" ? <WeatherPage onBack={()=>setView("today")} /> : null}
        </div>
        {showFinancePin ? <FinancePinModal pin={financePin} error={financePinError} onChange={value => { setFinancePin(value.replace(/\D/g, "").slice(0, 4)); setFinancePinError(""); }} onClose={() => { setShowFinancePin(false); setFinancePin(""); setFinancePinError(""); }} onSubmit={unlockFinance} /> : null}
        {showStudentForm ? <StudentForm title="Novo aluno" onClose={() => setShowStudentForm(false)} onSave={createStudent} /> : null}
        {showGoogleEventForm ? <GoogleEventForm students={students} onClose={()=>setShowGoogleEventForm(false)} onSaved={()=>{setShowGoogleEventForm(false);void refreshCalendarAutomatic(true);}} /> : null}
      </main>
    );
  }

  if (!selectedStudent) return null;

  if (view === "student") {
    const workoutEntries = getStudentWorkoutEntries(selectedStudent);
    const primaryWorkout = workoutEntries[0]?.workout;
    const workoutSlots = workoutEntries.map(entry => entry.slot).join(" · ");

    return (
      <main className="app-page">
        <Header title={selectedStudent.name} back={goStudents} />
        <section className="content student-profile-page">
          <div className="hero student-profile-hero">
            <div>
              <span className={`status-pill ${selectedStudent.status === "ARCHIVED" ? "archived" : ""}`}>{selectedStudent.status === "ACTIVE" ? "Ativo" : "Inativo"}</span>
              <h1>{selectedStudent.name}</h1>
              <p>{selectedStudent.goal || "Objetivo não informado"}</p>
            </div>
            <div className="hero-actions">
              {workoutEntries.length ? <button className="primary" onClick={() => setTab("workouts")}>▶ Usar treino montado</button> : null}
              <button className={workoutEntries.length ? "secondary" : "primary"} onClick={() => setView("free-session")}>🎤 Registrar o que fez</button>
              <button className="secondary" onClick={() => setView("attendance-session")}>✓ Só presença</button>
              <button className="secondary" onClick={() => setShowEditStudentForm(true)}>Editar aluno</button>
              <button className="secondary" onClick={()=>void printPersonalStudentReport(selectedStudent)}>🖨️ Relatório</button>
              <button className="secondary" onClick={toggleArchive}>{selectedStudent.status === "ACTIVE" ? "Marcar inativo" : "Reativar"}</button>
              {whatsappLink(selectedStudent.phone)?<a className="secondary button-link whatsapp-student-link" href={whatsappLink(selectedStudent.phone)!} target="_blank" rel="noreferrer">🟢 WhatsApp</a>:null}
            </div>
          </div>

          <StudentProfileSnapshot student={selectedStudent} />

          <nav className="profile-tabs">
            {(["summary","workouts","history","assessments"] as StudentTab[]).map(item => (
              <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}><span>{item==="summary"?"📋":item==="workouts"?"🏋️":item==="history"?"🕘":"📏"}</span>{tabLabel(item)}</button>
            ))}
          </nav>

          <section className={`workflow-strip ${workoutEntries.length ? "has-workout" : "no-workout"}`}>
            <div>
              <strong>{workoutEntries.length ? `Treinos montados: ${workoutSlots}` : "Aluno sem treino montado"}</strong>
              <span>{workoutEntries.length ? "Escolha A, B, C ou D para acompanhar a aula. Você também pode registrar por voz/texto ou somente presença." : "Monte uma aba de treino ou registre a aula por voz/texto sem ficha."}</span>
            </div>
            <div className="workflow-strip-actions">
              {workoutEntries.length ? <button className="primary" onClick={() => setTab("workouts")}>Escolher treino</button> : <button className="primary" onClick={() => {setWorkoutEditorSlot("A");setSelectedWorkoutId(null);setTab("workouts");setView("workout-editor");}}>Montar Treino A</button>}
              <button className="secondary" onClick={() => setView("free-session")}>Registrar depois</button>
              <button className="secondary" onClick={() => setView("attendance-session")}>Só presença</button>
            </div>
          </section>

          {tab === "summary" ? <StudentSummary student={selectedStudent} /> : null}
          {tab === "workouts" ? <WorkoutSlotsPanel student={selectedStudent} onEdit={(slot,workout)=>{setWorkoutEditorSlot(slot);setSelectedWorkoutId(workout?.id||null);setView("workout-editor");}} onStart={workout=>{if(window.matchMedia("(min-width: 801px)").matches){window.open(`/app?mode=planned-session&student=${encodeURIComponent(selectedStudent.id)}&workout=${encodeURIComponent(workout.id)}`,"_blank");return;}setSelectedWorkoutId(workout.id);setView("planned-session");}} onArchive={archiveWorkout} onClear={clearWorkout} onCopy={workout=>setWorkoutToCopy(workout)} /> : null}
          {tab === "history" ? <HistoryPanel student={selectedStudent} /> : null}
          {tab === "assessments" ? <AssessmentPanel student={selectedStudent} onNew={() => setShowAssessmentForm(true)} /> : null}
          <div className="student-danger-zone"><button className="danger-link" onClick={deleteSelectedStudent}>Excluir cadastro</button><small>Exclusão definitiva do aluno e dos dados vinculados.</small></div>
        </section>

        {showEditStudentForm ? <StudentForm title="Editar aluno" initialStudent={selectedStudent} onClose={() => setShowEditStudentForm(false)} onSave={editStudent} /> : null}
        {showAssessmentForm ? <AssessmentForm onClose={() => setShowAssessmentForm(false)} onSave={saveAssessment} /> : null}
        {workoutToCopy ? <DuplicateWorkoutModal workout={workoutToCopy} students={students} sourceStudentId={selectedStudent.id} onClose={()=>setWorkoutToCopy(null)} onConfirm={copyWorkoutToStudent} /> : null}
      </main>
    );
  }

  if (view === "workout-editor") return <WorkoutEditor student={selectedStudent} workout={selectedWorkoutId ? selectedWorkout : null} slot={workoutEditorSlot} exerciseCatalog={exerciseCatalog} onBack={() => {setTab("workouts");setView("student");}} onSave={saveWorkout} />;
  if (view === "planned-session") return <PlannedSession student={selectedStudent} workout={selectedWorkout} onBack={() => setView("student")} onSave={saveSession} />;
  if (view === "attendance-session") return <AttendanceSessionScreen student={selectedStudent} onBack={() => setView("student")} onSave={saveSession} />;
  return <FreeSessionScreen student={selectedStudent} onBack={() => setView("student")} onSave={saveSession} />;
}


function CalendarTodayPanel({status,events,loading,sync,students,todaySessions,onOpenAgenda,onOpenStudent,onStartStudent,onAbsence,onOpenKids}:{status:{configured:boolean;connected:boolean};events:CalendarEvent[];loading:boolean;sync:{dailyAt:string;weeklyAt:string;weeklyCount:number};students:Student[];todaySessions:{student:Student;session:Session}[];onOpenAgenda:()=>void;onOpenStudent:(id:string)=>void;onStartStudent:(id:string,mode:"session"|"free"|"attendance")=>void;onAbsence:(student:Student,event:CalendarEvent)=>void;onOpenKids:(event:CalendarEvent)=>void}) {
  const completedIds=new Set(todaySessions.filter(item=>item.session.source!=="ABSENCE").map(item=>item.student.id));
  const absentIds=new Set(todaySessions.filter(item=>item.session.source==="ABSENCE").map(item=>item.student.id));
  const displayEvents=[...events];
  todaySessions.filter(item=>item.session.source==="ABSENCE"&&item.session.calendarEvent).forEach(({student,session})=>{
    const stored=session.calendarEvent!;
    const found=displayEvents.findIndex(event=>event.id===stored.id);
    if(found>=0){const current=displayEvents[found];const ids=new Set([...(current.matchedStudentIds||[]),student.id]);displayEvents[found]={...current,matchedStudentIds:[...ids]};}
    else displayEvents.push({...stored,matchedStudentId:student.id,matchedStudentIds:[student.id]});
  });
  displayEvents.sort((a,b)=>a.start.localeCompare(b.start));
  return <section className="panel calendar-today-panel"><div className="panel-head"><div><h2>Agenda de hoje</h2><p className="muted">Sua agenda oficial do Google, agora ligada ao fluxo do DMP.</p>{status.connected?<p className="calendar-auto-sync">↻ Atualização automática ativa{sync.dailyAt?` · última ${formatSyncTime(sync.dailyAt)}`:""}</p>:null}</div><button className="secondary" onClick={onOpenAgenda}>Abrir agenda</button></div>
    {!status.configured ? <div className="calendar-empty"><strong>Integração pronta no aplicativo</strong><span>Falta apenas configurar as credenciais do Google para conectar sua agenda.</span></div> : !status.connected ? <div className="calendar-empty"><strong>Google Agenda ainda não conectado</strong><span>Abra a aba Agenda e toque em “Conectar Google”.</span></div> : loading ? <div className="calendar-empty"><span>Carregando compromissos...</span></div> : displayEvents.length ? <div className="calendar-preview-list">{displayEvents.slice(0,10).map(event=>{const slotStudents=getCalendarEventStudents(event,students);const kids=kidsCalendarRequest(event);const allDone=slotStudents.length>0&&slotStudents.every(student=>completedIds.has(student.id)||absentIds.has(student.id));return <article key={event.id} className={`calendar-preview-row central-row calendar-multi-row ${allDone?"event-done":""}`}><span className="calendar-time">{formatCalendarTime(event)}</span><div className="calendar-slot-main"><button className="calendar-event-main" onClick={kids?()=>onOpenKids(event):onOpenAgenda}><strong>{event.summary}</strong><small>{kids?"Aula Tênis Kids":slotStudents.length?`${slotStudents.length} aluno${slotStudents.length===1?"":"s"} neste horário`:"Compromisso da agenda"}</small></button>{kids?<button className={`primary compact-action kids-action-${kids.category.toLowerCase()}`} onClick={()=>onOpenKids(event)}>🎾 Abrir turma e chamada</button>:slotStudents.length?<div className="calendar-slot-students"><span className="calendar-slot-title">Treinos do horário</span>{slotStudents.map(student=>{const done=completedIds.has(student.id);const absent=absentIds.has(student.id);return <div className="calendar-slot-student" key={student.id}><button className="calendar-slot-student-name" onClick={()=>onOpenStudent(student.id)}>👤 {student.name}</button><span className={done?"status-chip ok":absent?"status-chip absent":"status-chip waiting"}>{done?"✓ Finalizado":absent?"Ausente":getStudentWorkoutEntries(student).length>0?"Com treino":"Sem treino"}</span>{!done&&!absent?<>{getStudentWorkoutEntries(student).length>0?<button className="primary compact-action" onClick={()=>onStartStudent(student.id,"session")}>▶ Iniciar</button>:null}<button className={getStudentWorkoutEntries(student).length>0?"secondary compact-action":"primary compact-action"} onClick={()=>onStartStudent(student.id,"free")}>✍ Registrar</button><button className="secondary compact-action" onClick={()=>onStartStudent(student.id,"attendance")}>✓ Presença</button><button className="absence-action compact-action" onClick={()=>void onAbsence(student,event)}>Ausência</button></>:null}</div>})}</div>:null}</div><span className="status-chip">{calendarEventStatus(event)}</span></article>})}</div> : <div className="calendar-empty"><strong>Nenhum compromisso hoje</strong><span>Sua agenda Google está conectada.</span></div>}
  </section>;
}

function CalendarAgenda({status,events,loading,sync,students,range,anchor,onRange,onAnchor,onOpenStudent,onStartStudent,onOpenKids,onStatusChange,onRefresh,onNewEvent}:{status:{configured:boolean;connected:boolean};events:CalendarEvent[];loading:boolean;sync:{dailyAt:string;weeklyAt:string;weeklyCount:number};students:Student[];range:AgendaRange;anchor:string;onRange:(value:AgendaRange)=>void;onAnchor:(value:string)=>void;onOpenStudent:(id:string)=>void;onStartStudent:(id:string,mode:"session"|"free"|"attendance")=>void;onOpenKids:(event:CalendarEvent)=>void;onStatusChange:(value:{configured:boolean;connected:boolean})=>void;onRefresh:()=>void;onNewEvent:()=>void}) {
  const [addingEvent,setAddingEvent]=useState<CalendarEvent|null>(null);
  async function disconnect(){await fetch("/api/google/disconnect",{method:"POST"});onStatusChange({...status,connected:false});}
  async function removeEvent(id:string){if(!confirm("Excluir este compromisso do Google Calendar?"))return;const r=await fetch(`/api/google/events?id=${encodeURIComponent(id)}`,{method:"DELETE"});if(r.ok)onRefresh();else alert("Não foi possível excluir o compromisso.");}
  const visible=events.filter(event=>agendaRangeIncludes(event,anchor,range)).sort((a,b)=>a.start.localeCompare(b.start));
  const navigate=(direction:-1|1)=>onAnchor(shiftAgendaAnchor(anchor,range,direction));
  const openEvent=(event:CalendarEvent)=>{const kids=kidsCalendarRequest(event);if(kids){onOpenKids(event);return;}const matched=getCalendarEventStudents(event,students);if(matched.length===1){onOpenStudent(matched[0].id);return;}if(event.htmlLink)window.open(event.htmlLink,"_blank","noopener,noreferrer");};
  return <>
    <section className="agenda-view-toolbar"><div>{(["day","week","month","year","list"] as AgendaRange[]).map(value=><button key={value} className={range===value?"filter-active":"secondary"} onClick={()=>onRange(value)}>{agendaRangeLabel(value)}</button>)}</div><div className="agenda-period-nav"><button className="secondary" onClick={()=>navigate(-1)} aria-label="Período anterior">‹</button><strong>{agendaPeriodLabel(anchor,range)}</strong><button className="secondary" onClick={()=>navigate(1)} aria-label="Próximo período">›</button></div><input type="date" value={anchor} onChange={event=>onAnchor(event.target.value)}/><button className="primary" onClick={onNewEvent}>+ Novo compromisso</button></section>
    {!status.configured?<section className="panel setup-panel"><h2>Uma configuração única</h2><p>Para ativar, crie as credenciais OAuth no Google Cloud e configure <code>GOOGLE_CLIENT_ID</code>, <code>GOOGLE_CLIENT_SECRET</code> e <code>APP_URL</code>. Depois o mesmo login funciona no computador e no celular.</p></section>:null}
    {status.connected?<section className="panel agenda-period-panel"><div className="panel-head"><div><h2>{agendaRangeTitle(range)}</h2><p className="muted">{agendaPeriodLabel(anchor,range)}</p></div><span className="status-chip ok">{visible.length} evento{visible.length===1?"":"s"}</span></div>{loading?<div className="calendar-empty">Carregando agenda...</div>:<AgendaRangeContent range={range} anchor={anchor} events={visible} students={students} onOpenEvent={openEvent} onOpenStudent={onOpenStudent} onStartStudent={onStartStudent} onOpenKids={onOpenKids} onAddStudent={setAddingEvent} onRemoveEvent={removeEvent} onSelectDate={date=>{onAnchor(date);onRange("day");}} onSelectMonth={date=>{onAnchor(date);onRange("month");}}/>}</section>:null}
    <section className="panel agenda-connect agenda-connect-bottom"><div className="agenda-icon">📅</div><div className="agenda-connect-main"><h2>Google Calendar</h2><p>O Google continua sendo a agenda oficial. O DMP mantém os nomes e horários como estão na sua agenda e abre os treinos dos alunos daquele horário.</p><div className="agenda-roadmap"><span>✓ Atualiza ao abrir/voltar ao DMP</span><span>✓ Revisa o dia a cada 5 min em uso</span><span>✓ Domingo: pré-carrega 7 dias</span><span>✓ Vários alunos no mesmo horário</span><span>✓ Criar/excluir compromisso pelo DMP</span></div>{status.connected?<div className="agenda-sync-summary"><strong>Sincronização automática ativa</strong><span>Hoje{sync.dailyAt?` atualizado às ${formatSyncTime(sync.dailyAt)}`:" aguardando primeira atualização"}.</span><span>{sync.weeklyAt?`Última revisão semanal: ${formatSyncDateTime(sync.weeklyAt)} · ${sync.weeklyCount} compromissos.`:"A revisão dos próximos 7 dias acontece automaticamente no primeiro uso de domingo."}</span></div>:null}</div><div className="agenda-actions">{!status.configured?<span className="status-chip">Configuração pendente</span>:status.connected?<><span className="status-chip ok">Conectado</span><button className="primary" onClick={onNewEvent}>+ Compromisso</button><button className="secondary" onClick={onRefresh}>Atualizar</button><button className="secondary" onClick={disconnect}>Desconectar</button></>:<a className="primary button-link" href="/api/google/auth">Conectar Google</a>}</div></section>
    {addingEvent?<AddStudentsToCalendarEventModal event={addingEvent} students={students} onClose={()=>setAddingEvent(null)} onSaved={()=>{setAddingEvent(null);onRefresh();}}/>:null}
  </>;
}

function AddStudentsToCalendarEventModal({event,students,onClose,onSaved}:{event:CalendarEvent;students:Student[];onClose:()=>void;onSaved:()=>void}){
  const existingIds=new Set(getCalendarEventStudents(event,students).map(student=>student.id));
  const [search,setSearch]=useState("");
  const [selected,setSelected]=useState<string[]>([]);
  const [saving,setSaving]=useState(false);
  const available=students.filter(student=>student.status==="ACTIVE"&&!existingIds.has(student.id)&&normalizeName(student.name).includes(normalizeName(search))).sort((a,b)=>a.name.localeCompare(b.name,"pt-BR"));
  function toggle(id:string){setSelected(current=>current.includes(id)?current.filter(value=>value!==id):[...current,id]);}
  async function save(){if(!selected.length)return;setSaving(true);const names=students.filter(student=>selected.includes(student.id)).map(calendarStudentDisplayName);const summary=`${event.summary} ${names.join(" ")}`.replace(/\s+/g," ").trim();const response=await fetch("/api/google/events",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({id:event.id,summary,description:event.description||"",location:event.location||"",start:event.start,end:event.end})});setSaving(false);if(response.ok)onSaved();else alert("Não foi possível adicionar os alunos ao compromisso.");}
  return <div className="modal-backdrop"><section className="modal"><div className="modal-head"><div><h2>Adicionar alunos</h2><p className="muted">{event.summary} · escolha um ou vários alunos.</p></div><button className="text-button" onClick={onClose}>Fechar</button></div><input className="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar aluno..."/><div className="calendar-student-picker">{available.map(student=><button type="button" key={student.id} className={selected.includes(student.id)?"selected":""} onClick={()=>toggle(student.id)}><span>{selected.includes(student.id)?"✓":"+"}</span><strong>{student.name}</strong></button>)}</div>{!available.length?<div className="calendar-empty">Nenhum aluno disponível nesta busca.</div>:null}<div className="modal-actions"><button onClick={onClose}>Cancelar</button><button className="primary" disabled={!selected.length||saving} onClick={save}>{saving?"Salvando...":`Adicionar ${selected.length||""}`}</button></div></section></div>;
}

function AgendaRangeContent({range,anchor,events,students,onOpenEvent,onOpenStudent,onStartStudent,onOpenKids,onAddStudent,onRemoveEvent,onSelectDate,onSelectMonth}:{range:AgendaRange;anchor:string;events:CalendarEvent[];students:Student[];onOpenEvent:(event:CalendarEvent)=>void;onOpenStudent:(id:string)=>void;onStartStudent:(id:string,mode:"session"|"free"|"attendance")=>void;onOpenKids:(event:CalendarEvent)=>void;onAddStudent:(event:CalendarEvent)=>void;onRemoveEvent:(id:string)=>void;onSelectDate:(date:string)=>void;onSelectMonth:(date:string)=>void}){
  if(range==="week")return <AgendaWeekView anchor={anchor} events={events} students={students} onOpenEvent={onOpenEvent} onOpenStudent={onOpenStudent}/>;
  if(range==="month")return <AgendaMonthView anchor={anchor} events={events} onOpenEvent={onOpenEvent} onSelectDate={onSelectDate}/>;
  if(range==="year")return <AgendaYearView anchor={anchor} events={events} onSelectMonth={onSelectMonth}/>;
  return events.length?<div className="agenda-event-list">{events.map(event=><AgendaEventDetails key={event.id} event={event} students={students} compact={range==="list"} onOpenEvent={onOpenEvent} onOpenStudent={onOpenStudent} onStartStudent={onStartStudent} onOpenKids={onOpenKids} onAddStudent={onAddStudent} onRemoveEvent={onRemoveEvent}/>)}</div>:<div className="calendar-empty">Nenhum compromisso encontrado neste período.</div>;
}

function AgendaEventDetails({event,students,compact,onOpenEvent,onOpenStudent,onStartStudent,onOpenKids,onAddStudent,onRemoveEvent}:{event:CalendarEvent;students:Student[];compact:boolean;onOpenEvent:(event:CalendarEvent)=>void;onOpenStudent:(id:string)=>void;onStartStudent:(id:string,mode:"session"|"free"|"attendance")=>void;onOpenKids:(event:CalendarEvent)=>void;onAddStudent:(event:CalendarEvent)=>void;onRemoveEvent:(id:string)=>void}){
  const matchedStudents=getCalendarEventStudents(event,students);const kids=kidsCalendarRequest(event);
  return <article className={`agenda-event-row agenda-event-row-multi ${compact?"agenda-list-row":""}`}><div className="agenda-event-time">{compact?<><small>{formatRailDate(event)}</small><strong>{formatCalendarTime(event)}</strong></>:formatCalendarTime(event)}</div><div className="agenda-event-body"><button className="agenda-event-title-button" onClick={()=>onOpenEvent(event)}>{event.summary}</button>{event.location?<small>📍 {event.location}</small>:null}{event.description?<small>{event.description}</small>:null}{kids?<button className="primary compact-action" onClick={()=>onOpenKids(event)}>🎾 Abrir turma e chamada</button>:matchedStudents.length?<div className="slot-workouts"><div className="slot-workouts-head"><span>🏋️ Treinos do horário</span><small>{matchedStudents.length} aluno{matchedStudents.length===1?"":"s"}</small></div>{matchedStudents.map(student=><div className="slot-workout-student" key={student.id}><button className="calendar-student-link" onClick={()=>onOpenStudent(student.id)}>👤 {student.name}</button><span className="slot-ficha-label">{getStudentWorkoutEntries(student).length>0?"Treino montado":"Sem treino"}</span>{getStudentWorkoutEntries(student).length>0?<button className="primary compact-action" onClick={()=>onStartStudent(student.id,"session")}>▶ Iniciar</button>:null}<button className={getStudentWorkoutEntries(student).length>0?"secondary compact-action":"primary compact-action"} onClick={()=>onStartStudent(student.id,"free")}>✍ Registrar</button><button className="secondary compact-action" onClick={()=>onStartStudent(student.id,"attendance")}>✓ Presença</button></div>)}</div>:event.allDay?<small className="muted">Evento de dia inteiro.</small>:<small className="muted">Nenhum aluno identificado no DMP.</small>}</div><div className="agenda-event-actions"><button className="secondary compact-action" onClick={()=>onAddStudent(event)}>+ Adicionar aluno</button>{event.htmlLink?<a className="secondary button-link compact-action" href={event.htmlLink} target="_blank" rel="noreferrer">Google</a>:null}<button className="danger-link" onClick={()=>onRemoveEvent(event.id)}>Excluir</button></div></article>;
}

function AgendaWeekView({anchor,events,students,onOpenEvent,onOpenStudent}:{anchor:string;events:CalendarEvent[];students:Student[];onOpenEvent:(event:CalendarEvent)=>void;onOpenStudent:(id:string)=>void}){
  const days=agendaWeekDays(anchor);
  return <div className="agenda-week-grid">{days.map(date=>{const dayEvents=events.filter(event=>calendarEventDate(event)===date);return <section key={date} className="agenda-week-day"><header><strong>{new Date(`${date}T12:00:00`).toLocaleDateString("pt-BR",{weekday:"short"})}</strong><span>{new Date(`${date}T12:00:00`).toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit"})}</span></header>{dayEvents.length?dayEvents.map(event=>{const people=getCalendarEventStudents(event,students);const kids=kidsCalendarRequest(event);return <article key={event.id} className={kids?"kids":""}><button onClick={()=>onOpenEvent(event)}><small>{formatCalendarTime(event)}</small>{kids||!people.length?<strong>{event.summary}</strong>:null}</button>{people.map(student=><button className="agenda-week-student" key={student.id} onClick={()=>onOpenStudent(student.id)}>{student.name}</button>)}</article>}):<p>Sem aulas</p>}</section>})}</div>;
}

function AgendaMonthView({anchor,events,onOpenEvent,onSelectDate}:{anchor:string;events:CalendarEvent[];onOpenEvent:(event:CalendarEvent)=>void;onSelectDate:(date:string)=>void}){
  const base=new Date(`${anchor.slice(0,7)}-01T12:00:00`);const year=base.getFullYear();const month=base.getMonth();const first=base.getDay();const days=new Date(year,month+1,0).getDate();
  return <div className="agenda-month"><div className="agenda-month-week"><b>Dom</b><b>Seg</b><b>Ter</b><b>Qua</b><b>Qui</b><b>Sex</b><b>Sáb</b></div><div className="agenda-month-days">{Array.from({length:first},(_,index)=><i key={`empty-${index}`}/>)}{Array.from({length:days},(_,index)=>{const day=index+1;const date=`${year}-${String(month+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;const dayEvents=events.filter(event=>calendarEventDate(event)===date);return <section key={date} className={date===today()?"today":""}><button className="agenda-month-number" onClick={()=>onSelectDate(date)}>{day}</button>{dayEvents.slice(0,3).map(event=><button key={event.id} className={kidsCalendarRequest(event)?"kids":""} onClick={()=>onOpenEvent(event)}><small>{formatCalendarTime(event)}</small>{event.summary}</button>)}{dayEvents.length>3?<button className="agenda-month-more" onClick={()=>onSelectDate(date)}>+{dayEvents.length-3} compromissos</button>:null}</section>})}</div></div>;
}

function AgendaYearView({anchor,events,onSelectMonth}:{anchor:string;events:CalendarEvent[];onSelectMonth:(date:string)=>void}){
  const year=Number(anchor.slice(0,4));
  return <div className="agenda-year-grid">{Array.from({length:12},(_,month)=>{const monthKey=`${year}-${String(month+1).padStart(2,"0")}`;const count=events.filter(event=>calendarEventDate(event).startsWith(monthKey)).length;return <button key={month} onClick={()=>onSelectMonth(`${monthKey}-01`)}><span>{new Date(year,month,1).toLocaleDateString("pt-BR",{month:"long"})}</span><strong>{count}</strong><small>compromisso{count===1?"":"s"}</small></button>})}</div>;
}

function GoogleEventForm({students,onClose,onSaved}:{students:Student[];onClose:()=>void;onSaved:()=>void}) {
  const [studentIds,setStudentIds]=useState<string[]>([]);
  const [summary,setSummary]=useState("");
  const [description,setDescription]=useState("");
  const [location,setLocation]=useState("");
  const [date,setDate]=useState(today());
  const [startTime,setStartTime]=useState("08:00");
  const [endTime,setEndTime]=useState("09:00");
  const [saving,setSaving]=useState(false);
  const [repeatWeekly,setRepeatWeekly]=useState(false);const [repeatUntil,setRepeatUntil]=useState("");
  function chooseStudent(id:string){if(!id)return;setStudentIds(current=>current.includes(id)?current.filter(value=>value!==id):[...current,id]);const names=students.filter(item=>[...studentIds,id].includes(item.id)).map(item=>calendarStudentDisplayName(item));if(names.length)setSummary(names.join(" "));}
  async function save(event:FormEvent){event.preventDefault();if(!summary.trim())return;setSaving(true);const start=`${date}T${startTime}:00-03:00`;const end=`${date}T${endTime}:00-03:00`;const recurrence=repeatWeekly?[`RRULE:FREQ=WEEKLY${repeatUntil?`;UNTIL=${repeatUntil.replaceAll("-","")}T235959Z`:""}`]:[];const response=await fetch("/api/google/events",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({summary,description,location,start,end,recurrence})});setSaving(false);if(response.ok)onSaved();else alert("Não foi possível criar o compromisso. Confira a conexão com o Google.");}
  return <div className="modal-backdrop"><section className="modal"><div className="modal-head"><div><h2>Novo compromisso</h2><p className="muted">Cria diretamente no Google Calendar.</p></div><button className="text-button" onClick={onClose}>Fechar</button></div><form className="form-grid" onSubmit={save}><label className="full">Adicionar alunos<select value="" onChange={e=>chooseStudent(e.target.value)}><option value="">Selecione um ou mais alunos</option>{students.filter(s=>s.status==="ACTIVE"&&!studentIds.includes(s.id)).sort((a,b)=>a.name.localeCompare(b.name,"pt-BR")).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>{studentIds.length?<div className="full selected-students">{studentIds.map(id=>{const student=students.find(item=>item.id===id);return student?<button type="button" key={id} onClick={()=>chooseStudent(id)}>{student.name} ×</button>:null;})}</div>:null}<label className="full">Título<input value={summary} onChange={e=>setSummary(e.target.value)} required/></label><label>Data<input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label><label>Local<input value={location} onChange={e=>setLocation(e.target.value)} placeholder="Academia, DS Tennis..."/></label><label>Início<input type="time" value={startTime} onChange={e=>setStartTime(e.target.value)}/></label><label>Fim<input type="time" value={endTime} onChange={e=>setEndTime(e.target.value)}/></label><label className="full repeat-option"><input type="checkbox" checked={repeatWeekly} onChange={e=>setRepeatWeekly(e.target.checked)}/> Repetir semanalmente</label>{repeatWeekly?<label className="full">Repetir até<input type="date" value={repeatUntil} min={date} onChange={e=>setRepeatUntil(e.target.value)}/></label>:null}<label className="full">Observação<textarea rows={3} value={description} onChange={e=>setDescription(e.target.value)}/></label><button className="primary full" disabled={saving}>{saving?"Salvando...":"Salvar no Google Calendar"}</button></form></section></div>;
}

function DataCenter({students,onReplace}:{students:Student[];onReplace:(students:Student[])=>void}) {
  const sessions=students.reduce((sum,s)=>sum+s.sessions.length,0);
  const assessments=students.reduce((sum,s)=>sum+s.assessments.length,0);
  function exportBackup(){const payload={version:1,exportedAt:new Date().toISOString(),students};downloadText(`DMP_backup_${today()}.json`,JSON.stringify(payload,null,2),"application/json");}
  async function importBackup(files:FileList|null){const file=files?.[0];if(!file)return;try{const parsed=JSON.parse(await file.text());const incoming=Array.isArray(parsed)?parsed:parsed.students;if(!Array.isArray(incoming))throw new Error();if(!confirm(`Restaurar ${incoming.length} alunos deste backup? Os dados atuais serão substituídos.`))return;onReplace(incoming);}catch{alert("Arquivo de backup inválido.");}}
  function exportAllCsv(){const header=["Aluno","Data","Tipo","Treino","Exercício","Séries","Repetições","Carga","Observações"];const rows=students.flatMap(student=>student.sessions.flatMap(session=>session.completedExercises.length?session.completedExercises.map(ex=>[student.name,session.date,sessionSourceLabel(session),session.workoutName,ex.name,ex.sets,ex.reps,ex.load,session.notes]):[[student.name,session.date,sessionSourceLabel(session),session.workoutName,"","","","",session.notes]]));const csv=[header,...rows].map(row=>row.map(v=>`"${String(v??"").replaceAll('"','""')}"`).join(";")).join("\n");downloadText(`DMP_historico_${today()}.csv`,"\ufeff"+csv,"text/csv;charset=utf-8");}
  return <><header className="dashboard-topbar"><div><p className="dashboard-eyebrow">Segurança e portabilidade</p><h1>Dados</h1><p>Backup, restauração e exportação do seu histórico.</p></div></header><section className="dashboard-content"><div className="dashboard-stats"><Stat icon="👥" label="Alunos" value={students.length}/><Stat icon="✅" label="Sessões" value={sessions}/><Stat icon="📏" label="Avaliações" value={assessments}/></div><div className="data-grid"><article className="panel"><h2>Backup completo</h2><p>Salva alunos, fichas, sessões, avaliações, observações e restrições em um arquivo JSON.</p><button className="primary" onClick={exportBackup}>⬇ Baixar backup</button></article><article className="panel"><h2>Restaurar backup</h2><p>Use um arquivo gerado pelo próprio DMP. A restauração substitui os dados locais atuais.</p><label className="secondary button-link file-button">Selecionar backup<input type="file" accept="application/json,.json" onChange={e=>importBackup(e.target.files)}/></label></article><article className="panel"><h2>Exportar histórico</h2><p>Gera um CSV único com todas as sessões de todos os alunos.</p><button className="secondary" onClick={exportAllCsv}>Exportar CSV geral</button></article><article className="panel"><h2>Importação de planilhas</h2><p>Estrutura reservada para a migração das planilhas históricas. Não altera os dados atuais até você confirmar a importação.</p><span className="status-chip">Próxima etapa</span></article></div></section></>;
}

function FinancePinModal({pin,error,onChange,onClose,onSubmit}:{pin:string;error:string;onChange:(value:string)=>void;onClose:()=>void;onSubmit:(event:FormEvent)=>void}) {
  return <div className="modal-backdrop"><section className="modal"><div className="modal-head"><div><h2>Financeiro protegido</h2><p className="muted">Digite seu PIN para acessar. O Financeiro ficará liberado por 10 minutos.</p></div><button className="text-button" onClick={onClose}>Fechar</button></div><form className="form-grid" autoComplete="off" onSubmit={onSubmit}><label className="full">PIN<input autoFocus className="finance-pin-input" type="text" name="dmp-finance-pin" inputMode="numeric" autoComplete="one-time-code" maxLength={4} value={pin} onChange={event=>onChange(event.target.value)} placeholder="••••" /></label>{error?<div className="full restriction-mini">⚠ {error}</div>:null}<button className="primary full" disabled={pin.length!==4}>Entrar no Financeiro</button></form></section></div>;
}

function Sidebar({current,onNavigate,logout}:{current:View;onNavigate:(view:View)=>void;logout:()=>void}) {
  const [mobile, setMobile] = useState(false);
  useEffect(() => { setMobile(isPhoneDevice());for(const panel of ["sidebar","rail"]){const saved=localStorage.getItem(`dmp_${panel}_width`);if(saved)document.documentElement.style.setProperty(panel==="sidebar"?"--dmp-sidebar-width":"--dmp-agenda-rail-width",`${saved}px`);}}, []);
  const items:{view:View;icon:string;label:string}[]=[{view:"today",icon:"🏠",label:"Hoje"},{view:"finance",icon:"💰",label:"Financeiro"},{view:"performance",icon:"\u{1F4C8}",label:"Performance"},{view:"assessments-overview",icon:"📏",label:"Avaliações"},{view:"students",icon:"👥",label:"Alunos"},{view:"workouts-overview",icon:"🏋️",label:"Treinos"},{view:"history-overview",icon:"📋",label:"Histórico"},{view:"agenda",icon:"📅",label:"Agenda"},{view:"kids",icon:"🎾",label:"Aulas Kids"},{view:"data",icon:"💾",label:"Dados"}];
  const mobileOrder:View[]=["today","kids","finance","performance","students","workouts-overview","assessments-overview","history-overview","agenda","data"];
  const orderedItems = mobile ? mobileOrder.map(view=>items.find(item=>item.view===view)!).filter(Boolean) : items;
  const renderDays=Math.max(0,Math.ceil((new Date("2026-09-06T23:59:59").getTime()-Date.now())/86400000));
  return <aside className="dashboard-sidebar"><div className="dashboard-logo-card"><img src="/logo-danilo.jpg" alt="Danilo Modesto Personal Trainer" className="dashboard-sidebar-logo" /></div><nav className="dashboard-nav">{orderedItems.filter(item=>mobile||item.view!=="kids").map(item=><button key={item.view} className={`dashboard-nav-item ${current===item.view?"active":""}`} onClick={()=>onNavigate(item.view)}>{item.icon} {item.label}</button>)}</nav>{!mobile&&renderDays>0?<a className="render-reminder" href="https://dashboard.render.com/billing" target="_blank" rel="noreferrer"><small>⚠ Assinatura do Render</small><strong>{renderDays} dias restantes</strong></a>:null}{!mobile?<button className={`sidebar-kids-special ${current==="kids"?"active":""}`} onClick={()=>onNavigate("kids")}><img src="/logo-ctds.png" alt="CT DS Tennis"/><span><small>Gestão pedagógica</small><strong>Aulas Kids</strong></span></button>:null}<button className="dashboard-logout" onClick={logout}>Sair</button>{!mobile?<span className="sidebar-resize-handle" onPointerDown={event=>beginPanelResize(event,"sidebar")}/>:null}</aside>;
}
type WeatherData={temperature:number;wind:number;rainChance:number;code:number;hours:{time:string;rain:number}[]};
function DigitalClock(){
  const [now,setNow]=useState<Date|null>(null);
  useEffect(()=>{setNow(new Date());const timer=window.setInterval(()=>setNow(new Date()),1000);return()=>window.clearInterval(timer);},[]);
  const hours=now?.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})||"--:--";
  const seconds=now?.toLocaleTimeString("pt-BR",{second:"2-digit"})||"--";
  return <div className="header-clock" aria-label={`Horário atual ${hours}`}><span>◷</span><div><small>Horário atual</small><strong>{hours}<em>:{seconds}</em></strong></div></div>;
}
function WeatherWidget({onOpen}:{onOpen:()=>void}){
  const [weather,setWeather]=useState<WeatherData|null>(null);
  const [status,setStatus]=useState<"loading"|"ready"|"denied"|"error">("loading");
  useEffect(()=>{
    let cancelled=false;
    const load=(latitude:number,longitude:number)=>{
      const url=`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code,wind_speed_10m&hourly=precipitation_probability&forecast_days=1&timezone=auto`;
      fetch(url).then(r=>{if(!r.ok)throw new Error("weather");return r.json();}).then(data=>{
        if(cancelled)return;
        const now=Date.now();
        const times:string[]=data.hourly?.time||[]; const rains:number[]=data.hourly?.precipitation_probability||[];
        const upcoming=times.map((time,i)=>({time,rain:Number(rains[i]||0)})).filter(item=>new Date(item.time).getTime()>=now-30*60*1000).slice(0,4);
        setWeather({temperature:Number(data.current?.temperature_2m||0),wind:Number(data.current?.wind_speed_10m||0),rainChance:upcoming.length?Math.max(...upcoming.map(i=>i.rain)):0,code:Number(data.current?.weather_code||0),hours:upcoming});setStatus("ready");
      }).catch(()=>{if(!cancelled)setStatus("error");});
    };
    if(!navigator.geolocation){setStatus("error");return;}
    navigator.geolocation.getCurrentPosition(pos=>load(pos.coords.latitude,pos.coords.longitude),()=>setStatus("denied"),{enableHighAccuracy:false,timeout:8000,maximumAge:30*60*1000});
    return()=>{cancelled=true;};
  },[]);
  const icon=weather?weatherIcon(weather.code):"🌦️";
  return <section className="header-weather" role="button" tabIndex={0} onClick={onOpen} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();onOpen();}}} title="Abrir previsão completa"><span className="header-weather-icon">{icon}</span><div>{status==="loading"?<small>Carregando clima...</small>:status==="denied"?<small>Permita a localização para ver o clima.</small>:status==="error"?<small>Previsão indisponível.</small>:weather?<><div className="header-weather-main"><b>{Math.round(weather.temperature)}°C</b><span>{weatherDescription(weather.code)}</span></div><div className="header-weather-meta"><span>Chuva {Math.round(weather.rainChance)}%</span><span>💨 {Math.round(weather.wind)} km/h</span></div></>:null}</div></section>;
}
function weatherIcon(code:number){if(code===0)return"☀️";if(code<=3)return"⛅";if(code<=48)return"🌫️";if(code<=67)return"🌧️";if(code<=77)return"🌨️";if(code<=82)return"🌦️";return"⛈️";}
function weatherDescription(code:number){if(code===0)return"Céu limpo";if(code<=3)return"Parcialmente nublado";if(code<=48)return"Neblina";if(code<=67)return"Chuva";if(code<=77)return"Granizo/neve";if(code<=82)return"Pancadas";return"Temporal";}

type WeatherDay={date:string;min:number;max:number;rain:number;wind:number;code:number};
function WeatherPage({onBack}:{onBack:()=>void}){
  const [status,setStatus]=useState<"loading"|"ready"|"denied"|"error">("loading");
  const [days,setDays]=useState<WeatherDay[]>([]);
  const [current,setCurrent]=useState<{temperature:number;wind:number;code:number}|null>(null);
  useEffect(()=>{
    if(!navigator.geolocation){setStatus("error");return;}
    navigator.geolocation.getCurrentPosition(({coords:{latitude,longitude}})=>{
      const url=`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max&forecast_days=7&timezone=auto`;
      fetch(url).then(r=>{if(!r.ok)throw new Error("weather");return r.json();}).then(data=>{
        setCurrent({temperature:Number(data.current?.temperature_2m||0),wind:Number(data.current?.wind_speed_10m||0),code:Number(data.current?.weather_code||0)});
        const d=(data.daily?.time||[]).map((date:string,i:number)=>({date,min:Number(data.daily.temperature_2m_min?.[i]||0),max:Number(data.daily.temperature_2m_max?.[i]||0),rain:Number(data.daily.precipitation_probability_max?.[i]||0),wind:Number(data.daily.wind_speed_10m_max?.[i]||0),code:Number(data.daily.weather_code?.[i]||0)}));
        setDays(d);setStatus("ready");
      }).catch(()=>setStatus("error"));
    },err=>setStatus(err.code===1?"denied":"error"),{enableHighAccuracy:false,timeout:8000,maximumAge:600000});
  },[]);
  return <><header className="dashboard-topbar"><div><p className="dashboard-eyebrow">Planejamento das aulas</p><h1>Previsão do tempo</h1><p>Clima local para os próximos 7 dias.</p></div><button className="secondary" onClick={onBack}>← Voltar</button></header><section className="dashboard-content weather-page">
    {status==="loading"?<div className="panel"><strong>Carregando previsão...</strong></div>:status==="denied"?<div className="panel"><strong>Localização não autorizada.</strong><p className="muted">Permita a localização no navegador para consultar a previsão local.</p></div>:status==="error"?<div className="panel"><strong>Previsão indisponível.</strong><p className="muted">O restante do DMP continua funcionando normalmente.</p></div>:<>
      {current?<section className="panel weather-current"><div><span className="weather-big-icon">{weatherIcon(current.code)}</span><div><p className="dashboard-eyebrow">Agora</p><h2>{Math.round(current.temperature)}°C</h2><p>{weatherDescription(current.code)} · Vento {Math.round(current.wind)} km/h</p></div></div></section>:null}
      <div className="weather-days">{days.map((day,i)=><article className="panel weather-day" key={day.date}><div className="weather-day-head"><span>{weatherIcon(day.code)}</span><div><strong>{i===0?"Hoje":new Date(`${day.date}T12:00:00`).toLocaleDateString("pt-BR",{weekday:"long"})}</strong><small>{new Date(`${day.date}T12:00:00`).toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit"})}</small></div></div><h3>{Math.round(day.min)}° / {Math.round(day.max)}°</h3><p>🌧️ Chuva {Math.round(day.rain)}%</p><p>💨 Vento até {Math.round(day.wind)} km/h</p><small>{weatherDescription(day.code)}</small></article>)}</div>
    </>}
  </section></>;
}


function whatsappLink(phone?:string){const digits=(phone||"").replace(/\D/g,"");if(digits.length<10)return null;const normalized=digits.startsWith("55")?digits:`55${digits}`;return `https://wa.me/${normalized}`;}

function StudentCategoryDot({category}:{category?:TennisCategory}) { return category?<span className={`tennis-category-dot ${category.toLowerCase()}`} title={`Categoria ${category.toLowerCase()}`}/>:null; }
function Stat({icon,label,value,onClick}:{icon:string;label:string;value:number;onClick?:()=>void}) { return onClick?<button type="button" className="stat-card stat-card-button" onClick={onClick}><div className="stat-card-icon">{icon}</div><div><span>{label}</span><strong>{value}</strong></div></button>:<article className="stat-card"><div className="stat-card-icon">{icon}</div><div><span>{label}</span><strong>{value}</strong></div></article>; }

function GlobalSearch({value,onChange,students,events,onStudent,onAgenda}:{value:string;onChange:(value:string)=>void;students:Student[];events:CalendarEvent[];onStudent:(id:string)=>void;onAgenda:(date:string)=>void}){
  const query=normalizeName(value);
  const studentResults=query?students.filter(student=>student.status==="ACTIVE"&&normalizeName(`${student.name} ${student.phone} ${student.goal} ${student.notes}`).includes(query)).slice(0,6):[];
  const eventResults=query?events.filter(event=>normalizeName(`${event.summary} ${event.description||""} ${event.location||""}`).includes(query)).sort((a,b)=>calendarEventDate(a).localeCompare(calendarEventDate(b))).slice(0,5):[];
  return <section className="global-search-box"><div className="global-search-input"><span>⌕</span><input value={value} onChange={event=>onChange(event.target.value)} placeholder="Busca rápida: aluno, compromisso, telefone ou observação..."/>{value?<button onClick={()=>onChange("")} aria-label="Limpar busca">×</button>:null}</div>{query?<div className="global-search-results">{studentResults.map(student=><button key={student.id} onClick={()=>onStudent(student.id)}><span>👤</span><strong>{student.name}</strong><small>Aluno · abrir cadastro</small></button>)}{eventResults.map(event=><button key={event.id} onClick={()=>onAgenda(calendarEventDate(event))}><span>📅</span><strong>{event.summary}</strong><small>{formatDate(calendarEventDate(event))} · {formatCalendarTime(event)}</small></button>)}{!studentResults.length&&!eventResults.length?<p>Nenhum resultado encontrado.</p>:null}</div>:null}</section>;
}

function WeeklySmartSummary({students,events}:{students:Student[];events:CalendarEvent[]}){
  const now=new Date(`${today()}T12:00:00`);const weekday=(now.getDay()+6)%7;
  const start=new Date(now);start.setDate(now.getDate()-weekday);const end=new Date(start);end.setDate(start.getDate()+6);
  const startKey=localDateKey(start);const endKey=localDateKey(end);
  const sessions=students.flatMap(student=>student.sessions).filter(session=>session.date>=startKey&&session.date<=endKey);
  const absences=sessions.filter(session=>session.source==="ABSENCE").length;
  const weekEvents=events.filter(event=>{const date=calendarEventDate(event);return date>=startKey&&date<=endKey;});
  const completed=sessions.length-absences;
  const remaining=weekEvents.filter(event=>new Date(event.end||`${calendarEventDate(event)}T23:59:59`).getTime()>Date.now()).length;
  const busiest=Object.entries(weekEvents.reduce<Record<string,number>>((acc,event)=>{const date=calendarEventDate(event);acc[date]=(acc[date]||0)+1;return acc;},{})).sort((a,b)=>b[1]-a[1])[0];
  return <section className="weekly-smart-summary"><div><span>Resumo semanal inteligente</span><strong>{completed} atendimento{completed===1?"":"s"} registrado{completed===1?"":"s"}</strong><small>{start.toLocaleDateString("pt-BR",{day:"2-digit",month:"short"})} a {end.toLocaleDateString("pt-BR",{day:"2-digit",month:"short"})}</small></div><dl><div><dt>Agenda</dt><dd>{weekEvents.length}</dd></div><div><dt>Ainda faltam</dt><dd>{remaining}</dd></div><div><dt>Ausências</dt><dd>{absences}</dd></div><div><dt>Dia mais cheio</dt><dd>{busiest?`${new Date(`${busiest[0]}T12:00:00`).toLocaleDateString("pt-BR",{weekday:"short"})} · ${busiest[1]}`:"—"}</dd></div></dl></section>;
}

function TodayHighlights({events,notes,students,sessions,onAgenda,onKids,onNotes}:{events:CalendarEvent[];notes:DmpNote[];students:Student[];sessions:{student:Student;session:Session}[];onAgenda:(date:string)=>void;onKids:()=>void;onNotes:()=>void}){
  const timed=events.filter(event=>!event.allDay).sort((a,b)=>a.start.localeCompare(b.start));
  const programmedIds=new Set(timed.filter(event=>!kidsCalendarRequest(event)).flatMap(event=>getCalendarEventStudents(event,students).map(student=>student.id)));
  const attendedIds=new Set(sessions.filter(item=>item.session.source!=="ABSENCE"&&programmedIds.has(item.student.id)).map(item=>item.student.id));
  const absentIds=new Set(sessions.filter(item=>item.session.source==="ABSENCE").map(item=>item.student.id));
  const programmed=programmedIds.size;
  const attended=attendedIds.size;
  const remaining=[...programmedIds].filter(id=>!attendedIds.has(id)&&!absentIds.has(id)).length;
  const progress=programmed?Math.round((attended/programmed)*100):0;
  const kids=timed.map(event=>({event,kids:kidsCalendarRequest(event)})).filter((item):item is {event:CalendarEvent;kids:KidsLessonOpenRequest}=>Boolean(item.kids));
  const pending=notes.filter(note=>!note.done);
  return <div className="today-highlight-grid"><MiniMonthCalendar onSelect={onAgenda}/><button className="today-highlight-card" onClick={()=>onAgenda(today())}><span className="today-highlight-icon">📊</span><div><strong>Resumo do dia</strong><span className="highlight-lines"><small><b>{programmed}</b> alunos programados</small><small><b>{attended}</b> atendidos</small><small><b>{remaining}</b> ainda faltam</small></span><i><b style={{width:`${progress}%`}}/></i></div><em>›</em></button><button className="today-highlight-card" onClick={onKids}><span className="today-highlight-icon">🎾</span><div><strong>Aulas Kids hoje</strong><span className="highlight-lines">{kids.length?kids.map(({event,kids:item})=><small key={event.id}><b>{formatCalendarTime(event)}</b> · {kidsCategoryName(item.category)}</small>):<small>Nenhuma aula Kids hoje</small>}</span></div><em>›</em></button><button className="today-highlight-card" onClick={onNotes}><span className="today-highlight-icon">🗒️</span><div><strong>Recados pendentes</strong><span className="highlight-lines"><small><b>{pending.length}</b> pendente{pending.length===1?"":"s"}</small>{pending.slice(0,2).map(note=><small key={note.id}>{note.text}</small>)}</span></div><em>›</em></button></div>;
}
function MiniMonthCalendar({onSelect}:{onSelect:(date:string)=>void}){
  const now=new Date();const [cursor,setCursor]=useState(()=>new Date(now.getFullYear(),now.getMonth(),1));const year=cursor.getFullYear();const month=cursor.getMonth();const first=new Date(year,month,1).getDay();const days=new Date(year,month+1,0).getDate();
  return <article className="mini-month"><div className="mini-month-nav"><button onClick={()=>setCursor(new Date(year,month-1,1))}>‹</button><strong>{cursor.toLocaleDateString("pt-BR",{month:"long",year:"numeric"})}</strong><button onClick={()=>setCursor(new Date(year,month+1,1))}>›</button></div><button className="mini-month-today" onClick={()=>{setCursor(new Date(now.getFullYear(),now.getMonth(),1));onSelect(today());}}>Hoje · abrir agenda</button><div className="mini-month-week"><b>D</b><b>S</b><b>T</b><b>Q</b><b>Q</b><b>S</b><b>S</b></div><div className="mini-month-days">{Array.from({length:first},(_,index)=><i key={`e-${index}`}/>)}{Array.from({length:days},(_,index)=>{const day=index+1;const value=`${year}-${String(month+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;return <button key={day} className={value===today()?"today":""} onClick={()=>onSelect(value)}>{day}</button>;})}</div></article>;
}

function DesktopAgendaRail({events,students,onOpenAgenda,onOpenStudent}:{events:CalendarEvent[];students:Student[];onOpenAgenda:(date:string)=>void;onOpenStudent:(id:string)=>void}){
  const now=Date.now();
  const todayKey=today();
  const tomorrowDate=new Date(`${todayKey}T12:00:00`);tomorrowDate.setDate(tomorrowDate.getDate()+1);
  const tomorrowKey=localDateKey(tomorrowDate);
  const upcoming=events.filter(event=>{
    const date=calendarEventDate(event);
    if(date<todayKey)return false;
    if(date>todayKey)return true;
    if(event.allDay)return true;
    return new Date(event.end||event.start).getTime()>now;
  }).sort((a,b)=>a.start.localeCompare(b.start));
  let previousDate="";
  return <aside className="desktop-agenda-rail"><span className="rail-resize-handle" onPointerDown={event=>beginPanelResize(event,"rail")}/><div className="agenda-rail-head"><div><span>📅</span><strong>Próximos compromissos</strong></div><button onClick={()=>onOpenAgenda(todayKey)}>Abrir agenda completa <b>›</b></button></div><div className="agenda-rail-scroll">{upcoming.length?upcoming.map(event=>{const people=getCalendarEventStudents(event,students);const date=calendarEventDate(event);const changed=date!==previousDate;previousDate=date;const dayLabel=date===todayKey?"Hoje":date===tomorrowKey?"Amanhã":"Dia seguinte";return <section className="agenda-rail-group" key={event.id}>{changed?<div className="agenda-rail-day"><span>{dayLabel}</span><strong>{new Date(`${date}T12:00:00`).toLocaleDateString("pt-BR",{weekday:"short",day:"2-digit",month:"short"})}</strong></div>:null}<article className={`agenda-rail-event ${kidsCalendarRequest(event)?`kids kids-${kidsCalendarRequest(event)!.category.toLowerCase()}`:""}`}><button onClick={()=>onOpenAgenda(date)}><small>{formatCalendarTime(event)}</small><strong>{event.summary}</strong></button>{people.length?<div>{people.map(student=><button key={student.id} onClick={()=>onOpenStudent(student.id)}>{student.name}</button>)}</div>:null}</article></section>}):<p>Nenhum próximo compromisso.</p>}</div></aside>;
}

function beginPanelResize(event:any,panel:"sidebar"|"rail"){
  event.preventDefault();
  const move=(pointer:PointerEvent)=>{const width=panel==="sidebar"?pointer.clientX:window.innerWidth-pointer.clientX;const bounded=Math.max(panel==="sidebar"?205:260,Math.min(panel==="sidebar"?360:480,width));document.documentElement.style.setProperty(panel==="sidebar"?"--dmp-sidebar-width":"--dmp-agenda-rail-width",`${bounded}px`);localStorage.setItem(`dmp_${panel}_width`,String(bounded));};
  const stop=()=>{window.removeEventListener("pointermove",move);window.removeEventListener("pointerup",stop);};
  window.addEventListener("pointermove",move);window.addEventListener("pointerup",stop);
}

function MobileQuickActions({onClose,onNavigate}:{onClose:()=>void;onNavigate:(target:"extra"|"receive"|"students"|"kids")=>void}){
  return <div className="mobile-actions-backdrop" onClick={onClose}><section className="mobile-actions-sheet" onClick={event=>event.stopPropagation()}><div><strong>Ações rápidas</strong><button onClick={onClose}>×</button></div><button className="primary" onClick={()=>onNavigate("extra")}>💸 Lançar gasto extra</button><button onClick={()=>onNavigate("receive")}>💰 Registrar recebimento</button><button onClick={()=>onNavigate("students")}>✍ Registrar treino ou presença</button><button onClick={()=>onNavigate("kids")}>🎾 Abrir Aulas Kids</button></section></div>;
}
function kidsCategoryName(category:KidsCategory){return category==="RED"?"Bola vermelha":category==="ORANGE"?"Bola laranja":category==="GREEN"?"Bola verde":"Bola amarela";}
function Header({title,back}:{title:string;back?:()=>void}) { return <header className="topbar"><div className="header-left">{back ? <button className="text-button" onClick={back}>← Voltar</button> : null}<img src="/logo-danilo.jpg" alt="Danilo Modesto" className="header-logo" /><strong>{title}</strong></div></header>; }

function StudentProfileSnapshot({student}:{student:Student}) {
  const age=calculateAge(student.birthDate);
  const lastSession=student.sessions[0];
  const alerts=[student.restrictions,student.injuries].filter(Boolean);
  const workouts=getStudentWorkoutEntries(student);
  const slotLabel=workouts.length?workouts.map(entry=>entry.slot).join(" · "):"Sem ficha";
  return <section className="profile-snapshot"><div className="snapshot-card"><span>Idade</span><strong>{age!==null?`${age} anos`:"—"}</strong></div><div className="snapshot-card"><span>Modalidade</span><strong>{student.modality||"—"}</strong></div><div className="snapshot-card"><span>Treinos montados</span><strong>{slotLabel}</strong></div><div className="snapshot-card"><span>Última sessão</span><strong>{lastSession?formatDate(lastSession.date):"—"}</strong></div>{alerts.length?<div className="snapshot-alert"><span>⚠ Lembretes importantes</span><strong>{alerts.join(" · ")}</strong></div>:<div className="snapshot-alert clear"><span>✓ Cuidados</span><strong>Nenhuma restrição ou dor registrada</strong></div>}</section>;
}

function kidsCalendarRequest(event:CalendarEvent):KidsLessonOpenRequest|null{
  if(event.allDay)return null;
  const name=normalizeName(event.summary);
  let category:KidsCategory|null=null;
  if(/\b(vermelho|vermelha)\b/.test(name))category="RED";
  else if(/\blaranja\b/.test(name))category="ORANGE";
  else if(/\bverde\b/.test(name))category="GREEN";
  else if(/\b(amarelo|amarela)\b/.test(name))category="YELLOW";
  if(!category)return null;
  const date=new Date(event.start);
  const parts=new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false}).formatToParts(date);
  const read=(type:string)=>parts.find(part=>part.type===type)?.value||"";
  return {date:`${read("year")}-${read("month")}-${read("day")}`,time:`${read("hour")}:${read("minute")}`,category};
}

async function printPersonalStudentReport(student:Student){
  const popup=window.open("","_blank");
  if(!popup){alert("Permita a abertura de janelas para gerar o relatório.");return;}
  popup.document.write("<p style='font-family:Arial;padding:24px'>Preparando relatório...</p>");
  let finance:FinanceData|null=null;
  try{const response=await fetch("/api/finance",{cache:"no-store"});if(response.ok)finance=(await response.json()).data||null;}catch{}
  const invoices=(finance?.personalInvoices||[]).filter(item=>item.studentId===student.id||normalizeName(item.studentName)===normalizeName(student.name)).sort((a,b)=>b.competence.localeCompare(a.competence));
  const expected=invoices.reduce((total,item)=>total+item.expectedAmount,0);
  const paid=invoices.reduce((total,item)=>total+item.payments.reduce((sum,payment)=>sum+payment.amount,0),0);
  const months=new Map<string,Session[]>();
  student.sessions.forEach(session=>{const key=session.date.slice(0,7);months.set(key,[...(months.get(key)||[]),session]);});
  const esc=(value:unknown)=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]!));
  const money=(value:number)=>value.toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
  const monthLabel=(value:string)=>new Date(`${value}-01T12:00:00`).toLocaleDateString("pt-BR",{month:"long",year:"numeric"});
  const html=`<!doctype html><html><head><meta charset="utf-8"><title>Relatório · ${esc(student.name)}</title><style>@page{size:A4;margin:14mm}*{box-sizing:border-box}body{font-family:Arial;color:#13202b;margin:0}header{display:flex;justify-content:space-between;align-items:center;border-bottom:4px solid #abd92f;padding-bottom:12px}header img{width:170px}h1{margin:0;font-size:25px}h2{font-size:17px;margin:22px 0 8px;color:#126d94}.muted{color:#65717b}.cards{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:18px 0}.card{border:1px solid #dfe5e8;border-radius:10px;padding:10px}.card small{display:block;color:#65717b}.card strong{font-size:18px}table{width:100%;border-collapse:collapse;font-size:12px}th,td{text-align:left;padding:7px;border-bottom:1px solid #e3e7e9;vertical-align:top}th{background:#f2f7e9}footer{margin-top:28px;border-top:1px solid #ddd;padding-top:8px;font-size:11px;color:#777}@media print{button{display:none}}</style></head><body><header><div><p class="muted">RELATÓRIO INDIVIDUAL</p><h1>${esc(student.name)}</h1><p>${esc(student.goal||"Objetivo não informado")}</p></div><img src="/logo-danilo.jpg"></header><div class="cards"><div class="card"><small>Sessões</small><strong>${student.sessions.length}</strong></div><div class="card"><small>Avaliações</small><strong>${student.assessments.length}</strong></div><div class="card"><small>Recebido</small><strong>${money(paid)}</strong></div><div class="card"><small>Em aberto</small><strong>${money(Math.max(0,expected-paid))}</strong></div></div><h2>Frequência por mês</h2><table><thead><tr><th>Mês</th><th>Registros</th><th>Fichas</th><th>Treinos livres</th><th>Presenças</th></tr></thead><tbody>${[...months.entries()].sort((a,b)=>b[0].localeCompare(a[0])).map(([key,list])=>`<tr><td>${monthLabel(key)}</td><td>${list.length}</td><td>${list.filter(item=>(item.source||"PLANNED")==="PLANNED").length}</td><td>${list.filter(item=>item.source==="FREE").length}</td><td>${list.filter(item=>item.source==="ATTENDANCE").length}</td></tr>`).join("")||"<tr><td colspan='5'>Nenhum registro.</td></tr>"}</tbody></table><h2>Treinos e evolução recente</h2><table><thead><tr><th>Data</th><th>Treino</th><th>Exercícios / cargas</th></tr></thead><tbody>${student.sessions.slice().sort((a,b)=>b.date.localeCompare(a.date)).slice(0,30).map(session=>`<tr><td>${formatDate(session.date)}</td><td>${esc(session.workoutName)}</td><td>${session.completedExercises.map(exercise=>`${esc(exercise.name)}${exercise.sets||exercise.reps?` · ${esc(exercise.sets)}×${esc(exercise.reps)}`:""}${exercise.load?` · ${esc(exercise.load)}`:""}`).join("<br>")||"Presença sem detalhamento"}</td></tr>`).join("")||"<tr><td colspan='3'>Nenhuma sessão.</td></tr>"}</tbody></table><h2>Financeiro</h2><table><thead><tr><th>Competência</th><th>Vencimento</th><th>Previsto</th><th>Pago</th><th>Saldo</th></tr></thead><tbody>${invoices.map(item=>{const received=item.payments.reduce((sum,payment)=>sum+payment.amount,0);return `<tr><td>${esc(item.competence)}</td><td>Dia ${item.dueDay}</td><td>${money(item.expectedAmount)}</td><td>${money(received)}</td><td>${money(Math.max(0,item.expectedAmount-received))}</td></tr>`}).join("")||"<tr><td colspan='5'>Nenhum lançamento financeiro localizado.</td></tr>"}</tbody></table><footer>Danilo Modesto Personal Trainer · Emitido em ${new Date().toLocaleString("pt-BR")}</footer><script>window.onload=()=>setTimeout(()=>window.print(),300)<\/script></body></html>`;
  popup.document.open();popup.document.write(html);popup.document.close();
}

function StudentSummary({student}:{student:Student}) {
  const age = calculateAge(student.birthDate);
  const months = monthsSince(student.startDate);
  const workouts=getStudentWorkoutEntries(student);
  const slotLabel=workouts.length?workouts.map(entry=>`Treino ${entry.slot}`).join(", "):"Sem treino montado";
  return <div className="detail-grid"><article className="panel"><h2>Resumo rápido</h2><dl className="summary-list"><div><dt>Aluno desde</dt><dd>{student.startDate ? formatDate(student.startDate) : "Não informado"}</dd></div><div><dt>Tempo com você</dt><dd>{months === null ? "Não informado" : formatMonths(months)}</dd></div><div><dt>Nascimento</dt><dd>{student.birthDate ? `${formatDate(student.birthDate)}${age !== null ? ` (${age} anos)` : ""}` : "Não informado"}</dd></div><div><dt>Telefone</dt><dd>{student.phone || "Não informado"}</dd></div><div><dt>E-mail</dt><dd>{student.email || "Não informado"}</dd></div><div><dt>Profissão</dt><dd>{student.profession || "Não informado"}</dd></div><div><dt>Modalidade</dt><dd>{student.modality || "Não informado"}</dd></div><div><dt>Frequência</dt><dd>{student.weeklyFrequency || "Não informado"}</dd></div><div><dt>Treinos montados</dt><dd>{slotLabel}</dd></div></dl></article><article className="panel safety-panel"><h2>⚠ Cuidados do aluno</h2><div className="safety-block important"><strong>Restrições / cuidados</strong><p>{student.restrictions || "Nenhuma restrição registrada."}</p></div><div className="safety-block"><strong>Lesões / dores</strong><p>{student.injuries || "Nenhuma lesão ou dor registrada."}</p></div><div className="safety-block"><strong>Medicações / informações relevantes</strong><p>{student.medications || "Nenhuma informação registrada."}</p></div><div className="safety-block"><strong>Observações gerais</strong><p>{student.notes || "Nenhuma observação registrada."}</p></div>{student.emergencyContact||student.emergencyPhone?<div className="safety-block"><strong>Contato de emergência</strong><p>{[student.emergencyContact,student.emergencyPhone].filter(Boolean).join(" · ")}</p></div>:null}</article></div>;
}

function HistoryPanel({student}:{student:Student}) {
  return <section className="panel"><div className="panel-head"><h2>Histórico de sessões</h2><button className="secondary" onClick={() => exportStudentSessionsCsv(student)}>Exportar CSV</button></div>{student.sessions.length ? student.sessions.map(session => <details className="history-item" key={session.id}><summary><span><strong>{formatDate(session.date)}</strong> — {session.workoutName}</span><small>{sessionSourceLabel(session)}</small></summary>{session.completedExercises.length ? <ul className="simple-list">{session.completedExercises.map(exercise => <li key={exercise.id}>{exercise.block ? `${exercise.block} · ` : ""}{exercise.name}{exercise.sets || exercise.reps ? ` — ${exercise.sets}×${exercise.reps}` : ""}{exercise.load ? ` — ${exercise.load}` : ""}{exercise.notes ? ` — ${exercise.notes}` : ""}</li>)}</ul> : <p className="muted">Presença registrada sem detalhamento de exercícios.</p>}<p>{session.notes || "Sem observações."}</p></details>) : <p className="muted">Nenhuma sessão registrada.</p>}</section>;
}

function AssessmentPanel({student,onNew}:{student:Student;onNew:()=>void}) {
  return <section className="panel"><div className="panel-head"><h2>Avaliações</h2><button className="primary" onClick={onNew}>+ Nova avaliação</button></div>{student.assessments.length ? student.assessments.map(assessment => <article className="assessment-card" key={assessment.id}><div><strong>{formatDate(assessment.date)}</strong><p>Peso: {displayNumber(assessment.weight,"kg")} · Gordura: {displayNumber(assessment.bodyFatPercent,"%")} · Massa magra: {displayNumber(assessment.leanMass,"kg")}</p></div>{assessment.photos.length ? <div className="assessment-photos">{assessment.photos.map((photo,index) => <img key={index} src={photo} alt={`Avaliação ${index+1}`} />)}</div> : null}</article>) : <p className="muted">Nenhuma avaliação registrada.</p>}</section>;
}

type StudentFormPayload = Pick<Student,"name"|"phone"|"email"|"goal"|"profession"|"modality"|"weeklyFrequency"|"notes"|"restrictions"|"injuries"|"medications"|"emergencyContact"|"emergencyPhone"|"startDate"|"birthDate"|"tennisCategory">;
function StudentForm({title,initialStudent,onClose,onSave}:{title:string;initialStudent?:Student;onClose:()=>void;onSave:(payload:StudentFormPayload)=>void}) {
  const [form,setForm]=useState<StudentFormPayload>({name:initialStudent?.name||"",phone:initialStudent?.phone||"",email:initialStudent?.email||"",goal:initialStudent?.goal||"",profession:initialStudent?.profession||"",modality:initialStudent?.modality||"",weeklyFrequency:initialStudent?.weeklyFrequency||"",notes:initialStudent?.notes||"",restrictions:initialStudent?.restrictions||"",injuries:initialStudent?.injuries||"",medications:initialStudent?.medications||"",emergencyContact:initialStudent?.emergencyContact||"",emergencyPhone:initialStudent?.emergencyPhone||"",startDate:initialStudent?.startDate||"",birthDate:initialStudent?.birthDate||"",tennisCategory:initialStudent?.tennisCategory||null});
  const age=calculateAge(form.birthDate);
  function submit(event:FormEvent){event.preventDefault();if(!form.name.trim())return;onSave({...form,name:form.name.trim()});}
  return <div className="modal-backdrop"><section className="modal modal-large"><div className="modal-head"><div><h2>{title}</h2><p className="muted">Cadastro completo para atendimento e segurança.</p></div><button className="text-button" onClick={onClose}>Fechar</button></div><form className="form-grid" onSubmit={submit}>
    <label>Nome<input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} required /></label><label>Telefone<input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} /></label>
    <label>E-mail<input type="email" value={form.email||""} onChange={e=>setForm({...form,email:e.target.value})} /></label><label>Profissão<input value={form.profession||""} onChange={e=>setForm({...form,profession:e.target.value})} /></label>
    <label>Data de início<input type="date" value={form.startDate} onChange={e=>setForm({...form,startDate:e.target.value})} /></label><label>Data de nascimento<input type="date" value={form.birthDate} onChange={e=>setForm({...form,birthDate:e.target.value})} />{age!==null?<small>Idade atual: {age} anos</small>:null}</label>
    <label>Modalidade<input value={form.modality||""} onChange={e=>setForm({...form,modality:e.target.value})} placeholder="Ex.: musculação, tênis, corrida" /></label><label>Frequência semanal<input value={form.weeklyFrequency||""} onChange={e=>setForm({...form,weeklyFrequency:e.target.value})} placeholder="Ex.: 2x por semana" /></label>
    <fieldset className="full tennis-category-picker"><legend>Categoria DS Tênis</legend>{([null,"RED","ORANGE","GREEN"] as const).map(category=><button type="button" key={category||"NONE"} className={form.tennisCategory===category?"selected":""} onClick={()=>setForm({...form,tennisCategory:category})}><StudentCategoryDot category={category}/>{category===null?"Sem categoria":category==="RED"?"Vermelha":category==="ORANGE"?"Laranja":"Verde"}</button>)}</fieldset>
    <label className="full">Objetivo<input value={form.goal} onChange={e=>setForm({...form,goal:e.target.value})} /></label>
    <label className="full">⚠ Restrições / cuidados importantes<textarea rows={3} value={form.restrictions} onChange={e=>setForm({...form,restrictions:e.target.value})} placeholder="O que você precisa lembrar antes de prescrever ou iniciar a aula." /></label>
    <label className="full">Lesões / dores<textarea rows={3} value={form.injuries||""} onChange={e=>setForm({...form,injuries:e.target.value})} /></label>
    <label className="full">Medicações / informações relevantes<textarea rows={2} value={form.medications||""} onChange={e=>setForm({...form,medications:e.target.value})} /></label>
    <label>Contato de emergência<input value={form.emergencyContact||""} onChange={e=>setForm({...form,emergencyContact:e.target.value})} /></label><label>Telefone emergência<input value={form.emergencyPhone||""} onChange={e=>setForm({...form,emergencyPhone:e.target.value})} /></label>
    <label className="full">Observações gerais<textarea rows={4} value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} /></label><button className="primary full">Salvar aluno</button></form></section></div>;
}

function DuplicateWorkoutModal({workout,students,sourceStudentId,onClose,onConfirm}:{workout:Workout;students:Student[];sourceStudentId:string;onClose:()=>void;onConfirm:(studentId:string,slot:WorkoutSlot)=>void}){
  const targets=students.filter(student=>student.status==="ACTIVE"&&student.id!==sourceStudentId).sort((a,b)=>a.name.localeCompare(b.name,"pt-BR"));
  const [studentId,setStudentId]=useState(targets[0]?.id||"");
  const [slot,setSlot]=useState<WorkoutSlot>(workout.slot||"A");
  return <div className="modal-backdrop"><section className="modal"><div className="modal-head"><div><h2>Duplicar ficha</h2><p className="muted">Copie “{workout.name}” para outro aluno. A cópia poderá ser editada normalmente.</p></div><button className="text-button" onClick={onClose}>Fechar</button></div><div className="form-grid"><label className="full">Aluno<select value={studentId} onChange={event=>setStudentId(event.target.value)}>{targets.map(student=><option key={student.id} value={student.id}>{student.name}</option>)}</select></label><label className="full">Destino<select value={slot} onChange={event=>setSlot(event.target.value as WorkoutSlot)}>{WORKOUT_SLOTS.map(value=><option key={value} value={value}>Treino {value}</option>)}</select></label><button className="primary full" disabled={!studentId} onClick={()=>onConfirm(studentId,slot)}>Duplicar ficha</button></div></section></div>;
}

function WorkoutSlotsPanel({student,onEdit,onStart,onArchive,onClear,onCopy}:{student:Student;onEdit:(slot:WorkoutSlot,workout:Workout|null)=>void;onStart:(workout:Workout)=>void;onArchive:(workout:Workout)=>void;onClear:(workout:Workout)=>void;onCopy:(workout:Workout)=>void}) {
  const entries=getStudentWorkoutEntries(student);
  const archived=getArchivedWorkouts(student);

  return <div className="workout-section-stack">
    <section className="panel workout-library-panel">
      <div className="panel-head workout-library-head">
        <div><h2>Treinos planejados</h2><p className="muted">Cada aba é independente. Monte A, B, C e D com o protocolo que quiser.</p></div>
        <span className="status-chip ok">{entries.length}/4 montados</span>
      </div>
      <div className="workout-tabs-grid">{WORKOUT_SLOTS.map(slot=>{
        const entry=entries.find(item=>item.slot===slot);
        const workout=entry?.workout;
        return <article className={`workout-slot-card ${workout?"filled":"empty"}`} key={slot}>
          <div className="workout-slot-head"><span className="workout-slot-badge">Treino {slot}</span>{workout?<span className="protocol-chip">{workoutProtocolLabel(workout.protocol)}</span>:<span className="status-chip">Vazio</span>}</div>
          {workout?<><h3>{workout.name||`Treino ${slot}`}</h3><p className="workout-slot-meta">{workout.exercises.length} exercício{workout.exercises.length===1?"":"s"} · {workout.sequenceSize||defaultSequenceSize(workout.protocol||"CONVENTIONAL")} por sequência</p>{workout.notes?<p className="workout-slot-note">{workout.notes}</p>:null}<ul className="workout-slot-preview">{workout.exercises.slice(0,6).map((exercise,index)=><li key={exercise.id}><strong>{index+1}.</strong> {exercise.name}<small>{exercise.sets||exercise.reps?`${exercise.sets}×${exercise.reps}`:""}{exercise.load?` · ${exercise.load}`:""}</small></li>)}</ul>{workout.exercises.length>6?<small className="muted">+ {workout.exercises.length-6} exercícios</small>:null}<div className="workout-slot-actions workout-slot-actions-share"><button className="secondary" onClick={()=>onEdit(slot,workout)}>Editar</button><button className="secondary" onClick={()=>onCopy(workout)}>Duplicar</button><button className="secondary" onClick={()=>openWorkoutSharePreview(student,workout)}>Compartilhar</button><button className="secondary archive-workout-button" onClick={()=>onArchive(workout)}>Arquivar</button><button className="secondary clear-workout-button" onClick={()=>onClear(workout)}>🗑 Limpar treino</button><button className="primary" onClick={()=>onStart(workout)}>▶ Iniciar treino</button></div></>:<><div className="workout-slot-empty"><strong>Treino {slot} ainda não montado</strong><span>Escolha o protocolo e adicione os exercícios.</span></div><button className="primary" onClick={()=>onEdit(slot,null)}>+ Montar Treino {slot}</button></>}
        </article>
      })}</div>
    </section>

    <section className="panel archived-workouts-panel">
      <div className="panel-head workout-library-head">
        <div><h2>Treinos arquivados</h2><p className="muted">Fichas antigas ficam guardadas aqui para consulta. Arquivar não altera o histórico das aulas.</p></div>
        <span className="status-chip">{archived.length} arquivado{archived.length===1?"":"s"}</span>
      </div>
      {archived.length?<div className="archived-workout-list">{archived.map(workout=>{
        const slot=workout.slot;
        const archivedName=slot?`Treino ${slot} · ${workout.name||`Treino ${slot}`}`:workout.name||"Ficha anterior";
        return <details className="archived-workout-item" key={workout.id}>
          <summary>
            <span><strong>{archivedName}</strong><small>{workoutProtocolLabel(workout.protocol)} · {workout.exercises.length} exercício{workout.exercises.length===1?"":"s"}</small></span>
            <span className="archived-workout-date">{workout.archivedAt?`Arquivado em ${formatDate(workout.archivedAt)}`:"Arquivado anteriormente"}</span>
          </summary>
          {workout.notes?<p className="workout-slot-note">{workout.notes}</p>:null}
          <ul className="simple-list archived-exercise-list">{workout.exercises.map((exercise,index)=><li key={exercise.id}><strong>{index+1}. {exercise.block?`${exercise.block} · `:""}{exercise.name}</strong>{exercise.sets||exercise.reps?` — ${exercise.sets}×${exercise.reps}`:""}{exercise.load?` — ${exercise.load}`:""}{exercise.notes?` — ${exercise.notes}`:""}</li>)}</ul>
        </details>
      })}</div>:<div className="empty-review"><strong>Nenhum treino arquivado</strong><span>Quando você trocar uma ficha, use “Arquivar” para guardar o planejamento antigo e liberar a aba.</span></div>}
    </section>
  </div>;
}

function WorkoutEditor({student,workout,slot,exerciseCatalog,onBack,onSave}:{student:Student;workout:Workout|null;slot:WorkoutSlot;exerciseCatalog:string[];onBack:()=>void;onSave:(workout:Workout)=>void}) {
  const initialProtocol=workout?.protocol||"CONVENTIONAL";
  const [name,setName]=useState(workout?.name||`Treino ${slot}`);
  const [week,setWeek]=useState(workout?.week||1);
  const [protocol,setProtocol]=useState<WorkoutProtocol>(initialProtocol);
  const [sequenceSize,setSequenceSize]=useState(workout?.sequenceSize||defaultSequenceSize(initialProtocol));
  const [workoutNotes,setWorkoutNotes]=useState(workout?.notes||"");
  const [exercises,setExercises]=useState<Exercise[]>((workout?.exercises||[]).map(ex=>({...ex,notes:ex.notes||""})));
  const [dictation,setDictation]=useState("");
  const [dictating,setDictating]=useState(false);
  const [removedExercise,setRemovedExercise]=useState<{exercise:Exercise;index:number}|null>(null);

  function applyDictation(){
    const text=dictation.trim(); if(!text)return;
    const detected=detectWorkoutProtocol(text); if(detected){setProtocol(detected);setSequenceSize(defaultSequenceSize(detected));}
    const parsed=organizeQuickTranscript(text.replace(/treino\s+em\s+sistema\s+(?:convencional|b7|bi[- ]?set|tri[- ]?set|circuito|personalizado)[.,;:]?/i,"").replace(/fim\s+do\s+treino[.!]?/i,""));
    if(parsed.length)setExercises(parsed.map((ex,index)=>({...ex,block:ex.block?`Bloco ${ex.block}`:sequenceBlockLabel(detected||protocol,index,defaultSequenceSize(detected||protocol)),notes:ex.notes||""})));
  }
  function listenWorkout(){
    const Recognition=(window as any).SpeechRecognition||(window as any).webkitSpeechRecognition;
    if(!Recognition){alert("Ditado por voz não disponível neste navegador. Você pode colar ou digitar o treino.");return;}
    const recognition=new Recognition(); recognition.lang="pt-BR"; recognition.continuous=true; recognition.interimResults=false;
    recognition.onstart=()=>setDictating(true); recognition.onend=()=>setDictating(false); recognition.onerror=()=>setDictating(false);
    recognition.onresult=(event:any)=>{let spoken="";for(let i=event.resultIndex;i<event.results.length;i++)spoken+=`${event.results[i][0].transcript} `;setDictation(current=>`${current} ${spoken}`.trim());}; recognition.start();
  }

  function updateExercise(id:string,patch:Partial<Exercise>){setExercises(current=>current.map(item=>item.id===id?{...item,...patch}:item));}
  function addExercise(){setExercises(current=>[...current,{id:crypto.randomUUID(),block:"",name:"",sets:"3",reps:"12",load:"",notes:""}]);}
  function removeExercise(id:string){setExercises(current=>{const index=current.findIndex(item=>item.id===id);if(index<0)return current;setRemovedExercise({exercise:current[index],index});return current.filter(item=>item.id!==id);});}
  function undoExerciseRemoval(){if(!removedExercise)return;setExercises(current=>{const next=[...current];next.splice(Math.min(removedExercise.index,next.length),0,removedExercise.exercise);return next;});setRemovedExercise(null);}
  function changeProtocol(next:WorkoutProtocol){setProtocol(next);setSequenceSize(defaultSequenceSize(next));}
  function organizeSequences(){setExercises(current=>current.map((exercise,index)=>({...exercise,block:sequenceBlockLabel(protocol,index,sequenceSize)})));}
  function applyTemplate(template:WorkoutTemplate){
    if(exercises.some(exercise=>exercise.name.trim())&&!confirm(`Substituir os exercícios atuais pelo modelo “${template.label}”?`))return;
    setProtocol(template.protocol);
    setSequenceSize(template.sequenceSize);
    setWorkoutNotes(template.notes||"");
    setExercises(template.exercises.map((exercise,index)=>({id:crypto.randomUUID(),block:exercise.block||sequenceBlockLabel(template.protocol,index,template.sequenceSize),name:exercise.name||"",sets:exercise.sets||"3",reps:exercise.reps||"12",load:"",notes:""})));
  }

  const save=()=>{
    const cleanExercises=exercises.filter(exercise=>exercise.name.trim()).map((exercise,index)=>({
      ...exercise,
      block:exercise.block?.trim()||sequenceBlockLabel(protocol,index,sequenceSize),
      name:exercise.name.trim(),
      sets:exercise.sets.trim(),
      reps:exercise.reps.trim(),
      load:exercise.load.trim(),
      notes:exercise.notes?.trim()||""
    }));

    onSave({
      id:workout?.id||crypto.randomUUID(),
      slot,
      name:name.trim()||`Treino ${slot}`,
      week,
      active:true,
      protocol,
      sequenceSize:Math.max(1,sequenceSize),
      notes:workoutNotes.trim(),
      exercises:cleanExercises
    });
  };

  return <main className="app-page"><Header title={`${student.name} — Treino ${slot}`} back={onBack}/><section className="content workout-editor-page">
    {student.restrictions||student.injuries?<div className="session-alert"><strong>⚠ Atenção com {student.name}</strong><span>{[student.restrictions,student.injuries].filter(Boolean).join(" · ")}</span></div>:null}
    <section className="panel workout-config-panel"><div className="workout-editor-title"><div><span className="workout-slot-badge large">Treino {slot}</span><h1>Montagem da ficha</h1><p>Defina o protocolo desta aba e monte a sequência do jeito que você trabalha.</p></div><button className="primary" disabled={!exercises.some(ex=>ex.name.trim())} onClick={save}>Salvar Treino {slot}</button></div><div className="workout-config-grid"><label>Nome / foco<input value={name} onChange={e=>setName(e.target.value)} placeholder={`Treino ${slot}`}/></label><label>Semana<input type="number" min="1" value={week} onChange={e=>setWeek(Number(e.target.value))}/></label><label>Protocolo<select value={protocol} onChange={e=>changeProtocol(e.target.value as WorkoutProtocol)}>{WORKOUT_PROTOCOL_OPTIONS.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select></label><label>Exercícios por sequência<input type="number" min="1" max="12" value={sequenceSize} onChange={e=>setSequenceSize(Math.max(1,Number(e.target.value)||1))}/></label></div><div className="protocol-help"><strong>{workoutProtocolLabel(protocol)}</strong><span>{protocolDescription(protocol,sequenceSize)}</span><button className="secondary compact-action" onClick={organizeSequences}>Organizar blocos automaticamente</button></div><label>Observações da ficha<textarea rows={3} value={workoutNotes} onChange={e=>setWorkoutNotes(e.target.value)} placeholder="Ex.: atenção ao intervalo, progressão planejada, ordem especial..."/></label></section>

    <section className="panel workout-template-panel"><div className="panel-head"><div><h2>Modelos de treino</h2><p className="muted">Use uma estrutura pronta como ponto de partida e revise tudo antes de salvar.</p></div></div><div className="workout-template-grid">{WORKOUT_TEMPLATES.map(template=><button className="secondary" key={template.id} onClick={()=>applyTemplate(template)}><strong>{template.label}</strong><small>{template.description}</small></button>)}</div></section>

    <section className="panel workout-dictation-panel"><div className="panel-head"><div><h2>📋 Importar treino por texto</h2><p className="muted">Cole aqui o treino organizado e transforme em ficha para revisão. Nada é salvo automaticamente.</p></div></div><textarea rows={8} value={dictation} onChange={e=>setDictation(e.target.value)} placeholder={'Treino em sistema B7\n\nBloco 1\nSupino reto — 3x15 — 30 kg\nAgachamento livre — 3x15\n\nBloco 2\nSupino inclinado — 3x12 — 12 kg de cada lado\nCadeira extensora — 3x15'}/><div className="hero-actions"><button className="primary" onClick={applyDictation} disabled={!dictation.trim()}>Interpretar texto</button><button className="secondary" onClick={listenWorkout}>{dictating?"Ouvindo...":"🎤 Falar (experimental)"}</button></div><small className="muted">Depois de interpretar, confira protocolo, blocos, séries, repetições e cargas na tabela abaixo. O microfone continua disponível, mas é experimental.</small></section>

    <section className="panel workout-grid-panel"><div className="panel-head"><div><h2>Exercícios do Treino {slot}</h2><p className="muted">Comece a digitar um exercício já usado para ver sugestões.</p></div><button className="primary" onClick={addExercise}>+ Exercício</button></div><datalist id="dmp-exercise-catalog">{exerciseCatalog.map(name=><option key={name} value={name}/>)}</datalist>{exercises.length?<div className="workout-table"><div className="workout-table-head"><span>#</span><span>Seq.</span><span>Exercício</span><span>Séries</span><span>Reps</span><span>Carga</span><span>Observação</span><span></span></div>{exercises.map((exercise,index)=><div className="workout-table-row" key={exercise.id}><strong>{index+1}</strong><input aria-label="Sequência" placeholder={sequenceBlockLabel(protocol,index,sequenceSize)||"—"} value={exercise.block||""} onChange={e=>updateExercise(exercise.id,{block:e.target.value})}/><input className="workout-exercise-name" list="dmp-exercise-catalog" placeholder="Exercício" value={exercise.name} onChange={e=>updateExercise(exercise.id,{name:e.target.value})}/><input placeholder="Séries" value={exercise.sets} onChange={e=>updateExercise(exercise.id,{sets:e.target.value})}/><input placeholder="Reps" value={exercise.reps} onChange={e=>updateExercise(exercise.id,{reps:e.target.value})}/><input placeholder="Carga" value={exercise.load} onChange={e=>updateExercise(exercise.id,{load:e.target.value})}/><input placeholder="Observação" value={exercise.notes||""} onChange={e=>updateExercise(exercise.id,{notes:e.target.value})}/><button className="danger-link workout-remove" onClick={()=>removeExercise(exercise.id)}>×</button></div>)}</div>:<div className="empty-review"><strong>Nenhum exercício ainda</strong><span>Toque em “+ Exercício” para começar a montar o Treino {slot}.</span></div>}{removedExercise?<div className="undo-strip"><span>Exercício removido.</span><button onClick={undoExerciseRemoval}>Desfazer</button></div>:null}<div className="workout-editor-footer"><button className="secondary" onClick={addExercise}>+ Adicionar exercício</button><button className="primary" disabled={!exercises.some(ex=>ex.name.trim())} onClick={save}>Salvar Treino {slot}</button></div></section>
  </section></main>;
}

function PlannedSession({student,workout,onBack,onSave}:{student:Student;workout:Workout|null;onBack:()=>void;onSave:(session:Session)=>void}) {
  const [exercises,setExercises]=useState<Exercise[]>((workout?.exercises||[]).map(ex=>({...ex,notes:ex.notes||""})));
  const [completed,setCompleted]=useState<Record<string,boolean>>(() => Object.fromEntries((workout?.exercises||[]).map(ex=>[ex.id,true])));
  const [notes,setNotes]=useState("");
  const [sessionDate,setSessionDate]=useState(today());
  const [lessonMode,setLessonMode]=useState(false);
  const [currentIndex,setCurrentIndex]=useState(0);
  const [startedAt]=useState(()=>new Date().toISOString());
  function updateExercise(id:string, patch:Partial<Exercise>){setExercises(current=>current.map(item=>item.id===id?{...item,...patch}:item));}
  const completedCount=exercises.filter(ex=>completed[ex.id]).length;
  const currentExercise=exercises[currentIndex];
  const slot=workout?.slot||inferWorkoutSlot(workout,0);
  const protocol=workout?.protocol||"CONVENTIONAL";

  if(lessonMode && currentExercise){
    const previous=findPreviousExercise(student,currentExercise.name);
    return <main className="app-page lesson-mode-page"><Header title={`${student.name} — Treino ${slot}`} back={()=>setLessonMode(false)}/><section className="content lesson-mode-content">
      {student.restrictions||student.injuries?<div className="session-alert"><strong>⚠ Atenção com {student.name}</strong><span>{[student.restrictions,student.injuries].filter(Boolean).join(" · ")}</span></div>:null}
      <div className="lesson-progress"><span>{workoutProtocolLabel(protocol)} · Exercício {currentIndex+1} de {exercises.length}</span><div><i style={{width:`${((currentIndex+1)/Math.max(1,exercises.length))*100}%`}}/></div></div>
      <article className="panel lesson-card"><div className="lesson-card-top"><span className="status-chip">{currentExercise.block||`#${currentIndex+1}`}</span><label className="exercise-check"><input type="checkbox" checked={completed[currentExercise.id]??true} onChange={e=>setCompleted(current=>({...current,[currentExercise.id]:e.target.checked}))}/><span>Realizado</span></label></div><h1>{currentExercise.name}</h1>{currentExercise.notes?<div className="planned-note">📌 {currentExercise.notes}</div>:null}{previous?<div className="previous-load"><span>Última execução</span><strong>{previous.sets&&previous.reps?`${previous.sets}×${previous.reps}`:""}{previous.load?` · ${previous.load}`:""}</strong><small>{formatDate(previous.date)}</small></div>:<div className="previous-load muted">Sem execução anterior encontrada.</div>}<div className="planned-fields lesson-fields"><label>Séries<input value={currentExercise.sets} onChange={e=>updateExercise(currentExercise.id,{sets:e.target.value})}/></label><label>Repetições<input value={currentExercise.reps} onChange={e=>updateExercise(currentExercise.id,{reps:e.target.value})}/></label><label>Carga<input value={currentExercise.load} onChange={e=>updateExercise(currentExercise.id,{load:e.target.value})}/></label></div><label className="lesson-exercise-note">Observação de hoje<input value={currentExercise.notes||""} onChange={e=>updateExercise(currentExercise.id,{notes:e.target.value})} placeholder="Ajuste feito hoje..."/></label><div className="lesson-actions"><button className="secondary" disabled={currentIndex===0} onClick={()=>setCurrentIndex(i=>Math.max(0,i-1))}>← Anterior</button><button className="primary" onClick={()=>{setCompleted(current=>({...current,[currentExercise.id]:true}));setCurrentIndex(i=>Math.min(exercises.length-1,i+1));}}>{currentIndex===exercises.length-1?"✓ Último exercício":"Concluir e próximo →"}</button></div></article>
      <button className="secondary" onClick={()=>setLessonMode(false)}>Voltar para ficha completa</button>
    </section></main>;
  }

  return <main className="app-page"><Header title={`${student.name} — Treino ${slot}`} back={onBack}/><section className="content narrow">
    {student.restrictions||student.injuries ? <div className="session-alert"><strong>⚠ Atenção com {student.name}</strong><span>{[student.restrictions,student.injuries].filter(Boolean).join(" · ")}</span></div> : null}<div className="session-mode-banner"><span>📋 Treino {slot} · {workoutProtocolLabel(protocol)}</span><strong>{workout?.name||`Treino ${slot}`}</strong><small>{completedCount}/{exercises.length} exercícios marcados{workout?.notes?` · ${workout.notes}`:""}</small><button className="secondary compact-button" onClick={()=>setLessonMode(true)}>▶ Modo aula</button></div>
    <div className="session-list">{exercises.map(ex=>{const previous=findPreviousExercise(student,ex.name);return <article className={`session-exercise planned-row ${completed[ex.id]?"is-done":""}`} key={ex.id}>
      <label className="exercise-check"><input type="checkbox" checked={completed[ex.id]??true} onChange={e=>setCompleted(current=>({...current,[ex.id]:e.target.checked}))}/><span>Feito</span></label>
      <div className="planned-exercise-main"><div className="planned-title-line"><span className="status-chip">{ex.block||"—"}</span><input className="planned-name" value={ex.name} onChange={e=>updateExercise(ex.id,{name:e.target.value})}/></div>{ex.notes?<small className="planned-note-inline">📌 {ex.notes}</small>:null}{previous?<small className="last-load-inline">Última: {previous.sets&&previous.reps?`${previous.sets}×${previous.reps}`:""}{previous.load?` · ${previous.load}`:""} · {formatDate(previous.date)}</small>:null}<div className="planned-fields"><input placeholder="Séries" value={ex.sets} onChange={e=>updateExercise(ex.id,{sets:e.target.value})}/><input placeholder="Reps" value={ex.reps} onChange={e=>updateExercise(ex.id,{reps:e.target.value})}/><input placeholder="Carga" value={ex.load} onChange={e=>updateExercise(ex.id,{load:e.target.value})}/><input placeholder="Observação de hoje" value={ex.notes||""} onChange={e=>updateExercise(ex.id,{notes:e.target.value})}/></div></div>
    </article>})}</div>
    <div className="panel form-stack"><label>Data<input type="date" value={sessionDate} onChange={e=>setSessionDate(e.target.value)}/></label><label>Alterações / observações<textarea rows={6} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Ex.: exercício substituído, carga alterada, bloco não realizado..."/></label><button className="primary finish-button" disabled={!exercises.some(ex=>completed[ex.id])} onClick={()=>onSave({id:crypto.randomUUID(),date:sessionDate,workoutName:workout?.name||`Treino ${slot}`,notes,completedExercises:exercises.filter(ex=>completed[ex.id]),source:"PLANNED",startedAt,finishedAt:new Date().toISOString()})}>✓ Treino concluído — salvar no histórico</button></div>
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
  function listen(){
  const SpeechRecognition=(window as any).SpeechRecognition||(window as any).webkitSpeechRecognition;

  if(!SpeechRecognition){
    alert("O reconhecimento de voz não está disponível neste navegador. Use o campo de texto.");
    return;
  }

  const voiceWindow=window as any;

  // Segundo toque: para definitivamente.
  if(voiceWindow.__dmpShouldListen){
    voiceWindow.__dmpShouldListen=false;

    const activeRecognition=voiceWindow.__dmpRecognition;
    if(activeRecognition){
      activeRecognition.onend=null;
      try{activeRecognition.stop();}catch{}
    }

    voiceWindow.__dmpRecognition=null;
    voiceWindow.__dmpLastFinalText="";
    voiceWindow.__dmpLastFinalAt=0;
    setListening(false);
    return;
  }

  const normalizeVoiceText=(value:string)=>
    value
      .toLocaleLowerCase("pt-BR")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g,"")
      .replace(/[^\p{L}\p{N}\s]/gu," ")
      .replace(/\s+/g," ")
      .trim();

  const appendWithoutDuplicate=(current:string,incoming:string)=>{
    const cleanIncoming=incoming.replace(/\s+/g," ").trim();
    if(!cleanIncoming) return current;

    const now=Date.now();
    const normalizedIncoming=normalizeVoiceText(cleanIncoming);
    const lastFinal=String(voiceWindow.__dmpLastFinalText||"");
    const normalizedLast=normalizeVoiceText(lastFinal);
    const lastAt=Number(voiceWindow.__dmpLastFinalAt||0);

    // Chrome/Android pode devolver a mesma frase final mais de uma vez.
    if(normalizedLast && now-lastAt<3500){
      if(normalizedIncoming===normalizedLast){
        voiceWindow.__dmpLastFinalAt=now;
        return current;
      }

      // Se a nova hipótese apenas cresceu, acrescenta só a parte nova.
      if(normalizedIncoming.startsWith(normalizedLast+" ")){
        const lastWords=lastFinal.trim().split(/\s+/).filter(Boolean).length;
        const incomingWords=cleanIncoming.split(/\s+/).filter(Boolean);
        const delta=incomingWords.slice(lastWords).join(" ").trim();

        voiceWindow.__dmpLastFinalText=cleanIncoming;
        voiceWindow.__dmpLastFinalAt=now;

        if(!delta) return current;
        const base=current.trim();
        return base ? `${base} ${delta}` : delta;
      }

      // Se voltou uma hipótese menor já contida na anterior, ignora.
      if(normalizedLast.startsWith(normalizedIncoming+" ")){
        voiceWindow.__dmpLastFinalAt=now;
        return current;
      }
    }

    // Remove sobreposição entre o final já salvo e o começo do novo trecho.
    const currentWords=current.trim().split(/\s+/).filter(Boolean);
    const incomingWords=cleanIncoming.split(/\s+/).filter(Boolean);

    if(!currentWords.length){
      voiceWindow.__dmpLastFinalText=cleanIncoming;
      voiceWindow.__dmpLastFinalAt=now;
      return cleanIncoming;
    }

    const currentNormalized=currentWords.map(normalizeVoiceText);
    const incomingNormalized=incomingWords.map(normalizeVoiceText);

    let overlap=0;
    const maxOverlap=Math.min(currentNormalized.length,incomingNormalized.length,24);

    for(let size=maxOverlap;size>0;size--){
      if(
        currentNormalized.slice(-size).join(" ")===
        incomingNormalized.slice(0,size).join(" ")
      ){
        overlap=size;
        break;
      }
    }

    const remainder=incomingWords.slice(overlap).join(" ").trim();

    voiceWindow.__dmpLastFinalText=cleanIncoming;
    voiceWindow.__dmpLastFinalAt=now;

    if(!remainder) return current;

    const base=current.trim();
    return base ? `${base} ${remainder}` : remainder;
  };

  const startRecognition=()=>{
    if(!voiceWindow.__dmpShouldListen) return;

    const recognition=new SpeechRecognition();
    voiceWindow.__dmpRecognition=recognition;

    recognition.lang="pt-BR";
    recognition.continuous=true;
    recognition.interimResults=false;
    recognition.maxAlternatives=1;

    // Índices já processados nesta instância do Chrome.
    let processedResults=0;

    recognition.onstart=()=>setListening(true);

    recognition.onresult=(event:any)=>{
      let finalText="";
      const resultIndex=typeof event.resultIndex==="number" ? event.resultIndex : 0;
      const startIndex=Math.max(resultIndex,processedResults);

      for(let i=startIndex;i<event.results.length;i++){
        const result=event.results[i];

        if(result?.isFinal){
          const text=String(result[0]?.transcript||"").trim();

          if(text){
            finalText+=`${text} `;
          }

          processedResults=Math.max(processedResults,i+1);
        }
      }

      if(finalText.trim()){
        setTranscript(current=>appendWithoutDuplicate(current,finalText.trim()));
      }
    };

    recognition.onerror=(event:any)=>{
      if(
        event.error==="not-allowed" ||
        event.error==="service-not-allowed" ||
        event.error==="audio-capture"
      ){
        voiceWindow.__dmpShouldListen=false;
        voiceWindow.__dmpRecognition=null;
        voiceWindow.__dmpLastFinalText="";
        voiceWindow.__dmpLastFinalAt=0;
        setListening(false);
      }
    };

    recognition.onend=()=>{
      voiceWindow.__dmpRecognition=null;

      // Se o navegador parou sozinho, recomeça sem desligar o modo.
      if(voiceWindow.__dmpShouldListen){
        setListening(true);

        window.setTimeout(()=>{
          if(voiceWindow.__dmpShouldListen){
            startRecognition();
          }
        },350);
      }else{
        setListening(false);
      }
    };

    try{
      recognition.start();
    }catch{
      if(voiceWindow.__dmpShouldListen){
        window.setTimeout(startRecognition,350);
      }
    }
  };

  // Primeiro toque: inicia o modo contínuo.
  voiceWindow.__dmpShouldListen=true;
  voiceWindow.__dmpLastFinalText="";
  voiceWindow.__dmpLastFinalAt=0;
  startRecognition();
}
  return <main className="app-page"><Header title={`${student.name} — Registro rápido`} back={onBack}/><section className="content free-session-layout">
    <article className="panel form-stack quick-register-panel">{student.restrictions ? <div className="session-alert"><strong>⚠ Atenção com {student.name}</strong><span>{student.restrictions}</span></div> : null}<div className="session-mode-banner free"><span>⚡ Sem precisar de ficha</span><strong>Registre depois da aula</strong><small>Fale ou escreva exatamente como você costuma me contar o treino.</small></div><label>Data<input type="date" value={sessionDate} onChange={e=>setSessionDate(e.target.value)}/></label><label>Nome / foco da sessão<input value={focus} onChange={e=>setFocus(e.target.value)} placeholder="Ex.: Peito + core, Full body, MMII..."/></label><label>O que foi feito<textarea rows={10} value={transcript} onChange={e=>setTranscript(e.target.value)} placeholder={'Ex.: Bloco 1: supino reto 4x12 com 18 kg; agachamento goblet 4x15.\nBloco 2: remada baixa 4x12 45 kg; prancha até a falha.'}/></label><div className="hero-actions"><button className="secondary" onClick={listen}>{listening?"Ouvindo...":"🎤 Falar"}</button><button
  type="button"
  className="primary"
  onClick={()=>{
    if(listening){
      alert("Pare o microfone antes de organizar o treino.");
      return;
    }

    const organized=organizeQuickTranscript(transcript);

    if(!organized.length){
      alert("Fale ou escreva o treino antes de organizar.");
      return;
    }

    setExercises(organized);
  }}
>
  Organizar para revisão
</button></div></article>
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


const WORKOUT_SLOTS:WorkoutSlot[]=["A","B","C","D"];
type WorkoutTemplate={id:string;label:string;description:string;protocol:WorkoutProtocol;sequenceSize:number;notes?:string;exercises:Array<Partial<Exercise>>};
const blankTemplateExercises=(count:number,size:number)=>Array.from({length:count},(_,index)=>({block:`Bloco ${Math.floor(index/size)+1}`,name:"",sets:"3",reps:"12"}));
const WORKOUT_TEMPLATES:WorkoutTemplate[]=[
  {id:"b7",label:"B7",description:"4 blocos com 2 exercícios",protocol:"B7",sequenceSize:2,exercises:blankTemplateExercises(8,2)},
  {id:"biset",label:"Bi-set",description:"3 blocos com 2 exercícios",protocol:"BISET",sequenceSize:2,exercises:blankTemplateExercises(6,2)},
  {id:"circuit",label:"Circuito",description:"6 exercícios em sequência",protocol:"CIRCUIT",sequenceSize:6,exercises:blankTemplateExercises(6,6)},
  {id:"travel",label:"Viagem / academia",description:"Ficha geral fácil de adaptar",protocol:"CONVENTIONAL",sequenceSize:1,notes:"Treino para realizar durante a viagem. Ajustar cargas conforme os equipamentos disponíveis.",exercises:["Agachamento livre com halteres","Puxada frontal","Supino com halteres","Cadeira extensora","Remada baixa","Mesa ou cadeira flexora"].map(name=>({name,sets:"3",reps:"12"}))},
  {id:"bodyweight",label:"Sem equipamentos",description:"Treino usando o peso corporal",protocol:"CIRCUIT",sequenceSize:6,notes:"Executar respeitando limitações e espaço disponível.",exercises:["Agachamento livre","Avanço alternado","Flexão de braço","Elevação de quadril","Prancha","Polichinelo"].map(name=>({name,sets:"3",reps:"12"}))}
];
const WORKOUT_PROTOCOL_OPTIONS:{value:WorkoutProtocol;label:string}[]=[
  {value:"CONVENTIONAL",label:"Convencional"},
  {value:"BISET",label:"Bi-set"},
  {value:"TRISET",label:"Tri-set"},
  {value:"B7",label:"B7"},
  {value:"CIRCUIT",label:"Circuito"},
  {value:"MIXED",label:"Misto / personalizado"}
];

function inferWorkoutSlot(workout:Workout|null|undefined,index:number):WorkoutSlot{
  if(workout?.slot&&WORKOUT_SLOTS.includes(workout.slot))return workout.slot;
  const match=(workout?.name||"").match(/(?:treino\s*)?([ABCD])\b/i);
  if(match)return match[1].toUpperCase() as WorkoutSlot;
  return WORKOUT_SLOTS[Math.min(index,WORKOUT_SLOTS.length-1)]||"A";
}

function getStudentWorkoutEntries(student:Student):{workout:Workout;slot:WorkoutSlot}[]{
  const used=new Set<WorkoutSlot>();
  const entries:{workout:Workout;slot:WorkoutSlot}[]=[];

  student.workouts.filter(workout=>workout.active!==false).forEach((workout,index)=>{
    let slot=inferWorkoutSlot(workout,index);
    if(used.has(slot))slot=WORKOUT_SLOTS.find(candidate=>!used.has(candidate))||slot;
    used.add(slot);
    entries.push({workout,slot});
  });

  return entries.sort((a,b)=>WORKOUT_SLOTS.indexOf(a.slot)-WORKOUT_SLOTS.indexOf(b.slot)).slice(0,4);
}

function getArchivedWorkouts(student:Student):Workout[]{
  return student.workouts
    .filter(workout=>workout.active===false)
    .slice()
    .sort((a,b)=>(b.archivedAt||"").localeCompare(a.archivedAt||""));
}

function workoutProtocolLabel(protocol?:WorkoutProtocol){
  return WORKOUT_PROTOCOL_OPTIONS.find(option=>option.value===(protocol||"CONVENTIONAL"))?.label||"Convencional";
}

function defaultSequenceSize(protocol:WorkoutProtocol){
  return protocol==="BISET"?2:protocol==="TRISET"?3:protocol==="B7"?7:protocol==="CIRCUIT"?4:protocol==="MIXED"?2:1;
}

function sequenceBlockLabel(protocol:WorkoutProtocol,index:number,size:number){
  if(protocol==="CONVENTIONAL"&&Math.max(1,size)===1)return "";
  return `Bloco ${Math.floor(index/Math.max(1,size))+1}`;
}

function protocolDescription(protocol:WorkoutProtocol,size:number){
  if(protocol==="CONVENTIONAL")return size===1?"Exercícios executados individualmente. Você ainda pode aumentar a sequência se quiser.":`Convencional organizado em grupos de ${size}.`;
  if(protocol==="BISET")return `Bi-set: o editor agrupa ${size} exercícios por sequência. O padrão é 2, mas você pode ajustar.`;
  if(protocol==="TRISET")return `Tri-set: o editor agrupa ${size} exercícios por sequência. O padrão é 3.`;
  if(protocol==="B7")return `B7: protocolo identificado na ficha e organizado em sequências de ${size} exercícios. Você pode ajustar esse número.`;
  if(protocol==="CIRCUIT")return `Circuito com ${size} exercícios por sequência. Ajuste a quantidade conforme a aula.`;
  return `Misto / personalizado com ${size} exercícios por sequência. Use a coluna Seq. para mudar blocos específicos.`;
}

function openWorkoutSharePreview(student:Student,workout:Workout){
  const popup=window.open("","_blank","width=900,height=760");
  if(!popup){alert("O navegador bloqueou a prévia. Permita pop-ups para o DMP e tente novamente.");return;}
  const esc=(value:string)=>value.replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[char]||char));
  const groups=new Map<string,Exercise[]>();
  workout.exercises.forEach((exercise,index)=>{const block=exercise.block?.trim()||sequenceBlockLabel(workout.protocol||"CONVENTIONAL",index,workout.sequenceSize||defaultSequenceSize(workout.protocol||"CONVENTIONAL"))||"Sequência";groups.set(block,[...(groups.get(block)||[]),exercise]);});
  const blocks=[...groups.entries()].map(([block,items])=>`<section><h3>${esc(block)}</h3>${items.map((ex,i)=>`<div class="exercise"><b>${i+1}. ${esc(ex.name)}</b><span>${esc(ex.sets||"—")} × ${esc(ex.reps||"—")}${ex.load?` · ${esc(ex.load)}`:""}</span>${ex.notes?`<small>${esc(ex.notes)}</small>`:""}</div>`).join("")}</section>`).join("");
  const workoutNotes=workout.notes?.trim()?`<aside class="workout-notes"><strong>Orientações do treino</strong><p>${esc(workout.notes.trim())}</p></aside>`:"";
  const date=new Date().toLocaleDateString("pt-BR");
  (window as any).__dmpShareWorkout={student,workout};
  (window as any).downloadWorkoutJpgFromShare=()=>downloadWorkoutJpg(student,workout);
  popup.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(student.name)} - ${esc(workout.name)}</title><style>body{font-family:Arial,sans-serif;margin:0;background:#f4f7ee;color:#25272c}.sheet{max-width:760px;margin:24px auto;background:#fff;padding:34px;border-radius:18px}.head{display:flex;align-items:center;justify-content:space-between;gap:18px;border-bottom:3px solid #a8c93b;padding-bottom:18px}.head img{width:150px;height:82px;object-fit:contain;object-position:right center}.head h1{margin:0}.head p{margin:6px 0 0}.meta{display:flex;gap:12px;flex-wrap:wrap;margin:18px 0}.meta span{background:#eef4df;padding:8px 12px;border-radius:999px}.workout-notes{margin:18px 0;padding:15px 17px;border-radius:12px;background:#f5f8ed;border-left:5px solid #a8c93b}.workout-notes p{margin:6px 0 0;white-space:pre-wrap}section{margin:22px 0}h3{border-left:5px solid #a8c93b;padding-left:10px}.exercise{display:grid;grid-template-columns:1fr auto;gap:5px 16px;padding:11px 0;border-bottom:1px solid #e3e8d8}.exercise small{grid-column:1/-1;color:#707781}.actions{display:flex;gap:10px;margin:20px auto;max-width:760px}.actions button{padding:12px 16px;border:0;border-radius:10px;cursor:pointer}.primary{background:#a8c93b;font-weight:700}@media print{body{background:#fff}.actions{display:none}.sheet{margin:0;max-width:none;box-shadow:none}}</style></head><body><div class="actions"><button class="primary" onclick="window.print()">Salvar / imprimir PDF</button><button onclick="window.opener.downloadWorkoutJpgFromShare && window.opener.downloadWorkoutJpgFromShare()">Salvar como JPG</button><button onclick="window.close()">Fechar prévia</button></div><main class="sheet"><div class="head"><div><h1>${esc(student.name)}</h1><p>${esc(workout.name||`Treino ${workout.slot||""}`)}</p></div><img src="${location.origin}/logo-danilo.jpg" alt="Danilo Modesto Personal"></div><div class="meta"><span>Treino ${esc(workout.slot||"—")}</span><span>${esc(workoutProtocolLabel(workout.protocol||"CONVENTIONAL"))}</span><span>${date}</span></div>${workoutNotes}${blocks}</main></body></html>`);
  popup.document.close();
}

function cleanExerciseCatalogName(value:string){
  let clean=value.replace(/\s+/g," ").trim();
  // Remove prescrições/cargas no fim sem apagar números legítimos do nome (45°, Rosca 21 etc.).
  clean=clean
    .replace(/\s*[-–—|:,;]?\s*\d+\s*[x×]\s*(?:f|falha|\d+(?:\s*(?:a|[-–—])\s*\d+)?)(?:\s+\d+(?:[.,]\d+)?(?:\s*kg)?)?.*$/i,"")
    .replace(/\s*[-–—|:,;]?\s*\d+\s*(?:de|por|vezes)\s*(?:\d+|(?:até\s+)?(?:a\s+)?falha)(?:\s+\d+(?:[.,]\d+)?(?:\s*kg)?)?.*$/i,"")
    .replace(/\s*[-–—|:,;]?\s*\d+\s*séries?(?:\s*(?:de|por)?\s*\d+)?(?:\s+até\s+(?:a\s+)?falha)?.*$/i,"")
    .replace(/\s*[-–—|:,;]?\s*(?:carga\s*:?\s*)?\d+(?:[.,]\d+)?\s*(?:kg|quilos?|kilos?)(?:\s+de\s+cada\s+lado)?.*$/i,"")
    .replace(/\s*[-–—|:,;]?\s*(?:até\s+)?(?:a\s+)?falha.*$/i,"")
    .replace(/\s*[-–—|:,;]?\s*\d+\s*(?:segundos?|s)(?:\s|$).*$/i,"")
    .replace(/\s+/g," ").trim();
  return clean.replace(/[\s,;:|–—-]+$/g,"").trim();
}
function splitExerciseCatalogNames(value:string){
  const base=value.replace(/\s+/g," ").trim();
  // Se um histórico antigo juntou dois exercícios, transforma em duas sugestões.
  return base.split(/\s+(?:\+|&|e)\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ])/).map(cleanExerciseCatalogName).filter(Boolean);
}
function buildExerciseCatalog(students:Student[]){
  const names=new Map<string,string>();
  const addName=(value:string)=>{
    for(const cleanName of splitExerciseCatalogNames(value)){
      const key=normalizeName(cleanName);
      if(key&&!names.has(key))names.set(key,cleanName);
    }
  };
  for(const student of students){
    for(const workout of student.workouts)for(const exercise of workout.exercises)addName(exercise.name);
    for(const session of student.sessions)for(const exercise of session.completedExercises)addName(exercise.name);
  }
  return [...names.values()].sort((a,b)=>a.localeCompare(b,"pt-BR"));
}

function detectWorkoutProtocol(text:string):WorkoutProtocol|null{const v=normalizeName(text);if(/\bb7\b/.test(v))return"B7";if(/\btri set\b|\btriset\b/.test(v))return"TRISET";if(/\bbi set\b|\bbiset\b/.test(v))return"BISET";if(/\bcircuito\b/.test(v))return"CIRCUIT";if(/\bpersonalizado\b|\bmisto\b/.test(v))return"MIXED";if(/\bconvencional\b/.test(v))return"CONVENTIONAL";return null;}
async function downloadWorkoutJpg(student:Student,workout:Workout){
  const W=1240,H=1754,margin=90; const groups=new Map<string,Exercise[]>();
  workout.exercises.forEach((ex,index)=>{const block=ex.block?.trim()||sequenceBlockLabel(workout.protocol||"CONVENTIONAL",index,workout.sequenceSize||defaultSequenceSize(workout.protocol||"CONVENTIONAL"))||"Sequência";groups.set(block,[...(groups.get(block)||[]),ex]);});
  const logo=await loadCanvasImage("/logo-danilo.jpg").catch(()=>null);
  const rows:[string,Exercise[]][]=[...groups.entries()]; let page=1, y=0; let canvas!:HTMLCanvasElement; let ctx!:CanvasRenderingContext2D;
  const wrapped=(text:string,x:number,startY:number,maxWidth:number,lineHeight:number,maxLines=3)=>{const words=text.replace(/\s+/g," ").trim().split(" ");let current="",lineIndex=0;for(const word of words){const candidate=current?`${current} ${word}`:word;if(ctx.measureText(candidate).width<=maxWidth){current=candidate;continue;}if(current){ctx.fillText(current,x,startY+lineIndex*lineHeight);lineIndex++;if(lineIndex>=maxLines)return startY+lineIndex*lineHeight;}current=word;}if(current&&lineIndex<maxLines){ctx.fillText(current,x,startY+lineIndex*lineHeight);lineIndex++;}return startY+lineIndex*lineHeight;};
  const newPage=()=>{canvas=document.createElement("canvas");canvas.width=W;canvas.height=H;ctx=canvas.getContext("2d")!;ctx.fillStyle="#ffffff";ctx.fillRect(0,0,W,H);ctx.fillStyle="#25272c";ctx.font="700 42px Arial";ctx.fillText(student.name,margin,105);ctx.font="27px Arial";ctx.fillStyle="#555d63";ctx.fillText(workout.name||`Treino ${workout.slot||""}`,margin,145);if(logo){const maxW=250,maxH=105,scale=Math.min(maxW/logo.width,maxH/logo.height);ctx.drawImage(logo,W-margin-logo.width*scale,55,logo.width*scale,logo.height*scale);}ctx.fillStyle="#a8c93b";ctx.fillRect(margin,182,W-margin*2,6);ctx.fillStyle="#25272c";ctx.font="22px Arial";ctx.fillText(`Treino ${workout.slot||"—"} · ${workoutProtocolLabel(workout.protocol||"CONVENTIONAL")} · ${new Date().toLocaleDateString("pt-BR")} · página ${page}`,margin,224);y=275;if(page===1&&workout.notes?.trim()){ctx.fillStyle="#f4f7ec";ctx.fillRect(margin,y-15,W-margin*2,105);ctx.fillStyle="#60752c";ctx.font="700 20px Arial";ctx.fillText("ORIENTAÇÕES DO TREINO",margin+20,y+14);ctx.fillStyle="#444a50";ctx.font="20px Arial";y=wrapped(workout.notes.trim(),margin+20,y+45,W-margin*2-40,26,2)+35;}};
  const savePage=(last=false)=>new Promise<void>(resolve=>{const output=document.createElement("canvas");output.width=W;output.height=last?Math.min(H,Math.max(720,y+95)):H;const outputCtx=output.getContext("2d")!;outputCtx.fillStyle="#ffffff";outputCtx.fillRect(0,0,output.width,output.height);outputCtx.drawImage(canvas,0,0);outputCtx.fillStyle="#77806d";outputCtx.font="18px Arial";outputCtx.fillText("Danilo Modesto Personal · ficha de treino",margin,output.height-34);output.toBlob(blob=>{if(blob){const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`${safeFileName(student.name)}_${safeFileName(workout.name||`Treino_${workout.slot||""}`)}_${page}.jpg`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}resolve();},"image/jpeg",0.94);});
  newPage();
  for(const [block,items] of rows){const needed=75+items.reduce((total,ex)=>total+(ex.notes?106:78),0);if(y+needed>H-100){await savePage();page++;newPage();}ctx.fillStyle="#eef4df";ctx.fillRect(margin,y-32,W-margin*2,50);ctx.fillStyle="#a8c93b";ctx.fillRect(margin,y-32,8,50);ctx.fillStyle="#25272c";ctx.font="700 28px Arial";ctx.fillText(block,margin+24,y);y+=58;for(const ex of items){ctx.font="700 24px Arial";ctx.fillStyle="#25272c";wrapped(ex.name,margin,y,W-margin*2-310,29,2);ctx.font="22px Arial";const prescription=[ex.sets&&ex.reps?`${ex.sets} × ${ex.reps}`:"",ex.load].filter(Boolean).join(" · ");ctx.fillText(prescription,W-margin-ctx.measureText(prescription).width,y);if(ex.notes){ctx.font="19px Arial";ctx.fillStyle="#707781";wrapped(ex.notes,margin,y+32,W-margin*2,25,2);ctx.fillStyle="#25272c";y+=106;}else y+=78;ctx.strokeStyle="#e5e9df";ctx.beginPath();ctx.moveTo(margin,y-18);ctx.lineTo(W-margin,y-18);ctx.stroke();}}
  await savePage(true);
}
function loadCanvasImage(src:string){return new Promise<HTMLImageElement>((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error("image_load_failed"));image.src=src;});}
function safeFileName(value:string){return normalizeName(value).replace(/\s+/g,"_")||"treino";}

function isBirthdayToday(value:string){if(!value)return false;const [y,m,d]=value.split("-").map(Number);const now=new Date();return m===now.getMonth()+1&&d===now.getDate();}
function assessmentDue(student:Student){const last=student.assessments[0];if(!last)return true;const date=new Date(`${last.date}T12:00:00`);return Date.now()-date.getTime()>1000*60*60*24*90;}
function downloadText(filename:string,content:string,type:string){const blob=new Blob([content],{type});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=filename;a.click();URL.revokeObjectURL(url);}

function findPreviousExercise(student:Student,name:string){const target=normalizeName(name);for(const session of student.sessions){const found=session.completedExercises.find(ex=>normalizeName(ex.name)===target);if(found)return {...found,date:session.date};}return null;}
function normalizeName(value:string){return value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9 ]/g," ").replace(/\s+/g," ").trim();}
const CALENDAR_STUDENT_ALIASES:Record<string,string>={bruna:"bruna sickler"};
function matchCalendarEvents(events:CalendarEvent[],students:Student[]):CalendarEvent[]{
  const active=students.filter(student=>student.status==="ACTIVE");
  const firstNameCount=new Map<string,number>();
  active.forEach(student=>{const first=normalizeName(student.name).split(" ").filter(Boolean)[0];if(first)firstNameCount.set(first,(firstNameCount.get(first)||0)+1);});
  return events.map(event=>{
    if(event.allDay)return {...event,matchedStudentId:null,matchedStudentIds:[]};
    const title=normalizeName(event.summary||"");
    const padded=` ${title} `;
    const tokens=new Set(title.split(" ").filter(Boolean));
    const matches=active.filter(student=>{
      const full=normalizeName(student.name);
      const parts=full.split(" ").filter(part=>part.length>1);
      if(!parts.length)return false;
      const first=parts[0];
      const firstLast=parts.length>=2?`${first} ${parts[parts.length-1]}`:"";
      if(full&&padded.includes(` ${full} `))return true;
      if(firstLast&&padded.includes(` ${firstLast} `))return true;
      if([...tokens].some(token=>CALENDAR_STUDENT_ALIASES[token]===full))return true;
      if(first.length>=3&&firstNameCount.get(first)===1&&tokens.has(first))return true;
      // Aceita qualquer parte única do nome, inclusive sobrenomes usados na agenda.
      if(parts.some(part=>{
        if(part.length<3||!tokens.has(part))return false;
        const candidates=active.filter(item=>normalizeName(item.name).split(" ").filter(Boolean).includes(part));
        return candidates.length===1&&candidates[0].id===student.id;
      }))return true;
      // Aceita abreviações como "Gra" somente quando apontam para um único aluno ativo.
      return [...tokens].some(token=>{
        if(token.length<3||!first.startsWith(token))return false;
        const candidates=active.filter(item=>normalizeName(item.name).split(" ").filter(Boolean)[0]?.startsWith(token));
        return candidates.length===1&&candidates[0].id===student.id;
      });
    });
    const ids=matches.map(student=>student.id);
    return {...event,matchedStudentId:ids[0]||null,matchedStudentIds:ids};
  });
}
function getCalendarEventStudents(event:CalendarEvent,students:Student[]):Student[]{const ids=event.matchedStudentIds?.length?event.matchedStudentIds:(event.matchedStudentId?[event.matchedStudentId]:[]);return ids.map(id=>students.find(student=>student.id===id)).filter((student):student is Student=>Boolean(student));}
function formatCalendarTime(event:CalendarEvent){if(event.allDay)return"Dia todo";if(!event.start)return"—";const date=new Date(event.start);return date.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"});}
function calendarEventDate(event:CalendarEvent){return event.start.slice(0,10);}
function formatRailDate(event:CalendarEvent){const value=calendarEventDate(event);return new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR",{weekday:"short",day:"2-digit",month:"2-digit"});}
function calendarStudentDisplayName(student:Student){const parts=student.name.trim().split(/\s+/);return parts.length>1?`${parts[0]} ${parts[parts.length-1]}`:parts[0];}
function agendaRangeLabel(value:AgendaRange){return value==="day"?"Dia":value==="week"?"Semana":value==="month"?"Mês":value==="year"?"Ano":"Lista";}
function agendaRangeIncludes(event:CalendarEvent,anchor:string,range:AgendaRange){
  const date=calendarEventDate(event);if(range==="list")return date>=anchor;
  if(range==="day")return date===anchor;if(range==="month")return date.slice(0,7)===anchor.slice(0,7);if(range==="year")return date.slice(0,4)===anchor.slice(0,4);
  const start=new Date(`${anchor}T12:00:00`);const weekday=start.getDay();start.setDate(start.getDate()-(weekday===0?6:weekday-1));const end=new Date(start);end.setDate(start.getDate()+6);const target=new Date(`${date}T12:00:00`);return target>=start&&target<=end;
}
function agendaWeekDays(anchor:string){const base=new Date(`${anchor}T12:00:00`);const weekday=base.getDay();base.setDate(base.getDate()-(weekday===0?6:weekday-1));return Array.from({length:6},(_,index)=>{const date=new Date(base);date.setDate(base.getDate()+index);return localDateKey(date);});}
function agendaRequestRange(anchor:string,range:AgendaRange){const base=new Date(`${anchor}T12:00:00`);if(range==="day")return{date:anchor,days:1};if(range==="week"){const weekday=base.getDay();base.setDate(base.getDate()-(weekday===0?6:weekday-1));return{date:localDateKey(base),days:6};}if(range==="month"){base.setDate(1);return{date:localDateKey(base),days:new Date(base.getFullYear(),base.getMonth()+1,0).getDate()};}if(range==="year")return{date:`${anchor.slice(0,4)}-01-01`,days:366};return{date:anchor,days:90};}
function shiftAgendaAnchor(anchor:string,range:AgendaRange,direction:-1|1){const date=new Date(`${anchor}T12:00:00`);if(range==="day"||range==="list")date.setDate(date.getDate()+direction);else if(range==="week")date.setDate(date.getDate()+direction*7);else if(range==="month")date.setMonth(date.getMonth()+direction);else date.setFullYear(date.getFullYear()+direction);return localDateKey(date);}
function agendaPeriodLabel(anchor:string,range:AgendaRange){const date=new Date(`${anchor}T12:00:00`);if(range==="day")return formatLongDate(anchor);if(range==="week"){const days=agendaWeekDays(anchor);return `${formatDate(days[0])} a ${formatDate(days[5])}`;}if(range==="month")return date.toLocaleDateString("pt-BR",{month:"long",year:"numeric"});if(range==="year")return String(date.getFullYear());return `A partir de ${formatDate(anchor)}`;}
function agendaRangeTitle(range:AgendaRange){return range==="day"?"Compromissos do dia":range==="week"?"Semana de trabalho":range==="month"?"Calendário mensal":range==="year"?"Calendário anual":"Próximos compromissos";}

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
function formatWeekday(value:string){const text=new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR",{weekday:"long"});return text.charAt(0).toUpperCase()+text.slice(1);}
function formatCalendarDate(value:string){return new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR",{day:"2-digit",month:"long",year:"numeric"});}
function fileToDataUrl(file:File):Promise<string>{return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=reject;reader.readAsDataURL(file);});}
function num(value:string){return value===""?null:Number(value);}
const CALENDAR_AUTO_REFRESH_MS=5*60*1000;
function readLocalStorage(key:string){try{return localStorage.getItem(key)||"";}catch{return"";}}
function writeLocalStorage(key:string,value:string){try{localStorage.setItem(key,value);}catch{}}
function localDateKey(value:Date){return new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).format(value);}
function today(){return localDateKey(new Date());}
function saoPauloDateFromIso(value:string){return new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(value));}
function sameSaoPauloDate(a:string,b:string){try{return saoPauloDateFromIso(a)===saoPauloDateFromIso(b);}catch{return false;}}
function isSundayInSaoPaulo(){const label=new Intl.DateTimeFormat("en-US",{timeZone:"America/Sao_Paulo",weekday:"short"}).format(new Date());return label==="Sun";}
function formatSyncTime(value:string){try{return new Intl.DateTimeFormat("pt-BR",{timeZone:"America/Sao_Paulo",hour:"2-digit",minute:"2-digit"}).format(new Date(value));}catch{return"";}}
function formatSyncDateTime(value:string){try{return new Intl.DateTimeFormat("pt-BR",{timeZone:"America/Sao_Paulo",day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}).format(new Date(value));}catch{return"";}}
function organizeQuickTranscript(rawText:string): Exercise[] {
  const text=rawText.replace(/\r/g," ").replace(/\s+/g," ").trim();
  if(!text) return [];

  const numbers:Record<string,string>={
    "um":"1","uma":"1","dois":"2","duas":"2","tres":"3","três":"3",
    "quatro":"4","cinco":"5","seis":"6","sete":"7","oito":"8","nove":"9",
    "dez":"10","onze":"11","doze":"12","treze":"13","quatorze":"14",
    "catorze":"14","quinze":"15","dezesseis":"16","dezessete":"17",
    "dezoito":"18","dezenove":"19","vinte":"20"
  };

  const toNumber=(value:string)=>{
    const key=value.toLocaleLowerCase("pt-BR").trim();
    return numbers[key]||value;
  };

  const normalizedNumbers=text.replace(
    /\b(um|uma|dois|duas|tr[eê]s|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|quatorze|catorze|quinze|dezesseis|dezessete|dezoito|dezenove|vinte)\b/gi,
    m=>toNumber(m)
  );

  const blockRegex=/\bbloco\s+(\d+)\b/gi;
  const blockMatches=[...normalizedNumbers.matchAll(blockRegex)];
  const chunks:{block:string;text:string}[]=[];

  if(blockMatches.length){
    for(let i=0;i<blockMatches.length;i++){
      const match=blockMatches[i];
      const start=(match.index||0)+match[0].length;
      const end=i+1<blockMatches.length ? (blockMatches[i+1].index||normalizedNumbers.length) : normalizedNumbers.length;

      chunks.push({
        block:match[1],
        text:normalizedNumbers.slice(start,end).replace(/^[\s,:;.\-–—]+/,"").trim()
      });
    }
  }else{
    chunks.push({block:"",text:normalizedNumbers});
  }

  const output:Exercise[]=[];

  const cleanName=(value:string)=>
    value
      .replace(/^[\s,;:.\-–—]+|[\s,;:.\-–—]+$/g,"")
      .replace(/^(?:e|depois|mais)\s+/i,"")
      .trim();

  const loadAtStart=(value:string)=>{
    const match=value.match(/^\s*[,;:\-–—]*\s*(\d+(?:[.,]\d+)?)\s*(?:kg|quilos?|kilos?)\b(?:\s*(?:de\s*cada\s*lado|cada\s*lado))?/i);

    if(!match) return null;

    return {
      value:`${match[1].replace(",",".")} kg${/cada\s*lado/i.test(match[0]) ? " de cada lado" : ""}`,
      length:match[0].length
    };
  };

  for(const chunk of chunks){
    const value=chunk.text.trim();
    if(!value) continue;

    const prescriptionRegex=/\b(\d+)\s*(?:s[eé]ries?\s*(?:de\s*)?|[x×]\s*|\s+de\s+)(\d+|falha)\b/gi;
    const prescriptions=[...value.matchAll(prescriptionRegex)];

    if(!prescriptions.length){
      output.push({
        id:crypto.randomUUID(),
        block:chunk.block,
        name:value,
        sets:"",
        reps:"",
        load:""
      } as Exercise);
      continue;
    }

    let previousPrescriptionEnd=0;

    for(let i=0;i<prescriptions.length;i++){
      const prescription=prescriptions[i];
      const prescriptionStart=prescription.index||0;

      let between=value.slice(previousPrescriptionEnd,prescriptionStart);

      if(i>0){
        const leadingLoad=loadAtStart(between);

        if(leadingLoad){
          if(output.length){
            output[output.length-1]={
              ...output[output.length-1],
              load:leadingLoad.value
            };
          }

          between=between.slice(leadingLoad.length);
        }
      }

      const name=cleanName(between);

      output.push({
        id:crypto.randomUUID(),
        block:chunk.block,
        name:name || `Exercício ${output.length+1}`,
        sets:prescription[1]||"",
        reps:prescription[2]||"",
        load:""
      } as Exercise);

      previousPrescriptionEnd=prescriptionStart+prescription[0].length;
    }

    const tail=value.slice(previousPrescriptionEnd);
    const finalLoad=loadAtStart(tail);

    if(finalLoad && output.length){
      output[output.length-1]={
        ...output[output.length-1],
        load:finalLoad.value
      };
    }
  }

  if(!output.length){
    output.push({
      id:crypto.randomUUID(),
      block:"",
      name:text,
      sets:"",
      reps:"",
      load:""
    } as Exercise);
  }

  return output;
}

function formatDate(value:string){if(!value)return"—";const [year,month,day]=value.split("-");return `${day}/${month}/${year}`;}
function calculateAge(value:string){if(!value)return null;const birth=new Date(`${value}T12:00:00`);const now=new Date();let age=now.getFullYear()-birth.getFullYear();if(now.getMonth()<birth.getMonth()||(now.getMonth()===birth.getMonth()&&now.getDate()<birth.getDate()))age--;return age;}
function monthsSince(value:string){if(!value)return null;const start=new Date(`${value}T12:00:00`);const now=new Date();return Math.max(0,(now.getFullYear()-start.getFullYear())*12+now.getMonth()-start.getMonth());}
function formatMonths(months:number){const years=Math.floor(months/12);const rest=months%12;return [years?`${years} ano${years>1?"s":""}`:"",rest?`${rest} ${rest===1?"mês":"meses"}`:""].filter(Boolean).join(" e ")||"menos de 1 mês";}
function displayNumber(value:number|null|undefined,suffix:string){return value===null||value===undefined?"—":`${Number(value).toLocaleString("pt-BR",{maximumFractionDigits:1})} ${suffix}`;}
function tabLabel(tab:StudentTab){return({summary:"Resumo",workouts:"Treinos",history:"Histórico",assessments:"Avaliações"})[tab];}
