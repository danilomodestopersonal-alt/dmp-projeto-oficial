// DMP_HOME_TREINO_CLICAVEL_V2
"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Assessment, CalendarEvent, Exercise, Measurements, Session, Student, TennisCategory, Workout, WorkoutProtocol, WorkoutSlot } from "@/types/models";
import { importedStudents2026 } from "@/lib/imported-data";
import { loadStudents, resetImportedData, saveStudents } from "@/lib/storage";
import { exportStudentSessionsCsv } from "@/lib/export";
import FinanceiroPage from "@/components/financeiro/FinanceiroPage";
import PerformancePage from "@/components/performance/PerformancePage";
import BackupCenter from "@/components/backup/BackupCenter";
import KidsPage, {type KidsLessonOpenRequest} from "@/components/kids/KidsPage";
import type {KidsCategory,KidsData,KidsStudent} from "@/types/kids";
import type {FinanceData} from "@/types/financeiro";
import { financeSeedAugust2026 } from "@/lib/financeiro/agosto2026";
import { fetchFinanceCloud, loadFinanceData } from "@/lib/financeiro/storage";
import { financeSummary } from "@/lib/financeiro/calculos";
import type { PerformanceActivity } from "@/types/performance";

type View = "today" | "students" | "workouts-overview" | "history-overview" | "assessments-overview" | "agenda" | "finance" | "reports" | "kids" | "performance" | "data" | "settings" | "weather" | "student" | "workout-editor" | "planned-session" | "free-session" | "attendance-session";
type StudentTab = "summary" | "timeline" | "workouts" | "history" | "assessments" | "finance" | "files";
type DmpNote = { id:string; title?:string; text:string; done:boolean; createdAt:string; updatedAt:string };
type AgendaRange = "day" | "week" | "month" | "year" | "list";

type PersonalWorkoutTemplate = {
  id:string;
  name:string;
  description:string;
  protocol:WorkoutProtocol;
  sequenceSize:number;
  notes:string;
  exercises:Exercise[];
  createdAt:string;
  updatedAt:string;
};


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
  const [personalWorkoutTemplates,setPersonalWorkoutTemplates]=useState<PersonalWorkoutTemplate[]>([]);
  const [workoutTemplatesLoaded,setWorkoutTemplatesLoaded]=useState(false);

  const [calendarStatus, setCalendarStatus] = useState<{configured:boolean;connected:boolean}>({configured:false,connected:false});
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [calendarRange,setCalendarRange]=useState<AgendaRange>("week");
  const [calendarAnchor,setCalendarAnchor]=useState(today());
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarLoaded, setCalendarLoaded] = useState(false);
  const [calendarSync, setCalendarSync] = useState<{dailyAt:string;weeklyAt:string;weeklyCount:number}>({dailyAt:"",weeklyAt:"",weeklyCount:0});
  const [historySearch, setHistorySearch] = useState("");
  const [historySource, setHistorySource] = useState<"ALL"|"PLANNED"|"FREE"|"ATTENDANCE"|"IMPORTED">("ALL");
  const [historyPeriod, setHistoryPeriod] = useState<"ALL"|"30"|"90"|"YEAR">("ALL");
  const [workoutsOnly, setWorkoutsOnly] = useState(false);
  const [showGoogleEventForm, setShowGoogleEventForm] = useState(false);
  const [showFinancePin, setShowFinancePin] = useState(false);
  const [financePin, setFinancePin] = useState("");
  const [financePinError, setFinancePinError] = useState("");
  const [notes, setNotes] = useState<DmpNote[]>([]);
  const [newNoteTitle, setNewNoteTitle] = useState("");
  const [newNote, setNewNote] = useState("");
  const [notesLoaded, setNotesLoaded] = useState(false);
  const [removedNote, setRemovedNote] = useState<{note:DmpNote;index:number}|null>(null);
  const [editingNoteId, setEditingNoteId] = useState<string|null>(null);
  const [editingNoteTitle, setEditingNoteTitle] = useState("");
  const [editingNoteText, setEditingNoteText] = useState("");
  const [kidsLessonRequest,setKidsLessonRequest]=useState<KidsLessonOpenRequest|null>(null);
  const [kidsStudentRequest,setKidsStudentRequest]=useState<string|null>(null);
  const [kidsEntryKey,setKidsEntryKey]=useState(0);
  const [homeMonthKidsCount,setHomeMonthKidsCount]=useState<number|null>(null);
  const [showMobileActions,setShowMobileActions]=useState(false);
  const [todayPerformanceActivities,setTodayPerformanceActivities]=useState<PerformanceActivity[]>([]);
  const [homePerformanceActivities,setHomePerformanceActivities]=useState<PerformanceActivity[]>([]);
  const [spotifyState,setSpotifyState]=useState<{
    connected:boolean;
    active?:boolean;
    isPlaying?:boolean;
    track?:{name:string;artist:string;image:string}|null;
    progressMs?:number;
    durationMs?:number;
  }>({connected:false});
  const [spotifyBusy,setSpotifyBusy]=useState(false);
  const [spotifyProgressMs,setSpotifyProgressMs]=useState(0);
  const [selectedPerformanceActivityId,setSelectedPerformanceActivityId]=useState<string|null>(null);
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


  useEffect(()=>{
    let cancelled=false;

    fetch("/api/workout-templates",{cache:"no-store"})
      .then(response=>response.json())
      .then(result=>{
        if(cancelled)return;
        setPersonalWorkoutTemplates(Array.isArray(result.data)?result.data:[]);
      })
      .catch(error=>{
        console.error("Erro ao carregar biblioteca de treinos:",error);
      })
      .finally(()=>{
        if(!cancelled)setWorkoutTemplatesLoaded(true);
      });

    return()=>{cancelled=true;};
  },[]);

  useEffect(()=>{
    if(!workoutTemplatesLoaded)return;

    const timer=window.setTimeout(()=>{
      void fetch("/api/workout-templates",{
        method:"PUT",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify(personalWorkoutTemplates)
      }).catch(error=>{
        console.error("Erro ao salvar biblioteca de treinos:",error);
      });
    },350);

    return()=>window.clearTimeout(timer);
  },[personalWorkoutTemplates,workoutTemplatesLoaded]);

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
  let cancelled=false;

  const loadHomePerformance=async()=>{
    try{
      const response=await fetch("/api/performance",{cache:"no-store"});
      const result=await response.json();
      const activities:PerformanceActivity[]=result?.data?.activities||[];

      if(!cancelled){
        setHomePerformanceActivities(activities);
        setTodayPerformanceActivities(
          activities
            .filter(activity=>activity.date===today())
            .sort((a,b)=>(b.createdAt||"").localeCompare(a.createdAt||""))
        );
      }
    }catch{
      if(!cancelled){setTodayPerformanceActivities([]);setHomePerformanceActivities([]);}
    }
  };

  void loadHomePerformance();
  return()=>{cancelled=true;};
},[view]);

useEffect(()=>{
  if(view==="student"){
    window.requestAnimationFrame(()=>{
      window.scrollTo({top:0,left:0,behavior:"auto"});
    });
  }
},[view,selectedStudentId]);

useEffect(()=>{
  if(view!=="today")return;
  let cancelled=false;
  let spotifyUnauthorized=false;
  const loadSpotify=async()=>{
    if(spotifyUnauthorized)return;
    try{
      const response=await fetch("/api/spotify/player",{cache:"no-store"});
      if(response.status===401){
        spotifyUnauthorized=true;
        if(!cancelled){
          setSpotifyState({connected:false});
          setSpotifyProgressMs(0);
        }
        return;
      }
      const data=await response.json().catch(()=>({connected:false}));
      if(!cancelled){
        setSpotifyState(data);
        setSpotifyProgressMs(Number(data.progressMs||0));
      }
    }catch{
      if(!cancelled)setSpotifyState({connected:false});
    }
  };
  void loadSpotify();
  const timer=window.setInterval(()=>{void loadSpotify();},5000);
  return()=>{cancelled=true;window.clearInterval(timer);};
},[view]);

useEffect(()=>{
  setSpotifyProgressMs(Number(spotifyState.progressMs||0));

  if(view!=="today" || !spotifyState.isPlaying || !spotifyState.durationMs)return;

  const timer=window.setInterval(()=>{
    setSpotifyProgressMs(current=>
      Math.min(Number(spotifyState.durationMs||0),current+1000)
    );
  },1000);

  return()=>window.clearInterval(timer);
},[
  view,
  spotifyState.progressMs,
  spotifyState.durationMs,
  spotifyState.isPlaying,
  spotifyState.track?.name
]);

useEffect(()=>{
  if(view!=="today")return;
  const desktop=window.matchMedia("(min-width: 901px)").matches;
  const cards=[...document.querySelectorAll<HTMLElement>(".home-main-content > [data-home-size-key]")];
  const legacyIndex:Record<string,number>={highlights:2,weekly:3,calendar:4,notes:5,birthdays:8};
  cards.forEach(card=>{
    const key=card.dataset.homeSizeKey||"";
    if(!desktop){card.style.width="";card.style.height="";return;}
    let saved=localStorage.getItem(`dmp_home-${key}_size`);
    if(!saved&&legacyIndex[key]!==undefined){
      saved=localStorage.getItem(`dmp_home-card-${legacyIndex[key]}_size`);
      if(saved)localStorage.setItem(`dmp_home-${key}_size`,saved);
    }
    if(saved){try{const parsed=JSON.parse(saved);if(parsed.width)card.style.width=`${parsed.width}px`;if(parsed.height)card.style.height=`${parsed.height}px`;}catch{}}
  });
},[view]);

  function formatSpotifyTime(ms:number){
    const total=Math.max(0,Math.floor(ms/1000));
    const minutes=Math.floor(total/60);
    const seconds=total%60;
    return `${minutes}:${String(seconds).padStart(2,"0")}`;
  }

  async function controlSpotify(action:"play"|"pause"|"next"|"previous"){
    if(spotifyBusy)return;
    setSpotifyBusy(true);
    try{
      await fetch("/api/spotify/player",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({action})
      });
      const response=await fetch("/api/spotify/player",{cache:"no-store"});
      const data=await response.json().catch(()=>({connected:false}));
      setSpotifyState(data);
      setSpotifyProgressMs(Number(data.progressMs||0));
    }catch{}
    finally{setSpotifyBusy(false);}
  }

  function addNote(){const title=newNoteTitle.trim();const text=newNote.trim();if(!title&&!text)return;const now=new Date().toISOString();setNotes(current=>[{id:crypto.randomUUID(),title,text,done:false,createdAt:now,updatedAt:now},...current]);setNewNoteTitle("");setNewNote("");}
  function patchNote(id:string,patch:Partial<DmpNote>){setNotes(current=>current.map(note=>note.id===id?{...note,...patch,updatedAt:new Date().toISOString()}:note));}
  function removeNote(id:string){if(!confirm("Excluir este recado?"))return;setNotes(current=>{const index=current.findIndex(note=>note.id===id);if(index<0)return current;setRemovedNote({note:current[index],index});return current.filter(note=>note.id!==id);});}
  function undoNoteRemoval(){if(!removedNote)return;setNotes(current=>{const next=[...current];next.splice(Math.min(removedNote.index,next.length),0,removedNote.note);return next;});setRemovedNote(null);}
  function startEditingNote(note:DmpNote){setEditingNoteId(note.id);setEditingNoteTitle(note.title||"");setEditingNoteText(note.text);}
  function saveEditedNote(){if(!editingNoteId)return;const title=editingNoteTitle.trim();const text=editingNoteText.trim();if(title||text)patchNote(editingNoteId,{title,text});setEditingNoteId(null);setEditingNoteTitle("");setEditingNoteText("");}

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
      if (!response.ok) {
        const errorData=await response.json().catch(()=>({}));
        if(response.status===401||errorData?.error==="reauth_required"){setCalendarStatus(current=>({...current,connected:false}));setCalendarLoaded(false);return;}
        throw new Error("calendar_day_failed");
      }
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

  useEffect(()=>{
    if(view!=="today")return;
    let cancelled=false;
    fetch("/api/kids",{cache:"no-store"})
      .then(response=>response.ok?response.json():Promise.reject())
      .then(payload=>{
        if(cancelled)return;
        const data=payload.data as KidsData|null;
        if(!data){
          setHomeMonthKidsCount(0);
          return;
        }
        const monthKey=today().slice(0,7);
        const count=data.lessons.filter(lesson=>{
          if(lesson.date.slice(0,7)!==monthKey)return false;
          if(lesson.status==="COMPLETED")return true;
          if(lesson.status!=="SCHEDULED")return false;
          const group=data.classes.find(item=>item.id===lesson.classId);
          if(!group)return lesson.date<today();
          return new Date(`${lesson.date}T${group.endTime||group.startTime}:00`).getTime()<=Date.now();
        }).length;
        setHomeMonthKidsCount(count);
      })
      .catch(()=>{
        if(!cancelled)setHomeMonthKidsCount(null);
      });
    return()=>{cancelled=true;};
  },[view]);

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

  const exerciseCatalog = useMemo(() => buildExerciseCatalog(students,personalWorkoutTemplates), [students,personalWorkoutTemplates]);

  function updateStudentRecord(nextStudent: Student) {
    setStudents(current => current.map(student => student.id === nextStudent.id ? nextStudent : student));
  }

  function goStudents() {
    setView("students");
    setSelectedStudentId(null);
    setSelectedWorkoutId(null);
  }

  function openStudent(id: string, initialTab:StudentTab="summary") {
    setSelectedStudentId(id);
    setSelectedWorkoutId(null);
    setWorkoutEditorSlot("A");
    setTab(initialTab);
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
      const openedAsWorkoutTab=new URLSearchParams(window.location.search).get("mode")==="planned-session";
      if(openedAsWorkoutTab){
        window.close();
        return;
      }
      if(sessionReturnView.current==="today") setView("today");
      else { setTab("history"); setView("student"); }
      sessionReturnView.current="student";
    } catch {
      alert("Não foi possível salvar esta sessão. Confira a conexão e tente novamente.");
    }
  }

  async function updateHistoricalSession(studentId:string, session:Session) {
    try {
      const response=await fetch("/api/data",{cache:"no-store"});
      if(!response.ok)throw new Error();
      const result=await response.json();
      if(!Array.isArray(result.data))throw new Error();
      const latest=result.data as Student[];
      const target=latest.find(student=>student.id===studentId);
      if(!target)throw new Error();
      const updated={...target,sessions:target.sessions.map(item=>item.id===session.id?{...item,...session}:item)};
      const next=latest.map(student=>student.id===studentId?updated:student);
      const saveResponse=await fetch("/api/data",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(next)});
      if(!saveResponse.ok)throw new Error();
      setStudents(next);
      saveStudents(next);
      const channel=new BroadcastChannel(STUDENTS_CHANNEL);
      channel.postMessage({type:"refresh"});
      channel.close();
    } catch {
      alert("Não foi possível atualizar esta sessão. Confira a conexão e tente novamente.");
      throw new Error("historical_session_update_failed");
    }
  }

  async function deleteHistoricalSession(studentId:string, sessionId:string) {
    try {
      const response=await fetch("/api/data",{cache:"no-store"});
      if(!response.ok)throw new Error();
      const result=await response.json();
      if(!Array.isArray(result.data))throw new Error();
      const latest=result.data as Student[];
      const target=latest.find(student=>student.id===studentId);
      if(!target)throw new Error();
      const updated={...target,sessions:target.sessions.filter(item=>item.id!==sessionId)};
      const next=latest.map(student=>student.id===studentId?updated:student);
      const saveResponse=await fetch("/api/data",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(next)});
      if(!saveResponse.ok)throw new Error();
      setStudents(next);
      saveStudents(next);
      const channel=new BroadcastChannel(STUDENTS_CHANNEL);
      channel.postMessage({type:"refresh"});
      channel.close();
    } catch {
      alert("Não foi possível excluir esta sessão. Confira a conexão e tente novamente.");
      throw new Error("historical_session_delete_failed");
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
    if(target==="kids"){setKidsLessonRequest(null);setKidsStudentRequest(null);setKidsEntryKey(current=>current+1);}
    setView(target);
  }

  async function registerAbsence(student:Student,event:CalendarEvent){
    const absence:Session={id:crypto.randomUUID(),date:calendarEventDate(event),workoutName:"Ausência",notes:"Aus\u00eancia informada.",completedExercises:[],source:"ABSENCE",finishedAt:new Date().toISOString(),calendarEvent:{id:event.id,summary:event.summary,description:event.description,start:event.start,end:event.end,allDay:event.allDay,location:event.location}};
    const alreadyAbsentIds=new Set(students.filter(item=>item.sessions.some(session=>session.source==="ABSENCE"&&session.calendarEvent?.id===event.id)).map(item=>item.id));
    const remaining=getCalendarEventStudents(event,students).filter(item=>item.id!==student.id&&!alreadyAbsentIds.has(item.id));
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
    const absence:Session={id:crypto.randomUUID(),date:today(),workoutName:"Ausência",notes:"Aus\u00eancia informada.",completedExercises:[],source:"ABSENCE",finishedAt:new Date().toISOString()};
    updateStudentRecord({...student,sessions:[absence,...student.sessions]});
  }
  function openKidsCalendarEvent(event:CalendarEvent){
    const request=kidsCalendarRequest(event);
    if(!request)return;
    setKidsStudentRequest(null);
    setKidsLessonRequest(request);
    setView("kids");
  }
  function openKidsStudent(studentId:string){
    setKidsLessonRequest(null);
    setKidsStudentRequest(studentId);
    setKidsEntryKey(current=>current+1);
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

  if (["today","students","workouts-overview","history-overview","assessments-overview","agenda","finance","reports","kids","performance","data","settings","weather"].includes(view)) {
    const activeCount = students.filter(student => student.status === "ACTIVE").length;
    const sessionCount = students.reduce((total, student) => total + student.sessions.length, 0);
    const assessmentCount = students.reduce((total, student) => total + student.assessments.length, 0);
    const todayKey = today();
    const todaySessions = students.flatMap(student => student.sessions.filter(session => session.date === todayKey).map(session => ({student, session}))).sort((a,b)=>(b.session.finishedAt||b.session.startedAt||"").localeCompare(a.session.finishedAt||a.session.startedAt||""));
    const plannedCount = students.filter(student => student.status === "ACTIVE" && getStudentWorkoutEntries(student).length > 0).length;
    const birthdayStudents = students.filter(student => student.status === "ACTIVE" && isBirthdayToday(student.birthDate));
    const allHistory = students.flatMap(student=>student.sessions.map(session=>({student,session}))).sort((a,b)=>b.session.date.localeCompare(a.session.date));
    const allAssessments = students.flatMap(student=>student.assessments.map(assessment=>({student,assessment}))).sort((a,b)=>a.student.name.localeCompare(b.student.name,"pt-BR")||b.assessment.date.localeCompare(a.assessment.date));
    const filteredHistory = allHistory.filter(({student,session}) => { const q=normalizeName(historySearch); const matchText=!q || normalizeName(`${session.date} ${student.name} ${session.workoutName} ${session.focus||""} ${session.notes} ${session.completedExercises.map(ex=>ex.name).join(" ")}`).includes(q); const matchSource=historySource==="ALL" || (session.source||"PLANNED")===historySource; const now=today(); const cutoff=historyPeriod==="30"?dateOffset(now,-29):historyPeriod==="90"?dateOffset(now,-89):historyPeriod==="YEAR"?`${now.slice(0,4)}-01-01`:""; const matchPeriod=!cutoff||session.date>=cutoff; return matchText&&matchSource&&matchPeriod; });

    return (
      <main className="dashboard-shell">
        <Sidebar current={view} onNavigate={navigateMain} logout={logout} students={students} onStudent={openStudent} />
        <div className="dashboard-main">
          {view === "today" ? <>
            <header className="dashboard-topbar"><div className="today-heading"><div><p className="dashboard-eyebrow">Sua central do dia</p><h1>{formatWeekday(todayKey)}</h1><p>{formatCalendarDate(todayKey)}</p></div><div className="today-tools"><WeatherWidget onOpen={()=>setView("weather")}/><DigitalClock/><a className="drive-shortcut drive-shortcut-premium" href="https://drive.google.com/drive/my-drive" target="_blank" rel="noreferrer" title="Abrir meu Google Drive"><span className="shortcut-icon drive-icon" aria-hidden="true"><svg viewBox="0 0 48 48"><path d="M17.2 6h13.4l11.1 19.2-6.7 11.6H21.6l6.7-11.6L17.2 6Z" fill="#34A853"/><path d="M17.2 6 6.1 25.2l6.7 11.6h22.1l-6.6-11.6H19.4L10.6 10l6.6-4Z" fill="#FBBC04"/><path d="M6.1 25.2h22.2l6.7 11.6H12.8L6.1 25.2Z" fill="#4285F4"/></svg></span><span className="drive-shortcut-copy"><strong>Google Drive</strong><small>Abrir arquivos</small></span></a><a className="drive-shortcut bioimpedance-shortcut" href="https://galileuonline.com.br/#/avaliacao" target="_blank" rel="noreferrer" title="Abrir Bioimpedância no Galileu Online" aria-label="Abrir Bioimpedância"><span className="shortcut-icon bio-icon"><img src="/bioimpedancia-bin.png" alt="Bioimpedância"/></span></a></div></div></header>
            <div className="home-desktop-layout"><section className="dashboard-content home-main-content">
              <div data-home-size-key="highlights"><TodayHighlights events={calendarEvents.filter(event=>calendarEventDate(event)===todayKey)} monthEvents={calendarEvents.filter(event=>calendarEventDate(event).slice(0,7)===todayKey.slice(0,7))} monthKidsCount={homeMonthKidsCount} students={students} sessions={todaySessions} notes={notes} performanceActivities={todayPerformanceActivities} monthPerformanceActivities={homePerformanceActivities} onAgenda={(date)=>{setCalendarAnchor(date);setView("agenda");}} onStudent={openStudent} onKids={openKidsCalendarEvent} onKidsModule={()=>{setKidsLessonRequest(null);setView("kids")}} onHistory={()=>setView("history-overview")} onAssessments={()=>setView("assessments-overview")} onPerformance={()=>{setSelectedPerformanceActivityId(null);setView("performance")}} onOpenPerformanceActivity={activity=>{setSelectedPerformanceActivityId(activity.id);setView("performance")}} onOpenNote={startEditingNote} onNotes={()=>{const note=notes.find(item=>!item.done)||notes[0];if(note)startEditingNote(note);}}/></div>
              <div data-home-size-key="calendar"><CalendarTodayPanel status={calendarStatus} events={calendarEvents.filter(event=>calendarEventDate(event)===todayKey)} loading={calendarLoading} sync={calendarSync} students={students} todaySessions={todaySessions} onOpenAgenda={() => setView("agenda")} onOpenStudent={openStudent} onStartStudent={(id,mode)=>startStudentFlow(id,mode,"today")} onAbsence={registerAbsence} onOpenKids={openKidsCalendarEvent}/></div>
              <section className="panel notes-panel" data-home-size-key="notes"><div className="panel-head"><div><h2>Meus recados</h2><p className="muted">Anotações rápidas sincronizadas entre seus dispositivos.</p></div></div><div className="note-create"><input className="note-title-input" value={newNoteTitle} onChange={e=>setNewNoteTitle(e.target.value)} placeholder="Título do recado"/><textarea value={newNote} onChange={e=>setNewNote(e.target.value)} placeholder="Escreva o conteúdo do recado..." rows={3}/><button className="primary" onClick={addNote}>+ Adicionar</button></div>{notes.length?<div className="note-grid">{notes.map(note=><article className={`note-card ${note.done?"done":""}`} key={note.id} onClick={()=>startEditingNote(note)} role="button" tabIndex={0}><div className="note-card-content">{note.title?<strong>{note.title}</strong>:null}<p>{note.text}</p></div><div className="note-actions" onClick={e=>e.stopPropagation()}><label><input type="checkbox" checked={note.done} onChange={e=>patchNote(note.id,{done:e.target.checked})}/> Concluído</label><button className="danger-link" onClick={()=>removeNote(note.id)}>Excluir</button></div></article>)}</div>:<div className="empty-review compact-empty"><strong>Nenhum recado</strong><span>Use este mural para lembretes rápidos do dia a dia.</span></div>}{removedNote?<div className="undo-strip"><span>Recado excluído.</span><button onClick={undoNoteRemoval}>Desfazer</button></div>:null}{editingNoteId?<div className="note-modal-backdrop" onMouseDown={()=>{setEditingNoteId(null);setEditingNoteTitle("");setEditingNoteText("");}}><section className="note-modal" onMouseDown={e=>e.stopPropagation()}><div className="note-modal-head"><span>Editar recado</span><button className="text-button" onClick={()=>{setEditingNoteId(null);setEditingNoteTitle("");setEditingNoteText("");}} aria-label="Fechar">×</button></div><input className="note-modal-title" value={editingNoteTitle} onChange={e=>setEditingNoteTitle(e.target.value)} placeholder="Título"/><textarea className="note-modal-text" value={editingNoteText} onChange={e=>setEditingNoteText(e.target.value)} placeholder="Escreva seu recado..."/><div className="note-modal-actions"><button onClick={()=>{setEditingNoteId(null);setEditingNoteTitle("");setEditingNoteText("");}}>Cancelar</button><button className="primary" onClick={saveEditedNote}>Salvar</button></div></section></div>:null}</section>
              <HomePendingSection students={students}/>
              <SpecialDatesHome students={students} onStudent={openStudent} />
              <div className="home-search-bottom" data-home-size-key="search"><GlobalSearch value={globalSearch} onChange={setGlobalSearch} students={students} events={calendarEvents} onStudent={openStudent} onAgenda={(date)=>{setGlobalSearch("");setCalendarAnchor(date);setView("agenda");}} onKidsStudent={openKidsStudent}/></div>
            </section><aside className="home-right-rail"><div className="spotify-shortcut">
  {spotifyState.connected ? <>
    <div className="spotify-track">
      {spotifyState.track?.image ? <img src={spotifyState.track.image} alt=""/> : <span className="spotify-logo">S</span>}
      <div><strong>{spotifyState.track?.name || "Spotify"}</strong><small>{spotifyState.track?.artist || (spotifyState.active ? "Pronto para tocar" : "Abra o Spotify")}</small></div>
    </div>
    {spotifyState.track&&spotifyState.durationMs ? <div className="spotify-progress-block">
      <div className="spotify-progress-bar">
        <i style={{width:`${Math.min(100,Math.max(0,(spotifyProgressMs/Number(spotifyState.durationMs))*100))}%`}}/>
      </div>
      <div className="spotify-progress-times">
        <span>{formatSpotifyTime(spotifyProgressMs)}</span>
        <span>{formatSpotifyTime(Number(spotifyState.durationMs))}</span>
      </div>
    </div> : null}
    <div className="spotify-controls">
      <button type="button" disabled={spotifyBusy} onClick={()=>void controlSpotify("previous")} aria-label="Música anterior">◀</button>
      <button type="button" disabled={spotifyBusy} onClick={()=>void controlSpotify(spotifyState.isPlaying?"pause":"play")} aria-label={spotifyState.isPlaying?"Pausar":"Tocar"}>{spotifyState.isPlaying?"❚❚":"▶"}</button>
      <button type="button" disabled={spotifyBusy} onClick={()=>void controlSpotify("next")} aria-label="Próxima música">▶</button>
    </div>
  </> : <a className="spotify-connect" href="/api/spotify/login">Conectar Spotify</a>}
</div><DesktopAgendaRail events={calendarEvents} students={students} onOpenAgenda={(date)=>{setCalendarAnchor(date);setView("agenda");}} onOpenStudent={openStudent} onRefresh={()=>void refreshCalendarAutomatic(true)}/></aside></div>
            <div className="mobile-home-logout"><button type="button" onClick={logout}>Sair</button></div>
            <div className="mobile-header-actions"><button className="mobile-quick-launch" onClick={()=>setShowMobileActions(true)} aria-label="Abrir ações rápidas">＋</button><button className="mobile-voice-launch" onClick={()=>{sessionStorage.setItem("dmp_finance_voice_start","1");navigateMain("finance");}} aria-label="Falar lançamento financeiro">🎤</button></div>
            {showMobileActions?<MobileQuickActions onClose={()=>setShowMobileActions(false)} onNavigate={target=>{if(target==="extra")sessionStorage.setItem("dmp_finance_quick_action","extra");setShowMobileActions(false);navigateMain(target==="extra"||target==="receive"?"finance":target);}}/>:null}
          </> : null}

          {view === "students" ? <>
            <header className="dashboard-topbar"><div><p className="dashboard-eyebrow">Painel de atendimento</p><h1>Alunos</h1><p>Cadastros, fichas, observações, restrições e histórico.</p></div><div className="hero-actions"><button className="secondary" onClick={resetData}>Restaurar importação</button><button className="primary" onClick={() => setShowStudentForm(true)}>+ Novo aluno</button></div></header>
            <section className="dashboard-content"><div className="dashboard-stats four-stats">
{(()=>{
  const active=students.filter(student=>student.status==="ACTIVE");
  const inactive=students.filter(student=>student.status!=="ACTIVE");
  const genderStudents=active.filter(student=>student.gender);
  const men=genderStudents.filter(student=>student.gender==="MALE").length;
  const women=genderStudents.filter(student=>student.gender==="FEMALE").length;
  const ages=active.map(student=>calculateAge(student.birthDate)).filter((age):age is number=>age!==null);
  const ageGroups=[
    ["Até 30",ages.filter(age=>age<=30).length],
    ["31–40",ages.filter(age=>age>=31&&age<=40).length],
    ["41–50",ages.filter(age=>age>=41&&age<=50).length],
    ["51–60",ages.filter(age=>age>=51&&age<=60).length],
    ["60+",ages.filter(age=>age>60).length]
  ] as const;
  return <>
    <Stat icon="👥" label="Alunos ativos" value={active.length}/>
    <Stat icon="📁" label="Alunos inativos" value={inactive.length}/>
    <article className="stat-card student-demographic-card"><span className="stat-icon">👨👩</span><div><small>Homens / Mulheres</small><strong>{men} / {women}</strong><em>{genderStudents.length} de {active.length} cadastrados</em></div></article>
    <article className="stat-card student-demographic-card age-card"><span className="stat-icon">🎂</span><div><small>Faixa etária</small><div className="age-stat-list">{ageGroups.map(([label,value])=><span key={label}><b>{label}</b><strong>{value}</strong></span>)}</div><em>{ages.length} de {active.length} cadastrados</em></div></article>
  </>;
})()}
</div>
              <div className="student-toolbar dashboard-toolbar"><input className="search" placeholder="Pesquisar por nome, telefone ou objetivo..." value={search} onChange={event => setSearch(event.target.value)} /><div className="student-filters"><button className={studentFilter === "ACTIVE" ? "filter-active" : "secondary"} onClick={() => setStudentFilter("ACTIVE")}>Ativos</button><button className={studentFilter === "ARCHIVED" ? "filter-active" : "secondary"} onClick={() => setStudentFilter("ARCHIVED")}>Inativos</button></div></div>
              <div className="student-grid dashboard-student-grid compact-student-grid">{visibleStudents.map(student => {
                const lastSession=student.sessions.slice().sort((a,b)=>b.date.localeCompare(a.date))[0];
                const entries=getStudentWorkoutEntries(student);
                const sequence=studentWorkoutSequence(student,entries);
                const latestAssessment=student.assessments.slice().sort((a,b)=>b.date.localeCompare(a.date))[0];
                const assessmentDays=latestAssessment?Math.floor((Date.now()-new Date(latestAssessment.date+"T12:00:00").getTime())/86400000):null;
                const assessmentExpired=assessmentDays!==null&&assessmentDays>60;
                const workoutStates=entries.map(({workout,slot})=>({workout,slot,validity:workoutValidityInfo(student,workout)}));
                const needsRenewal=workoutStates.some(item=>item.validity.status==="RENEW"||item.validity.status==="EXPIRED");
                return <article className={`student-card dashboard-student-card compact-student-card ${needsRenewal?"workout-needs-renewal":""}`} key={student.id}>
                  <button className="student-card-open" onClick={() => openStudent(student.id)}>
                    <span className="student-avatar">{student.name.slice(0,1).toUpperCase()}</span>
                    <span className="student-card-main">
                      <span className="student-card-headline">
                        <strong><StudentCategoryDot category={student.tennisCategory}/>{student.name}</strong>
                        <span className={latestAssessment?(assessmentExpired?"student-assessment-mini expired":"student-assessment-mini"):"student-assessment-mini none"}>{latestAssessment?`📏 ${formatDate(latestAssessment.date)}`:"📏 Sem avaliação"}</span>
                      </span>
                      <span className="student-card-meta-line">
                        <small>{lastSession?`Último atendimento: ${formatDate(lastSession.date)}`:(student.goal||"Sem atendimentos")}</small>
                        {workoutStates.length?<span className="student-workout-summary">{workoutStates.map(({workout,slot,validity})=>{const suggested=entries.length>1&&sequence.suggested?.workout.id===workout.id;return <span key={workout.id} title={`${workout.name||`Treino ${slot}`} · ${validity.status==="NONE"?`${workout.exercises.length} exercícios`:validity.label}`} className={`student-workout-chip ${validity.status.toLowerCase()} ${suggested?"suggested":""}`}><b>{slot}</b><span>{suggested?"PRÓXIMO":`${workout.exercises.length} ex`}</span></span>})}</span>:<span className="student-workout-summary"><span className="student-workout-chip empty"><b>—</b><span>Sem treino</span></span></span>}
                        {student.restrictions?<span className="student-row-care" title={student.restrictions}>⚠ Cuidados</span>:null}
                      </span>
                    </span>
                    <b className="student-open-arrow">›</b>
                  </button>
                  <div className="card-actions compact-card-actions">
                    <button className="primary" onClick={()=>{setSelectedStudentId(student.id);setView("free-session");}}>✍ Registrar</button>
                    {entries.length?<button className="secondary" onClick={() => startStudentFlow(student.id,"session")}>▶ Acompanhar</button>:<button className="secondary" onClick={()=>{setSelectedStudentId(student.id);setWorkoutEditorSlot("A");setSelectedWorkoutId(null);setView("workout-editor");}}>+ Montar treino</button>}
                    <button className="secondary" onClick={()=>{setSelectedStudentId(student.id);setView("attendance-session");}}>✓ Presença</button>
                    <button className="absence-action" onClick={()=>void registerStudentAbsence(student)}>Ausência</button>
                  </div>
                </article>;
              })}</div>
            </section>
          </> : null}

          {view === "workouts-overview" ? (() => {
  const activeStudents = students.filter(student => student.status === "ACTIVE");
  const monthKey = todayKey.slice(0,7);
  const todayDate = new Date(todayKey + "T12:00:00");

  const trainingData = activeStudents.map(student => {
    const sessions = student.sessions
      .filter(session => session.source !== "ABSENCE")
      .slice()
      .sort((a,b) => b.date.localeCompare(a.date));

    const monthSessions = sessions.filter(session => session.date.slice(0,7) === monthKey);
    const last = sessions[0] || null;
    const daysSinceLast = last
      ? Math.max(0, Math.floor((todayDate.getTime() - new Date(last.date + "T12:00:00").getTime()) / 86400000))
      : null;

    const entries = getStudentWorkoutEntries(student);

    const status =
      !last ? "NEVER" :
      daysSinceLast !== null && daysSinceLast >= 14 ? "STALE" :
      daysSinceLast !== null && daysSinceLast >= 8 ? "WATCH" :
      "RECENT";

    return {student,sessions,monthSessions,last,daysSinceLast,entries,status};
  });

  const monthWorkouts = trainingData.reduce((sum,item)=>sum+item.monthSessions.length,0);
  const trainedThisMonth = trainingData.filter(item=>item.monthSessions.length>0).length;
  const average = trainedThisMonth ? Math.round((monthWorkouts/trainedThisMonth)*10)/10 : 0;
  const withoutRecent = trainingData.filter(item=>item.status==="STALE"||item.status==="NEVER").length;

  const priority:Record<string,number>={NEVER:0,STALE:1,WATCH:2,RECENT:3};

  const ordered = trainingData.slice().sort((a,b)=>{
    if(priority[a.status]!==priority[b.status]) return priority[a.status]-priority[b.status];
    if(a.daysSinceLast!==null&&b.daysSinceLast!==null&&a.daysSinceLast!==b.daysSinceLast) return b.daysSinceLast-a.daysSinceLast;
    return a.student.name.localeCompare(b.student.name,"pt-BR");
  });

  return <><header className="dashboard-topbar"><div>
    <p className="dashboard-eyebrow">Acompanhamento dos treinos</p>
    <h1>Central de Treinos</h1>
    <p>Veja quem treinou, a frequência do mês e quais alunos estão há mais tempo sem registro.</p>
  </div></header>

  <section className="dashboard-content">

    <div className="dashboard-stats four-stats">
      <Stat icon="🏋️" label="Treinos no mês" value={monthWorkouts}/>
      <Stat icon="👥" label="Alunos treinados" value={trainedThisMonth}/>
      <Stat icon="📊" label="Média por aluno" value={average}/>
      <Stat icon="⚠️" label="Sem treino 14+ dias" value={withoutRecent}/>
    </div>

    {withoutRecent>0?<div className="training-attention-banner">
      <strong>⚠ {withoutRecent} aluno{withoutRecent===1?"":"s"} precisam de atenção</strong>
      <span>Sem treino registrado há 14 dias ou mais, ou ainda sem nenhum treino registrado.</span>
    </div>:null}

    <div className="overview-list training-control-list">
      {ordered.map(item=>{
        const statusLabel =
          item.status==="NEVER" ? "Sem registros" :
          item.status==="STALE" ? `${item.daysSinceLast} dias sem treino` :
          item.status==="WATCH" ? `${item.daysSinceLast} dias` :
          item.daysSinceLast===0 ? "Treinou hoje" :
          item.daysSinceLast===1 ? "Treinou ontem" :
          `${item.daysSinceLast} dias`;

        const slots=item.entries.map(entry=>entry.slot).join(" · ");

        return <button
          className={`overview-row training-control-row training-${item.status.toLowerCase()}`}
          key={item.student.id}
          onClick={()=>{setSelectedStudentId(item.student.id);setTab("history");setView("student");}}
        >
          <span>
            <strong><StudentCategoryDot category={item.student.tennisCategory}/>{item.student.name}</strong>
            <small>
              {item.last
                ? <>Último treino: <b>{formatDate(item.last.date)}</b> · {item.last.workoutName||"Treino registrado"}</>
                : <>Nenhum treino registrado</>}
            </small>
            <small className="training-month-line">
              {item.monthSessions.length} treino{item.monthSessions.length===1?"":"s"} neste mês
              {item.entries.length?<> · 📋 Ficha {slots}</>:null}
            </small>
          </span>

          <span className={`training-status training-status-${item.status.toLowerCase()}`}>
            {statusLabel}
          </span>
        </button>;
      })}
    </div>

  </section></>;
})() : null}

          {view === "history-overview" ? <><header className="dashboard-topbar"><div><p className="dashboard-eyebrow">Linha do tempo</p><h1>Histórico</h1><p>Pesquise qualquer sessão por aluno, exercício, observação ou tipo de registro.</p></div></header><section className="dashboard-content"><div className="history-toolbar"><input className="search" placeholder="Buscar aluno, exercício, foco ou observação..." value={historySearch} onChange={e=>setHistorySearch(e.target.value)}/><select value={historySource} onChange={e=>setHistorySource(e.target.value as any)}><option value="ALL">Todos os tipos</option><option value="PLANNED">Ficha concluída</option><option value="FREE">Treino registrado</option><option value="ATTENDANCE">Presença</option><option value="IMPORTED">Importado</option></select><select value={historyPeriod} onChange={e=>setHistoryPeriod(e.target.value as any)}><option value="ALL">Todo o período</option><option value="30">Últimos 30 dias</option><option value="90">Últimos 90 dias</option><option value="YEAR">Este ano</option></select><span className="status-chip ok">{filteredHistory.length} registro{filteredHistory.length===1?"":"s"}</span></div><div className="overview-list">{filteredHistory.slice(0,500).map(({student,session})=><button className="overview-row" key={session.id} onClick={()=>openStudent(student.id)}><span><strong>{formatDate(session.date)} · {student.name}</strong><small>{session.focus?`Foco: ${session.focus}`:session.workoutName}{session.notes?` — ${session.notes}`:""}</small></span><span className="status-chip ok">{sessionSourceLabel(session)}</span></button>)}</div></section></> : null}

          {view === "assessments-overview" ? (() => {
  const activeStudents = students.filter(student => student.status === "ACTIVE");

  const assessmentControl = activeStudents.map(student => {
    const latest = student.assessments
      .slice()
      .sort((a,b) => b.date.localeCompare(a.date))[0];

    if (!latest) {
      return {student, latest:null, days:null, status:"NONE"};
    }

    const assessmentDate = new Date(latest.date + "T12:00:00");
    const todayDate = new Date(todayKey + "T12:00:00");
    const days = Math.max(0, Math.floor((todayDate.getTime() - assessmentDate.getTime()) / 86400000));

    const status = days > 60 ? "EXPIRED" : days >= 45 ? "SOON" : "OK";

    return {student, latest, days, status};
  });

  const expired = assessmentControl.filter(item => item.status === "EXPIRED");
  const soon = assessmentControl.filter(item => item.status === "SOON");
  const ok = assessmentControl.filter(item => item.status === "OK");
  const none = assessmentControl.filter(item => item.status === "NONE");

  const priority:Record<string,number> = {EXPIRED:0, SOON:1, NONE:2, OK:3};

  const ordered = assessmentControl.slice().sort((a,b) => {
    if (priority[a.status] !== priority[b.status]) {
      return priority[a.status] - priority[b.status];
    }
    if (a.days !== null && b.days !== null && a.days !== b.days) {
      return b.days - a.days;
    }
    return a.student.name.localeCompare(b.student.name,"pt-BR");
  });

  return <><header className="dashboard-topbar"><div>
    <p className="dashboard-eyebrow">Controle de avaliações</p>
    <h1>Acompanhamento dos alunos</h1>
    <p>Veja rapidamente quem está em dia e quem precisa de uma nova avaliação.</p>
  </div></header>

  <section className="dashboard-content">

    <div className="dashboard-stats four-stats">
      <Stat icon="🟢" label="Em dia" value={ok.length}/>
      <Stat icon="🟡" label="Próximas do prazo" value={soon.length}/>
      <Stat icon="🔴" label="Vencidas" value={expired.length}/>
      <Stat icon="⚪" label="Sem avaliação" value={none.length}/>
    </div>

    <div className="assessment-control-summary">
      <strong>{allAssessments.filter(({assessment})=>assessment.date.slice(0,7)===todayKey.slice(0,7)).length}</strong>
      <span>avaliações realizadas neste mês</span>
    </div>

    <div className="overview-list assessment-control-list">
      {ordered.map(item => {
        const label =
          item.status === "EXPIRED" ? "Vencida" :
          item.status === "SOON" ? "Próxima do prazo" :
          item.status === "OK" ? "Em dia" :
          "Sem avaliação";

        return <button
          className={`overview-row assessment-control-row assessment-${item.status.toLowerCase()}`}
          key={item.student.id}
          onClick={()=>{setSelectedStudentId(item.student.id);setTab("assessments");setView("student");}}
        >
          <span>
            <strong><StudentCategoryDot category={item.student.tennisCategory}/>{item.student.name}</strong>
            <small>
              {item.latest
                ? <>Última avaliação: <b>{formatDate(item.latest.date)}</b> · {item.days} dia{item.days===1?"":"s"} atrás</>
                : <>Nenhuma avaliação cadastrada</>}
            </small>
          </span>

          <span className={`assessment-control-status assessment-control-${item.status.toLowerCase()}`}>
            {label}
          </span>
        </button>
      })}
    </div>

  </section></>;
})() : null}

          {view === "agenda" ? <><header className="dashboard-topbar"><div><p className="dashboard-eyebrow">Agenda de trabalho</p><h1>Agenda</h1><p>Seus compromissos do Google Calendar dentro do DMP.</p></div></header><section className="dashboard-content"><CalendarAgenda status={calendarStatus} events={calendarEvents} loading={calendarLoading} sync={calendarSync} students={students} range={calendarRange} anchor={calendarAnchor} onRange={setCalendarRange} onAnchor={setCalendarAnchor} onOpenStudent={openStudent} onStartStudent={startStudentFlow} onOpenKids={openKidsCalendarEvent} onStatusChange={setCalendarStatus} onRefresh={()=>void refreshCalendarAutomatic(true)} onNewEvent={()=>setShowGoogleEventForm(true)} /></section></> : null}
          {view === "finance" ? <FinanceiroPage students={students} onStudentsChange={setStudents} /> : null}
          {view === "reports" ? <PersonalReportsPage students={students} onStudent={openStudent} /> : null}
          {view === "kids" ? <KidsPage key={kidsEntryKey} openRequest={kidsLessonRequest} openStudentId={kidsStudentRequest} onBack={()=>{setKidsLessonRequest(null);setKidsStudentRequest(null);setView("today");}} /> : null}
          {view === "performance" ? <PerformancePage openActivityId={selectedPerformanceActivityId} /> : null}
          {view === "data" ? <><DataCenter students={students} onReplace={setStudents} /><BackupCenter /></> : null}
          {view === "settings" ? <SettingsCenter /> : null}
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
          <section className="student-profile-command">
            <div className="student-profile-command-main">
              <StudentProfileIdentity student={selectedStudent} onEdit={() => setShowEditStudentForm(true)} />

              <nav className="student-profile-primary-tabs" aria-label="Áreas do aluno">
                {(["summary","timeline","workouts","history","assessments","finance","files"] as StudentTab[]).map(item => (
                  <button
                    key={item}
                    className={tab === item ? "active" : ""}
                    onClick={() => setTab(item)}
                  >
                    <span className="student-profile-tab-icon">
                      {item==="summary"?"📊":
                       item==="timeline"?"🧭":
                       item==="workouts"?"🏋️":
                       item==="history"?"🕘":
                       item==="assessments"?"📏":
                       item==="finance"?"💰":"📁"}
                    </span>

                    <span className="student-profile-tab-text">
                      <strong>{tabLabel(item)}</strong>
                      <small>
                        {item==="summary"?"Visão geral":
                         item==="timeline"?"História completa":
                         item==="workouts"?"Fichas e montagem":
                         item==="history"?"Sessões realizadas":
                         item==="assessments"?"Evolução física":
                         item==="finance"?"Mensalidade e histórico":
                         "Documentos"}
                      </small>
                    </span>
                  </button>
                ))}
              </nav>
            </div>

          </section>

          {tab === "summary" ? <StudentDashboardComplete student={selectedStudent} onOpen={setTab} onReport={()=>void printPersonalStudentReport(selectedStudent)} onStudentUpdate={updateStudentRecord} /> : null}
          {tab === "timeline" ? <StudentTimeline student={selectedStudent} /> : null}

          {tab === "workouts" ? <>
            <div className="student-profile-secondary-actions">
              <button
                className="secondary"
                onClick={() => setView("free-session")}
              >
                🎤 Registrar treino
              </button>

              <button
                className="secondary"
                onClick={() => setView("attendance-session")}
              >
                ✓ Presença
              </button>
            </div>

            <section className={`workflow-strip ${workoutEntries.length ? "has-workout" : "no-workout"}`}>
              <div>
                <strong>{workoutEntries.length ? `Treinos montados: ${workoutSlots}` : "Aluno sem treino montado"}</strong>
                <span>{workoutEntries.length ? "Escolha abaixo a ficha A, B, C ou D para editar, consultar ou iniciar a aula." : "Monte uma ficha abaixo ou registre a aula por voz/texto sem ficha."}</span>
              </div>
              {!workoutEntries.length ? <div className="workflow-strip-actions"><button className="primary" onClick={() => {setWorkoutEditorSlot("A");setSelectedWorkoutId(null);setTab("workouts");setView("workout-editor");}}>Montar Treino A</button></div> : null}
            </section>
          </> : null}
          {tab === "workouts" ? <WorkoutSlotsPanel student={selectedStudent} onEdit={(slot,workout)=>{setWorkoutEditorSlot(slot);setSelectedWorkoutId(workout?.id||null);setView("workout-editor");}} onStart={workout=>{if(window.matchMedia("(min-width: 801px)").matches){window.open(`/app?mode=planned-session&student=${encodeURIComponent(selectedStudent.id)}&workout=${encodeURIComponent(workout.id)}`,"_blank");return;}setSelectedWorkoutId(workout.id);setView("planned-session");}} onArchive={archiveWorkout} onClear={clearWorkout} onCopy={workout=>setWorkoutToCopy(workout)} /> : null}
          {tab === "history" ? <HistoryPanel student={selectedStudent} onSave={session=>updateHistoricalSession(selectedStudent.id,session)} onDelete={sessionId=>deleteHistoricalSession(selectedStudent.id,sessionId)} /> : null}
          {tab === "assessments" ? <AssessmentPanel student={selectedStudent} onNew={() => setShowAssessmentForm(true)} /> : null}
          {tab === "finance" ? <StudentFinancePanel student={selectedStudent} onEditProfile={() => setShowEditStudentForm(true)} /> : null}
          {tab === "files" ? <StudentFilesPanel student={selectedStudent} /> : null}
          <div className="student-danger-zone"><button className="danger-link" onClick={deleteSelectedStudent}>Excluir cadastro</button><small>Exclusão definitiva do aluno e dos dados vinculados.</small></div>
        </section>

        {showEditStudentForm ? <StudentForm title="Editar aluno" initialStudent={selectedStudent} onClose={() => setShowEditStudentForm(false)} onSave={editStudent} /> : null}
        {showAssessmentForm ? <AssessmentForm onClose={() => setShowAssessmentForm(false)} onSave={saveAssessment} /> : null}
        {workoutToCopy ? <DuplicateWorkoutModal workout={workoutToCopy} students={students} sourceStudentId={selectedStudent.id} onClose={()=>setWorkoutToCopy(null)} onConfirm={copyWorkoutToStudent} /> : null}
      </main>
    );
  }

  if (view === "workout-editor") return <WorkoutEditor student={selectedStudent} workout={selectedWorkoutId ? selectedWorkout : null} slot={workoutEditorSlot} exerciseCatalog={exerciseCatalog} personalTemplates={personalWorkoutTemplates} onTemplatesChange={setPersonalWorkoutTemplates} onBack={() => {setTab("workouts");setView("student");}} onSave={saveWorkout} />;
  if (view === "planned-session") return <PlannedSession student={selectedStudent} workout={selectedWorkout} onBack={() => setView("student")} onSave={saveSession} />;
  if (view === "attendance-session") return <AttendanceSessionScreen student={selectedStudent} onBack={() => setView("student")} onSave={saveSession} />;
  return <FreeSessionScreen student={selectedStudent} onBack={() => setView("student")} onSave={saveSession} />;
}


function CalendarTodayPanel({status,events,loading,sync,students,todaySessions,onOpenAgenda,onOpenStudent,onStartStudent,onAbsence,onOpenKids}:{status:{configured:boolean;connected:boolean};events:CalendarEvent[];loading:boolean;sync:{dailyAt:string;weeklyAt:string;weeklyCount:number};students:Student[];todaySessions:{student:Student;session:Session}[];onOpenAgenda:()=>void;onOpenStudent:(id:string,tab?:StudentTab)=>void;onStartStudent:(id:string,mode:"session"|"free"|"attendance")=>void;onAbsence:(student:Student,event:CalendarEvent)=>void;onOpenKids:(event:CalendarEvent)=>void}) {
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
  return <section className="panel calendar-today-panel calendar-today-panel-clickable" onClick={event=>{const target=event.target as HTMLElement;if(target.closest("button,a,input,select,textarea,label"))return;onOpenAgenda();}}><div className="panel-head"><div><h2>Agenda de hoje</h2>{status.connected?<p className="calendar-auto-sync">↻ Atualização automática ativa{sync.dailyAt?` · última ${formatSyncTime(sync.dailyAt)}`:""}</p>:null}</div><button className="secondary" onClick={onOpenAgenda}>Abrir agenda</button></div>
    {!status.configured ? <div className="calendar-empty"><strong>Integração pronta no aplicativo</strong><span>Falta apenas configurar as credenciais do Google para conectar sua agenda.</span></div> : !status.connected ? <div className="calendar-empty"><strong>Google Agenda ainda não conectado</strong><span>Abra a aba Agenda e toque em “Conectar Google”.</span></div> : loading ? <div className="calendar-empty"><span>Carregando compromissos...</span></div> : displayEvents.length ? <div className="calendar-preview-list">{displayEvents.map(event=>{const slotStudents=getCalendarEventStudents(event,students);const kids=kidsCalendarRequest(event);const allDone=slotStudents.length>0&&slotStudents.every(student=>completedIds.has(student.id)||absentIds.has(student.id));return <article key={event.id} className={`calendar-preview-row central-row calendar-multi-row ${allDone?"event-done":""}`}><span className="calendar-time">{formatCalendarTime(event)}</span><div className="calendar-slot-main"><button className="calendar-event-main" onClick={kids?()=>onOpenKids(event):onOpenAgenda}>{kids||!slotStudents.length?<strong>{event.summary}</strong>:null}<small>{kids?"Aula Tênis Kids":slotStudents.length?`${slotStudents.length} aluno${slotStudents.length===1?"":"s"} neste horário`:"Compromisso da agenda"}</small></button>{kids?<button className={`primary compact-action kids-action-${kids.category.toLowerCase()}`} onClick={()=>onOpenKids(event)}>🎾 Abrir turma e chamada</button>:slotStudents.length?<div className="calendar-slot-students"><span className="calendar-slot-title">Treinos do horário</span>{slotStudents.map(student=>{const done=completedIds.has(student.id);const absent=absentIds.has(student.id);const latestAssessment=student.assessments.slice().sort((a,b)=>b.date.localeCompare(a.date))[0];const assessmentAgeDays=latestAssessment?Math.floor((Date.now()-new Date(latestAssessment.date+"T12:00:00").getTime())/86400000):null;const assessmentExpired=assessmentAgeDays!==null&&assessmentAgeDays>60;const workoutEntries=getStudentWorkoutEntries(student);return <div className="calendar-slot-student" key={student.id}><span className="calendar-student-contact">
  {student.phone?<button
    type="button"
    className="calendar-whatsapp-button"
    title={`Enviar WhatsApp para ${student.name}`}
    aria-label={`Enviar WhatsApp para ${student.name}`}
    onClick={()=>{
      const phone=student.phone.replace(/\D/g,"");
      const whatsappPhone=phone.startsWith("55")?phone:`55${phone}`;
      window.open(`https://wa.me/${whatsappPhone}`,"_blank","noopener,noreferrer");
    }}
  ><svg viewBox="0 0 24 24" aria-hidden="true" className="calendar-whatsapp-icon"><path fill="currentColor" d="M12.04 2a9.84 9.84 0 0 0-8.39 14.98L2 22l5.18-1.62A9.96 9.96 0 1 0 12.04 2Zm0 17.93a8.02 8.02 0 0 1-4.09-1.12l-.29-.17-3.07.96 1-2.99-.19-.31a7.91 7.91 0 1 1 6.64 3.63Zm4.4-5.93c-.24-.12-1.43-.7-1.65-.78-.22-.08-.38-.12-.54.12-.16.24-.62.78-.76.94-.14.16-.28.18-.52.06-.24-.12-1.01-.37-1.93-1.19-.71-.63-1.19-1.42-1.33-1.66-.14-.24-.02-.37.11-.49.11-.11.24-.28.36-.42.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.54-1.3-.74-1.78-.19-.47-.39-.41-.54-.42h-.46c-.16 0-.42.06-.64.3-.22.24-.84.82-.84 2s.86 2.32.98 2.48c.12.16 1.69 2.58 4.1 3.62.57.25 1.02.4 1.37.51.58.18 1.1.16 1.51.1.46-.07 1.43-.58 1.63-1.15.2-.56.2-1.04.14-1.14-.06-.1-.22-.16-.46-.28Z"/></svg></button>:null}
  <button className="calendar-slot-student-name" onClick={()=>onOpenStudent(student.id)}>{student.name}</button>
</span><span className={latestAssessment?(assessmentExpired?"home-assessment-badge expired":"home-assessment-badge ok"):"home-assessment-badge none"}>{latestAssessment?`📏 ${formatDate(latestAssessment.date)}`:"📏 Sem avaliação"}</span>{workoutEntries.length&&!done?<button type="button" className="secondary compact-action home-workouts-open" onClick={()=>onOpenStudent(student.id,"workouts")} title="Abrir Central de Treinos">Treinos</button>:null}{absent?<span className="status-chip absent">Ausente</span>:null}{!done&&!absent?<span className="calendar-student-actions"><button className="secondary compact-action" onClick={()=>onStartStudent(student.id,"free")}>✍ Registrar</button><button className="secondary compact-action" onClick={()=>onStartStudent(student.id,"attendance")}>✓ Presença</button><button className="absence-action compact-action" onClick={()=>void onAbsence(student,event)}>Ausência</button></span>:null}</div>})}</div>:null}</div><span className="status-chip">{calendarEventStatus(event)}</span></article>})}</div> : <div className="calendar-empty"><strong>Nenhum compromisso hoje</strong><span>Sua agenda Google está conectada.</span></div>}
  </section>;
}

function CalendarAgenda({status,events,loading,sync,students,range,anchor,onRange,onAnchor,onOpenStudent,onStartStudent,onOpenKids,onStatusChange,onRefresh,onNewEvent}:{status:{configured:boolean;connected:boolean};events:CalendarEvent[];loading:boolean;sync:{dailyAt:string;weeklyAt:string;weeklyCount:number};students:Student[];range:AgendaRange;anchor:string;onRange:(value:AgendaRange)=>void;onAnchor:(value:string)=>void;onOpenStudent:(id:string)=>void;onStartStudent:(id:string,mode:"session"|"free"|"attendance")=>void;onOpenKids:(event:CalendarEvent)=>void;onStatusChange:(value:{configured:boolean;connected:boolean})=>void;onRefresh:()=>void;onNewEvent:()=>void}) {
  const [addingEvent,setAddingEvent]=useState<CalendarEvent|null>(null);
  async function disconnect(){await fetch("/api/google/disconnect",{method:"POST"});onStatusChange({...status,connected:false});}
  async function removeEvent(id:string){if(!confirm("Excluir este compromisso do Google Calendar?"))return;const r=await fetch(`/api/google/events?id=${encodeURIComponent(id)}`,{method:"DELETE"});if(r.ok)onRefresh();else alert("Não foi possível excluir o compromisso.");}
  const visible=events.filter(event=>agendaRangeIncludes(event,anchor,range)).sort((a,b)=>a.start.localeCompare(b.start));
  const navigate=(direction:-1|1)=>onAnchor(shiftAgendaAnchor(anchor,range,direction));
  const openEvent=(event:CalendarEvent)=>{const kids=kidsCalendarRequest(event);if(kids){onOpenKids(event);return;}if(range==="week"){setAddingEvent(event);return;}const matched=getCalendarEventStudents(event,students);if(matched.length===1){onOpenStudent(matched[0].id);return;}if(event.htmlLink)window.open(event.htmlLink,"_blank","noopener,noreferrer");};
  return <>
    <section className="agenda-view-toolbar"><div>{(["day","week","month","year","list"] as AgendaRange[]).map(value=><button key={value} className={range===value?"filter-active":"secondary"} onClick={()=>onRange(value)}>{agendaRangeLabel(value)}</button>)}</div><div className="agenda-period-nav"><button className="secondary" onClick={()=>navigate(-1)} aria-label="Período anterior">‹</button><strong>{agendaPeriodLabel(anchor,range)}</strong><button className="secondary" onClick={()=>navigate(1)} aria-label="Próximo período">›</button></div><input type="date" value={anchor} onChange={event=>onAnchor(event.target.value)}/><button className="primary" onClick={onNewEvent}>+ Novo compromisso</button></section>
    {!status.configured?<section className="panel setup-panel"><h2>Uma configuração única</h2><p>Para ativar, crie as credenciais OAuth no Google Cloud e configure <code>GOOGLE_CLIENT_ID</code>, <code>GOOGLE_CLIENT_SECRET</code> e <code>APP_URL</code>. Depois o mesmo login funciona no computador e no celular.</p></section>:null}
    {status.connected?<section className="panel agenda-period-panel"><div className="panel-head"><div><h2>{agendaRangeTitle(range)}</h2><p className="muted">{agendaPeriodLabel(anchor,range)}</p></div><span className="status-chip ok">{visible.length} evento{visible.length===1?"":"s"}</span></div>{loading?<div className="calendar-empty">Carregando agenda...</div>:<AgendaRangeContent range={range} anchor={anchor} events={visible} students={students} onOpenEvent={openEvent} onOpenStudent={onOpenStudent} onStartStudent={onStartStudent} onOpenKids={onOpenKids} onAddStudent={setAddingEvent} onRemoveEvent={removeEvent} onSelectDate={date=>{onAnchor(date);onRange("day");}} onSelectMonth={date=>{onAnchor(date);onRange("month");}}/>}</section>:null}
    <section className="panel agenda-connect agenda-connect-bottom"><div className="agenda-icon">📅</div><div className="agenda-connect-main"><h2>Google Calendar</h2><p>O Google continua sendo a agenda oficial. O DMP mantém os nomes e horários como estão na sua agenda e abre os treinos dos alunos daquele horário.</p><div className="agenda-roadmap"><span>✓ Atualiza ao abrir/voltar ao DMP</span><span>✓ Revisa o dia a cada 5 min em uso</span><span>✓ Domingo: pré-carrega 7 dias</span><span>✓ Vários alunos no mesmo horário</span><span>✓ Criar/excluir compromisso pelo DMP</span></div>{status.connected?<div className="agenda-sync-summary"><strong>Sincronização automática ativa</strong><span>Hoje{sync.dailyAt?` atualizado às ${formatSyncTime(sync.dailyAt)}`:" aguardando primeira atualização"}.</span><span>{sync.weeklyAt?`Última revisão semanal: ${formatSyncDateTime(sync.weeklyAt)} · ${sync.weeklyCount} compromissos.`:"A revisão dos próximos 7 dias acontece automaticamente no primeiro uso de domingo."}</span></div>:null}</div><div className="agenda-actions">{!status.configured?<span className="status-chip">Configuração pendente</span>:status.connected?<><span className="status-chip ok">Conectado</span><button className="primary" onClick={onNewEvent}>+ Compromisso</button><button className="secondary" onClick={onRefresh}>Atualizar</button><button className="secondary" onClick={disconnect}>Desconectar</button></>:<a className="primary button-link" href="/api/google/auth">Conectar Google</a>}</div></section>
    {addingEvent?<AddStudentsToCalendarEventModal event={addingEvent} students={students} onClose={()=>setAddingEvent(null)} onSaved={()=>{setAddingEvent(null);onRefresh();}}/>:null}
  </>;
}

function AddStudentsToCalendarEventModal({event,students,onClose,onSaved}:{event:CalendarEvent;students:Student[];onClose:()=>void;onSaved:()=>void}){
  const existing=getCalendarEventStudents(event,students);
  const [search,setSearch]=useState("");
  const [selected,setSelected]=useState<string[]>(()=>existing.map(student=>student.id));
  const [saving,setSaving]=useState(false);
  const [recurrenceScope,setRecurrenceScope]=useState<"single"|"following"|"series">("single");

  const activeStudents=students
    .filter(student=>student.status==="ACTIVE"&&normalizeName(student.name).includes(normalizeName(search)))
    .sort((a,b)=>a.name.localeCompare(b.name,"pt-BR"));

  function toggle(id:string){
    setSelected(current=>current.includes(id)?current.filter(value=>value!==id):[...current,id]);
  }

  async function save(){
    setSaving(true);
    const oldNames=existing.map(calendarStudentDisplayName).sort((a,b)=>b.length-a.length);
    let baseSummary=event.summary||"";

    for(const name of oldNames){
      baseSummary=baseSummary.split(name).join(" ");
    }

    baseSummary=baseSummary.replace(/\s+/g," ").trim();

    const names=students
      .filter(student=>selected.includes(student.id))
      .map(calendarStudentDisplayName);

    const summary=((baseSummary||"Aula")+(names.length?" "+names.join(" "):""))
      .replace(/\s+/g," ")
      .trim();

    const response=await fetch("/api/google/events",{
      method:"PATCH",
      headers:{"content-type":"application/json"},
      body:JSON.stringify({
        id:event.id,
        summary,
        description:event.description||"",
        location:event.location||"",
        start:event.start,
        end:event.end,
        scope:event.recurringEventId?recurrenceScope:"single",
        recurringEventId:event.recurringEventId||"",
        originalStartTime:event.originalStartTime||event.start
      })
    });

    setSaving(false);
    if(response.ok)onSaved();
    else alert("Não foi possível atualizar os alunos deste compromisso.");
  }

  return <div className="modal-backdrop"><section className="modal">
    <div className="modal-head">
      <div>
        <h2>Editar alunos</h2>
        <p className="muted">{event.summary} · marque ou desmarque os alunos desta aula.</p>
      </div>
      <button className="text-button" onClick={onClose}>Fechar</button>
    </div>

    <input className="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar aluno..."/>

    <div className="calendar-student-picker">
      {activeStudents.map(student=><button type="button" key={student.id} className={selected.includes(student.id)?"selected":""} onClick={()=>toggle(student.id)}>
        <span>{selected.includes(student.id)?"✓":"+"}</span>
        <strong>{student.name}</strong>
      </button>)}
    </div>

    {!activeStudents.length?<div className="calendar-empty">Nenhum aluno encontrado nesta busca.</div>:null}
    {event.recurringEventId?<div className="calendar-recurrence-scope">
      <strong>Aplicar alteração em:</strong>
      <div className="calendar-recurrence-options">
        <button type="button" className={recurrenceScope==="single"?"selected":""} onClick={()=>setRecurrenceScope("single")}>Somente esta aula</button>
        <button type="button" className={recurrenceScope==="following"?"selected":""} onClick={()=>setRecurrenceScope("following")}>Esta e as próximas</button>
        <button type="button" className={recurrenceScope==="series"?"selected":""} onClick={()=>setRecurrenceScope("series")}>Toda a série</button>
      </div>
      {recurrenceScope==="following"?<small>As aulas anteriores permanecem como estão.</small>:null}
    </div>:null}


    <div className="modal-actions">
      <button onClick={onClose}>Cancelar</button>
      <button className="primary" disabled={saving} onClick={save}>{saving?"Salvando...":"Salvar alunos"}</button>
    </div>
  </section></div>;
}

function AgendaRangeContent({range,anchor,events,students,onOpenEvent,onOpenStudent,onStartStudent,onOpenKids,onAddStudent,onRemoveEvent,onSelectDate,onSelectMonth}:{range:AgendaRange;anchor:string;events:CalendarEvent[];students:Student[];onOpenEvent:(event:CalendarEvent)=>void;onOpenStudent:(id:string)=>void;onStartStudent:(id:string,mode:"session"|"free"|"attendance")=>void;onOpenKids:(event:CalendarEvent)=>void;onAddStudent:(event:CalendarEvent)=>void;onRemoveEvent:(id:string)=>void;onSelectDate:(date:string)=>void;onSelectMonth:(date:string)=>void}){
  if(range==="week")return <AgendaWeekView anchor={anchor} events={events} students={students} onOpenEvent={onOpenEvent} onOpenStudent={onOpenStudent}/>;
  if(range==="month")return <AgendaMonthView anchor={anchor} events={events} onOpenEvent={onOpenEvent} onSelectDate={onSelectDate}/>;
  if(range==="year")return <AgendaYearView anchor={anchor} events={events} onSelectMonth={onSelectMonth}/>;
  return events.length?<div className="agenda-event-list">{events.map(event=><AgendaEventDetails key={event.id} event={event} students={students} compact={range==="list"} onOpenEvent={onOpenEvent} onOpenStudent={onOpenStudent} onStartStudent={onStartStudent} onOpenKids={onOpenKids} onAddStudent={onAddStudent} onRemoveEvent={onRemoveEvent}/>)}</div>:<div className="calendar-empty">Nenhum compromisso encontrado neste período.</div>;
}

function AgendaEventDetails({event,students,compact,onOpenEvent,onOpenStudent,onStartStudent,onOpenKids,onAddStudent,onRemoveEvent}:{event:CalendarEvent;students:Student[];compact:boolean;onOpenEvent:(event:CalendarEvent)=>void;onOpenStudent:(id:string)=>void;onStartStudent:(id:string,mode:"session"|"free"|"attendance")=>void;onOpenKids:(event:CalendarEvent)=>void;onAddStudent:(event:CalendarEvent)=>void;onRemoveEvent:(id:string)=>void}){
  const matchedStudents=getCalendarEventStudents(event,students);const kids=kidsCalendarRequest(event);
  return <article className={`agenda-event-row agenda-event-row-multi ${compact?"agenda-list-row":""}`}><div className="agenda-event-time">{compact?<><small>{formatRailDate(event)}</small><strong>{formatCalendarTime(event)}</strong></>:formatCalendarTime(event)}</div><div className="agenda-event-body"><button className="agenda-event-title-button" onClick={()=>onOpenEvent(event)}>{event.summary}</button>{event.location?<small>📍 {event.location}</small>:null}{event.description?<small>{event.description}</small>:null}{kids?<button className="primary compact-action" onClick={()=>onOpenKids(event)}>🎾 Abrir turma e chamada</button>:matchedStudents.length?<div className="slot-workouts"><div className="slot-workouts-head"><span>🏋️ Treinos do horário</span><small>{matchedStudents.length} aluno{matchedStudents.length===1?"":"s"}</small></div>{matchedStudents.map(student=>{const latestAssessment=student.assessments.slice().sort((a,b)=>b.date.localeCompare(a.date))[0];const assessmentAgeDays=latestAssessment?Math.floor((Date.now()-new Date(latestAssessment.date+"T12:00:00").getTime())/86400000):null;const assessmentExpired=assessmentAgeDays!==null&&assessmentAgeDays>60;return <div className="slot-workout-student" key={student.id}><button className="calendar-student-link" onClick={()=>onOpenStudent(student.id)}>👤 {student.name}</button><span className={latestAssessment?(assessmentExpired?"home-assessment-badge expired":"home-assessment-badge ok"):"home-assessment-badge none"}>{latestAssessment?`📏 ${formatDate(latestAssessment.date)}`:"📏 Sem avaliação"}</span><span className="slot-ficha-label">{getStudentWorkoutEntries(student).length>0?"Treino montado":"Sem treino"}</span>{getStudentWorkoutEntries(student).length>0?<button className="primary compact-action" onClick={()=>onStartStudent(student.id,"session")}>▶ Iniciar</button>:null}<button className={getStudentWorkoutEntries(student).length>0?"secondary compact-action":"primary compact-action"} onClick={()=>onStartStudent(student.id,"free")}>✍ Registrar</button><button className="secondary compact-action" onClick={()=>onStartStudent(student.id,"attendance")}>✓ Presença</button></div>})}</div>:event.allDay?<small className="muted">Evento de dia inteiro.</small>:<small className="muted">Nenhum aluno identificado no DMP.</small>}</div><div className="agenda-event-actions"><button className="secondary compact-action" onClick={()=>onAddStudent(event)}>✎ Editar alunos</button>{event.htmlLink?<a className="secondary button-link compact-action" href={event.htmlLink} target="_blank" rel="noreferrer">Google</a>:null}<button className="danger-link" onClick={()=>onRemoveEvent(event.id)}>Excluir</button></div></article>;
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


type DmpProfileSettings={birthdayImage?:string;birthdayMessage?:string;studentSummaryMessage?:string};
function SettingsCenter(){
  const [profile,setProfile]=useState<DmpProfileSettings>({birthdayMessage:"Parabéns pelo seu dia! 🎉 Desejo muita saúde, felicidade e um excelente novo ciclo. Abraço!",studentSummaryMessage:"Olá, {nome}! Segue um resumo do seu acompanhamento no DMP:\n\n• Frequência: {frequencia}\n{avaliacao}\n{evolucao}\n\nSeguimos acompanhando sua evolução! 💪"});
  const [health,setHealth]=useState<{database?:string;backup?:string;google?:string;strava?:string;spotify?:string;updatedAt?:string}>({});
  const [savingProfile,setSavingProfile]=useState(false);
  useEffect(()=>{
    fetch("/api/settings/profile",{cache:"no-store"}).then(r=>r.json()).then(d=>{if(d?.data)setProfile(current=>({...current,...d.data}));}).catch(()=>{});
    Promise.allSettled([fetch("/api/data",{cache:"no-store"}),fetch("/api/backup",{cache:"no-store"}),fetch("/api/google/status",{cache:"no-store"}),fetch("/api/strava/status",{cache:"no-store"}),fetch("/api/spotify/player",{cache:"no-store"})]).then(async results=>{
      const json=await Promise.all(results.map(async r=>r.status==="fulfilled"?r.value.json().catch(()=>null):null));
      const [data,backup,google,strava,spotify]=json;
      setHealth({database:data?.ok?"Online":"Indisponível",updatedAt:data?.updatedAt||"",backup:backup?.ok?(backup.backups?.[0]?.createdAt?`Último: ${new Date(backup.backups[0].createdAt).toLocaleString("pt-BR")}`:"Pronto"):"Indisponível",google:google?.connected?"Conectado":google?.configured?"Desconectado":"Não configurado",strava:strava?.connected?"Conectado":strava?.configured?"Desconectado":"Não configurado",spotify:spotify?.connected?"Conectado":"Desconectado"});
    });
  },[]);
  async function saveProfile(next=profile){setSavingProfile(true);try{const r=await fetch("/api/settings/profile",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(next)});if(!r.ok)throw new Error();setProfile(next);alert("Configuração de comunicação salva.");}catch{alert("Não foi possível salvar a configuração.");}finally{setSavingProfile(false);}}
  function chooseImage(files:FileList|null){const file=files?.[0];if(!file)return;if(file.size>2_000_000){alert("Use uma imagem de até 2 MB.");return;}const reader=new FileReader();reader.onload=()=>setProfile(current=>({...current,birthdayImage:String(reader.result||"")}));reader.readAsDataURL(file);}
  const healthItems=[['Banco de dados',health.database,health.updatedAt?`Dados: ${new Date(health.updatedAt).toLocaleString("pt-BR")}`:null],['Backup',health.backup,null],['Google Agenda',health.google,null],['Strava',health.strava,null],['Spotify',health.spotify,null]];
  return <><header className="dashboard-topbar"><div><p className="dashboard-eyebrow">Preferências e segurança</p><h1>Configurações</h1><p>Acesso, comunicação e saúde das integrações do DMP.</p></div></header><section className="dashboard-content settings-center-grid"><AccessSettings compact/><article className="panel"><div className="panel-head"><div><h2>Comunicação de aniversário</h2><p className="muted">Imagem e mensagem usadas pelo aviso da Home.</p></div></div><label className="settings-image-upload">Imagem padrão<input type="file" accept="image/*" onChange={e=>chooseImage(e.target.files)}/></label>{profile.birthdayImage?<div className="settings-birthday-preview"><img src={profile.birthdayImage} alt="Imagem padrão de aniversário"/><button className="danger-link" onClick={()=>setProfile(current=>({...current,birthdayImage:""}))}>Remover imagem</button></div>:<p className="muted">Nenhuma imagem carregada.</p>}<label className="settings-message-label">Mensagem padrão<textarea rows={4} value={profile.birthdayMessage||""} onChange={e=>setProfile(current=>({...current,birthdayMessage:e.target.value}))}/></label><button className="primary" disabled={savingProfile} onClick={()=>void saveProfile()}>{savingProfile?"Salvando...":"Salvar comunicação"}</button></article><article className="panel"><div className="panel-head"><div><h2>Resumo do aluno para WhatsApp</h2><p className="muted">Edite o texto usado no botão WhatsApp resumo. Campos automáticos: {"{nome}"}, {"{frequencia}"}, {"{avaliacao}"} e {"{evolucao}"}.</p></div></div><label className="settings-message-label">Mensagem padrão<textarea rows={8} value={profile.studentSummaryMessage||""} onChange={e=>setProfile(current=>({...current,studentSummaryMessage:e.target.value}))}/></label><button className="primary" disabled={savingProfile} onClick={()=>void saveProfile()}>{savingProfile?"Salvando...":"Salvar mensagem do resumo"}</button></article><article className="panel settings-health-panel"><div className="panel-head"><div><h2>Central de saúde do DMP</h2><p className="muted">Visão rápida dos serviços essenciais.</p></div></div><div className="settings-health-list">{healthItems.map(([label,status,detail])=><div key={String(label)}><span className={`health-dot ${String(status||"").includes("Conectado")||String(status)==="Online"||String(status).startsWith("Último")||String(status)==="Pronto"?"ok":"warn"}`}/><div><strong>{label}</strong><small>{status||"Verificando..."}{detail?` · ${detail}`:""}</small></div></div>)}</div></article></section></>;
}
function AccessSettings({compact=false}:{compact?:boolean}){
  const [email,setEmail]=useState("");const [currentPassword,setCurrentPassword]=useState("");const [newPassword,setNewPassword]=useState("");const [confirmPassword,setConfirmPassword]=useState("");const [message,setMessage]=useState("");const [saving,setSaving]=useState(false);
  useEffect(()=>{fetch("/api/settings/access",{cache:"no-store"}).then(r=>r.json()).then(data=>{if(data?.email)setEmail(data.email);}).catch(()=>{});},[]);
  async function save(event:FormEvent){event.preventDefault();setMessage("");if(!email.trim()){setMessage("Informe o login / e-mail.");return;}if(!newPassword){setMessage("Defina uma nova senha para concluir a configuração do acesso.");return;}if(newPassword!==confirmPassword){setMessage("A confirmação da nova senha não confere.");return;}if(newPassword.length<8){setMessage("A nova senha deve ter pelo menos 8 caracteres.");return;}setSaving(true);try{const response=await fetch("/api/settings/access",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:email.trim(),currentPassword,newPassword})});const data=await response.json();setMessage(response.ok?"Acesso definitivo configurado. Teste o novo login em uma janela anônima antes de sair desta sessão.":data?.message||"Não foi possível atualizar o acesso.");if(response.ok){setCurrentPassword("");setNewPassword("");setConfirmPassword("");}}catch{setMessage("Não foi possível atualizar o acesso.");}finally{setSaving(false);}}
  return <>{!compact?<header className="dashboard-topbar"><div><p className="dashboard-eyebrow">Segurança da conta</p><h1>Configurações</h1><p>Defina seu e-mail e sua senha definitiva de acesso ao DMP.</p></div></header>:null}<section className={compact?"":"dashboard-content"}><article className="panel access-settings-panel"><div className="panel-head"><div><h2>Acesso ao DMP</h2><p className="muted">Como você já está conectado, pode cadastrar um novo acesso sem precisar saber a senha inicial.</p></div><span className="status-chip ok">Sessão protegida</span></div><form className="form-grid" onSubmit={save} autoComplete="off"><label className="full">Login / e-mail<input type="email" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="username" required/></label><label className="full">Senha atual <small>(opcional nesta sessão)</small><input type="password" value={currentPassword} onChange={e=>setCurrentPassword(e.target.value)} autoComplete="current-password" placeholder="Pode deixar vazio"/></label><label>Nova senha<input type="password" value={newPassword} onChange={e=>setNewPassword(e.target.value)} autoComplete="new-password" placeholder="Mínimo 8 caracteres" required/></label><label>Confirmar nova senha<input type="password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} autoComplete="new-password" required/></label>{message?<div className="full access-settings-message">{message}</div>:null}<button className="primary full" disabled={saving}>{saving?"Salvando...":"Cadastrar acesso definitivo"}</button></form></article></section></>;
}

function FinancePinModal({pin,error,onChange,onClose,onSubmit}:{pin:string;error:string;onChange:(value:string)=>void;onClose:()=>void;onSubmit:(event:FormEvent)=>void}) {
  return <div className="modal-backdrop"><section className="modal"><div className="modal-head"><div><h2>Financeiro protegido</h2><p className="muted">Digite seu PIN para acessar. O Financeiro ficará liberado por 10 minutos.</p></div><button className="text-button" onClick={onClose}>Fechar</button></div><form className="form-grid" autoComplete="off" onSubmit={onSubmit}><label className="full">PIN<input autoFocus className="finance-pin-input" type="text" name="dmp-finance-pin" inputMode="numeric" autoComplete="one-time-code" maxLength={4} value={pin} onChange={event=>onChange(event.target.value)} placeholder="••••" /></label>{error?<div className="full restriction-mini">⚠ {error}</div>:null}<button className="primary full" disabled={pin.length!==4}>Entrar no Financeiro</button></form></section></div>;
}

function Sidebar({current,onNavigate,logout,students,onStudent}:{current:View;onNavigate:(view:View)=>void;logout:()=>void;students:Student[];onStudent:(id:string)=>void}) {
  const [mobile, setMobile] = useState(false);
  const [studentSearch,setStudentSearch]=useState("");
  useEffect(() => { setMobile(isPhoneDevice());for(const panel of ["sidebar","rail"]){const saved=localStorage.getItem(`dmp_${panel}_width`);if(saved)document.documentElement.style.setProperty(panel==="sidebar"?"--dmp-sidebar-width":"--dmp-agenda-rail-width",`${saved}px`);}}, []);
  const items:{view:View;icon:string;label:string}[]=[{view:"today",icon:"🏠",label:"Hoje"},{view:"finance",icon:"💰",label:"Financeiro"},{view:"performance",icon:"\u{1F4C8}",label:"Performance"},{view:"reports",icon:"📊",label:"Relatórios"},{view:"assessments-overview",icon:"📏",label:"Avaliações"},{view:"students",icon:"👥",label:"Alunos"},{view:"workouts-overview",icon:"🏋️",label:"Treinos"},{view:"kids",icon:"🎾",label:"Aulas Kids"},{view:"data",icon:"💾",label:"Dados"},{view:"settings",icon:"⚙️",label:"Configurações"}];
  const mobileOrder:View[]=["today","kids","finance","performance","reports","students","workouts-overview","assessments-overview","data","settings"];
  const orderedItems = mobile ? mobileOrder.map(view=>items.find(item=>item.view===view)!).filter(Boolean) : items;
  const quickStudents=studentSearch.trim()?students.filter(student=>student.status==="ACTIVE"&&normalizeName(student.name).includes(normalizeName(studentSearch))).slice(0,6):[];
  return <aside className="dashboard-sidebar"><div className="dashboard-logo-card" role="button" tabIndex={0} title="Voltar para Hoje" onClick={()=>onNavigate("today")} onKeyDown={event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();onNavigate("today");}}}><img src="/logo-danilo.jpg" alt="Danilo Modesto Personal Trainer" className="dashboard-sidebar-logo" /></div><nav className="dashboard-nav">{orderedItems.filter(item=>mobile||item.view!=="kids").map(item=><button key={item.view} className={`dashboard-nav-item ${current===item.view?"active":""}`} onClick={()=>onNavigate(item.view)}>{item.icon} {item.label}</button>)}</nav>{!mobile?<><button className={`sidebar-kids-special ${current==="kids"?"active":""}`} onClick={()=>onNavigate("kids")}><img src="/logo-ctds.png" alt="CT DS Tennis"/><span><strong>Aulas Kids</strong></span></button><div className="sidebar-student-search"><div className="sidebar-student-search-box"><span>⌕</span><input id="sidebar-student-search" value={studentSearch} onChange={event=>setStudentSearch(event.target.value)} placeholder="Buscar aluno..." autoComplete="off"/></div>{quickStudents.length?<div className="sidebar-student-search-results">{quickStudents.map(student=><button key={student.id} onClick={()=>{setStudentSearch("");onStudent(student.id);}}><strong>{student.name}</strong><small>Abrir Dashboard</small></button>)}</div>:studentSearch.trim()?<div className="sidebar-student-search-empty">Nenhum aluno encontrado.</div>:null}</div><button className="dashboard-logout" onClick={logout}>Sair</button></>:null}{!mobile?<span className="sidebar-resize-handle" onPointerDown={event=>beginPanelResize(event,"sidebar")}/>:null}</aside>;
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


function monthKeyOffset(key:string,delta:number){const [y,m]=key.split("-").map(Number);const d=new Date(y,m-1+delta,1);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;}
function monthLabel(key:string){return new Date(`${key}-01T12:00:00`).toLocaleDateString("pt-BR",{month:"long",year:"numeric"});}
function sessionIsPresence(session:Session){return session.source!=="ABSENCE";}
function monthStudentStats(student:Student,key:string){const sessions=student.sessions.filter(s=>s.date.startsWith(key));const done=sessions.filter(sessionIsPresence).length;const absences=sessions.filter(s=>s.source==="ABSENCE").length;return{done,absences,total:done+absences,presence:done+absences?Math.round(done/(done+absences)*100):0};}
function PersonalReportsPage({students,onStudent}:{students:Student[];onStudent:(id:string)=>void}){
  const [month,setMonth]=useState(today().slice(0,7));const [finance,setFinance]=useState<FinanceData|null>(null);
  useEffect(()=>{let cancelled=false;const local=loadFinanceData(financeSeedAugust2026);setFinance(local);fetchFinanceCloud(financeSeedAugust2026).then(d=>{if(!cancelled&&d)setFinance(d)}).catch(()=>{});return()=>{cancelled=true}},[]);
  const previous=monthKeyOffset(month,-1);const active=students.filter(s=>s.status==="ACTIVE");
  const makeStats=(key:string)=>{const rows=active.map(student=>({student,...monthStudentStats(student,key)}));const done=rows.reduce((n,r)=>n+r.done,0),absences=rows.reduce((n,r)=>n+r.absences,0),evaluations=active.reduce((n,s)=>n+s.assessments.filter(a=>a.date.startsWith(key)).length,0);const fs=finance?financeSummary(finance,key):null;return{rows,done,absences,evaluations,studentsWithSessions:rows.filter(r=>r.done>0).length,received:fs?.personalReceived||0,expected:fs?.personalExpected||0};};
  const current=makeStats(month),prev=makeStats(previous);const rank=[...current.rows].filter(r=>r.total>0).sort((a,b)=>b.presence-a.presence||b.done-a.done||a.student.name.localeCompare(b.student.name,"pt-BR"));
  const delta=(a:number,b:number)=>`${a-b>0?"+":""}${a-b}`;
  function printReport(){const popup=window.open("","_blank");if(!popup)return;const rows=rank.map((r,i)=>`<tr><td>${i+1}</td><td>${r.student.name}</td><td>${r.done}</td><td>${r.absences}</td><td>${r.presence}%</td></tr>`).join("");popup.document.write(`<html><head><title>Relatório Personal - ${monthLabel(month)}</title><style>body{font-family:Arial;padding:32px;color:#263238}h1{color:#166b91}.cards{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.card{border:1px solid #ddd;padding:14px;border-radius:12px}table{width:100%;border-collapse:collapse;margin-top:20px}td,th{padding:8px;border-bottom:1px solid #ddd;text-align:left}@media print{button{display:none}}</style></head><body><button onclick="print()">Imprimir / salvar PDF</button><h1>DMP · Fechamento ${monthLabel(month)}</h1><div class="cards"><div class="card"><b>Sessões</b><h2>${current.done}</h2></div><div class="card"><b>Faltas</b><h2>${current.absences}</h2></div><div class="card"><b>Avaliações</b><h2>${current.evaluations}</h2></div><div class="card"><b>Recebido Personal</b><h2>${formatStudentMoney(current.received)}</h2></div></div><h2>Ranking de assiduidade</h2><table><tr><th>#</th><th>Aluno</th><th>Sessões</th><th>Faltas</th><th>Presença</th></tr>${rows}</table></body></html>`);popup.document.close();}
  return <><header className="dashboard-topbar"><div><p className="dashboard-eyebrow">Gestão do Personal</p><h1>Relatórios</h1><p>Fechamento mensal, comparação e assiduidade.</p></div><div className="report-head-actions"><input type="month" value={month} onChange={e=>setMonth(e.target.value)}/><button className="primary" onClick={printReport}>Gerar relatório</button></div></header><section className="dashboard-content"><div className="report-metric-grid"><ReportMetric label="Sessões realizadas" value={String(current.done)} compare={`${delta(current.done,prev.done)} vs. ${monthLabel(previous)}`}/><ReportMetric label="Faltas" value={String(current.absences)} compare={`${delta(current.absences,prev.absences)} vs. mês anterior`}/><ReportMetric label="Avaliações" value={String(current.evaluations)} compare={`${delta(current.evaluations,prev.evaluations)} vs. mês anterior`}/><ReportMetric label="Alunos atendidos" value={String(current.studentsWithSessions)} compare={`${delta(current.studentsWithSessions,prev.studentsWithSessions)} vs. mês anterior`}/><ReportMetric label="Recebido Personal" value={formatStudentMoney(current.received)} compare={`${formatStudentMoney(current.received-prev.received)} de diferença`}/><ReportMetric label="Previsto Personal" value={formatStudentMoney(current.expected)} compare={`${formatStudentMoney(current.expected-prev.expected)} de diferença`}/></div><section className="panel month-comparison-panel"><div className="panel-head"><div><h2>{monthLabel(month)} × {monthLabel(previous)}</h2><p className="muted">Comparação automática com o mês anterior.</p></div></div><div className="month-comparison-bars">{[["Sessões",current.done,prev.done],["Faltas",current.absences,prev.absences],["Avaliações",current.evaluations,prev.evaluations],["Alunos atendidos",current.studentsWithSessions,prev.studentsWithSessions]].map(([label,now,before])=><div key={String(label)}><strong>{label}</strong><span><i style={{width:`${Math.max(4,Math.min(100,Number(now)/(Math.max(Number(now),Number(before),1))*100))}%`}}/> {now}</span><span className="previous"><i style={{width:`${Math.max(4,Math.min(100,Number(before)/(Math.max(Number(now),Number(before),1))*100))}%`}}/> {before}</span></div>)}</div></section><section className="panel attendance-ranking"><div className="panel-head"><div><h2>Ranking de assiduidade</h2><p className="muted">Uso interno · presença do mês selecionado.</p></div></div>{rank.length?<div className="attendance-table">{rank.map((row,index)=><button key={row.student.id} onClick={()=>onStudent(row.student.id)}><b>{index+1}</b><strong>{row.student.name}</strong><span>{row.done} sessões</span><span>{row.absences} faltas</span><em>{row.presence}%</em></button>)}</div>:<p className="muted">Nenhum registro no mês.</p>}</section></section></>;
}
function ReportMetric({label,value,compare}:{label:string;value:string;compare:string}){return <article className="report-metric"><small>{label}</small><strong>{value}</strong><span>{compare}</span></article>}

function StudentTimeline({student}:{student:Student}){const [filter,setFilter]=useState<"ALL"|"SESSION"|"ASSESSMENT"|"FINANCE"|"NOTE">("ALL");const [finance,setFinance]=useState<FinanceData|null>(null);useEffect(()=>{const local=loadFinanceData(financeSeedAugust2026);setFinance(local);fetchFinanceCloud(financeSeedAugust2026).then(d=>d&&setFinance(d)).catch(()=>{})},[]);const items:any[]=[...student.sessions.map(x=>({type:"SESSION",date:x.date,title:x.source==="ABSENCE"?"Falta registrada":`Treino · ${x.workoutName||"Sessão"}`,detail:x.notes||x.focus||sessionSourceLabel(x)})),...student.assessments.map(x=>({type:"ASSESSMENT",date:x.date,title:"Avaliação física",detail:[x.weight!=null?`${x.weight} kg`:"",x.bodyFatPercent!=null?`${x.bodyFatPercent}% gordura`:""].filter(Boolean).join(" · ")})),...(student.notes?[{type:"NOTE",date:student.notesUpdatedAt?.slice(0,10)||student.startDate,title:"Observação do aluno",detail:student.notes}]:[]),...(finance?.personalInvoices||[]).filter(i=>i.studentId===student.id||normalizeName(i.studentName)===normalizeName(student.name)).flatMap(i=>[{type:"FINANCE",date:`${i.competence}-${String(i.dueDay||1).padStart(2,"0")}`,title:`Financeiro · ${i.competence}`,detail:`Previsto ${formatStudentMoney(i.expectedAmount)}`},...i.payments.map(p=>({type:"FINANCE",date:p.date,title:"Pagamento registrado",detail:formatStudentMoney(p.amount)}))])].sort((a,b)=>b.date.localeCompare(a.date));const shown=filter==="ALL"?items:items.filter(x=>x.type===filter);const labels:any={ALL:"Tudo",SESSION:"Treinos e presença",ASSESSMENT:"Avaliações",FINANCE:"Financeiro",NOTE:"Observações"};return <section className="panel student-timeline-panel"><div className="panel-head"><div><h2>Linha do tempo</h2><p className="muted">A história do aluno reunida em um só lugar.</p></div></div><div className="timeline-filters">{Object.keys(labels).map(k=><button key={k} className={filter===k?"active":""} onClick={()=>setFilter(k as any)}>{labels[k]}</button>)}</div><div className="timeline-list">{shown.map((item,index)=><article key={`${item.type}-${item.date}-${index}`}><div className={`timeline-dot ${item.type.toLowerCase()}`}/><time>{formatDate(item.date)}</time><div><strong>{item.title}</strong><p>{item.detail||"Sem observações adicionais."}</p></div></article>)}{!shown.length?<p className="muted">Nenhum registro neste filtro.</p>:null}</div></section>}

function AssessmentTrendChart({student}:{student:Student}){const [period,setPeriod]=useState<"ALL"|"3"|"6"|"12">("ALL");const sorted=[...student.assessments].sort((a,b)=>a.date.localeCompare(b.date));const cutoff=period==="ALL"?"":dateOffset(today(),-(Number(period)*30));const data=cutoff?sorted.filter(a=>a.date>=cutoff):sorted;const metrics=[{label:"Peso",unit:"kg",value:(a:Assessment)=>assessmentNumber(a.weight)},{label:"Gordura corporal",unit:"%",value:(a:Assessment)=>assessmentNumber(a.bodyFatPercent)},{label:"Massa muscular (kg)",unit:"kg",value:(a:Assessment)=>assessmentNumber(a.muscleMass)},{label:"Massa magra (kg)",unit:"kg",value:(a:Assessment)=>assessmentLeanMassKg(a)}];return <section className="assessment-trends"><div className="assessment-trends-head"><div><h3>Histórico visual</h3><p>Evolução de peso e composição corporal.</p></div><select value={period} onChange={e=>setPeriod(e.target.value as any)}><option value="3">3 meses</option><option value="6">6 meses</option><option value="12">1 ano</option><option value="ALL">Todo histórico</option></select></div><div className="assessment-trend-grid">{metrics.map(metric=><MiniTrend key={metric.label} label={metric.label} unit={metric.unit} points={data.flatMap(a=>{const value=metric.value(a);return value===null?[]:[{date:a.date,value}]})}/>)}</div></section>}
function MiniTrend({label,unit,points}:{label:string;unit:string;points:{date:string;value:number}[]}){if(points.length<2)return <article className="mini-trend"><strong>{label}</strong><p className="muted">Dados insuficientes para gráfico.</p></article>;const vals=points.map(p=>p.value),min=Math.min(...vals),max=Math.max(...vals),span=max-min||1;const coords=points.map((p,i)=>`${(i/(points.length-1))*100},${90-((p.value-min)/span)*70}`).join(" ");const last=points[points.length-1],first=points[0],diff=last.value-first.value;return <article className="mini-trend"><div><strong>{label}</strong><span>{last.value.toFixed(1)} {unit} <small>{diff>0?"+":""}{diff.toFixed(1)}</small></span></div><svg viewBox="0 0 100 100" preserveAspectRatio="none"><polyline points={coords} fill="none" stroke="currentColor" strokeWidth="2.5" vectorEffect="non-scaling-stroke"/></svg><footer><span>{formatDate(first.date)}</span><span>{formatDate(last.date)}</span></footer></article>}

function SpecialDatesHome({students,onStudent}:{students:Student[];onStudent:(id:string)=>void}){const [profile,setProfile]=useState<DmpProfileSettings>({});useEffect(()=>{fetch("/api/settings/profile",{cache:"no-store"}).then(r=>r.json()).then(d=>d?.data&&setProfile(d.data)).catch(()=>{})},[]);const now=today(),md=now.slice(5);const birthdays=students.filter(s=>s.status==="ACTIVE"&&s.birthDate?.slice(5)===md).map(s=>({student:s,kind:"birthday" as const,label:`Aniversário: ${s.name}`,detail:`${calculateAge(s.birthDate)} anos hoje`}));const anniversaries=students.filter(s=>s.status==="ACTIVE"&&s.startDate?.slice(5)===md&&s.startDate.slice(0,4)!==now.slice(0,4)).map(s=>{const years=Number(now.slice(0,4))-Number(s.startDate.slice(0,4));return{student:s,kind:"anniversary" as const,label:`${s.name} · ${years} ano${years===1?"":"s"} de DMP`,detail:"Aniversário de acompanhamento"}});const dates=[...birthdays,...anniversaries];async function shareBirthday(student:Student){const text=(profile.birthdayMessage||"Parabéns pelo seu dia! 🎉").replaceAll("{nome}",student.name.split(" ")[0]);const link=whatsappLink(student.phone);if(profile.birthdayImage&&navigator.share){try{const blob=await (await fetch(profile.birthdayImage)).blob();const file=new File([blob],"parabens.jpg",{type:blob.type||"image/jpeg"});if((navigator as any).canShare?.({files:[file]})){await navigator.share({text,files:[file]});return;}}catch{}}if(link)window.open(`${link}?text=${encodeURIComponent(text)}`,"_blank");else navigator.clipboard?.writeText(text);}
return dates.length?<section className="panel special-dates-home"><div className="panel-head"><div><h2>Hoje é dia especial 🎉</h2><p className="muted">{dates.length===1?"1 data importante hoje":`${dates.length} datas importantes hoje`}.</p></div></div><div className="special-date-list">{dates.map((item,index)=><article key={`${item.student.id}-${item.kind}-${index}`}><button className="special-date-main" onClick={()=>onStudent(item.student.id)}><span>{item.kind==="birthday"?"🎂":"🏅"}</span><div><strong>{item.label}</strong><small>{item.detail}</small></div></button>{item.kind==="birthday"?<button className="primary compact-action" onClick={()=>void shareBirthday(item.student)}>Enviar parabéns</button>:null}</article>)}</div></section>:null}


async function shareStudentSummary(student:Student){
  const sorted=assessmentSorted(student),latest=sorted[0],previous=sorted[1];
  const first=student.name.trim().split(/\s+/)[0]||student.name;
  const frequency=studentFrequencyDisplay(student);
  const assessmentText=latest?`• Última avaliação: ${formatDate(latest.date)}${latest.weight!=null?` · ${latest.weight} kg`:""}${latest.bodyFatPercent!=null?` · ${latest.bodyFatPercent}% de gordura`:""}.`:"";
  const evolution:string[]=[];
  if(latest&&previous){if(latest.weight!=null&&previous.weight!=null)evolution.push(`peso ${assessmentDelta(latest.weight,previous.weight," kg")}`);if(latest.bodyFatPercent!=null&&previous.bodyFatPercent!=null)evolution.push(`gordura ${assessmentDelta(latest.bodyFatPercent,previous.bodyFatPercent," p.p.")}`);if(latest.muscleMass!=null&&previous.muscleMass!=null)evolution.push(`massa muscular ${assessmentDelta(latest.muscleMass,previous.muscleMass," kg")}`);}
  const evolutionText=evolution.length&&previous?`• Evolução desde ${formatDate(previous.date)}: ${evolution.join(" · ")}.`:"";
  const fallback=`Olá, {nome}! Segue um resumo do seu acompanhamento no DMP:

• Frequência: {frequencia}
{avaliacao}
{evolucao}

Seguimos acompanhando sua evolução! 💪`;
  let template=fallback;
  try{const response=await fetch("/api/settings/profile",{cache:"no-store"});const payload=await response.json();if(response.ok&&String(payload?.data?.studentSummaryMessage||"").trim())template=String(payload.data.studentSummaryMessage);}catch{}
  const text=template.replaceAll("{nome}",first).replaceAll("{frequencia}",frequency).replaceAll("{avaliacao}",assessmentText).replaceAll("{evolucao}",evolutionText).replace(/\n{3,}/g,"\n\n").trim();
  const link=whatsappLink(student.phone);if(link)window.open(`${link}?text=${encodeURIComponent(text)}`,"_blank");else{navigator.clipboard?.writeText(text);alert("Resumo copiado. Cadastre o WhatsApp do aluno para abrir a conversa diretamente.");}
}

function StudentCategoryDot({category}:{category?:TennisCategory}) { return category?<span className={`tennis-category-dot ${category.toLowerCase()}`} title={`Categoria ${category.toLowerCase()}`}/>:null; }
function Stat({icon,label,value,onClick}:{icon:string;label:string;value:number;onClick?:()=>void}) { return onClick?<button type="button" className="stat-card stat-card-button" onClick={onClick}><div className="stat-card-icon">{icon}</div><div><span>{label}</span><strong>{value}</strong></div></button>:<article className="stat-card"><div className="stat-card-icon">{icon}</div><div><span>{label}</span><strong>{value}</strong></div></article>; }

function HomePendingSection({students}:{students:Student[]}){
  const active=students.filter(student=>student.status==="ACTIVE");
  const renewals=active.flatMap(student=>
    getStudentWorkoutEntries(student)
      .map(({workout,slot})=>({student,workout,slot,validity:workoutValidityInfo(student,workout)}))
      .filter(item=>item.validity.status==="RENEW"||item.validity.status==="EXPIRED")
  );
  const assessmentAlerts=active.map(student=>{
    const latest=student.assessments.slice().sort((a,b)=>b.date.localeCompare(a.date))[0]||null;
    const days=latest?Math.floor((Date.now()-new Date(latest.date+"T12:00:00").getTime())/86400000):null;
    return {student,latest,days};
  }).filter(item=>item.days===null||item.days>60);
  const withoutWorkout=active.filter(student=>getStudentWorkoutEntries(student).length===0);
  const total=renewals.length+assessmentAlerts.length+withoutWorkout.length;

  return <details className="home-pending-section">
    <summary>
      <div><span>PENDÊNCIAS</span><strong>{total?`${total} itens para revisar`:"Tudo em dia"}</strong></div>
      <small>{renewals.length} treinos · {assessmentAlerts.length} avaliações · {withoutWorkout.length} sem ficha</small>
    </summary>
    <div className="home-pending-grid">
      <section>
        <header><span>🏋️</span><div><strong>Treinos a renovar</strong><small>{renewals.length} pendente{renewals.length===1?"":"s"}</small></div></header>
        {renewals.length?<div className="home-pending-list">{renewals.slice(0,12).map(item=><article key={item.student.id+"-"+item.workout.id}><b>{item.student.name}</b><span>Treino {item.slot} · {item.validity.label}</span></article>)}</div>:<p>Nenhum treino precisa de renovação.</p>}
      </section>
      <section>
        <header><span>📏</span><div><strong>Avaliações atrasadas</strong><small>{assessmentAlerts.length} aluno{assessmentAlerts.length===1?"":"s"}</small></div></header>
        {assessmentAlerts.length?<div className="home-pending-list">{assessmentAlerts.slice(0,12).map(item=><article key={item.student.id}><b>{item.student.name}</b><span>{item.latest?`Última ${formatDate(item.latest.date)} · ${item.days} dias`:"Sem avaliação registrada"}</span></article>)}</div>:<p>Nenhuma avaliação atrasada.</p>}
      </section>
      <section>
        <header><span>🗂️</span><div><strong>Sem treino montado</strong><small>{withoutWorkout.length} aluno{withoutWorkout.length===1?"":"s"}</small></div></header>
        {withoutWorkout.length?<div className="home-pending-list">{withoutWorkout.slice(0,12).map(student=><article key={student.id}><b>{student.name}</b><span>Cadastro ativo sem ficha de treino</span></article>)}</div>:<p>Todos os alunos ativos têm treino montado.</p>}
      </section>
    </div>
  </details>;
}

function GlobalSearch({value,onChange,students,events,onStudent,onAgenda,onKidsStudent}:{value:string;onChange:(value:string)=>void;students:Student[];events:CalendarEvent[];onStudent:(id:string)=>void;onAgenda:(date:string)=>void;onKidsStudent:(id:string)=>void}){
  const q=normalizeName(value.trim());
  const [finance,setFinance]=useState<FinanceData|null>(null);
  const [kids,setKids]=useState<KidsStudent[]>([]);
  useEffect(()=>{if(!q){setKids([]);return;}let cancelled=false;const local=loadFinanceData(financeSeedAugust2026);setFinance(local);fetchFinanceCloud(financeSeedAugust2026).then(data=>{if(!cancelled&&data)setFinance(data);}).catch(()=>{});fetch("/api/kids",{cache:"no-store"}).then(r=>r.ok?r.json():null).then(payload=>{if(cancelled)return;const groups=(payload?.data?.classes||[]) as {students?:KidsStudent[]}[];const unique=new Map<string,KidsStudent>();groups.flatMap(group=>group.students||[]).forEach(student=>{if(student?.id&&!unique.has(student.id))unique.set(student.id,student);});setKids([...unique.values()]);}).catch(()=>{if(!cancelled)setKids([]);});return()=>{cancelled=true};},[q]);
  if(!q)return <div className="global-search"><span>⌕</span><input value={value} onChange={e=>onChange(e.target.value)} placeholder="Buscar no DMP..."/></div>;
  const studentHits=students.map(student=>{const session=student.sessions.find(x=>normalizeName(`${x.date} ${x.workoutName} ${x.focus||""} ${x.notes} ${x.completedExercises.map(e=>e.name).join(" ")}`).includes(q));const assessment=student.assessments.find(a=>normalizeName(`${a.date} ${a.weight??""} ${a.bodyFatPercent??""} ${a.muscleMass??""} ${a.notes}`).includes(q));const base=normalizeName(`${student.name} ${student.phone} ${student.email||""} ${student.goal} ${student.notes} ${student.restrictions} ${student.profession||""}`);if(base.includes(q))return{student,label:"Personal",detail:student.goal||"Abrir cadastro"};if(session)return{student,label:"Personal · Treino / histórico",detail:`${formatDate(session.date)} · ${session.workoutName}`};if(assessment)return{student,label:"Personal · Avaliação",detail:`${formatDate(assessment.date)} · ${assessment.weight??"—"} kg`};return null;}).filter(Boolean).slice(0,8) as {student:Student;label:string;detail:string}[];
  const kidsHits=kids.filter(student=>student.active!==false&&normalizeName(`${student.name} ${student.fatherName||""} ${student.motherName||""} ${student.financialResponsible||""} ${student.notes||""}`).includes(q)).slice(0,8);
  const financeHits=(finance?.personalInvoices||[]).filter(i=>normalizeName(`${i.studentName} ${i.competence} ${i.expectedAmount}`).includes(q)).slice(0,5);
  const eventHits=events.filter(event=>normalizeName(`${event.summary} ${event.description||""} ${event.location||""}`).includes(q)).slice(0,5);
  return <div className="global-search global-search-open"><span>⌕</span><input autoFocus value={value} onChange={e=>onChange(e.target.value)} placeholder="Buscar Personal, Kids, treino, avaliação, financeiro..."/><div className="global-search-results">{studentHits.map(hit=><button key={`${hit.student.id}-${hit.label}`} onClick={()=>{onChange("");onStudent(hit.student.id)}}><b>{hit.student.name}</b><small>{hit.label} · {hit.detail}</small></button>)}{kidsHits.map(student=><button key={`kids-${student.id}`} onClick={()=>{onChange("");onKidsStudent(student.id)}}><b>{student.name}</b><small>Kids · Abrir ficha da criança</small></button>)}{financeHits.map(item=>{const st=students.find(s=>normalizeName(s.name)===normalizeName(item.studentName));return <button key={`fin-${item.id}`} onClick={()=>{onChange("");if(st)onStudent(st.id)}}><b>{item.studentName}</b><small>Financeiro · {item.competence} · {formatStudentMoney(item.expectedAmount)}</small></button>})}{eventHits.map(event=><button key={`ev-${event.id}`} onClick={()=>{onChange("");onAgenda(calendarEventDate(event))}}><b>{event.summary}</b><small>Agenda · {formatDate(calendarEventDate(event))}</small></button>)}{!studentHits.length&&!kidsHits.length&&!financeHits.length&&!eventHits.length?<p>Nenhum resultado encontrado.</p>:null}</div></div>;
}
function TodayHighlights({events,monthEvents,monthKidsCount,notes,students,sessions,performanceActivities,monthPerformanceActivities,onAgenda,onStudent,onKids,onKidsModule,onHistory,onAssessments,onPerformance,onOpenPerformanceActivity,onNotes,onOpenNote}:{events:CalendarEvent[];monthEvents:CalendarEvent[];monthKidsCount:number|null;notes:DmpNote[];students:Student[];sessions:{student:Student;session:Session}[];performanceActivities:PerformanceActivity[];monthPerformanceActivities:PerformanceActivity[];onAgenda:(date:string)=>void;onStudent:(id:string)=>void;onKids:(event:CalendarEvent)=>void;onKidsModule:()=>void;onHistory:()=>void;onAssessments:()=>void;onPerformance:()=>void;onOpenPerformanceActivity:(activity:PerformanceActivity)=>void;onNotes:()=>void;onOpenNote:(note:DmpNote)=>void}){
  const [showSummary,setShowSummary]=useState(false);
  const [showMonthClosing,setShowMonthClosing]=useState(false);

  const timed=events
    .filter(event=>!event.allDay)
    .sort((a,b)=>a.start.localeCompare(b.start));

  const programmedStudents=new Map<string,Student>();

  timed
    .filter(event=>!kidsCalendarRequest(event))
    .forEach(event=>{
      getCalendarEventStudents(event,students)
        .forEach(student=>programmedStudents.set(student.id,student));
    });

  sessions.forEach(item=>programmedStudents.set(item.student.id,item.student));

  const attendedIds=new Set(
    sessions
      .filter(item=>item.session.source!=="ABSENCE"&&programmedStudents.has(item.student.id))
      .map(item=>item.student.id)
  );

  const absentIds=new Set(
    sessions
      .filter(item=>item.session.source==="ABSENCE"&&programmedStudents.has(item.student.id))
      .map(item=>item.student.id)
  );

  const attended=[...programmedStudents.values()].filter(student=>attendedIds.has(student.id));
  const absent=[...programmedStudents.values()].filter(student=>absentIds.has(student.id));
  const remaining=[...programmedStudents.values()].filter(student=>!attendedIds.has(student.id)&&!absentIds.has(student.id));

  const programmed=programmedStudents.size;
  const progress=programmed?Math.round(((attended.length+absent.length)/programmed)*100):0;

  const kids=timed
    .map(event=>({event,kids:kidsCalendarRequest(event)}))
    .filter((item):item is {event:CalendarEvent;kids:KidsLessonOpenRequest}=>Boolean(item.kids));

  const pending=notes.filter(note=>!note.done);
  const monthKey=today().slice(0,7);
  const monthSessionRows=students.flatMap(student=>student.sessions.filter(session=>session.date.slice(0,7)===monthKey).map(session=>({student,session}))).sort((a,b)=>b.session.date.localeCompare(a.session.date));
  const monthSessions=monthSessionRows.map(item=>item.session);
  const monthAttended=monthSessions.filter(session=>session.source!=="ABSENCE").length;
  const monthAbsent=monthSessions.filter(session=>session.source==="ABSENCE").length;
  const monthAssessmentRows=students.flatMap(student=>student.assessments.filter(item=>item.date.slice(0,7)===monthKey).map(assessment=>({student,assessment}))).sort((a,b)=>b.assessment.date.localeCompare(a.assessment.date));
  const monthAssessments=monthAssessmentRows.length;
  const monthPerformance=monthPerformanceActivities.filter(item=>item.date.slice(0,7)===monthKey);
  const monthKids=monthKidsCount??monthEvents.filter(event=>Boolean(kidsCalendarRequest(event))).length;
  const monthCycling=monthPerformance.filter(item=>item.type==="CYCLING");
  const monthCyclingDistance=monthCycling.reduce((sum,item)=>sum+(item.distanceKm||0),0);
  const monthStrength=monthPerformance.filter(item=>item.type==="STRENGTH");
  const monthPilates=monthPerformance.filter(item=>item.type==="PILATES");

  const renderPeople=(title:string,list:Student[],empty:string,statusClass:string)=>
    <section className="today-summary-group">
      <div><strong>{title}</strong><span>{list.length}</span></div>
      {list.length
        ?<div className="today-summary-people">
          {list.map(student=>
            <button key={`${statusClass}-${student.id}`} onClick={()=>onStudent(student.id)}>
              <span className="student-avatar small">{student.name.slice(0,1).toUpperCase()}</span>
              <strong>{student.name}</strong>
            </button>
          )}
        </div>
        :<small>{empty}</small>}
    </section>;

  const durationText=(minutes:number)=>{
    const total=Math.round(minutes);
    const h=Math.floor(total/60);
    const m=total%60;
    if(!h)return `${m} min`;
    return m?`${h}h${String(m).padStart(2,"0")}`:`${h}h`;
  };

  const cyclingTodayKind=(activity:PerformanceActivity)=>{
    if(activity.cyclingKind==="SPEED")return "Speed";
    if(activity.cyclingKind==="MTB")return "MTB";
    if(activity.cyclingKind==="INDOOR")return "Indoor";
    const text=`${activity.title||""} ${activity.description||""} ${activity.notes||""}`.toLowerCase();
    if(/\bmtb\b|mountain bike/.test(text))return "MTB";
    if(/indoor|rolo|virtual/.test(text))return "Indoor";
    if(/speed|estrada|road/.test(text))return "Speed";
    return "Ciclismo";
  };

  const activityTodayLine=(activity:PerformanceActivity)=>{
    if(activity.type==="STRENGTH"){
      const focus=(activity.title||"").trim();
      const generic=/^(muscula[cç][aã]o|for[cç]a|strength|treino de for[cç]a)$/i.test(focus);
      return `🏋️ Musculação${focus&&!generic?` — ${focus}`:""}`;
    }
    if(activity.type==="CYCLING"){
      const distance=activity.distanceKm&&activity.distanceKm>0
        ?` — ${activity.distanceKm.toLocaleString("pt-BR",{maximumFractionDigits:1})} km`
        :"";
      return `🚴 ${cyclingTodayKind(activity)}${distance}`;
    }
    if(activity.type==="PILATES")return "🤸 Pilates";
    if(activity.type==="TENNIS"){
      const minutes=activity.durationMinutes||activity.elapsedMinutes||0;
      return `🎾 Tênis${minutes>0?` — ${durationText(minutes)}`:""}`;
    }
    return activity.title||"Atividade";
  };

  return <>
    <div className="today-highlight-grid">

      <MiniMonthCalendar onSelect={onAgenda}/>

      <button
        className="today-highlight-card today-summary-card"
        onClick={()=>setShowSummary(value=>!value)}
        aria-expanded={showSummary}
      >
        <div>
          <strong>Resumo do dia</strong>

          <span className="highlight-lines">
            <small><b>{programmed}</b> alunos programados</small>
            <small><b>{attended.length}</b> atendidos</small>
            <small><b>{absent.length}</b> {"aus\u00EAncias"}</small>
            <small><b>{remaining.length}</b> ainda faltam</small>
          </span>

          <i><b style={{width:`${progress}%`}}/></i>

          {kids.length?
            <span className="today-kids-inline">
              {kids.map(({event,kids:item})=>
                <span
                  className="today-kids-inline-row"
                  key={event.id}
                  onClick={click=>{
                    click.stopPropagation();
                    onKids(event);
                  }}
                >
                  <span className={`kids-category-dot kids-category-${item.category.toLowerCase()}`}/>
                  <b>{formatCalendarTime(event)}</b>
                  <span> {"\u00b7"} {kidsCategoryName(item.category)}</span>
                </span>
              )}
            </span>
          :null}
        </div>


      </button>



      <button className="today-highlight-card month-closing-today-card" onClick={()=>setShowMonthClosing(value=>!value)} aria-expanded={showMonthClosing}>
        <div>
          <strong>Fechamento do mês</strong>
          <span className="highlight-lines">
            <small><b>{monthAttended}</b> atendimentos</small>
            <small><b>{monthAssessments}</b> avaliações</small>
            <small><b>{monthKids}</b> aulas Kids</small>
            <small><b>{monthCycling.length}</b> ciclismo · <b>{monthCyclingDistance.toLocaleString("pt-BR",{maximumFractionDigits:1})} km</b></small>
            <small><b>{monthStrength.length}</b> musculação</small>
            <small><b>{monthPilates.length}</b> pilates</small>
          </span>
        </div>
      </button>

      <button className="today-highlight-card today-notes-card" onClick={onNotes}>
        <div>
          <strong>Recados</strong>
          <span className="highlight-lines">
            <small><b>{pending.length}</b> pendente{pending.length===1?"":"s"}</small>
            {pending.slice(0,4).map(note=><small key={note.id} role="button" tabIndex={0} onClick={event=>{event.stopPropagation();onOpenNote(note);}} onKeyDown={event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();event.stopPropagation();onOpenNote(note);}}}>{note.title || "Sem título"}</small>)}
          </span>
        </div>
      </button>

      <button
        className="today-highlight-card performance-today-card"
        onClick={onPerformance}
      >
        <div>
          <strong>Treino do dia</strong>
          {performanceActivities.length?
            <span className="performance-today-list">
              {performanceActivities.map(activity=>
                <span className="performance-today-row" key={activity.id} role="button" tabIndex={0} onClick={event=>{event.stopPropagation();onOpenPerformanceActivity(activity);}} onKeyDown={event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();event.stopPropagation();onOpenPerformanceActivity(activity);}}}>
                  <b style={{fontWeight:400}}>{activityTodayLine(activity)}</b>
                </span>
              )}
            </span>
          :<span className="highlight-lines"><small>Nenhum treino pessoal registrado hoje.</small></span>}
        </div>
      </button>


    </div>

    {showMonthClosing?
      <section className="month-closing-detail panel">
        <div className="panel-head">
          <div>
            <h2>Fechamento do mês</h2>
            <p className="muted">Detalhes dos registros de {new Date(`${monthKey}-01T12:00:00`).toLocaleDateString("pt-BR",{month:"long",year:"numeric"})}.</p>
          </div>
          <button className="secondary" onClick={()=>setShowMonthClosing(false)}>Fechar</button>
        </div>
        <div className="month-closing-detail-grid">
          <article>
            <header><strong>Atendimentos</strong><b>{monthAttended}</b></header>
            <div className="month-closing-detail-list">{monthSessionRows.filter(item=>item.session.source!=="ABSENCE").slice(0,6).map(({student,session})=><button key={student.id+session.id} onClick={()=>onStudent(student.id)}><span>{formatDate(session.date)}</span><strong>{student.name}</strong></button>)}</div>
            <button className="secondary compact-action" onClick={onHistory}>Abrir Histórico</button>
          </article>
          <article>
            <header><strong>Avaliações</strong><b>{monthAssessments}</b></header>
            <div className="month-closing-detail-list">{monthAssessmentRows.slice(0,6).map(({student,assessment})=><button key={student.id+assessment.id} onClick={()=>onStudent(student.id)}><span>{formatDate(assessment.date)}</span><strong>{student.name}</strong></button>)}</div>
            <button className="secondary compact-action" onClick={onAssessments}>Abrir Avaliações</button>
          </article>
          <article>
            <header><strong>Aulas Kids</strong><b>{monthKids}</b></header>
            <p className="muted">Aulas realizadas no mês pelo histórico oficial do módulo Kids.</p>
            <button className="secondary compact-action" onClick={onKidsModule}>Abrir Aulas Kids</button>
          </article>
          <article>
            <header><strong>Ciclismo</strong><b>{monthCycling.length}</b></header>
            <p className="muted">{monthCyclingDistance.toLocaleString("pt-BR",{maximumFractionDigits:1})} km registrados no mês.</p>
            <div className="month-closing-detail-list">{monthCycling.slice(0,5).map(activity=><button key={activity.id} onClick={()=>onOpenPerformanceActivity(activity)}><span>{formatDate(activity.date)}</span><strong>{activity.title}</strong></button>)}</div>
            <button className="secondary compact-action" onClick={onPerformance}>Abrir Performance</button>
          </article>
          <article>
            <header><strong>Musculação</strong><b>{monthStrength.length}</b></header>
            <div className="month-closing-detail-list">{monthStrength.slice(0,5).map(activity=><button key={activity.id} onClick={()=>onOpenPerformanceActivity(activity)}><span>{formatDate(activity.date)}</span><strong>{activity.title}</strong></button>)}</div>
            <button className="secondary compact-action" onClick={onPerformance}>Abrir Performance</button>
          </article>
          <article>
            <header><strong>Pilates</strong><b>{monthPilates.length}</b></header>
            <div className="month-closing-detail-list">{monthPilates.slice(0,5).map(activity=><button key={activity.id} onClick={()=>onOpenPerformanceActivity(activity)}><span>{formatDate(activity.date)}</span><strong>{activity.title}</strong></button>)}</div>
            <button className="secondary compact-action" onClick={onPerformance}>Abrir Performance</button>
          </article>
        </div>
      </section>
    :null}

    {showSummary?
      <section className="today-summary-detail panel">
        <div className="panel-head">
          <div>
            <h2>Atendimentos de hoje</h2>
            <p className="muted">Resumo dos alunos programados, já atendidos, pendentes e ausentes.</p>
          </div>

          <button className="secondary" onClick={()=>setShowSummary(false)}>Fechar</button>
        </div>

        <div className="today-summary-columns">
          {renderPeople("Atendidos",attended,"Nenhum atendimento concluído ainda.","done")}
          {renderPeople("Ainda faltam",remaining,"Nenhum atendimento pendente.","pending")}
          {renderPeople("Ausentes",absent,"Nenhuma ausência registrada.","absent")}
        </div>
      </section>
    :null}
  </>;
}

function MiniMonthCalendar({onSelect}:{onSelect:(date:string)=>void}){
  const now=new Date();const [cursor,setCursor]=useState(()=>new Date(now.getFullYear(),now.getMonth(),1));const year=cursor.getFullYear();const month=cursor.getMonth();const first=new Date(year,month,1).getDay();const days=new Date(year,month+1,0).getDate();
  return <article className="mini-month"><div className="mini-month-nav"><button onClick={()=>setCursor(new Date(year,month-1,1))}>‹</button><strong>{cursor.toLocaleDateString("pt-BR",{month:"long",year:"numeric"})}</strong><button onClick={()=>setCursor(new Date(year,month+1,1))}>›</button></div><button className="mini-month-today" onClick={()=>{setCursor(new Date(now.getFullYear(),now.getMonth(),1));onSelect(today());}}>Hoje · abrir agenda</button><div className="mini-month-week"><b>D</b><b>S</b><b>T</b><b>Q</b><b>Q</b><b>S</b><b>S</b></div><div className="mini-month-days">{Array.from({length:first},(_,index)=><i key={`e-${index}`}/>)}{Array.from({length:days},(_,index)=>{const day=index+1;const value=`${year}-${String(month+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;return <button key={day} className={value===today()?"today":""} onClick={()=>onSelect(value)}>{day}</button>;})}</div></article>;
}

function DesktopAgendaRail({events,students,onOpenAgenda,onOpenStudent,onRefresh}:{events:CalendarEvent[];students:Student[];onOpenAgenda:(date:string)=>void;onOpenStudent:(id:string)=>void;onRefresh:()=>void}){
  const [addingEvent,setAddingEvent]=useState<CalendarEvent|null>(null);
  const [showEncaixe,setShowEncaixe]=useState(false);
  const now=Date.now();
  const todayKey=today();
  const tomorrowDate=new Date(`${todayKey}T12:00:00`);
  tomorrowDate.setDate(tomorrowDate.getDate()+1);
  const tomorrowKey=localDateKey(tomorrowDate);
  const upcoming=events.filter(event=>{
    const date=calendarEventDate(event);
    if(date<todayKey)return false;
    if(date>todayKey)return true;
    if(event.allDay)return true;
    return new Date(event.end||event.start).getTime()>now;
  }).sort((a,b)=>a.start.localeCompare(b.start));
  const hasToday=upcoming.some(event=>calendarEventDate(event)===todayKey);
  let previousDate="";

  return <>
    <aside className="desktop-agenda-rail">
      <span className="rail-resize-handle" onPointerDown={event=>beginPanelResize(event,"rail")}/>
      <div className="agenda-rail-scroll">
        {!hasToday?<div className="agenda-rail-day agenda-rail-day-empty"><span>Hoje</span><strong>{new Date(`${todayKey}T12:00:00`).toLocaleDateString("pt-BR",{weekday:"short",day:"2-digit",month:"short"})}</strong><button className="agenda-rail-encaixe" onClick={()=>setShowEncaixe(true)}>+ Encaixe</button></div>:null}
        {upcoming.length?upcoming.map(event=>{
          const people=getCalendarEventStudents(event,students);
          const date=calendarEventDate(event);
          const changed=date!==previousDate;
          previousDate=date;
          const dayLabel=date===todayKey?"Hoje":date===tomorrowKey?"Amanhã":"Dia seguinte";
          const kids=kidsCalendarRequest(event);

          return <section className="agenda-rail-group" key={event.id}>
            {changed?<div className="agenda-rail-day"><span>{dayLabel}</span><strong>{new Date(`${date}T12:00:00`).toLocaleDateString("pt-BR",{weekday:"short",day:"2-digit",month:"short"})}</strong>{date===todayKey?<button className="agenda-rail-encaixe" onClick={()=>setShowEncaixe(true)}>+ Encaixe</button>:null}</div>:null}
            <article className={`agenda-rail-event ${kids?`kids kids-${kids.category.toLowerCase()}`:""}`}>
              <div className="agenda-rail-time-row"><button onClick={()=>onOpenAgenda(date)}><small>{formatCalendarTime(event)}</small>{kids||!people.length?<strong>{event.summary}</strong>:null}</button>{!kids?<button type="button" className="agenda-rail-plus" onClick={()=>setAddingEvent(event)} aria-label="Adicionar aluno" title="Adicionar aluno">+</button>:null}</div>
              {people.length?<div>{people.map(student=><button key={student.id} onClick={()=>onOpenStudent(student.id)}>{student.name}</button>)}</div>:null}
            </article>
          </section>
        }):<p>Nenhum próximo compromisso.</p>}
      </div>
    </aside>

    {addingEvent?<AddStudentsToCalendarEventModal event={addingEvent} students={students} onClose={()=>setAddingEvent(null)} onSaved={()=>{setAddingEvent(null);onRefresh();}}/>:null}
    {showEncaixe?<GoogleEventForm students={students} onClose={()=>setShowEncaixe(false)} onSaved={()=>{setShowEncaixe(false);onRefresh();}}/>:null}
  </>;
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
function Header({title,back,titleClassName}:{title:string;back?:()=>void;titleClassName?:string}) { return <header className="topbar"><div className="header-left">{back ? <button className="text-button" onClick={back}>← Voltar</button> : null}<img src="/logo-danilo.jpg" alt="Danilo Modesto" className="header-logo" /><strong className={titleClassName}>{title}</strong></div></header>; }

function looksLikeTrainingSchedule(value?:string){
  const text=(value||"").trim().toLowerCase();
  if(!text)return false;
  return /\b(seg|segunda|ter|terça|terca|qua|quarta|qui|quinta|sex|sexta|sáb|sab|sábado|sabado|dom|domingo)\b/.test(text)||/\b\d{1,2}(?::\d{2})?\s*h(?:\d{2})?\b/.test(text);
}
function inferredWeeklyFrequency(value?:string){
  const text=(value||"").toLowerCase();
  const groups=[/\b(seg|segunda)\b/,/\b(ter|terça|terca)\b/,/\b(qua|quarta)\b/,/\b(qui|quinta)\b/,/\b(sex|sexta)\b/,/\b(sáb|sab|sábado|sabado)\b/,/\b(dom|domingo)\b/];
  const count=groups.filter(regex=>regex.test(text)).length;
  return count?`${count}x por semana`:"Não informada";
}
function studentFrequencyDisplay(student:Student){
  if(student.trainingSchedule)return student.weeklyFrequency||"Não informada";
  return looksLikeTrainingSchedule(student.weeklyFrequency)?inferredWeeklyFrequency(student.weeklyFrequency):student.weeklyFrequency||"Não informada";
}
function studentScheduleDisplay(student:Student){
  return student.trainingSchedule||(looksLikeTrainingSchedule(student.weeklyFrequency)?student.weeklyFrequency:"")||"Não informado";
}

function StudentProfileIdentity({student,onEdit}:{student:Student;onEdit:()=>void}) {
  const age=calculateAge(student.birthDate);
  const months=monthsSince(student.startDate);
  const wa=whatsappLink(student.phone);
  return <div className="student-profile-command-head">
    <div className="student-profile-command-identity">
      <span className={`status-pill ${student.status === "ARCHIVED" ? "archived" : ""}`}>
        {student.status === "ACTIVE" ? "Ativo" : "Inativo"}
      </span>
      <div className="student-profile-identity-content">
        <span className="student-profile-command-kicker">CADERNO DO ALUNO</span>
        <h1>{student.name}</h1>
        <div className="student-profile-identity-meta">
          <span><small>Idade</small><strong>{age!==null?`${age} anos`:"Não informada"}</strong></span>
          <span><small>Aluno há</small><strong>{months===null?"Não informado":formatMonths(months)}</strong></span>
          <span><small>Frequência</small><strong>{studentFrequencyDisplay(student)}</strong></span>
          <span className="student-profile-schedule-meta"><small>Dias e horários</small><strong>{studentScheduleDisplay(student)}</strong></span>
        </div>
      </div>
    </div>
    <div className="student-profile-command-contact">
      {wa?<a className="primary button-link student-profile-whatsapp-main" href={wa} target="_blank" rel="noreferrer">🟢 WhatsApp</a>:null}
      <button className="secondary" onClick={onEdit}>Editar cadastro</button>
    </div>
  </div>;
}

function normalizeStudentFinanceName(value:string){
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9 ]/g," ").replace(/\s+/g," ").trim();
}

function studentFinanceInvoices(finance:FinanceData|null,student:Student){
  if(!finance)return [] as FinanceData["personalInvoices"];
  const normalizedName=normalizeStudentFinanceName(student.name);
  const matches=finance.personalInvoices.filter(invoice=>
    invoice.studentId===student.id||(!invoice.studentId&&normalizeStudentFinanceName(invoice.studentName)===normalizedName)
  );
  const visible=matches.filter(invoice=>{
    if(!invoice.excludedFromTotals)return true;
    if(!invoice.payments?.length)return false;
    return !matches.some(other=>other.id!==invoice.id&&!other.excludedFromTotals&&other.competence===invoice.competence);
  });
  const seen=new Set<string>();
  return visible.filter(invoice=>{if(seen.has(invoice.id))return false;seen.add(invoice.id);return true;}).sort((a,b)=>b.competence.localeCompare(a.competence));
}

function useStudentFinanceSnapshot(student:Student){
  const [finance,setFinance]=useState<FinanceData|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  async function reload(){
    setLoading(true);setError("");
    const local=loadFinanceData(financeSeedAugust2026);
    setFinance(local);
    try{
      const cloud=await fetchFinanceCloud(financeSeedAugust2026);
      if(cloud)setFinance(cloud);
    }catch{
      // No localhost, a API pode não ter acesso ao banco da produção.
      // Mantém o mesmo fallback local já usado pelo Financeiro geral.
      setFinance(local);
    }finally{setLoading(false);}
  }
  useEffect(()=>{void reload();},[student.id,student.name]);
  return {finance,setFinance,loading,error,reload,invoices:studentFinanceInvoices(finance,student)};
}

function formatStudentMoney(value:number){return Number(value||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});}
function financePaid(invoice:FinanceData["personalInvoices"][number]){return invoice.payments.reduce((sum,payment)=>sum+Number(payment.amount||0),0);}
function financeRemaining(invoice:FinanceData["personalInvoices"][number]){return Math.max(0,Number(invoice.expectedAmount||0)-financePaid(invoice));}
function financeMonthLabel(value:string){if(!/^\d{4}-\d{2}$/.test(value))return value;return new Date(`${value}-01T12:00:00`).toLocaleDateString("pt-BR",{month:"long",year:"numeric"});}
function financeCalendarCompetence(){return today().slice(0,7);}
function financeInvoiceDueDate(invoice:FinanceData["personalInvoices"][number]){
  const match=invoice.competence.match(/^(\d{4})-(\d{2})$/);
  if(!match)return "";
  const year=Number(match[1]);const month=Number(match[2]);
  const lastDay=new Date(year,month,0).getDate();
  const day=Math.min(Math.max(1,Number(invoice.dueDay)||1),lastDay);
  return `${match[1]}-${match[2]}-${String(day).padStart(2,"0")}`;
}
function financeDashboardDueLabel(invoice:FinanceData["personalInvoices"][number],remaining:number){
  const dueDate=financeInvoiceDueDate(invoice);
  if(!dueDate)return "Vencimento não informado";
  if(remaining<=0)return `Vencimento ${formatDate(dueDate)}`;
  return dueDate<today()?`Vencido em ${formatDate(dueDate)}`:`Vence em ${formatDate(dueDate)}`;
}
function daysSinceDate(value:string){if(!value)return null;return Math.max(0,Math.floor((new Date(`${today()}T12:00:00`).getTime()-new Date(`${value}T12:00:00`).getTime())/86400000));}
function studentMonthKeys(count=6){const [year,month]=today().slice(0,7).split("-").map(Number);return Array.from({length:count},(_,index)=>{const date=new Date(year,month-1-(count-1-index),1);return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}`;});}
function shortMonthLabel(value:string){return new Date(`${value}-01T12:00:00`).toLocaleDateString("pt-BR",{month:"short"}).replace(".","");}
function assessmentNumber(value:number|null|undefined){return value===null||value===undefined||!Number.isFinite(Number(value))?null:Number(value);}
function signedAssessmentDelta(current:number|null|undefined,previous:number|null|undefined,suffix:string){const a=assessmentNumber(current),b=assessmentNumber(previous);if(a===null||b===null)return null;const diff=a-b;return `${diff>0?"+":""}${diff.toLocaleString("pt-BR",{maximumFractionDigits:1})}${suffix}`;}

function StudentMiniLineChart({title,unit,series}:{title:string;unit:string;series:{label:string;value:number}[]}){
  if(series.length<2)return <article className="student-trend-card student-trend-empty"><div><span>{title}</span><strong>Histórico insuficiente</strong></div><small>São necessárias pelo menos 2 avaliações.</small></article>;
  const values=series.map(item=>item.value);const min=Math.min(...values),max=Math.max(...values);const range=Math.max(.0001,max-min);
  const points=series.map((item,index)=>{const x=series.length===1?50:(index/(series.length-1))*100;const y=84-((item.value-min)/range)*64;return `${x},${y}`;}).join(" ");
  const latest=series[series.length-1];
  return <article className="student-trend-card"><div className="student-trend-card-head"><span>{title}</span><strong>{latest.value.toLocaleString("pt-BR",{maximumFractionDigits:1})}{unit}</strong></div><svg className="student-mini-line" viewBox="0 0 100 92" preserveAspectRatio="none" aria-hidden="true"><polyline points={points}/>{series.map((item,index)=>{const x=series.length===1?50:(index/(series.length-1))*100;const y=84-((item.value-min)/range)*64;return <circle key={item.label} cx={x} cy={y} r="2.1"/>;})}</svg><div className="student-trend-labels"><small>{series[0].label}</small><small>{latest.label}</small></div></article>;
}

function StudentTrainingBars({student}:{student:Student}){
  const keys=studentMonthKeys(6);
  const data=keys.map(key=>({key,label:shortMonthLabel(key),value:student.sessions.filter(session=>session.source!=="ABSENCE"&&session.date.slice(0,7)===key).length}));
  const max=Math.max(1,...data.map(item=>item.value));
  return <article className="student-training-chart"><div className="student-chart-head"><div><span>Ritmo de treinamento</span><strong>Últimos 6 meses</strong></div><small>{data.reduce((sum,item)=>sum+item.value,0)} sessões</small></div><div className="student-training-bars">{data.map(item=><div key={item.key}><b>{item.value}</b><span><i style={{height:`${Math.max(6,(item.value/max)*100)}%`}}/></span><small>{item.label}</small></div>)}</div></article>;
}

function StudentQuickNotes({student,onStudentUpdate}:{student:Student;onStudentUpdate:(student:Student)=>void}){
  const [editing,setEditing]=useState(false);const [value,setValue]=useState(student.notes||"");
  useEffect(()=>{if(!editing)setValue(student.notes||"");},[student.id,student.notes,editing]);
  function save(){onStudentUpdate({...student,notes:value.trim(),notesUpdatedAt:new Date().toISOString()});setEditing(false);}
  return <section className="student-quick-notes"><div className="student-section-title"><div><span>OBSERVAÇÕES RÁPIDAS</span><h3>O que eu preciso lembrar sobre este aluno?</h3></div>{editing?<div><button className="secondary" onClick={()=>{setValue(student.notes||"");setEditing(false);}}>Cancelar</button><button className="primary" onClick={save}>Salvar</button></div>:<button className="secondary" onClick={()=>setEditing(true)}>✎ Editar</button>}</div>{editing?<textarea autoFocus rows={4} value={value} onChange={event=>setValue(event.target.value)} placeholder="Ex.: viaja na próxima semana, objetivo de prova, preferência de exercício, recado para o próximo atendimento..."/>:<div className={`student-quick-note-body ${student.notes?"":"empty"}`}><strong>{student.notes||"Nenhuma observação rápida registrada."}</strong><small>{student.notesUpdatedAt?`Atualizado em ${new Date(student.notesUpdatedAt).toLocaleString("pt-BR")}`:"Use este espaço para recados operacionais do dia a dia."}</small></div>}</section>;
}

function StudentDashboardTimeline({student,invoices}:{student:Student;invoices:FinanceData["personalInvoices"]}){
  const items=[
    ...student.sessions.map(session=>({id:`session-${session.id}`,date:session.date,at:session.finishedAt||session.startedAt||`${session.date}T12:00:00`,icon:session.source==="ABSENCE"?"○":"🏋️",title:session.source==="ABSENCE"?"Ausência registrada":session.workoutName||"Treino registrado",detail:session.focus||session.notes||"Sessão de treinamento"})),
    ...student.assessments.map(assessment=>({id:`assessment-${assessment.id}`,date:assessment.date,at:`${assessment.date}T13:00:00`,icon:"📏",title:"Avaliação física",detail:assessment.weight?`Peso ${Number(assessment.weight).toLocaleString("pt-BR",{maximumFractionDigits:1})} kg`:"Avaliação registrada"})),
    ...invoices.flatMap(invoice=>invoice.payments.map(payment=>({id:`payment-${invoice.id}-${payment.id}`,date:payment.date,at:`${payment.date}T14:00:00`,icon:"💰",title:"Pagamento recebido",detail:`${formatStudentMoney(payment.amount)} · ${financeMonthLabel(invoice.competence)}`})))
  ].sort((a,b)=>b.at.localeCompare(a.at)).slice(0,8);
  return <section className="student-timeline-panel"><div className="student-section-title"><div><span>LINHA DO TEMPO</span><h3>Últimas movimentações</h3></div></div>{items.length?<div className="student-timeline-list">{items.map(item=><article key={item.id}><span>{item.icon}</span><div><strong>{item.title}</strong><small>{formatDate(item.date)} · {item.detail}</small></div></article>)}</div>:<div className="student-empty-soft">Ainda não há movimentações registradas para este aluno.</div>}</section>;
}

function StudentDashboardComplete({student,onOpen,onReport,onStudentUpdate}:{student:Student;onOpen:(tab:StudentTab)=>void;onReport:()=>void;onStudentUpdate:(student:Student)=>void}) {
  const monthKey=today().slice(0,7);
  const monthSessions=student.sessions.filter(session=>session.date.slice(0,7)===monthKey&&session.source!=="ABSENCE");
  const monthAbsences=student.sessions.filter(session=>session.date.slice(0,7)===monthKey&&session.source==="ABSENCE");
  const latestSession=student.sessions.filter(session=>session.source!=="ABSENCE").slice().sort((a,b)=>b.date.localeCompare(a.date))[0];
  const sortedAssessments=student.assessments.slice().sort((a,b)=>b.date.localeCompare(a.date));
  const latestAssessment=sortedAssessments[0];const previousAssessment=sortedAssessments[1];
  const workouts=getStudentWorkoutEntries(student);
  const workoutLabel=workouts.length?workouts.map(entry=>entry.slot).join(" · "):"Sem ficha";
  const workoutDetail=workouts.length?`${workouts.reduce((total,entry)=>total+entry.workout.exercises.length,0)} exercícios nas fichas ativas`:"Nenhum treino montado";
  const attendanceBase=monthSessions.length+monthAbsences.length;
  const attendanceRate=attendanceBase?Math.round((monthSessions.length/attendanceBase)*100):null;
  const assessmentAge=latestAssessment?daysSinceDate(latestAssessment.date):null;
  const financeState=useStudentFinanceSnapshot(student);
  const calendarCompetence=financeCalendarCompetence();
  const currentInvoice=financeState.invoices.find(invoice=>invoice.competence===calendarCompetence)||null;
  const latestFinanceInvoice=financeState.invoices[0]||null;
  const hasFinanceReference=student.financialActive===true||Boolean(latestFinanceInvoice);
  const paidCurrent=currentInvoice?financePaid(currentInvoice):0;const remainingCurrent=currentInvoice?financeRemaining(currentInvoice):0;
  const assessmentChronological=student.assessments.slice().sort((a,b)=>a.date.localeCompare(b.date)).slice(-6);
  const weightSeries=assessmentChronological.flatMap(item=>{const value=assessmentNumber(item.weight);return value===null?[]:[{label:formatDate(item.date),value}];});
  const fatSeries=assessmentChronological.flatMap(item=>{const value=assessmentNumber(item.bodyFatPercent);return value===null?[]:[{label:formatDate(item.date),value}];});
  const leanSeries=assessmentChronological.flatMap(item=>{const value=assessmentLeanMassKg(item);return value===null?[]:[{label:formatDate(item.date),value}];});
  const shareSummary=()=>void shareStudentSummary(student);
  return <section className="student-dashboard-stage-one student-dashboard-complete">
    <div className="student-dashboard-stage-head"><div><span>DASHBOARD DO ALUNO</span><h2>Visão geral</h2></div><button className="primary" onClick={shareSummary}>WhatsApp resumo</button><button type="button" className="secondary" onClick={onReport}>🖨️ Relatório</button></div>
    <div className="student-dashboard-quick-grid">
      <button type="button" className="student-dashboard-quick-card" onClick={()=>onOpen("history")}><span>Treinos no mês</span><strong>{monthSessions.length}</strong><small>{latestSession?`Último: ${formatDate(latestSession.date)}`:"Nenhum treino registrado"}</small></button>
      <button type="button" className="student-dashboard-quick-card" onClick={()=>onOpen("workouts")}><span>Treino atual</span><strong>{workoutLabel}</strong><small>{workoutDetail}</small></button>
      <button type="button" className="student-dashboard-quick-card" onClick={()=>onOpen("assessments")}><span>Última avaliação</span><strong>{latestAssessment?formatDate(latestAssessment.date):"Sem avaliação"}</strong><small>{latestAssessment?`${assessmentAge} dias atrás · ${student.assessments.length} no histórico`:"Clique para abrir Avaliações"}</small></button>
    </div>

    <StudentProfileCare student={student}/>

    <div className="student-dashboard-status-grid">
      <button className="student-status-card" onClick={()=>onOpen("history")}><span>CONSISTÊNCIA DO MÊS</span><strong>{attendanceRate===null?"Sem base":`${attendanceRate}%`}</strong><small>{monthSessions.length} treino{monthSessions.length===1?"":"s"}{monthAbsences.length?` · ${monthAbsences.length} ausência${monthAbsences.length===1?"":"s"}`:" · sem ausência registrada"}</small></button>
      <button className="student-status-card" onClick={()=>onOpen("assessments")}><span>EVOLUÇÃO DA AVALIAÇÃO</span><strong>{latestAssessment?`${assessmentAge} dias desde a última`:"Sem avaliação"}</strong><small>{latestAssessment&&previousAssessment?[signedAssessmentDelta(latestAssessment.weight,previousAssessment.weight," kg")&&`Peso ${signedAssessmentDelta(latestAssessment.weight,previousAssessment.weight," kg")}`,signedAssessmentDelta(latestAssessment.bodyFatPercent,previousAssessment.bodyFatPercent," pp")&&`Gordura ${signedAssessmentDelta(latestAssessment.bodyFatPercent,previousAssessment.bodyFatPercent," pp")}`].filter(Boolean).join(" · ")||"Sem métricas comparáveis":"Clique para consultar o histórico"}</small></button>
      <button className="student-status-card" onClick={()=>onOpen("finance")}><span>FINANCEIRO ATUAL</span><strong>{financeState.loading?"Carregando...":currentInvoice?remainingCurrent>0?`${formatStudentMoney(remainingCurrent)} em aberto`:"Pago":hasFinanceReference?"Sem lançamento no mês":"Sem cobrança"}</strong><small>{currentInvoice?`${financeDashboardDueLabel(currentInvoice,remainingCurrent)} · ${formatStudentMoney(paidCurrent)} recebido`:latestFinanceInvoice?`Último vínculo: ${financeMonthLabel(latestFinanceInvoice.competence)} · ${formatStudentMoney(latestFinanceInvoice.expectedAmount)}`:student.financialActive?`${financeMonthLabel(calendarCompetence)} · sem lançamento vinculado`:"Financeiro não ativado no cadastro"}</small></button>
    </div>

    <StudentQuickNotes student={student} onStudentUpdate={onStudentUpdate}/>

    <section className="student-dashboard-analytics"><div className="student-section-title"><div><span>ESTATÍSTICAS E EVOLUÇÃO</span><h3>Treinamento e avaliações</h3></div></div><div className="student-analytics-grid"><StudentTrainingBars student={student}/><div className="student-assessment-trends"><StudentMiniLineChart title="Peso" unit=" kg" series={weightSeries}/><StudentMiniLineChart title="Gordura corporal" unit="%" series={fatSeries}/><StudentMiniLineChart title="Massa magra (kg)" unit=" kg" series={leanSeries}/></div></div></section>

    <StudentDashboardTimeline student={student} invoices={financeState.invoices}/>
  </section>;
}

function StudentProfileCare({student}:{student:Student}) {
  const alerts=[student.restrictions,student.injuries].filter(Boolean);
  return alerts.length
    ? <section className="snapshot-alert student-profile-care-bottom"><span>⚠ Lembretes importantes</span><strong>{alerts.join(" · ")}</strong></section>
    : <section className="snapshot-alert clear student-profile-care-bottom"><span>✓ Cuidados</span><strong>Nenhuma restrição ou dor registrada</strong></section>;
}

function StudentFinancePaymentModal({invoice,payment,onClose,onSaved}:{invoice:FinanceData["personalInvoices"][number];payment?:FinanceData["personalInvoices"][number]["payments"][number];onClose:()=>void;onSaved:(next:FinanceData)=>void}){
  const [date,setDate]=useState(payment?.date||today());const [amount,setAmount]=useState(String(payment?.amount??financeRemaining(invoice)));const [note,setNote]=useState(payment?.note||"");const [saving,setSaving]=useState(false);
  async function save(){
    const numeric=Number(String(amount).replace(",","."));if(!Number.isFinite(numeric)||numeric<=0){alert("Informe um valor válido.");return;}
    const available=financeRemaining(invoice)+(payment?Number(payment.amount||0):0);
    if(!payment&&available<=0){alert("Esta competência já está quitada. Não há saldo para registrar outro pagamento.");return;}
    if(numeric>available+0.005){alert(`O valor informado ultrapassa o saldo disponível de ${formatStudentMoney(available)}.`);return;}
    setSaving(true);
    try{
      const response=await fetch("/api/finance",{cache:"no-store"});if(!response.ok)throw new Error();const payload=await response.json();let finance=payload.data as FinanceData;
      if(finance.competences[invoice.competence]?.status==="CLOSED"){alert("Esta competência está fechada. Reabra o mês no Financeiro geral antes de alterar pagamentos históricos.");return;}
      const occurredAt=new Date().toISOString();
      if(payment){
        finance={...finance,personalInvoices:finance.personalInvoices.map(item=>item.id===invoice.id?{...item,payments:item.payments.filter(value=>value.id!==payment.id)}:item),history:[...(finance.history||[]),{id:`history-${crypto.randomUUID()}`,occurredAt,competence:invoice.competence,kind:"PERSONAL_PAYMENT_DELETED",description:`Recebimento de ${invoice.studentName} removido para edição.`,amount:payment.amount,entityId:invoice.id}]};
      }
      const newPayment={id:`payment-${crypto.randomUUID()}`,date,amount:numeric,note:note.trim()||undefined};
      finance={...finance,personalInvoices:finance.personalInvoices.map(item=>item.id===invoice.id?{...item,payments:[...item.payments,newPayment]}:item),history:[...(finance.history||[]),{id:`history-${crypto.randomUUID()}`,occurredAt:new Date().toISOString(),competence:invoice.competence,kind:"PERSONAL_PAYMENT_ADDED",description:`Recebimento de ${invoice.studentName} ${payment?"atualizado":"registrado"}.`,amount:numeric,entityId:invoice.id}]};
      const put=await fetch("/api/finance",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(finance)});if(!put.ok)throw new Error();onSaved(finance);onClose();
    }catch{alert("Não foi possível salvar o pagamento. Nenhum outro dado do aluno foi alterado.");}finally{setSaving(false);}
  }
  return <div className="modal-backdrop"><section className="modal"><div className="modal-head"><div><h2>{payment?"Editar pagamento":"Registrar pagamento"}</h2><p className="muted">{invoice.studentName} · {financeMonthLabel(invoice.competence)}</p></div><button className="text-button" onClick={onClose}>Fechar</button></div><div className="form-grid"><label>Valor recebido<input autoFocus inputMode="decimal" value={amount} onChange={event=>setAmount(event.target.value)}/></label><label>Data<input type="date" value={date} onChange={event=>setDate(event.target.value)}/></label><label className="full">Observação<input value={note} onChange={event=>setNote(event.target.value)} placeholder="Opcional"/></label><button className="primary full" disabled={saving} onClick={()=>void save()}>{saving?"Salvando...":"Salvar pagamento"}</button></div></section></div>;
}

function StudentFinancePanel({student,onEditProfile}:{student:Student;onEditProfile:()=>void}){
  const state=useStudentFinanceSnapshot(student);const [paymentTarget,setPaymentTarget]=useState<{invoice:FinanceData["personalInvoices"][number];payment?:FinanceData["personalInvoices"][number]["payments"][number]}|null>(null);
  const calendarCompetence=financeCalendarCompetence();
  const current=state.invoices.find(invoice=>invoice.competence===calendarCompetence)||null;
  const latest=state.invoices[0]||null;
  const referenceInvoice=current||latest;
  const hasFinanceReference=student.financialActive===true||Boolean(referenceInvoice);
  const totalExpected=state.invoices.reduce((sum,invoice)=>sum+invoice.expectedAmount,0);const totalPaid=state.invoices.reduce((sum,invoice)=>sum+financePaid(invoice),0);
  const paymentHistory=state.invoices.flatMap(invoice=>invoice.payments.map(payment=>({invoice,payment}))).sort((a,b)=>b.payment.date.localeCompare(a.payment.date));
  const latestPayment=paymentHistory[0]||null;
  async function deletePayment(invoice:FinanceData["personalInvoices"][number],payment:FinanceData["personalInvoices"][number]["payments"][number]){
    if(!state.finance)return;if(state.finance.competences[invoice.competence]?.status==="CLOSED"){alert("Esta competência está fechada. Reabra o mês no Financeiro geral antes de excluir um pagamento histórico.");return;}if(!confirm(`Excluir o recebimento de ${formatStudentMoney(payment.amount)} em ${formatDate(payment.date)}?`))return;
    const next={...state.finance,personalInvoices:state.finance.personalInvoices.map(item=>item.id===invoice.id?{...item,payments:item.payments.filter(value=>value.id!==payment.id)}:item),history:[...(state.finance.history||[]),{id:`history-${crypto.randomUUID()}`,occurredAt:new Date().toISOString(),competence:invoice.competence,kind:"PERSONAL_PAYMENT_DELETED" as const,description:`Recebimento de ${invoice.studentName} removido.`,amount:payment.amount,entityId:invoice.id}]};
    try{const response=await fetch("/api/finance",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(next)});if(!response.ok)throw new Error();state.setFinance(next);}catch{alert("Não foi possível excluir o pagamento.");}
  }
  return <section className="student-finance-panel"><div className="student-section-title"><div><span>FINANCEIRO DO ALUNO</span><h2>Mensalidade e pagamentos</h2></div><button className="secondary" onClick={onEditProfile}>✎ Editar valor e vencimento</button></div>
    {state.loading?<div className="student-empty-soft">Carregando histórico financeiro...</div>:state.error?<div className="student-empty-soft">{state.error}</div>:<>
      <div className="student-finance-summary-grid"><article><span>Valor mensal</span><strong>{student.financialActive===true&&Number.isFinite(student.monthlyAmount)?formatStudentMoney(Number(student.monthlyAmount)):referenceInvoice?formatStudentMoney(referenceInvoice.expectedAmount):"Não informado"}</strong><small>{student.financeDueDay?`Vencimento dia ${student.financeDueDay}`:referenceInvoice?`Vencimento dia ${referenceInvoice.dueDay}`:"Vencimento não informado"}</small></article><article><span>Competência atual</span><strong>{financeMonthLabel(calendarCompetence)}</strong><small>{current?financeRemaining(current)>0?`${formatStudentMoney(financeRemaining(current))} em aberto`:"✓ Quitada":hasFinanceReference?"Sem lançamento vinculado nesta competência":"Financeiro não ativado"}</small></article><article><span>Histórico financeiro</span><strong>{state.invoices.length} mês{state.invoices.length===1?"":"es"}</strong><small>{formatStudentMoney(totalPaid)} recebido de {formatStudentMoney(totalExpected)} previsto</small></article><article><span>Último pagamento</span><strong>{latestPayment?formatStudentMoney(latestPayment.payment.amount):"Nenhum"}</strong><small>{latestPayment?`${formatDate(latestPayment.payment.date)} · ${financeMonthLabel(latestPayment.invoice.competence)}`:"Ainda não há pagamento registrado"}</small></article></div>
      {state.invoices.length?<div className="student-finance-history">{state.invoices.map(invoice=>{const paid=financePaid(invoice),remaining=financeRemaining(invoice),closed=state.finance?.competences[invoice.competence]?.status==="CLOSED";return <article key={invoice.id} className="student-finance-month"><header><div><span>{financeMonthLabel(invoice.competence)}</span><strong>{formatStudentMoney(invoice.expectedAmount)}</strong><small>Vence dia {invoice.dueDay}{closed?" · competência fechada":""}</small></div><div><strong>{remaining>0?`${formatStudentMoney(remaining)} em aberto`:"✓ Quitada"}</strong><small>{formatStudentMoney(paid)} recebido</small>{remaining>0?<button className="primary compact-action" disabled={closed} onClick={()=>setPaymentTarget({invoice})}>+ Pagamento</button>:null}</div></header><div className="student-payment-history">{invoice.payments.length?invoice.payments.slice().sort((a,b)=>b.date.localeCompare(a.date)).map(payment=><div key={payment.id}><span><b>{formatDate(payment.date)}</b>{payment.note?<small>{payment.note}</small>:null}</span><strong>{formatStudentMoney(payment.amount)}</strong><button className="text-button" disabled={closed} onClick={()=>setPaymentTarget({invoice,payment})}>Editar</button><button className="danger-link" disabled={closed} onClick={()=>void deletePayment(invoice,payment)}>Excluir</button></div>):<span className="muted">Nenhum pagamento registrado nesta competência.</span>}</div></article>;})}</div>:<div className="student-empty-soft">Nenhuma mensalidade financeira está vinculada a este aluno. Use “Editar valor e vencimento” para conferir o cadastro financeiro.</div>}
    </>}
    {paymentTarget?<StudentFinancePaymentModal invoice={paymentTarget.invoice} payment={paymentTarget.payment} onClose={()=>setPaymentTarget(null)} onSaved={next=>state.setFinance(next)}/>:null}
  </section>;
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

function HomeClosingSummary({students,performanceActivities}:{students:Student[];performanceActivities:PerformanceActivity[]}){
  const todayKey=today();
  const monthKey=todayKey.slice(0,7);

  const sessions=students.flatMap(student=>student.sessions.map(session=>({student,session})));
  const assessments=students.flatMap(student=>student.assessments.map(assessment=>({student,assessment})));

  const previousDates=[
    ...sessions.map(item=>item.session.date),
    ...assessments.map(item=>item.assessment.date),
    ...performanceActivities.map(item=>item.date)
  ].filter(date=>date<todayKey).sort();

  const lastDate=previousDates.length?previousDates[previousDates.length-1]:null;

  const lastSessions=lastDate?sessions.filter(item=>item.session.date===lastDate):[];
  const lastAssessments=lastDate?assessments.filter(item=>item.assessment.date===lastDate):[];
  const lastPerformance=lastDate?performanceActivities.filter(item=>item.date===lastDate):[];

  const monthSessions=sessions.filter(item=>item.session.date.slice(0,7)===monthKey);
  const monthAssessments=assessments.filter(item=>item.assessment.date.slice(0,7)===monthKey);
  const monthPerformance=performanceActivities.filter(item=>item.date.slice(0,7)===monthKey);

  const lastAttended=lastSessions.filter(item=>item.session.source!=="ABSENCE").length;
  const lastAbsent=lastSessions.filter(item=>item.session.source==="ABSENCE").length;
  const lastDetailed=lastSessions.filter(item=>item.session.source!=="ABSENCE"&&item.session.completedExercises.length>0).length;

  const monthAttended=monthSessions.filter(item=>item.session.source!=="ABSENCE").length;
  const monthAbsent=monthSessions.filter(item=>item.session.source==="ABSENCE").length;
  const monthDetailed=monthSessions.filter(item=>item.session.source!=="ABSENCE"&&item.session.completedExercises.length>0).length;
  const monthDistance=monthPerformance.reduce((total,item)=>total+(item.distanceKm||0),0);

  return <section className="home-closing-section">
    <div className="panel-head">
      <div>
        <h2>Fechamentos</h2>
        <p className="muted">Uma leitura rápida do trabalho realizado, sem dados financeiros.</p>
      </div>
    </div>

    <div className="home-closing-grid">
      <article className="home-closing-card">
        <div className="home-closing-title">
          <span>✓</span>
          <div>
            <small>FECHAMENTO DO ÚLTIMO DIA</small>
            <strong>{lastDate?formatDate(lastDate):"Sem registro anterior"}</strong>
          </div>
        </div>

        {lastDate?<div className="home-closing-metrics">
          <div><span>Atendimentos</span><b>{lastAttended}</b></div>
          <div><span>Ausências</span><b>{lastAbsent}</b></div>
          <div><span>Treinos detalhados</span><b>{lastDetailed}</b></div>
          <div><span>Avaliações</span><b>{lastAssessments.length}</b></div>
          <div><span>Seu treino</span><b>{lastPerformance.length}</b></div>
          <div><span>Registros totais</span><b>{lastSessions.length}</b></div>
        </div>:<p className="muted">Ainda não existe atividade anterior para resumir.</p>}
      </article>

      <article className="home-closing-card month">
        <div className="home-closing-title">
          <span>☰</span>
          <div>
            <small>FECHAMENTO DO MÊS</small>
            <strong>{new Date(todayKey+"T12:00:00").toLocaleDateString("pt-BR",{month:"long",year:"numeric"})}</strong>
          </div>
        </div>

        <div className="home-closing-metrics">
          <div><span>Atendimentos</span><b>{monthAttended}</b></div>
          <div><span>Ausências</span><b>{monthAbsent}</b></div>
          <div><span>Treinos detalhados</span><b>{monthDetailed}</b></div>
          <div><span>Avaliações</span><b>{monthAssessments.length}</b></div>
          <div><span>Seus treinos</span><b>{monthPerformance.length}</b></div>
          <div><span>Distância pessoal</span><b>{monthDistance?monthDistance.toLocaleString("pt-BR",{maximumFractionDigits:1})+" km":"—"}</b></div>
        </div>
      </article>
    </div>
  </section>;
}

function HistoryPanel({student,onSave,onDelete}:{student:Student;onSave:(session:Session)=>Promise<void>;onDelete:(sessionId:string)=>Promise<void>}) {
  const [query,setQuery]=useState("");
  const [source,setSource]=useState<"ALL"|"PLANNED"|"FREE"|"ATTENDANCE"|"IMPORTED">("ALL");
  const [period,setPeriod]=useState<"ALL"|"30"|"90"|"YEAR">("ALL");
  const [editing,setEditing]=useState<Session|null>(null);
  const [saving,setSaving]=useState(false);
  const todayKey=today();
  const cutoffDate=new Date();
  cutoffDate.setDate(cutoffDate.getDate()-29);
  const cutoffKey=cutoffDate.toISOString().slice(0,10);

  const sortedSessions=student.sessions.slice().sort((a,b)=>b.date.localeCompare(a.date));
  const recentSessions=sortedSessions.filter(session=>session.date>=cutoffKey && session.date<=todayKey);
  const recentAttendances=recentSessions.filter(session=>session.source!=="ABSENCE");
  const recentAbsences=recentSessions.filter(session=>session.source==="ABSENCE");
  const recentAssessments=student.assessments.filter(assessment=>assessment.date>=cutoffKey && assessment.date<=todayKey);
  const latestSession=sortedSessions[0]||null;
  const latestAssessment=assessmentSorted(student)[0]||null;
  const recentNotes=recentSessions.filter(session=>String(session.notes||"").trim()).slice(0,3);
  const visibleSessions=sortedSessions.filter(session=>{
    if(session.source==="ABSENCE")return false;
    const q=normalizeName(query);
    const matchesText=!q||normalizeName(`${session.date} ${session.workoutName} ${session.focus||""} ${session.notes} ${session.completedExercises.map(ex=>`${ex.name} ${ex.load} ${ex.notes||""}`).join(" ")}`).includes(q);
    const matchesSource=source==="ALL"||(session.source||"PLANNED")===source;
    const cutoff=period==="30"?dateOffset(todayKey,-29):period==="90"?dateOffset(todayKey,-89):period==="YEAR"?`${todayKey.slice(0,4)}-01-01`:"";
    return matchesText&&matchesSource&&(!cutoff||session.date>=cutoff);
  });

  function patchEditing(patch:Partial<Session>){setEditing(current=>current?{...current,...patch}:current);}
  function patchExercise(id:string,patch:Partial<Exercise>){setEditing(current=>current?{...current,completedExercises:current.completedExercises.map(ex=>ex.id===id?{...ex,...patch}:ex)}:current);}
  function addExercise(){setEditing(current=>current?{...current,completedExercises:[...current.completedExercises,{id:crypto.randomUUID(),block:"",name:"",sets:"",reps:"",load:"",notes:""}]}:current);}
  function removeExercise(id:string){setEditing(current=>current?{...current,completedExercises:current.completedExercises.filter(ex=>ex.id!==id)}:current);}
  async function saveEdit(){if(!editing)return;setSaving(true);try{await onSave({...editing,completedExercises:editing.completedExercises.filter(ex=>ex.name.trim())});setEditing(null);}finally{setSaving(false);}}
  async function removeSession(session:Session){if(!confirm(`Excluir definitivamente a sessão de ${formatDate(session.date)}?\n\nEsta ação remove somente este registro do histórico e não altera a ficha de treino do aluno.`))return;setSaving(true);try{await onDelete(session.id);if(editing?.id===session.id)setEditing(null);}finally{setSaving(false);}}

  return <div className="student-history-stack">
    <section className="panel intelligent-history-panel">
      <div className="panel-head"><div><h2>{"Histórico inteligente"}</h2><p className="muted">{"Visão dos últimos 30 dias do aluno."}</p></div></div>
      <div className="intelligent-history-grid">
        <article><span>Registros</span><strong>{recentSessions.length}</strong><small>{"Últimos 30 dias"}</small></article>
        <article><span>Atendimentos</span><strong>{recentAttendances.length}</strong><small>{"Treinos e presenças"}</small></article>
        <article><span>{"Ausências"}</span><strong>{recentAbsences.length}</strong><small>{"No período"}</small></article>
        <article><span>{"Avaliações"}</span><strong>{recentAssessments.length}</strong><small>{"Nos últimos 30 dias"}</small></article>
      </div>
      <div className="intelligent-history-details">
        <div><span>{"Última sessão"}</span><strong>{latestSession?formatDate(latestSession.date):"—"}</strong><small>{latestSession?.focus?`Foco: ${latestSession.focus}`:latestSession?.workoutName||"Nenhum registro"}</small></div>
        <div><span>{"Última avaliação"}</span><strong>{latestAssessment?formatDate(latestAssessment.date):"—"}</strong><small>{latestAssessment?"Avaliação registrada":"Nenhuma avaliação"}</small></div>
      </div>
      {recentNotes.length?<div className="intelligent-history-notes"><strong>{"Observações recentes"}</strong>{recentNotes.map(session=><div key={session.id}><b>{formatDate(session.date)}</b><span>{session.notes}</span></div>)}</div>:null}
    </section>

    <section className="panel">
      <div className="panel-head"><div><h2>{"Histórico de sessões"}</h2><p className="muted">Pesquise, filtre e corrija registros sem alterar a ficha original.</p></div><button className="secondary" onClick={() => exportStudentSessionsCsv(student)}>Exportar CSV</button></div>
      <div className="student-history-toolbar"><input className="search" placeholder="Buscar exercício, foco ou observação..." value={query} onChange={e=>setQuery(e.target.value)}/><select value={source} onChange={e=>setSource(e.target.value as any)}><option value="ALL">Todos os tipos</option><option value="PLANNED">Ficha concluída</option><option value="FREE">Treino registrado</option><option value="ATTENDANCE">Presença</option><option value="IMPORTED">Importado</option></select><select value={period} onChange={e=>setPeriod(e.target.value as any)}><option value="ALL">Todo o período</option><option value="30">Últimos 30 dias</option><option value="90">Últimos 90 dias</option><option value="YEAR">Este ano</option></select><span className="status-chip ok">{visibleSessions.length}</span></div>
      {visibleSessions.length?visibleSessions.map(session=><details className="history-item" key={session.id}><summary><span><strong>{formatDate(session.date)}</strong> {"·"} {session.focus?"Treino realizado":session.workoutName}{session.focus?<> {"·"} <b>Foco:</b> {session.focus}</>:null}</span><small>{sessionSourceLabel(session)}</small></summary>{session.completedExercises.length?<ul className="simple-list">{session.completedExercises.map(exercise=><li key={exercise.id}>{exercise.block?`${exercise.block} · `:""}{exercise.name}{exercise.sets||exercise.reps?` · ${exercise.sets}×${exercise.reps}`:""}{exercise.load?` · ${exercise.load}`:""}{exercise.notes?` · ${exercise.notes}`:""}</li>)}</ul>:<p className="muted">{"Presença registrada sem detalhamento de exercícios."}</p>}<p>{session.notes||"Sem observações."}</p><div className="history-item-actions"><button className="secondary compact-button" onClick={e=>{e.preventDefault();setEditing({...session,completedExercises:session.completedExercises.map(ex=>({...ex}))});}}>Editar</button><button className="danger-link" disabled={saving} onClick={e=>{e.preventDefault();void removeSession(session);}}>Excluir registro</button></div></details>):<p className="muted">{"Nenhuma sessão encontrada com estes filtros."}</p>}
    </section>

    {editing?<div className="modal-backdrop" onMouseDown={()=>!saving&&setEditing(null)}><section className="modal history-edit-modal" onMouseDown={e=>e.stopPropagation()}><div className="modal-head"><div><h2>Editar sessão</h2><p className="muted">A ficha original do aluno não será alterada.</p></div><button className="text-button" disabled={saving} onClick={()=>setEditing(null)}>Fechar</button></div><div className="form-grid"><label>Data<input type="date" value={editing.date} onChange={e=>patchEditing({date:e.target.value})}/></label><label>Foco da sessão<input value={editing.focus||""} onChange={e=>patchEditing({focus:e.target.value})} placeholder="Ex.: Pernas, Dorsal + core..."/></label><label className="full">Nome do registro<input value={editing.workoutName} onChange={e=>patchEditing({workoutName:e.target.value})}/></label><label>Início<input type="datetime-local" value={isoToLocalInput(editing.startedAt)} onChange={e=>patchEditing({startedAt:localInputToIso(e.target.value)})}/></label><label>Fim<input type="datetime-local" value={isoToLocalInput(editing.finishedAt)} onChange={e=>patchEditing({finishedAt:localInputToIso(e.target.value)})}/></label></div><div className="panel-head history-edit-exercises-head"><div><h3>Exercícios realizados</h3><p className="muted">Corrija bloco, exercício, séries, repetições, carga e observação.</p></div><button className="secondary compact-button" onClick={addExercise}>+ Exercício</button></div><div className="history-edit-exercises">{editing.completedExercises.map(ex=><div className="history-edit-row" key={ex.id}><input placeholder="Bloco" value={ex.block||""} onChange={e=>patchExercise(ex.id,{block:e.target.value})}/><input className="history-edit-name" placeholder="Exercício" value={ex.name} onChange={e=>patchExercise(ex.id,{name:e.target.value})}/><input placeholder="Séries" value={ex.sets} onChange={e=>patchExercise(ex.id,{sets:e.target.value})}/><input placeholder="Reps" value={ex.reps} onChange={e=>patchExercise(ex.id,{reps:e.target.value})}/><input placeholder="Carga" value={ex.load} onChange={e=>patchExercise(ex.id,{load:e.target.value})}/><input placeholder="Observação" value={ex.notes||""} onChange={e=>patchExercise(ex.id,{notes:e.target.value})}/><button className="danger-link" onClick={()=>removeExercise(ex.id)}>×</button></div>)}</div><label className="form-stack">Observações da sessão<textarea rows={4} value={editing.notes} onChange={e=>patchEditing({notes:e.target.value})}/></label><div className="history-edit-actions"><button className="danger-link" disabled={saving} onClick={()=>void removeSession(editing)}>Excluir registro</button><span/><button className="secondary" disabled={saving} onClick={()=>setEditing(null)}>Cancelar</button><button className="primary" disabled={saving} onClick={()=>void saveEdit()}>{saving?"Salvando...":"Salvar alterações"}</button></div></section></div>:null}
  </div>;
}

function assessmentMetric(value:number|null|undefined,suffix=""){return value===null||value===undefined||Number.isNaN(value)?"—":`${value.toLocaleString("pt-BR",{maximumFractionDigits:1})}${suffix}`;}
function assessmentDelta(current:number|null|undefined,previous:number|null|undefined,suffix=""){if(current===null||current===undefined||previous===null||previous===undefined)return null;const delta=current-previous;return `${delta>0?"+":""}${delta.toLocaleString("pt-BR",{maximumFractionDigits:1})}${suffix}`;}
function assessmentBmi(assessment:Assessment){if(assessment.bmi!==null&&assessment.bmi!==undefined)return assessment.bmi;if(!assessment.weight||!assessment.height)return null;const meters=assessment.height>3?assessment.height/100:assessment.height;return meters>0?assessment.weight/(meters*meters):null;}
function assessmentLeanMassKg(assessment:Assessment){const weight=assessmentNumber(assessment.weight),fat=assessmentNumber(assessment.fatMass),bodyFatPercent=assessmentNumber(assessment.bodyFatPercent),raw=assessmentNumber(assessment.leanMass);const derivedFromFatMass=weight!==null&&fat!==null?Math.max(0,weight-fat):null;const derivedFromPercent=weight!==null&&bodyFatPercent!==null?Math.max(0,weight*(1-bodyFatPercent/100)):null;const derived=derivedFromFatMass??derivedFromPercent;if(raw===null)return derived;if(derived!==null&&Math.abs(raw-derived)>Math.max(3,(weight??0)*0.08))return derived;return raw;}
function assessmentLeanPercent(assessment:Assessment){const weight=assessmentNumber(assessment.weight),leanKg=assessmentLeanMassKg(assessment);if(weight!==null&&weight>0&&leanKg!==null)return leanKg/weight*100;const raw=assessmentNumber(assessment.leanMassPercent);return raw!==null&&raw>=0&&raw<=100?raw:null;}
function assessmentSorted(student:Student){return student.assessments.slice().sort((a,b)=>b.date.localeCompare(a.date));}
function assessmentPrevious(student:Student,assessment:Assessment){const sorted=student.assessments.slice().sort((a,b)=>a.date.localeCompare(b.date));const index=sorted.findIndex(item=>item.id===assessment.id);return index>0?sorted[index-1]:null;}
function assessmentSparkline(values:{label:string;value:number}[],label:string,suffix:string){if(values.length<2)return"";const width=720,height=180,pad=28;const min=Math.min(...values.map(v=>v.value)),max=Math.max(...values.map(v=>v.value));const span=Math.max(.1,max-min);const points=values.map((item,index)=>{const x=pad+(width-pad*2)*(index/Math.max(1,values.length-1));const y=height-pad-(height-pad*2)*((item.value-min)/span);return{x,y,...item};});const path=points.map((p,index)=>`${index?"L":"M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");return `<div class="chart"><div class="chart-title"><strong>${label}</strong><span>${assessmentMetric(values[values.length-1].value,suffix)}</span></div><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Evolução de ${label}"><line x1="${pad}" x2="${width-pad}" y1="${height-pad}" y2="${height-pad}" stroke="#dce5e8"/><path d="${path}" fill="none" stroke="#1d7ca6" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>${points.map(p=>`<circle cx="${p.x}" cy="${p.y}" r="5" fill="#a8c93b"><title>${p.label}: ${assessmentMetric(p.value,suffix)}</title></circle>`).join("")}</svg><div class="chart-labels"><span>${values[0].label}</span><span>${values[values.length-1].label}</span></div></div>`;}
function openAssessmentReport(student:Student,assessment:Assessment){
  const popup=window.open("","_blank");if(!popup){alert("Permita a abertura de janelas para visualizar o relatório.");return;}
  const previous=assessmentPrevious(student,assessment);const history=student.assessments.slice().sort((a,b)=>a.date.localeCompare(b.date));
  const esc=(value:unknown)=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]!));
  const metric=(label:string,value:number|null|undefined,suffix:string,prev:number|null|undefined,accent="")=>`<article class="metric ${accent}"><span>${label}</span><strong>${assessmentMetric(value,suffix)}</strong>${prev!==null&&prev!==undefined&&value!==null&&value!==undefined?`<small>${assessmentDelta(value,prev,suffix)} vs. anterior</small>`:"<small>Sem comparação anterior</small>"}</article>`;
  const bmi=assessmentBmi(assessment),prevBmi=previous?assessmentBmi(previous):null,leanPct=assessmentLeanPercent(assessment),prevLeanPct=previous?assessmentLeanPercent(previous):null;
  const measurements=Object.entries(assessment.measurements||{}).filter(([,value])=>String(value||"").trim()).map(([key,value])=>`<tr><td>${esc(MEASUREMENT_LABELS[key]||key)}</td><td>${esc(value)} cm</td>${previous?.measurements?.[key as keyof Measurements]?`<td>${esc(previous.measurements[key as keyof Measurements])} cm</td>`:"<td>—</td>"}</tr>`).join("");
  const series=(pick:(a:Assessment)=>number|null|undefined)=>history.map(a=>({label:formatDate(a.date),value:pick(a)})).filter((item):item is {label:string;value:number}=>item.value!==null&&item.value!==undefined&&!Number.isNaN(item.value));
  const html=`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Avaliação · ${esc(student.name)} · ${formatDate(assessment.date)}</title><style>@page{size:A4;margin:12mm}*{box-sizing:border-box}body{margin:0;background:#eef2ef;color:#17232a;font-family:Arial,Helvetica,sans-serif}.sheet{width:min(1000px,calc(100% - 32px));margin:20px auto;background:#fff;border-radius:24px;overflow:hidden;box-shadow:0 22px 70px rgba(20,39,44,.14)}header{padding:28px 34px;background:linear-gradient(135deg,#143f38,#1d6f66);color:#fff;display:flex;justify-content:space-between;gap:24px;align-items:center}header img{width:170px;border-radius:12px;background:#fff}header p{margin:0 0 7px;font-size:12px;letter-spacing:.12em;font-weight:800;color:#dce9a8}h1{margin:0;font-size:30px}header .date{margin-top:8px;color:#d9e8e5}.content{padding:28px 34px}.hero{display:grid;grid-template-columns:1.25fr .75fr;gap:18px;margin-bottom:22px}.hero-card{padding:20px;border:1px solid #dfe8e3;border-radius:18px;background:#fbfcfa}.hero-card h2{margin:0 0 8px;font-size:19px;color:#166b91}.hero-card p{margin:4px 0;color:#5d6d72}.comparison{display:flex;align-items:center;justify-content:center;text-align:center;background:#f4f8e7}.comparison strong{font-size:25px;color:#597319}.comparison span{display:block;font-size:12px;color:#6e7b7d;margin-top:5px}.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.metric{border:1px solid #dfe7e4;border-radius:15px;padding:14px;background:#fff}.metric span,.metric small{display:block;color:#738084;font-size:11px}.metric strong{display:block;font-size:22px;margin:6px 0;color:#143f38}.metric.primary{background:#f4f9df;border-color:#dbe8a9}.metric.blue{background:#edf7fb;border-color:#cbe4ef}.section{margin-top:28px}.section h2{font-size:18px;color:#166b91;margin:0 0 12px}.charts{display:grid;grid-template-columns:1fr 1fr;gap:14px}.chart{border:1px solid #dfe7e4;border-radius:16px;padding:14px}.chart-title{display:flex;justify-content:space-between;align-items:center}.chart-title span{font-weight:800;color:#597319}.chart svg{width:100%;height:145px}.chart-labels{display:flex;justify-content:space-between;font-size:10px;color:#788588}table{width:100%;border-collapse:collapse;border:1px solid #e1e7e5;border-radius:14px;overflow:hidden}th,td{padding:9px 10px;border-bottom:1px solid #e6ece9;text-align:left;font-size:12px}th{background:#f2f7e8;color:#41551f}.notes{padding:16px;border-radius:14px;background:#f7f9f8;white-space:pre-wrap}.photos{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}.photos img{width:100%;max-height:360px;object-fit:contain;border:1px solid #e1e7e5;border-radius:14px;background:#fafafa}footer{margin-top:28px;padding-top:12px;border-top:1px solid #e1e6e4;display:flex;justify-content:space-between;font-size:10px;color:#7a8688}.printbar{position:sticky;top:0;display:flex;justify-content:flex-end;gap:8px;padding:10px 16px;background:#fff;border-bottom:1px solid #e1e6e4;z-index:5}.printbar button{border:0;border-radius:9px;padding:9px 13px;font-weight:800;cursor:pointer}.printbar .primary{background:#a8c93b;color:#24310d}@media(max-width:760px){.hero,.charts{grid-template-columns:1fr}.metrics{grid-template-columns:1fr 1fr}.sheet{width:100%;margin:0;border-radius:0}header,.content{padding:20px}header img{width:120px}}@media print{body{background:#fff}.sheet{width:100%;margin:0;box-shadow:none;border-radius:0}.printbar{display:none}.content{padding:18px 20px}.metrics{grid-template-columns:repeat(4,1fr)}.chart svg{height:115px}}</style></head><body><div class="sheet"><div class="printbar"><button onclick="window.close()">Fechar</button><button class="primary" onclick="window.print()">Imprimir / Salvar PDF</button></div><header><div><p>AVALIAÇÃO CORPORAL · DMP</p><h1>${esc(student.name)}</h1><div class="date">${formatDate(assessment.date)} · ${esc(student.goal||"Objetivo não informado")}</div></div><img src="/logo-danilo.jpg" alt="Danilo Modesto Personal"></header><div class="content"><div class="hero"><div class="hero-card"><h2>Resumo da avaliação</h2><p>Relatório consolidado com composição corporal, medidas e evolução registrada no DMP.</p><p>${previous?`Comparação com ${formatDate(previous.date)}.`:"Primeira avaliação disponível para comparação."}</p></div><div class="hero-card comparison"><div><strong>${history.length}</strong><span>avaliação${history.length===1?"":"ões"} no histórico</span></div></div></div><div class="metrics">${metric("Peso",assessment.weight," kg",previous?.weight,"primary")}${metric("IMC",bmi,"",prevBmi,"blue")}${metric("Gordura corporal",assessment.bodyFatPercent,"%",previous?.bodyFatPercent,"primary")}${metric("Massa de gordura",assessment.fatMass," kg",previous?.fatMass,"blue")}${metric("Massa magra (kg)",assessmentLeanMassKg(assessment)," kg",previous?assessmentLeanMassKg(previous):null,"primary")}${metric("Massa magra (%)",leanPct,"%",prevLeanPct,"blue")}${metric("Água corporal",assessment.waterPercent,"%",previous?.waterPercent,"primary")}${metric("Massa muscular",assessment.muscleMass," kg",previous?.muscleMass,"blue")}${metric("Metabolismo basal",assessment.basalMetabolicRate," kcal",previous?.basalMetabolicRate,"primary")}${metric("Ângulo de fase",assessment.phaseAngle,"°",previous?.phaseAngle,"blue")}${metric("Gordura visceral",assessment.visceralFat,"",previous?.visceralFat,"primary")}${metric("Massa celular",assessment.bodyCellMass," kg",previous?.bodyCellMass,"blue")}${metric("Índice de hidratação",assessment.hydrationIndex,"",previous?.hydrationIndex,"primary")}${metric("Água corporal total",assessment.totalBodyWaterLiters," L",previous?.totalBodyWaterLiters,"blue")}${metric("Água na massa magra",assessment.waterLeanPercent,"%",previous?.waterLeanPercent,"primary")}${metric("Água intracelular",assessment.intracellularWaterLiters," L",previous?.intracellularWaterLiters,"blue")}${metric("Água extracelular",assessment.extracellularWaterLiters," L",previous?.extracellularWaterLiters,"primary")}${metric("Água intracelular",assessment.intracellularWaterPercent,"%",previous?.intracellularWaterPercent,"blue")}${metric("Massa muscular",assessment.muscleMassPercent,"%",previous?.muscleMassPercent,"primary")}${metric("Razão músculo/gordura",assessment.muscleFatRatio,"",previous?.muscleFatRatio,"blue")}${metric("Idade celular",assessment.cellularAge," anos",previous?.cellularAge,"primary")}</div>${history.length>1?`<section class="section"><h2>Evolução corporal</h2><div class="charts">${assessmentSparkline(series(a=>a.weight),"Peso"," kg")}${assessmentSparkline(series(a=>a.bodyFatPercent),"Gordura corporal","%")}${assessmentSparkline(series(a=>assessmentLeanMassKg(a)),"Massa magra (kg)"," kg")}${assessmentSparkline(series(a=>assessmentLeanPercent(a)),"Massa magra (%)","%")}</div></section>`:""}${measurements?`<section class="section"><h2>Perimetria</h2><table><thead><tr><th>Medida</th><th>Atual</th><th>Anterior</th></tr></thead><tbody>${measurements}</tbody></table></section>`:""}${assessment.notes?`<section class="section"><h2>Observações</h2><div class="notes">${esc(assessment.notes)}</div></section>`:""}${assessment.photos?.length?`<section class="section"><h2>Imagens da avaliação</h2><div class="photos">${assessment.photos.map(photo=>`<img src="${photo}" alt="Imagem da avaliação">`).join("")}</div></section>`:""}<footer><span>Danilo Modesto Personal Trainer</span><span>Relatório emitido em ${new Date().toLocaleString("pt-BR")}</span></footer></div></div></body></html>`;
  popup.document.open();popup.document.write(html);popup.document.close();
}
const MEASUREMENT_LABELS:Record<string,string>={neck:"Pescoço",shoulders:"Ombros",chest:"Tórax",waist:"Cintura",abdomen:"Abdômen",hips:"Quadril",rightArm:"Braço direito",leftArm:"Braço esquerdo",rightForearm:"Antebraço direito",leftForearm:"Antebraço esquerdo",rightThigh:"Coxa direita",leftThigh:"Coxa esquerda",rightCalf:"Panturrilha direita",leftCalf:"Panturrilha esquerda"};

function AssessmentPanel({student,onNew}:{student:Student;onNew:()=>void}) {
  const sorted=assessmentSorted(student);
  const latest=sorted[0]||null;
  const previous=latest?assessmentPrevious(student,latest):null;

  const comparison=latest?[
    {label:"Peso",value:assessmentMetric(latest.weight," kg"),delta:previous?assessmentDelta(latest.weight,previous.weight," kg"):null},
    {label:"Gordura corporal",value:assessmentMetric(latest.bodyFatPercent,"%"),delta:previous?assessmentDelta(latest.bodyFatPercent,previous.bodyFatPercent,"%"):null},
    {label:"Massa magra (kg)",value:assessmentMetric(assessmentLeanMassKg(latest)," kg"),delta:previous?assessmentDelta(assessmentLeanMassKg(latest),assessmentLeanMassKg(previous)," kg"):null},
    {label:"Massa magra (%)",value:assessmentMetric(assessmentLeanPercent(latest),"%"),delta:previous?assessmentDelta(assessmentLeanPercent(latest),assessmentLeanPercent(previous),"%"):null}
  ]:[];

  return <section className="panel assessment-history-panel">
    <div className="panel-head">
      <div>
        <h2>Avaliações</h2>
        <p className="muted">Histórico corporal e evolução do aluno.</p>
      </div>
      <button className="primary" onClick={onNew}>+ Nova avaliação</button>
    </div>

    {latest?
      <section className="assessment-comparison">
        <div className="assessment-comparison-head">
          <div>
            <span>COMPARAÇÃO MAIS RECENTE</span>
            <strong>{formatDate(latest.date)}</strong>
          </div>
          <small>{previous?`Comparado com ${formatDate(previous.date)}`:"Primeira avaliação registrada"}</small>
        </div>

        <div className="assessment-compare-grid">
          {comparison.map(item=>
            <article key={item.label}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
              <small>{item.delta?`${item.delta} vs. anterior`:"Sem comparação anterior"}</small>
            </article>
          )}
        </div>
      </section>
    :null}

    {sorted.length>1?<AssessmentTrendChart student={student}/>:null}

    {sorted.length?
      <div className="assessment-history-list">
        {sorted.map(assessment=>{
          const previousAssessment=assessmentPrevious(student,assessment);
          return <article className="assessment-card assessment-card-rich" key={assessment.id}>
            <div className="assessment-card-main">
              <div className="assessment-card-date">
                <small>Avaliação</small>
                <strong>{formatDate(assessment.date)}</strong>
              </div>

              <div className="assessment-card-metrics">
                <span><small>Peso</small><b>{assessmentMetric(assessment.weight," kg")}</b></span>
                <span><small>Gordura</small><b>{assessmentMetric(assessment.bodyFatPercent,"%")}</b></span>
                <span><small>Massa magra (kg)</small><b>{assessmentMetric(assessmentLeanMassKg(assessment)," kg")}</b></span>
                <span><small>Massa magra (%)</small><b>{assessmentMetric(assessmentLeanPercent(assessment),"%")}</b></span>
              </div>

              <div className="assessment-card-actions">
                <button className="primary" onClick={()=>openAssessmentReport(student,assessment)}>Ver relatório</button>
                {previousAssessment?<small>Comparação com {formatDate(previousAssessment.date)}</small>:<small>Primeira avaliação</small>}
              </div>
            </div>

            {assessment.photos.length?
              <div className="assessment-photos">
                {assessment.photos.slice(0,4).map((photo,photoIndex)=>
                  <img key={photoIndex} src={photo} alt={`Avaliação ${photoIndex+1}`}/>
                )}
              </div>
            :null}
          </article>
        })}
      </div>
    :<p className="muted">Nenhuma avaliação registrada.</p>}
  </section>;
}


type StudentFileCategory =
  | "MEDICAL_CERTIFICATE"
  | "EXAM"
  | "ASSESSMENT"
  | "REPORT"
  | "DOCUMENT"
  | "OTHER";

type StudentFileRecord = {
  id:string;
  studentId:string;
  name:string;
  category:StudentFileCategory;
  date:string;
  notes:string;
  mimeType:string;
  size:number;
  dataUrl:string;
  createdAt:string;
};

function studentFileCategoryLabel(category:StudentFileCategory){
  if(category==="MEDICAL_CERTIFICATE")return "Atestado médico";
  if(category==="EXAM")return "Exame";
  if(category==="ASSESSMENT")return "Avaliação";
  if(category==="REPORT")return "Laudo";
  if(category==="DOCUMENT")return "Documento";
  return "Outro";
}

function StudentFilesPanel({student}:{student:Student}) {
  const [files,setFiles]=useState<StudentFileRecord[]>([]);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [selectedFile,setSelectedFile]=useState<File|null>(null);
  const [category,setCategory]=useState<StudentFileCategory>("DOCUMENT");
  const [date,setDate]=useState(today());
  const [notes,setNotes]=useState("");

  async function loadFiles(){
    setLoading(true);
    try{
      const response=await fetch(`/api/student-files?studentId=${encodeURIComponent(student.id)}`,{cache:"no-store"});
      const result=await response.json();
      setFiles(Array.isArray(result.data)?result.data:[]);
    }catch{
      setFiles([]);
    }finally{
      setLoading(false);
    }
  }

  useEffect(()=>{
    void loadFiles();
  },[student.id]);

  async function saveFile(){
    if(!selectedFile)return;

    if(selectedFile.size>5*1024*1024){
      alert("O arquivo deve ter no máximo 5 MB.");
      return;
    }

    const allowed=
      selectedFile.type==="application/pdf"||
      selectedFile.type.startsWith("image/");

    if(!allowed){
      alert("Envie um arquivo PDF ou uma imagem.");
      return;
    }

    setSaving(true);

    try{
      const dataUrl=await fileToDataUrl(selectedFile);

      const response=await fetch("/api/student-files",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          studentId:student.id,
          name:selectedFile.name,
          category,
          date,
          notes:notes.trim(),
          mimeType:selectedFile.type,
          size:selectedFile.size,
          dataUrl
        })
      });

      const result=await response.json();

      if(!response.ok||!result.ok){
        throw new Error(result.error||"Erro ao salvar arquivo");
      }

      setSelectedFile(null);
      setNotes("");
      setDate(today());
      await loadFiles();
    }catch(error){
      console.error(error);
      alert("Não foi possível salvar o arquivo.");
    }finally{
      setSaving(false);
    }
  }

  async function removeFile(file:StudentFileRecord){
    if(!confirm(`Excluir “${file.name}”?`))return;

    try{
      const response=await fetch(`/api/student-files?id=${encodeURIComponent(file.id)}`,{
        method:"DELETE"
      });

      if(!response.ok)throw new Error();
      setFiles(current=>current.filter(item=>item.id!==file.id));
    }catch{
      alert("Não foi possível excluir o arquivo.");
    }
  }

  return <section className="panel student-files-panel">
    <div className="panel-head">
      <div>
        <h2>📁 Arquivos do aluno</h2>
        <p className="muted">Atestados, exames, avaliações, laudos e outros documentos vinculados a {student.name}.</p>
      </div>
    </div>

    <div className="student-file-upload">
      <label className="student-file-picker">
        <span>Arquivo</span>
        <input
          type="file"
          accept="application/pdf,image/*"
          onChange={event=>setSelectedFile(event.target.files?.[0]||null)}
        />
        <strong>{selectedFile?.name||"Selecionar PDF ou imagem"}</strong>
      </label>

      <label>
        Categoria
        <select
          value={category}
          onChange={event=>setCategory(event.target.value as StudentFileCategory)}
        >
          <option value="MEDICAL_CERTIFICATE">Atestado médico</option>
          <option value="EXAM">Exame</option>
          <option value="ASSESSMENT">Avaliação</option>
          <option value="REPORT">Laudo</option>
          <option value="DOCUMENT">Documento</option>
          <option value="OTHER">Outro</option>
        </select>
      </label>

      <label>
        Data
        <input
          type="date"
          value={date}
          onChange={event=>setDate(event.target.value)}
        />
      </label>

      <label className="student-file-notes">
        Observação
        <input
          value={notes}
          onChange={event=>setNotes(event.target.value)}
          placeholder="Ex.: retorno médico, exame de joelho..."
        />
      </label>

      <button
        className="primary"
        disabled={!selectedFile||saving}
        onClick={()=>void saveFile()}
      >
        {saving?"Enviando...":"+ Adicionar arquivo"}
      </button>
    </div>

    {loading?
      <div className="empty-review">
        <span>Carregando arquivos...</span>
      </div>
    :files.length?
      <div className="student-file-list">
        {files.map(file=>
          <article className="student-file-row" key={file.id}>
            <div className="student-file-icon">
              {file.mimeType==="application/pdf"?"PDF":"IMG"}
            </div>

            <div className="student-file-info">
              <strong>{file.name}</strong>
              <span>
                {studentFileCategoryLabel(file.category)}
                {" · "}
                {formatDate(file.date)}
              </span>
              {file.notes?<small>{file.notes}</small>:null}
            </div>

            <div className="student-file-actions">
              <a
                className="secondary button-link"
                href={file.dataUrl}
                target="_blank"
                rel="noreferrer"
              >
                Abrir
              </a>

              <button
                className="danger-link"
                onClick={()=>void removeFile(file)}
              >
                Excluir
              </button>
            </div>
          </article>
        )}
      </div>
    :
      <div className="empty-review">
        <strong>Nenhum arquivo</strong>
        <span>Use esta área para organizar documentos importantes deste aluno.</span>
      </div>
    }
  </section>;
}

type StudentFormPayload = Pick<Student,"name"|"phone"|"email"|"goal"|"profession"|"modality"|"weeklyFrequency"|"trainingSchedule"|"financialActive"|"monthlyAmount"|"financeDueDay"|"notes"|"restrictions"|"injuries"|"medications"|"emergencyContact"|"emergencyPhone"|"startDate"|"birthDate"|"gender"|"tennisCategory"> & {status?: Student["status"]};
function StudentForm({title,initialStudent,onClose,onSave}:{title:string;initialStudent?:Student;onClose:()=>void;onSave:(payload:StudentFormPayload)=>void}) {
  const [form,setForm]=useState<StudentFormPayload>({name:initialStudent?.name||"",phone:initialStudent?.phone||"",email:initialStudent?.email||"",goal:initialStudent?.goal||"",profession:initialStudent?.profession||"",modality:initialStudent?.modality||"",weeklyFrequency:initialStudent?.weeklyFrequency||"",trainingSchedule:initialStudent?.trainingSchedule||"",financialActive:initialStudent?.financialActive,monthlyAmount:initialStudent?.monthlyAmount,financeDueDay:initialStudent?.financeDueDay,notes:initialStudent?.notes||"",restrictions:initialStudent?.restrictions||"",injuries:initialStudent?.injuries||"",medications:initialStudent?.medications||"",emergencyContact:initialStudent?.emergencyContact||"",emergencyPhone:initialStudent?.emergencyPhone||"",startDate:initialStudent?.startDate||"",birthDate:initialStudent?.birthDate||"",gender:initialStudent?.gender,tennisCategory:initialStudent?.tennisCategory||null,status:initialStudent?.status});
  const age=calculateAge(form.birthDate);
  useEffect(()=>{
    if(!initialStudent||initialStudent.financialActive!==undefined)return;
    let cancelled=false;
    const normalizeFinanceName=(value:string)=>value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9 ]/g," ").replace(/\s+/g," ").trim();
    fetch("/api/finance",{cache:"no-store"})
      .then(response=>response.ok?response.json():Promise.reject())
      .then(payload=>{
        if(cancelled||!payload?.data)return;
        const finance=payload.data as FinanceData;
        const current=finance.personalInvoices.filter(invoice=>invoice.competence===finance.currentCompetence&&!invoice.excludedFromTotals);
        const byId=current.filter(invoice=>invoice.studentId===initialStudent.id);
        const byName=current.filter(invoice=>!invoice.studentId&&normalizeFinanceName(invoice.studentName)===normalizeFinanceName(initialStudent.name));
        const invoice=byId.length===1?byId[0]:byId.length===0&&byName.length===1?byName[0]:null;
        if(!invoice)return;
        setForm(currentForm=>currentForm.financialActive===undefined?{
          ...currentForm,
          financialActive:true,
          monthlyAmount:invoice.expectedAmount,
          financeDueDay:invoice.dueDay,
        }:currentForm);
      })
      .catch(()=>{});
    return()=>{cancelled=true;};
  },[initialStudent]);
  function submit(event:FormEvent){event.preventDefault();if(!form.name.trim())return;onSave({...form,name:form.name.trim()});}
  return <div className="modal-backdrop"><section className="modal modal-large"><div className="modal-head"><div><h2>{title}</h2><p className="muted">Cadastro completo para atendimento e segurança.</p></div><button className="text-button" onClick={onClose}>Fechar</button></div><form className="form-grid" onSubmit={submit}>
    <label>Nome<input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} required /></label><label>Telefone<input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} /></label>
    <label>E-mail<input type="email" value={form.email||""} onChange={e=>setForm({...form,email:e.target.value})} /></label><label>Profissão<input value={form.profession||""} onChange={e=>setForm({...form,profession:e.target.value})} /></label>
    <label>Data de início<input type="date" value={form.startDate} onChange={e=>setForm({...form,startDate:e.target.value})} /></label><label>Data de nascimento<input type="date" value={form.birthDate} onChange={e=>setForm({...form,birthDate:e.target.value})} />{age!==null?<small>Idade atual: {age} anos</small>:null}</label><label>Sexo<select value={form.gender||""} onChange={e=>setForm({...form,gender:(e.target.value||undefined) as Student["gender"]})}><option value="">Não informado</option><option value="MALE">Masculino</option><option value="FEMALE">Feminino</option></select></label>
    {initialStudent?<label>Situação do cadastro<select value={form.status||"ACTIVE"} onChange={e=>setForm({...form,status:e.target.value as Student["status"]})}><option value="ACTIVE">Ativo</option><option value="ARCHIVED">Inativo</option></select><small>Use aqui quando quiser inativar ou reativar o aluno.</small></label>:null}
    <label>Modalidade<input value={form.modality||""} onChange={e=>setForm({...form,modality:e.target.value})} placeholder="Ex.: musculação, tênis, corrida" /></label><label>Frequência semanal<input value={form.weeklyFrequency||""} onChange={e=>setForm({...form,weeklyFrequency:e.target.value})} placeholder="Ex.: 2x por semana" /></label>
    <label className="full">Dias e horários fixos<input value={form.trainingSchedule||""} onChange={e=>setForm({...form,trainingSchedule:e.target.value})} placeholder="Ex.: segunda 7h · quarta 7h" /><small>Informação exibida no topo do Dashboard do Aluno.</small></label>
    <fieldset className="full student-finance-box"><legend>Financeiro do Personal</legend><label className="student-finance-toggle"><input type="checkbox" checked={form.financialActive===true} onChange={e=>setForm({...form,financialActive:e.target.checked})}/><span><strong>Ativar no Financeiro</strong><small>Alunos antigos entram preenchidos com a mensalidade e o vencimento já existentes quando o vínculo é seguro.</small></span></label>{form.financialActive===true?<div className="student-finance-grid"><label>Mensalidade (R$)<input type="number" min="0" step="0.01" value={form.monthlyAmount??""} onChange={e=>setForm({...form,monthlyAmount:e.target.value===""?undefined:Number(e.target.value)})} required /></label><label>Vencimento (dia)<input type="number" min="1" max="31" value={form.financeDueDay??""} onChange={e=>setForm({...form,financeDueDay:e.target.value===""?undefined:Number(e.target.value)})} required /></label><small className="full">O cadastro passa a comandar as próximas mensalidades. Pagamentos e competências anteriores continuam preservados.</small></div>:<small className="student-finance-off">Desativado: não cria novas cobranças automáticas. O histórico existente não é apagado.</small>}</fieldset>
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
        const validity=workout?workoutValidityInfo(student,workout):null;
        return <article className={`workout-slot-card ${workout?"filled":"empty"}`} key={slot}>
          <div className="workout-slot-head"><span className="workout-slot-badge">Treino {slot}</span>{workout?<span className="protocol-chip">{workoutProtocolLabel(workout.protocol)}</span>:<span className="status-chip">Vazio</span>}</div>
          {workout?<><h3>{workout.name||`Treino ${slot}`}</h3><p className="workout-slot-meta">{workout.exercises.length} exercício{workout.exercises.length===1?"":"s"} · {workout.sequenceSize||defaultSequenceSize(workout.protocol||"CONVENTIONAL")} por sequência</p>{validity&&validity.status!=="NONE"?<div className={`workout-validity-badge ${validity.status.toLowerCase()}`}><strong>{validity.label}</strong>{workout.validityMode==="PERIOD"&&validity.endDate?<small>Termina em {formatDate(validity.endDate)}</small>:workout.validityMode==="SESSIONS"?<small>{validity.completed}/{workout.validitySessionTarget||0} sessões realizadas</small>:null}</div>:null}{workout.notes?<p className="workout-slot-note">{workout.notes}</p>:null}<ul className="workout-slot-preview">{workout.exercises.slice(0,6).map((exercise,index)=><li key={exercise.id}><strong>{index+1}.</strong> {exercise.name}<small>{exercise.sets||exercise.reps?`${exercise.sets}×${exercise.reps}`:""}{exercise.load?` · ${exercise.load}`:""}</small></li>)}</ul>{workout.exercises.length>6?<small className="muted">+ {workout.exercises.length-6} exercícios</small>:null}<div className="workout-slot-actions workout-slot-actions-share"><button className="secondary" onClick={()=>onEdit(slot,workout)}>Editar</button><button className="secondary" onClick={()=>onCopy(workout)}>Duplicar</button><button className="secondary" onClick={()=>openWorkoutSharePreview(student,workout)}>Compartilhar</button><button className="secondary archive-workout-button" onClick={()=>onArchive(workout)}>Arquivar</button><button className="secondary clear-workout-button" onClick={()=>onClear(workout)}>🗑 Limpar treino</button><button className="primary" onClick={()=>onStart(workout)}>▶ Iniciar treino</button></div></>:<><div className="workout-slot-empty"><strong>Treino {slot} ainda não montado</strong><span>Escolha o protocolo e adicione os exercícios.</span></div><button className="primary" onClick={()=>onEdit(slot,null)}>+ Montar Treino {slot}</button></>}
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

function WorkoutEditor({student,workout,slot,exerciseCatalog,personalTemplates,onTemplatesChange,onBack,onSave}:{student:Student;workout:Workout|null;slot:WorkoutSlot;exerciseCatalog:string[];personalTemplates:PersonalWorkoutTemplate[];onTemplatesChange:(templates:PersonalWorkoutTemplate[])=>void;onBack:()=>void;onSave:(workout:Workout)=>void}) {
  const initialProtocol=workout?.protocol||"CONVENTIONAL";
  const [name,setName]=useState(workout?.name||`Treino ${slot}`);
  const [week,setWeek]=useState(workout?.week||1);
  const [protocol,setProtocol]=useState<WorkoutProtocol>(initialProtocol);
  const [sequenceSize,setSequenceSize]=useState(workout?.sequenceSize||defaultSequenceSize(initialProtocol));
  const [workoutNotes,setWorkoutNotes]=useState(workout?.notes||"");
  const [validityMode,setValidityMode]=useState<"NONE"|"PERIOD"|"SESSIONS">(workout?.validityMode||"NONE");
  const [validityStartDate,setValidityStartDate]=useState(workout?.validityStartDate||today());
  const [validityWeeks,setValidityWeeks]=useState(workout?.validityWeeks||3);
  const [validitySessionTarget,setValiditySessionTarget]=useState(workout?.validitySessionTarget||12);
  const [exercises,setExercises]=useState<Exercise[]>((workout?.exercises||[]).map(ex=>({...ex,notes:ex.notes||""})));
  const [dictation,setDictation]=useState("");
  const [dictating,setDictating]=useState(false);
  const [removedExercise,setRemovedExercise]=useState<{exercise:Exercise;index:number}|null>(null);
  useEffect(()=>{
    const previousTitle=document.title;
    document.title=`${student.name} · Treino ${slot} · DMP`;
    return()=>{document.title=previousTitle;};
  },[student.name,slot]);

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
  function applyPersonalTemplate(template:PersonalWorkoutTemplate){
    if(exercises.some(exercise=>exercise.name.trim())&&!confirm(`Substituir os exercícios atuais pelo modelo “${template.name}”?`))return;

    setName(template.name);
    setProtocol(template.protocol);
    setSequenceSize(template.sequenceSize);
    setWorkoutNotes(template.notes||"");

    setExercises(template.exercises.map((exercise,index)=>({
      ...exercise,
      id:crypto.randomUUID(),
      block:exercise.block||sequenceBlockLabel(template.protocol,index,template.sequenceSize),
      name:cleanExerciseCatalogName(exercise.name)||exercise.name.trim(),
      load:"",
      notes:exercise.notes||""
    })));
  }

  function saveAsPersonalTemplate(){
    const cleanExercises=exercises
      .filter(exercise=>exercise.name.trim())
      .map((exercise,index)=>({
        ...exercise,
        id:crypto.randomUUID(),
        block:exercise.block?.trim()||sequenceBlockLabel(protocol,index,sequenceSize),
        name:exercise.name.trim(),
        sets:exercise.sets.trim(),
        reps:exercise.reps.trim(),
        load:"",
        notes:exercise.notes?.trim()||""
      }));

    if(!cleanExercises.length){
      alert("Adicione pelo menos um exercício antes de salvar como modelo.");
      return;
    }

    const suggested=name.trim()||`Treino ${slot}`;
    const templateName=prompt("Nome do modelo:",suggested)?.trim();

    if(!templateName)return;

    if(personalTemplates.some(item=>normalizeName(item.name)===normalizeName(templateName))){
      alert("Já existe um modelo com esse nome. Escolha outro nome para evitar duplicidade na biblioteca.");
      return;
    }

    const description=prompt(
      "Descrição curta do modelo:",
      `${workoutProtocolLabel(protocol)} · ${cleanExercises.length} exercícios`
    )?.trim()||"";

    const now=new Date().toISOString();

    const template:PersonalWorkoutTemplate={
      id:crypto.randomUUID(),
      name:templateName,
      description,
      protocol,
      sequenceSize:Math.max(1,sequenceSize),
      notes:workoutNotes.trim(),
      exercises:cleanExercises,
      createdAt:now,
      updatedAt:now
    };

    onTemplatesChange([template,...personalTemplates]);
    alert(`Modelo “${templateName}” salvo na Biblioteca de Treinos.`);
  }

  function renamePersonalTemplate(template:PersonalWorkoutTemplate){
    const nextName=prompt("Novo nome do modelo:",template.name)?.trim();
    if(!nextName||nextName===template.name)return;
    if(personalTemplates.some(item=>item.id!==template.id&&normalizeName(item.name)===normalizeName(nextName))){
      alert("Já existe outro modelo com esse nome.");
      return;
    }

    onTemplatesChange(personalTemplates.map(item=>
      item.id===template.id
        ?{...item,name:nextName,updatedAt:new Date().toISOString()}
        :item
    ));
  }

  function deletePersonalTemplate(template:PersonalWorkoutTemplate){
    if(!confirm(`Excluir o modelo “${template.name}” da biblioteca?`))return;
    onTemplatesChange(personalTemplates.filter(item=>item.id!==template.id));
  }

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
      name:cleanExerciseCatalogName(exercise.name)||exercise.name.trim(),
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
      validityMode,
      validityStartDate:validityMode==="NONE" ? undefined : validityStartDate,
      validityWeeks:validityMode==="PERIOD" ? Math.max(1,validityWeeks) : undefined,
      validitySessionTarget:validityMode==="SESSIONS" ? Math.max(1,validitySessionTarget) : undefined,
      exercises:cleanExercises
    });
  };

  const validityEndPreview=(()=>{
    if(validityMode!=="PERIOD"||!validityStartDate)return "";
    const end=new Date(validityStartDate+"T12:00:00");
    end.setDate(end.getDate()+(Math.max(1,validityWeeks)*7)-1);
    return end.toISOString().slice(0,10);
  })();

  return <main className="app-page"><Header title={`${student.name} — Treino ${slot}`} back={onBack} titleClassName="workout-student-header-title"/><section className="content workout-editor-page">
    {student.restrictions||student.injuries?<div className="session-alert"><strong>⚠ Atenção com {student.name}</strong><span>{[student.restrictions,student.injuries].filter(Boolean).join(" · ")}</span></div>:null}
    <section className="panel workout-config-panel">

      <div className="workout-editor-title">
        <div>
          <span className="workout-slot-badge large">Treino {slot}</span>
          <h1>Montagem da ficha</h1>
          <p>Monte o treino e defina por quanto tempo esta ficha ficará ativa para o aluno.</p>
        </div>

        <button
          className="primary"
          disabled={!exercises.some(ex=>ex.name.trim())}
          onClick={save}
        >
          Salvar Treino {slot}
        </button>
      </div>

      <section className="workout-validity-main">
        <div className="workout-validity-main-head">
          <div>
            <span className="workout-validity-kicker">VIGÊNCIA DO TREINO</span>
            <h2>Por quanto tempo este treino será utilizado?</h2>
            <p>Defina agora para o DMP avisar quando estiver perto da renovação.</p>
          </div>
        </div>

        <div className="workout-validity-options">
          <button
            type="button"
            className={`workout-validity-choice ${validityMode==="NONE"?"active":""}`}
            onClick={()=>setValidityMode("NONE")}
          >
            <span>∞</span>
            <strong>Sem controle</strong>
            <small>O treino permanece ativo até você trocar ou arquivar.</small>
          </button>

          <button
            type="button"
            className={`workout-validity-choice ${validityMode==="PERIOD"?"active":""}`}
            onClick={()=>setValidityMode("PERIOD")}
          >
            <span>📅</span>
            <strong>Por período</strong>
            <small>Defina a quantidade de semanas do treino.</small>
          </button>

          <button
            type="button"
            className={`workout-validity-choice ${validityMode==="SESSIONS"?"active":""}`}
            onClick={()=>setValidityMode("SESSIONS")}
          >
            <span>🏋️</span>
            <strong>Por quantidade de treinos</strong>
            <small>O DMP conta as sessões realizadas até a renovação.</small>
          </button>
        </div>

        {validityMode!=="NONE"?
          <div className="workout-validity-details">
            <label>
              Data de início
              <input
                type="date"
                value={validityStartDate}
                onChange={e=>setValidityStartDate(e.target.value)}
              />
            </label>

            {validityMode==="PERIOD"?
              <label>
                Duração
                <div className="workout-validity-number">
                  <input
                    type="number"
                    min="1"
                    max="52"
                    value={validityWeeks}
                    onChange={e=>setValidityWeeks(Math.max(1,Number(e.target.value)||1))}
                  />
                  <span>semanas</span>
                </div>
              </label>
            :
              <label>
                Quantidade prevista
                <div className="workout-validity-number">
                  <input
                    type="number"
                    min="1"
                    max="200"
                    value={validitySessionTarget}
                    onChange={e=>setValiditySessionTarget(Math.max(1,Number(e.target.value)||1))}
                  />
                  <span>treinos</span>
                </div>
              </label>
            }

            <div className="workout-validity-preview">
              <span>RESUMO DA VIGÊNCIA</span>

              {validityMode==="PERIOD"?
                <>
                  <strong>{validityWeeks} semana{validityWeeks===1?"":"s"}</strong>
                  <small>
                    {validityEndPreview
                      ?`Treino válido até ${formatDate(validityEndPreview)}`
                      :"Informe a data de início"}
                  </small>
                </>
              :
                <>
                  <strong>{validitySessionTarget} treino{validitySessionTarget===1?"":"s"}</strong>
                  <small>O DMP avisará quando restarem somente 2 sessões.</small>
                </>
              }
            </div>
          </div>
        :
          <div className="workout-validity-no-control">
            <strong>Sem prazo de renovação definido</strong>
            <span>Você poderá alterar a vigência deste treino depois.</span>
          </div>
        }
      </section>

      <div className="workout-config-grid">
        <label>
          Nome / foco
          <input value={name} onChange={e=>setName(e.target.value)} placeholder={`Treino ${slot}`}/>
        </label>

        <label>
          Semana
          <input type="number" min="1" value={week} onChange={e=>setWeek(Number(e.target.value))}/>
        </label>

        <label>
          Protocolo
          <select value={protocol} onChange={e=>changeProtocol(e.target.value as WorkoutProtocol)}>
            {WORKOUT_PROTOCOL_OPTIONS.map(option=>
              <option key={option.value} value={option.value}>{option.label}</option>
            )}
          </select>
        </label>

        <label>
          Exercícios por sequência
          <input
            type="number"
            min="1"
            max="12"
            value={sequenceSize}
            onChange={e=>setSequenceSize(Math.max(1,Number(e.target.value)||1))}
          />
        </label>
      </div>

      <div className="protocol-help">
        <strong>{workoutProtocolLabel(protocol)}</strong>
        <span>{protocolDescription(protocol,sequenceSize)}</span>
        <button className="secondary compact-action" onClick={organizeSequences}>
          Organizar blocos automaticamente
        </button>
      </div>

      <label>
        Observações da ficha
        <textarea
          rows={3}
          value={workoutNotes}
          onChange={e=>setWorkoutNotes(e.target.value)}
          placeholder="Ex.: atenção ao intervalo, progressão planejada, ordem especial..."
        />
      </label>

    </section>

    <section className="panel workout-template-panel">
      <div className="panel-head">
        <div>
          <h2>🧩 Biblioteca de Treinos</h2>
          <p className="muted">Reaproveite fichas prontas ou transforme o treino atual em um modelo para outros alunos.</p>
        </div>

        <button
          type="button"
          className="primary"
          disabled={!exercises.some(ex=>ex.name.trim())}
          onClick={saveAsPersonalTemplate}
        >
          ⭐ Salvar como modelo
        </button>
      </div>

      <div className="personal-workout-library">
        <div className="personal-workout-library-title">
          <strong>Meus modelos</strong>
          <span>{personalTemplates.length} salvo{personalTemplates.length===1?"":"s"}</span>
        </div>

        {personalTemplates.length?
          <div className="personal-workout-template-grid">
            {personalTemplates.map(template=>
              <article className="personal-workout-template-card" key={template.id}>
                <div>
                  <span className="workout-slot-badge">{workoutProtocolLabel(template.protocol)}</span>
                  <h3>{template.name}</h3>
                  <p>{template.description||`${template.exercises.length} exercícios`}</p>
                  <small>{template.exercises.length} exercício{template.exercises.length===1?"":"s"}</small>
                </div>

                <div className="personal-workout-template-actions">
                  <button
                    type="button"
                    className="primary"
                    onClick={()=>applyPersonalTemplate(template)}
                  >
                    Usar modelo
                  </button>

                  <button
                    type="button"
                    className="secondary"
                    onClick={()=>renamePersonalTemplate(template)}
                  >
                    Renomear
                  </button>

                  <button
                    type="button"
                    className="danger-link"
                    onClick={()=>deletePersonalTemplate(template)}
                  >
                    Excluir
                  </button>
                </div>
              </article>
            )}
          </div>
        :
          <div className="empty-review compact-empty">
            <strong>Nenhum modelo pessoal ainda</strong>
            <span>Monte uma ficha e toque em “Salvar como modelo”.</span>
          </div>
        }
      </div>

      <div className="workout-template-divider">
        <strong>Modelos rápidos do DMP</strong>
        <span>Estruturas prontas para começar do zero.</span>
      </div>

      <div className="workout-template-grid">
        {WORKOUT_TEMPLATES.map(template=>
          <button
            type="button"
            className="secondary"
            key={template.id}
            onClick={()=>applyTemplate(template)}
          >
            <strong>{template.label}</strong>
            <small>{template.description}</small>
          </button>
        )}
      </div>
    </section>

    <section className="panel workout-dictation-panel"><div className="panel-head"><div><h2>📋 Importar treino por texto</h2><p className="muted">Cole aqui o treino organizado e transforme em ficha para revisão. Nada é salvo automaticamente.</p></div></div><textarea rows={8} value={dictation} onChange={e=>setDictation(e.target.value)} placeholder={'Treino em sistema B7\n\nBloco 1\nSupino reto — 3x15 — 30 kg\nAgachamento livre — 3x15\n\nBloco 2\nSupino inclinado — 3x12 — 12 kg de cada lado\nCadeira extensora — 3x15'}/><div className="hero-actions"><button className="primary" onClick={applyDictation} disabled={!dictation.trim()}>Interpretar texto</button><button className="secondary" onClick={listenWorkout}>{dictating?"Ouvindo...":"🎤 Falar (experimental)"}</button></div><small className="muted">Depois de interpretar, confira protocolo, blocos, séries, repetições e cargas na tabela abaixo. O microfone continua disponível, mas é experimental.</small></section>

    <section className="panel workout-grid-panel"><div className="panel-head"><div><h2>Exercícios do Treino {slot}</h2><p className="muted">Comece a digitar um exercício já usado para ver sugestões.</p></div><button className="primary" onClick={addExercise}>+ Exercício</button></div><datalist id="dmp-exercise-catalog">{exerciseCatalog.map(name=><option key={name} value={name}/>)}</datalist>{exercises.length?<div className="workout-table"><div className="workout-table-head"><span>#</span><span>Seq.</span><span>Exercício</span><span>Séries</span><span>Reps</span><span>Carga</span><span>Observação</span><span></span></div>{exercises.map((exercise,index)=><div className="workout-table-row" key={exercise.id}><strong>{index+1}</strong><input aria-label="Sequência" placeholder={sequenceBlockLabel(protocol,index,sequenceSize)||"—"} value={exercise.block||""} onChange={e=>updateExercise(exercise.id,{block:e.target.value})}/><input className="workout-exercise-name" list="dmp-exercise-catalog" placeholder="Exercício" value={exercise.name} onChange={e=>updateExercise(exercise.id,{name:e.target.value})}/><input placeholder="Séries" value={exercise.sets} onChange={e=>updateExercise(exercise.id,{sets:e.target.value})}/><input placeholder="Reps" value={exercise.reps} onChange={e=>updateExercise(exercise.id,{reps:e.target.value})}/><input placeholder="Carga" value={exercise.load} onChange={e=>updateExercise(exercise.id,{load:e.target.value})}/><input placeholder="Observação" value={exercise.notes||""} onChange={e=>updateExercise(exercise.id,{notes:e.target.value})}/><button className="danger-link workout-remove" onClick={()=>removeExercise(exercise.id)}>×</button></div>)}</div>:<div className="empty-review"><strong>Nenhum exercício ainda</strong><span>Toque em “+ Exercício” para começar a montar o Treino {slot}.</span></div>}{removedExercise?<div className="undo-strip"><span>Exercício removido.</span><button onClick={undoExerciseRemoval}>Desfazer</button></div>:null}<div className="workout-editor-footer"><button className="secondary" onClick={addExercise}>+ Adicionar exercício</button><button className="primary" disabled={!exercises.some(ex=>ex.name.trim())} onClick={save}>Salvar Treino {slot}</button></div></section>
  </section></main>;
}

function PlannedSession({student,workout,onBack,onSave}:{student:Student;workout:Workout|null;onBack:()=>void;onSave:(session:Session)=>void}) {
  const [exercises,setExercises]=useState<Exercise[]>((workout?.exercises||[]).map(ex=>({...ex,notes:ex.notes||""})));
  const [completed,setCompleted]=useState<Record<string,boolean>>(() => Object.fromEntries((workout?.exercises||[]).map(ex=>[ex.id,false])));
  const [notes,setNotes]=useState("");
  const [sessionDate,setSessionDate]=useState(today());
  const [lessonMode,setLessonMode]=useState(false);
  const [currentIndex,setCurrentIndex]=useState(0);
  const [startedAt]=useState(()=>new Date().toISOString());
  function updateExercise(id:string, patch:Partial<Exercise>){setExercises(current=>current.map(item=>item.id===id?{...item,...patch}:item));}
  function nextSessionBlock(){
    const numbers=exercises.map(ex=>Number((ex.block||"").match(/\d+/)?.[0]||0)).filter(Boolean);
    return `Bloco ${Math.max(0,...numbers)+1}`;
  }
  function addSessionExercise(block=""){
    const id=crypto.randomUUID();
    setExercises(current=>[...current,{id,block,name:"",sets:"3",reps:"12",load:"",notes:""}]);
    setCompleted(current=>({...current,[id]:false}));
  }
  function addSessionBlock(){addSessionExercise(nextSessionBlock());}
  function removeSessionExercise(id:string){
    const target=exercises.find(ex=>ex.id===id);
    if(!target)return;
    if(!confirm(`Excluir "${target.name||"este exercício"}" somente da sessão de hoje?`))return;
    setExercises(current=>current.filter(ex=>ex.id!==id));
    setCompleted(current=>{const next={...current};delete next[id];return next;});
    setCurrentIndex(current=>Math.max(0,Math.min(current,Math.max(0,exercises.length-2))));
  }
  function removeSessionBlock(block:string){
    const clean=block.trim();
    if(!clean)return;
    const group=exercises.filter(ex=>(ex.block||"").trim()===clean);
    if(!group.length)return;
    if(!confirm(`Excluir ${clean} inteiro (${group.length} exercício${group.length===1?"":"s"}) somente da sessão de hoje?`))return;
    const ids=new Set(group.map(ex=>ex.id));
    setExercises(current=>current.filter(ex=>!ids.has(ex.id)));
    setCompleted(current=>{const next={...current};ids.forEach(id=>delete next[id]);return next;});
    setCurrentIndex(0);
  }
  const completedCount=exercises.filter(ex=>completed[ex.id]).length;
  const currentExercise=exercises[currentIndex];
  const slot=workout?.slot||inferWorkoutSlot(workout,0);
  const protocol=workout?.protocol||"CONVENTIONAL";
  useEffect(()=>{
    const previousTitle=document.title;
    document.title=`${student.name} · Treino ${slot} · DMP`;
    return()=>{document.title=previousTitle;};
  },[student.name,slot]);

  if(lessonMode && currentExercise){
    const previous=findPreviousExercise(student,currentExercise.name);
    return <main className="app-page lesson-mode-page"><Header title={`${student.name} — Treino ${slot}`} back={()=>setLessonMode(false)} titleClassName="workout-student-header-title"/><section className="content lesson-mode-content"><div className="planned-student-identity"><span>ALUNO</span><strong>{student.name}</strong><small>Treino {slot}</small></div>
      {student.restrictions||student.injuries?<div className="session-alert"><strong>⚠ Atenção com {student.name}</strong><span>{[student.restrictions,student.injuries].filter(Boolean).join(" · ")}</span></div>:null}
      <div className="lesson-progress"><span>{workoutProtocolLabel(protocol)} · Exercício {currentIndex+1} de {exercises.length}</span><div><i style={{width:`${((currentIndex+1)/Math.max(1,exercises.length))*100}%`}}/></div></div>
      <article className="panel lesson-card"><div className="lesson-card-top"><span className="status-chip">{currentExercise.block||`#${currentIndex+1}`}</span><label className="exercise-check"><input type="checkbox" checked={completed[currentExercise.id]??true} onChange={e=>setCompleted(current=>({...current,[currentExercise.id]:e.target.checked}))}/><span>Realizado</span></label></div><h1>{currentExercise.name}</h1>{currentExercise.notes?<div className="planned-note">📌 {currentExercise.notes}</div>:null}{previous?<div className="previous-load"><span>Última execução</span><strong>{previous.sets&&previous.reps?`${previous.sets}×${previous.reps}`:""}{previous.load?` · ${previous.load}`:""}</strong><small>{formatDate(previous.date)}</small></div>:<div className="previous-load muted">Sem execução anterior encontrada.</div>}<div className="planned-fields lesson-fields"><label>Séries<input value={currentExercise.sets} onChange={e=>updateExercise(currentExercise.id,{sets:e.target.value})}/></label><label>Repetições<input value={currentExercise.reps} onChange={e=>updateExercise(currentExercise.id,{reps:e.target.value})}/></label><label>Carga<input value={currentExercise.load} onChange={e=>updateExercise(currentExercise.id,{load:e.target.value})}/></label></div><label className="lesson-exercise-note">Observação de hoje<input value={currentExercise.notes||""} onChange={e=>updateExercise(currentExercise.id,{notes:e.target.value})} placeholder="Ajuste feito hoje..."/></label><div className="lesson-actions"><button className="secondary" disabled={currentIndex===0} onClick={()=>setCurrentIndex(i=>Math.max(0,i-1))}>← Anterior</button><button className="primary" onClick={()=>{setCompleted(current=>({...current,[currentExercise.id]:true}));setCurrentIndex(i=>Math.min(exercises.length-1,i+1));}}>{currentIndex===exercises.length-1?"✓ Último exercício":"Concluir e próximo →"}</button></div></article>
      <button className="secondary" onClick={()=>setLessonMode(false)}>Voltar para ficha completa</button>
    </section></main>;
  }

  return <main className="app-page"><Header title={`${student.name} — Treino ${slot}`} back={onBack} titleClassName="workout-student-header-title"/><section className="content narrow"><div className="planned-student-identity"><span>ALUNO</span><strong>{student.name}</strong><small>Treino {slot}</small></div>
    {student.restrictions||student.injuries ? <div className="session-alert"><strong>⚠ Atenção com {student.name}</strong><span>{[student.restrictions,student.injuries].filter(Boolean).join(" · ")}</span></div> : null}<div className="session-mode-banner"><span>📋 Treino {slot} · {workoutProtocolLabel(protocol)}</span><strong>{workout?.name||`Treino ${slot}`}</strong><small>{completedCount}/{exercises.length} exercícios marcados{workout?.notes?` · ${workout.notes}`:""}</small><button className="secondary compact-button" disabled={!exercises.length} onClick={()=>setLessonMode(true)}>▶ Modo aula</button></div>
    <div className="hero-actions" style={{marginBottom:12}}><button type="button" className="secondary compact-button" onClick={()=>addSessionExercise(exercises[exercises.length-1]?.block||"")}>+ Exercício</button><button type="button" className="secondary compact-button" onClick={addSessionBlock}>+ Bloco</button><small className="muted">Só muda a sessão de hoje; a ficha original não é alterada.</small></div>
    <div className="session-list">{exercises.map((ex,index)=>{const previous=findPreviousExercise(student,ex.name);return <article className={`session-exercise planned-row ${completed[ex.id]?"is-done":""}`} key={ex.id}>
      <label className="exercise-check"><input type="checkbox" checked={completed[ex.id]??false} onChange={e=>setCompleted(current=>({...current,[ex.id]:e.target.checked}))}/><span>Feito</span></label>
      <div className="planned-exercise-main"><div className="planned-title-line"><input aria-label="Bloco" title="Altere para mover o exercício entre blocos" value={ex.block||""} onChange={e=>updateExercise(ex.id,{block:e.target.value})} placeholder="Bloco" style={{width:105,maxWidth:"28%",fontWeight:800}}/><input className="planned-name" value={ex.name} onChange={e=>updateExercise(ex.id,{name:e.target.value})}/></div>{ex.notes?<small className="planned-note-inline">📌 {ex.notes}</small>:null}{previous?<small className="last-load-inline">Última: {previous.sets&&previous.reps?`${previous.sets}×${previous.reps}`:""}{previous.load?` · ${previous.load}`:""} · {formatDate(previous.date)}</small>:null}<div className="planned-fields"><input placeholder="Séries" value={ex.sets} onChange={e=>updateExercise(ex.id,{sets:e.target.value})}/><input placeholder="Reps" value={ex.reps} onChange={e=>updateExercise(ex.id,{reps:e.target.value})}/><input placeholder="Carga" value={ex.load} onChange={e=>updateExercise(ex.id,{load:e.target.value})}/><input placeholder="Observação de hoje" value={ex.notes||""} onChange={e=>updateExercise(ex.id,{notes:e.target.value})}/></div><div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center",marginTop:8}}><button type="button" className="danger-link compact-button" onClick={()=>removeSessionExercise(ex.id)}>Excluir exercício</button>{ex.block&&exercises.findIndex(item=>(item.block||"").trim()===(ex.block||"").trim())===index?<button type="button" className="danger-link compact-button" onClick={()=>removeSessionBlock(ex.block||"")}>Excluir {ex.block}</button>:null}</div></div>
    </article>})}</div>
    {!exercises.length?<div className="empty-review"><strong>Sessão sem exercícios</strong><span>Use “+ Exercício” ou “+ Bloco” para montar o que será realizado hoje.</span></div>:null}
    <div className="panel form-stack"><label>Data<input type="date" value={sessionDate} onChange={e=>setSessionDate(e.target.value)}/></label><label>Alterações / observações<textarea rows={6} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Ex.: exercício substituído, carga alterada, bloco não realizado..."/></label><button className="primary finish-button" disabled={!exercises.some(ex=>ex.name.trim())} onClick={()=>onSave({id:crypto.randomUUID(),date:sessionDate,workoutName:workout?.name||`Treino ${slot}`,workoutId:workout?.id,notes,completedExercises:exercises.filter(ex=>ex.name.trim()),source:"PLANNED",startedAt,finishedAt:new Date().toISOString()})}>✓ Treino concluído — salvar no histórico</button></div>
  </section></main>;
}

function FreeSessionScreen({student,onBack,onSave}:{student:Student;onBack:()=>void;onSave:(session:Session)=>void}) {
  const [transcript,setTranscript]=useState("");
  const [focus,setFocus]=useState("Treino realizado");
  const [notes,setNotes]=useState("");
  const [sessionDate,setSessionDate]=useState(today());
  const [exercises,setExercises]=useState<Exercise[]>([]);
  const [listening,setListening]=useState(false);
  const [transcriptFromVoice,setTranscriptFromVoice]=useState(false);
  function organize(){
    const extracted=extractSessionFocus(transcript);
    if(extracted.focus)setFocus(extracted.focus);
    const protocol=detectWorkoutProtocol(extracted.text);
    let organized=organizeQuickTranscript(extracted.text);

    if(protocol==="B7"){
      organized=organized.map((exercise,index)=>({
        ...exercise,
        block:exercise.block?.trim() || `Bloco ${Math.floor(index/2)+1}`
      }));
    }

    setExercises(organized);
  }
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
        setTranscriptFromVoice(true);
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
    <article className="panel form-stack quick-register-panel">{student.restrictions ? <div className="session-alert"><strong>⚠ Atenção com {student.name}</strong><span>{student.restrictions}</span></div> : null}<div className="session-mode-banner free"><span>⚡ Sem precisar de ficha</span><strong>Registre depois da aula</strong><small>Fale ou escreva exatamente como você costuma me contar o treino.</small></div><label>Data<input type="date" value={sessionDate} onChange={e=>setSessionDate(e.target.value)}/></label><label>Nome / foco da sessão<input value={focus} onChange={e=>setFocus(e.target.value)} placeholder="Ex.: Peito + core, Full body, MMII..."/></label><label>O que foi feito<textarea rows={10} value={transcript} onChange={e=>{const next=e.target.value;if(!next.trim())setTranscriptFromVoice(false);setTranscript(next);}} placeholder={'Ex.: Bloco 1: supino reto 4x12 com 18 kg; agachamento goblet 4x15.\nBloco 2: remada baixa 4x12 45 kg; prancha até a falha.'}/></label><div className="hero-actions"><button className="secondary" onClick={listen}>{listening?"Ouvindo...":"🎤 Falar"}</button><button
  type="button"
  className="primary"
  onClick={()=>{
    if(listening){
      alert("Pare o microfone antes de organizar o treino.");
      return;
    }

    let organized:Exercise[]=[];

    if(transcriptFromVoice){
      const voiceResult=organizeQuickVoiceTranscript(transcript);
      if(voiceResult.focus)setFocus(voiceResult.focus);
      organized=voiceResult.exercises;
    }else{
      const extracted=extractSessionFocus(transcript);
      if(extracted.focus)setFocus(extracted.focus);
      organized=organizeQuickTranscript(extracted.text);
    }

    if(!organized.length){
      alert("Fale ou escreva o treino antes de organizar.");
      return;
    }

    setExercises(organized);
  }}
>
  Organizar para revisão
</button></div></article>
    <article className="panel"><div className="panel-head"><div><h2>Revise antes de salvar</h2><p className="muted">Você pode corrigir bloco, exercício, séries, repetições e carga.</p></div><button className="secondary" onClick={()=>setExercises(current=>[...current,{id:crypto.randomUUID(),block:"",name:"",sets:"",reps:"",load:""}])}>+ Exercício</button></div>{exercises.length? <div className="review-list">{exercises.map(ex=><div className="review-row enhanced" key={ex.id}><input placeholder="Bloco" value={ex.block||""} onChange={e=>updateExercise(ex.id,{block:e.target.value})}/><input className="review-name" placeholder="Exercício" value={ex.name} onChange={e=>updateExercise(ex.id,{name:e.target.value})}/><input placeholder="Séries" value={ex.sets} onChange={e=>updateExercise(ex.id,{sets:e.target.value})}/><input placeholder="Reps" value={ex.reps} onChange={e=>updateExercise(ex.id,{reps:e.target.value})}/><input placeholder="Carga" value={ex.load} onChange={e=>updateExercise(ex.id,{load:e.target.value})}/><button className="danger-link" onClick={()=>setExercises(current=>current.filter(item=>item.id!==ex.id))}>×</button></div>)}</div>:<div className="empty-review"><strong>Ainda não organizado</strong><span>Escreva ou fale o treino e toque em “Organizar para revisão”.</span></div>}<label className="form-stack">Observações / próximos ajustes<textarea rows={4} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Ex.: não fizemos bloco 4; trocar exercício no próximo treino..."/></label><button className="primary finish-button" disabled={!exercises.some(ex=>ex.name.trim())} onClick={()=>onSave({id:crypto.randomUUID(),date:sessionDate,workoutName:"Treino realizado",focus:focus&&focus!=="Treino realizado"?focus:"",notes,completedExercises:exercises.filter(ex=>ex.name.trim()),source:"FREE"})}>✓ Salvar no histórico</button></article>
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


type GalileuPdfImport = {
  date?:string; weight?:number; height?:number; bmi?:number; bodyFatPercent?:number; fatMass?:number;
  leanMass?:number; leanMassPercent?:number; waterPercent?:number; totalBodyWaterLiters?:number;
  hydrationIndex?:number; waterLeanPercent?:number; intracellularWaterLiters?:number;
  extracellularWaterLiters?:number; intracellularWaterPercent?:number; muscleMass?:number;
  muscleMassPercent?:number; muscleFatRatio?:number; basalMetabolicRate?:number; phaseAngle?:number; cellularAge?:number;
};
function ocrNumber(value:string|undefined|null){if(!value)return undefined;const cleaned=value.replace(/\s/g,"").replace(/\.(?=\d{3}(?:\D|$))/g,"").replace(",",".").replace(/[^0-9.-]/g,"");const number=Number(cleaned);return Number.isFinite(number)?number:undefined;}
function parseGalileuStructuredText(raw:string):GalileuPdfImport{
  const text=raw.normalize("NFD").replace(/[\u0300-\u036f]/g,"");
  const pick=(labels:string[])=>{
    for(const label of labels){
      const regex=new RegExp(`^\\s*${label}\\s*:\\s*([\\d.,]+)`,"im");
      const value=ocrNumber(text.match(regex)?.[1]);
      if(value!==undefined)return value;
    }
    return undefined;
  };
  const dateMatch=text.match(/^\s*Data\s*:\s*(\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2})/im);
  const date=dateMatch?(dateMatch[1].includes("/")?dateMatch[1].split("/").reverse().join("-"):dateMatch[1]):undefined;
  return{
    date,
    weight:pick(["Peso"]),
    height:pick(["Altura"]),
    bmi:pick(["IMC"]),
    bodyFatPercent:pick(["Gordura corporal","Percentual de gordura","Gordura %"]),
    fatMass:pick(["Massa de gordura","Massa gorda"]),
    leanMass:pick(["Massa magra kg","Massa magra \\(kg\\)"]),
    leanMassPercent:pick(["Massa magra %","Massa magra percentual"]),
    waterPercent:pick(["Agua corporal %","Agua corporal percentual"]),
    totalBodyWaterLiters:pick(["Agua corporal total","Agua corporal total L"]),
    hydrationIndex:pick(["Indice de hidratacao"]),
    waterLeanPercent:pick(["Agua na massa magra","Agua na massa magra %"]),
    intracellularWaterLiters:pick(["Agua intracelular L","Agua intracelular \\(L\\)"]),
    extracellularWaterLiters:pick(["Agua extracelular L","Agua extracelular \\(L\\)"]),
    intracellularWaterPercent:pick(["Agua intracelular %","Agua intracelular percentual"]),
    muscleMass:pick(["Massa muscular kg","Massa muscular \\(kg\\)"]),
    muscleMassPercent:pick(["Massa muscular %","Massa muscular percentual"]),
    muscleFatRatio:pick(["Relacao musculo/gordura","Razao musculo/gordura"]),
    basalMetabolicRate:pick(["TMB","Metabolismo basal","Taxa metabolica basal"]),
    phaseAngle:pick(["Angulo de fase"]),
    cellularAge:pick(["Idade celular"])
  };
}
function parseGalileuPdfText(raw:string):GalileuPdfImport{
  const text=raw.normalize("NFD").replace(/[\u0300-\u036f]/g,"");
  const pick=(regex:RegExp,index=1)=>ocrNumber(text.match(regex)?.[index]);
  const dateMatch=text.match(/(\d{2}\/\d{2}\/\d{4})\s+(?:as|às)/i);
  const date=dateMatch?dateMatch[1].split("/").reverse().join("-"):undefined;
  const weight=pick(/Peso:\s*(\d+[.,]\d+)\s*kg/i) ?? pick(/(\d+[.,]\d+)\s*kg\s*$/im);
  const height=pick(/Altura:\s*(\d+[.,]?\d*)\s*cm/i);
  const hydrationSequence=text.match(/Massa Gorda[\s\S]{0,500}?(\d+[.,]\d+)\s*Kg\s+(\d+[.,]\d+)\s*%\s+(\d+[.,]\d+)\s*litros\s*\/\s*(\d+[.,]\d+)[\s\S]{0,100}?(\d+[.,]\d+)\s*(?:litros|iitros)\s+(\d+[.,]\d+)\s*%\s+(\d+[.,]\d+)\s*litros/i);
  const fatMass=ocrNumber(hydrationSequence?.[1])??pick(/Massa Gorda[\s\S]{0,520}?(\d+[.,]\d+)\s*Kg/i);
  const bodyFatPercent=ocrNumber(hydrationSequence?.[2])??pick(/%\s*Gordura[\s\S]{0,520}?(\d+[.,]\d+)\s*%/i);
  const totalBodyWaterLiters=ocrNumber(hydrationSequence?.[3]);
  const hydrationIndex=ocrNumber(hydrationSequence?.[4]);
  const intracellularWaterLiters=ocrNumber(hydrationSequence?.[5]);
  const intracellularWaterPercent=ocrNumber(hydrationSequence?.[6]);
  const extracellularWaterLiters=ocrNumber(hydrationSequence?.[7]);
  const muscleSequence=text.match(/Massa Magra e Muscular[\s\S]{0,900}?(\d+[.,]\d+)\s*Kg[\s\S]{0,150}?(\d+[.,]\d+)\s*Kg\s*\/\s*(\d+[.,]\d+)/i);
  let leanMass=ocrNumber(muscleSequence?.[1]);
  let leanMassPercent=bodyFatPercent!==undefined?100-bodyFatPercent:undefined;
  if(leanMass===undefined&&weight!==undefined&&fatMass!==undefined)leanMass=weight-fatMass;
  const muscleMass=ocrNumber(muscleSequence?.[2]);
  const muscleMassPercent=ocrNumber(muscleSequence?.[3]);
  let waterPercent=totalBodyWaterLiters!==undefined&&weight?totalBodyWaterLiters/weight*100:undefined;
  let waterLeanPercent=totalBodyWaterLiters!==undefined&&leanMass?totalBodyWaterLiters/leanMass*100:undefined;
  const muscleFatRatio=pick(/Razao Musculo[\s\S]{0,620}?(\d+[.,]\d+)\s*kg\s*musculo/i);
  const bmi=pick(/IMC[\s\S]{0,520}?(\d+[.,]\d+)\s*Kg\/m/i);
  const basalMetabolicRate=pick(/Taxa Metabolica[\s\S]{0,900}?(\d{1,2}[.]?\d{3})\s*kca[il]/i);
  const phaseAngle=pick(/Angulo de Fase[\s\S]{0,620}?(\d+[.,]\d+)\s*graus/i);
  const cellularAge=pick(/Idade Celular[\s\S]{0,420}?(\d{1,3})\s*anos/i);
  return{date,weight,height,bmi,bodyFatPercent,fatMass,leanMass,leanMassPercent,waterPercent,totalBodyWaterLiters,hydrationIndex,waterLeanPercent,intracellularWaterLiters,extracellularWaterLiters,intracellularWaterPercent,muscleMass,muscleMassPercent,muscleFatRatio,basalMetabolicRate,phaseAngle,cellularAge};
}
async function readGalileuPdf(file:File):Promise<GalileuPdfImport>{
  const pdfjs=await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc=new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs",import.meta.url).toString();
  const document=await pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;
  const page=await document.getPage(1);
  const content=await page.getTextContent();
  const pdfText=content.items.map((item:any)=>"str" in item?item.str:"").join(" ");
  const viewport=page.getViewport({scale:2});
  const canvas=document.createElement("canvas");
  canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
  const context=canvas.getContext("2d");if(!context)throw new Error("canvas_failed");
  await page.render({canvasContext:context,viewport}).promise;
  const {createWorker}=await import("tesseract.js");
  const worker=await createWorker("por");
  try{
    const result=await worker.recognize(canvas);
    return parseGalileuPdfText(`${pdfText}\n${result.data.text||""}`);
  }finally{await worker.terminate();}
}

function AssessmentForm({onClose,onSave}:{onClose:()=>void;onSave:(assessment:Assessment)=>void}) {
  const [values,setValues]=useState<any>({date:today(),weight:"",height:"",bodyFatPercent:"",fatMass:"",leanMass:"",leanMassPercent:"",bmi:"",waterPercent:"",muscleMass:"",muscleMassPercent:"",basalMetabolicRate:"",phaseAngle:"",visceralFat:"",bodyCellMass:"",hydrationIndex:"",totalBodyWaterLiters:"",waterLeanPercent:"",intracellularWaterLiters:"",extracellularWaterLiters:"",intracellularWaterPercent:"",muscleFatRatio:"",cellularAge:"",sourceUrl:"",sourceFileName:"",notes:"",measurements:{},photos:[]});
  const [pdfImporting,setPdfImporting]=useState(false);const [pdfImportMessage,setPdfImportMessage]=useState("");
  const [assessmentText,setAssessmentText]=useState("");const [assessmentTextMessage,setAssessmentTextMessage]=useState("");
  const measurementFields:[string,string][]=["neck","shoulders","chest","waist","abdomen","hips","rightArm","leftArm","rightForearm","leftForearm","rightThigh","leftThigh","rightCalf","leftCalf"].map(key=>[key,MEASUREMENT_LABELS[key]]);
  async function photos(files:FileList|null){if(!files)return;const selected=Array.from(files).slice(0,4);const urls=await Promise.all(selected.map(file=>fileToDataUrl(file)));setValues((current:any)=>({...current,photos:[...current.photos,...urls].slice(0,4)}));}
  async function importPdf(files:FileList|null){const file=files?.[0];if(!file)return;if(!file.name.toLowerCase().endsWith(".pdf")){setPdfImportMessage("Selecione um PDF do Galileu.");return;}setPdfImporting(true);setPdfImportMessage("Enviando o PDF para leitura…");try{const form=new FormData();form.append("file",file);const response=await fetch("/api/assessments/import-pdf",{method:"POST",body:form});const result=await response.json();if(!response.ok)throw new Error(result?.message||"pdf_import_failed");const data=result?.data||{};const entries=Object.entries(data).filter(([,value])=>value!==undefined&&value!==null);setValues((current:any)=>{const next={...current,sourceFileName:result?.fileName||file.name};for(const [key,value] of entries)next[key]=typeof value==="number"?String(Math.round(value*10)/10):value;return next;});setPdfImportMessage(`${result?.identified??entries.length} dados identificados no PDF. Revise os campos abaixo antes de salvar.`);}catch(error){console.error(error);setPdfImportMessage(error instanceof Error?error.message:"Não consegui ler este PDF automaticamente.");}finally{setPdfImporting(false);}}
  function organizeAssessmentText(){
    if(!assessmentText.trim()){setAssessmentTextMessage("Cole os dados da avaliação antes de organizar.");return;}
    const data=parseGalileuStructuredText(assessmentText);
    const entries=Object.entries(data).filter(([,value])=>value!==undefined&&value!==null);
    if(!entries.length){setAssessmentTextMessage("Não encontrei dados reconhecíveis nesse texto.");return;}
    setValues((current:any)=>{
      const next={...current};
      for(const [key,value] of entries)next[key]=typeof value==="number"?String(Math.round(value*10)/10):value;
      return next;
    });
    setAssessmentTextMessage(`${entries.length} dados organizados. Revise os campos abaixo antes de salvar.`);
  }
  const calculatedLeanPercent=values.leanMass&&values.weight?Number(values.leanMass)/Number(values.weight)*100:null;
  const calculatedBmi=values.weight&&values.height?Number(values.weight)/Math.pow(Number(values.height)>3?Number(values.height)/100:Number(values.height),2):null;
  return <div className="modal-backdrop"><section className="modal assessment-modal"><div className="modal-head"><div><h2>Nova avaliação</h2><p className="muted">Cole os dados da avaliação, organize automaticamente e revise antes de salvar.</p></div><button className="text-button" onClick={onClose}>Fechar</button></div><div className="assessment-pdf-box assessment-text-import"><div><strong>Importar avaliação por texto</strong><small>Cole abaixo os dados organizados da avaliação e o DMP preencherá os campos automaticamente para você revisar.</small></div><textarea rows={10} value={assessmentText} onChange={e=>setAssessmentText(e.target.value)} placeholder={"Cole aqui os dados da avaliação\n\nEx.: Peso: 60,5 kg\nMassa magra kg: 43,5\nMassa magra %: 71,8\nÂngulo de fase: 6,5"}></textarea><button type="button" className="primary" onClick={organizeAssessmentText}>Organizar dados</button>{assessmentTextMessage?<p>{assessmentTextMessage}</p>:null}</div><div className="assessment-form-section"><h3>Composição corporal</h3><div className="form-grid"><label>Data<input type="date" value={values.date} onChange={e=>setValues({...values,date:e.target.value})}/></label><label>Peso (kg)<input type="number" step="0.1" value={values.weight} onChange={e=>setValues({...values,weight:e.target.value})}/></label><label>Altura (cm)<input type="number" step="0.1" value={values.height} onChange={e=>setValues({...values,height:e.target.value})}/></label><label>IMC<input type="number" step="0.1" value={values.bmi} onChange={e=>setValues({...values,bmi:e.target.value})} placeholder={calculatedBmi?calculatedBmi.toFixed(1):"Calculado se vazio"}/></label><label>Gordura corporal (%)<input type="number" step="0.1" value={values.bodyFatPercent} onChange={e=>setValues({...values,bodyFatPercent:e.target.value})}/></label><label>Massa de gordura (kg)<input type="number" step="0.1" value={values.fatMass} onChange={e=>setValues({...values,fatMass:e.target.value})}/></label><label>Massa magra (kg)<input type="number" step="0.1" value={values.leanMass} onChange={e=>setValues({...values,leanMass:e.target.value})}/></label><label>Massa magra (%)<input type="number" step="0.1" value={values.leanMassPercent} onChange={e=>setValues({...values,leanMassPercent:e.target.value})} placeholder={calculatedLeanPercent?calculatedLeanPercent.toFixed(1):"Calculado se vazio"}/></label><label>Água corporal (%)<input type="number" step="0.1" value={values.waterPercent} onChange={e=>setValues({...values,waterPercent:e.target.value})}/></label><label>Água corporal total (L)<input type="number" step="0.1" value={values.totalBodyWaterLiters} onChange={e=>setValues({...values,totalBodyWaterLiters:e.target.value})}/></label><label>Índice de hidratação<input type="number" step="0.1" value={values.hydrationIndex} onChange={e=>setValues({...values,hydrationIndex:e.target.value})}/></label><label>Água na massa magra (%)<input type="number" step="0.1" value={values.waterLeanPercent} onChange={e=>setValues({...values,waterLeanPercent:e.target.value})}/></label><label>Água intracelular (L)<input type="number" step="0.1" value={values.intracellularWaterLiters} onChange={e=>setValues({...values,intracellularWaterLiters:e.target.value})}/></label><label>Água extracelular (L)<input type="number" step="0.1" value={values.extracellularWaterLiters} onChange={e=>setValues({...values,extracellularWaterLiters:e.target.value})}/></label><label>Água intracelular (%)<input type="number" step="0.1" value={values.intracellularWaterPercent} onChange={e=>setValues({...values,intracellularWaterPercent:e.target.value})}/></label><label>Massa muscular (kg)<input type="number" step="0.1" value={values.muscleMass} onChange={e=>setValues({...values,muscleMass:e.target.value})}/></label><label>Massa muscular (%)<input type="number" step="0.1" value={values.muscleMassPercent} onChange={e=>setValues({...values,muscleMassPercent:e.target.value})}/></label><label>Razão músculo/gordura<input type="number" step="0.1" value={values.muscleFatRatio} onChange={e=>setValues({...values,muscleFatRatio:e.target.value})}/></label><label>Metabolismo basal (kcal)<input type="number" step="1" value={values.basalMetabolicRate} onChange={e=>setValues({...values,basalMetabolicRate:e.target.value})}/></label><label>Ângulo de fase (°)<input type="number" step="0.1" value={values.phaseAngle} onChange={e=>setValues({...values,phaseAngle:e.target.value})}/></label><label>Idade celular<input type="number" step="1" value={values.cellularAge} onChange={e=>setValues({...values,cellularAge:e.target.value})}/></label><label>Gordura visceral<input type="number" step="0.1" value={values.visceralFat} onChange={e=>setValues({...values,visceralFat:e.target.value})}/></label><label>Massa celular (kg)<input type="number" step="0.1" value={values.bodyCellMass} onChange={e=>setValues({...values,bodyCellMass:e.target.value})}/></label></div></div><div className="assessment-form-section"><h3>Perimetria</h3><div className="form-grid">{measurementFields.map(([key,label])=><label key={key}>{label} (cm)<input type="number" step="0.1" value={values.measurements[key]||""} onChange={e=>setValues({...values,measurements:{...values.measurements,[key]:e.target.value}})}/></label>)}</div></div><div className="assessment-form-section"><h3>Registro complementar</h3><div className="form-grid"><label className="full">Link da avaliação / Galileu<input type="url" value={values.sourceUrl} onChange={e=>setValues({...values,sourceUrl:e.target.value})} placeholder="Opcional: cole aqui o endereço da página da avaliação"/></label>{values.sourceFileName?<div className="full assessment-source-file"><strong>PDF importado:</strong> {values.sourceFileName}</div>:null}<label className="full">Fotos / relatório<input type="file" accept="image/*" multiple onChange={e=>photos(e.target.files)}/><small>Até 4 imagens. Revise antes de salvar.</small></label><label className="full">Observações<textarea rows={4} value={values.notes} onChange={e=>setValues({...values,notes:e.target.value})}/></label><button className="primary full" disabled={pdfImporting} onClick={()=>onSave({id:crypto.randomUUID(),date:values.date,weight:num(values.weight),height:num(values.height),bodyFatPercent:num(values.bodyFatPercent),fatMass:num(values.fatMass),leanMass:num(values.leanMass),leanMassPercent:num(values.leanMassPercent),bmi:num(values.bmi),waterPercent:num(values.waterPercent),muscleMass:num(values.muscleMass),muscleMassPercent:num(values.muscleMassPercent),basalMetabolicRate:num(values.basalMetabolicRate),phaseAngle:num(values.phaseAngle),visceralFat:num(values.visceralFat),bodyCellMass:num(values.bodyCellMass),hydrationIndex:num(values.hydrationIndex),totalBodyWaterLiters:num(values.totalBodyWaterLiters),waterLeanPercent:num(values.waterLeanPercent),intracellularWaterLiters:num(values.intracellularWaterLiters),extracellularWaterLiters:num(values.extracellularWaterLiters),intracellularWaterPercent:num(values.intracellularWaterPercent),muscleFatRatio:num(values.muscleFatRatio),cellularAge:num(values.cellularAge),sourceUrl:values.sourceUrl.trim(),sourceFileName:values.sourceFileName,measurements:values.measurements,notes:values.notes,photos:values.photos})}>Salvar avaliação</button></div></div></section></div>;
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

function studentWorkoutSequence(student:Student,entries:{workout:Workout;slot:WorkoutSlot}[]){
  if(!entries.length)return {last:null as {workout:Workout;slot:WorkoutSlot}|null,suggested:null as {workout:Workout;slot:WorkoutSlot}|null};
  const planned=student.sessions.filter(session=>session.source==="PLANNED").slice().sort((a,b)=>
    (b.finishedAt||b.startedAt||`${b.date}T12:00:00`).localeCompare(a.finishedAt||a.startedAt||`${a.date}T12:00:00`)
  );
  let last:{workout:Workout;slot:WorkoutSlot}|null=null;
  for(const session of planned){
    const match=entries.find(entry=>
      (session.workoutId&&session.workoutId===entry.workout.id)||
      (!session.workoutId&&(normalizeName(session.workoutName)===normalizeName(entry.workout.name)||normalizeName(session.workoutName)===normalizeName(`Treino ${entry.slot}`)))
    );
    if(match){last=match;break;}
  }
  if(!last)return {last:null,suggested:entries[0]};
  const index=entries.findIndex(entry=>entry.workout.id===last?.workout.id);
  return {last,suggested:entries[(index+1)%entries.length]||entries[0]};
}

type WorkoutValidityStatus="NONE"|"ACTIVE"|"RENEW"|"EXPIRED";

function workoutValidityInfo(student:Student,workout:Workout){
  const mode=workout.validityMode||"NONE";
  const start=workout.validityStartDate||"";

  if(mode==="NONE"){
    return {status:"NONE" as WorkoutValidityStatus,label:"Sem controle",remaining:null as number|null,endDate:"",completed:0};
  }

  if(mode==="PERIOD"){
    const weeks=Math.max(1,workout.validityWeeks||1);
    if(!start)return {status:"NONE" as WorkoutValidityStatus,label:"Sem data de início",remaining:null as number|null,endDate:"",completed:0};
    const end=new Date(start+"T12:00:00");
    end.setDate(end.getDate()+(weeks*7)-1);
    const current=new Date(today()+"T12:00:00");
    const daysLeft=Math.ceil((end.getTime()-current.getTime())/86400000);
    const endDate=end.toISOString().slice(0,10);
    if(daysLeft<0)return {status:"EXPIRED" as WorkoutValidityStatus,label:"Vencido",remaining:0,endDate,completed:0};
    if(daysLeft<=6)return {status:"RENEW" as WorkoutValidityStatus,label:"Última semana",remaining:daysLeft+1,endDate,completed:0};
    return {status:"ACTIVE" as WorkoutValidityStatus,label:"Em andamento",remaining:daysLeft+1,endDate,completed:0};
  }

  const target=Math.max(1,workout.validitySessionTarget||1);
  const completed=student.sessions.filter(session=>{
    if(session.source!=="PLANNED")return false;
    if(session.workoutId)return session.workoutId===workout.id;
    return session.workoutName===workout.name&&(!start||session.date>=start);
  }).length;
  const remaining=Math.max(0,target-completed);
  if(remaining===0)return {status:"EXPIRED" as WorkoutValidityStatus,label:"Vencido",remaining,endDate:"",completed};
  if(remaining<=2)return {status:"RENEW" as WorkoutValidityStatus,label:"Faltam "+remaining+" sessão"+(remaining===1?"":"ões"),remaining,endDate:"",completed};
  return {status:"ACTIVE" as WorkoutValidityStatus,label:"Em andamento",remaining,endDate:"",completed};
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
  const whatsappUrl=whatsappLink(student.phone)||"";
  (window as any).__dmpShareWorkout={student,workout};
  (window as any).downloadWorkoutJpgFromShare=()=>downloadWorkoutJpg(student,workout);
  (window as any).generateWorkoutJpgFromShare=()=>downloadWorkoutJpg(student,workout,true);
  popup.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(student.name)} - ${esc(workout.name)}</title><style>body{font-family:Arial,sans-serif;margin:0;background:#f4f7ee;color:#25272c}.sheet{max-width:760px;margin:24px auto;background:#fff;padding:34px;border-radius:18px}.head{display:flex;align-items:center;justify-content:space-between;gap:18px;border-bottom:3px solid #a8c93b;padding-bottom:18px}.head img{width:150px;height:82px;object-fit:contain;object-position:right center}.head h1{margin:0}.head p{margin:6px 0 0}.meta{display:flex;gap:12px;flex-wrap:wrap;margin:18px 0}.meta span{background:#eef4df;padding:8px 12px;border-radius:999px}.workout-notes{margin:18px 0;padding:15px 17px;border-radius:12px;background:#f5f8ed;border-left:5px solid #a8c93b}.workout-notes p{margin:6px 0 0;white-space:pre-wrap}section{margin:22px 0}h3{border-left:5px solid #a8c93b;padding-left:10px}.exercise{display:grid;grid-template-columns:1fr auto;gap:5px 16px;padding:11px 0;border-bottom:1px solid #e3e8d8}.exercise small{grid-column:1/-1;color:#707781}.actions{display:flex;gap:10px;margin:20px auto;max-width:760px}.actions button{padding:12px 16px;border:0;border-radius:10px;cursor:pointer}.primary{background:#a8c93b;font-weight:700}@media print{body{background:#fff}.actions{display:none}.sheet{margin:0;max-width:none;box-shadow:none}}</style></head><body><div class="actions"><button class="primary" onclick="window.print()">Salvar / imprimir PDF</button><button onclick="window.opener.downloadWorkoutJpgFromShare && window.opener.downloadWorkoutJpgFromShare()">Salvar como JPG</button><button onclick="sendWorkoutToWhatsappFromPreview()">Enviar pelo WhatsApp</button><button onclick="window.close()">Fechar prévia</button></div><main class="sheet"><div class="head"><div><h1>${esc(student.name)}</h1><p>${esc(workout.name||`Treino ${workout.slot||""}`)}</p></div><img src="${location.origin}/logo-danilo.jpg" alt="Danilo Modesto Personal"></div><div class="meta"><span>Treino ${esc(workout.slot||"—")}</span><span>${esc(workoutProtocolLabel(workout.protocol||"CONVENTIONAL"))}</span><span>${date}</span></div>${workoutNotes}${blocks}</main><script>async function sendWorkoutToWhatsappFromPreview(){  const whatsappUrl=${JSON.stringify(whatsappUrl)};  if(!whatsappUrl){alert("Cadastre um telefone valido para o aluno antes de enviar pelo WhatsApp.");return;}  try{    const blobs=await window.opener.generateWorkoutJpgFromShare();    if(!blobs||!blobs.length)throw new Error("image_generation_failed");    const files=blobs.map((blob,index)=>new File([blob],"treino_"+(index+1)+".jpg",{type:"image/jpeg"}));    if(navigator.maxTouchPoints>0&&navigator.share&&navigator.canShare&&navigator.canShare({files})){      await navigator.share({files,title:"Treino DMP"});      return;    }    if(!navigator.clipboard||typeof ClipboardItem==="undefined")throw new Error("clipboard_not_supported");    const images=await Promise.all(blobs.map(blob=>createImageBitmap(blob)));    const canvas=document.createElement("canvas");    canvas.width=Math.max(...images.map(image=>image.width));    canvas.height=images.reduce((total,image)=>total+image.height,0);    const ctx=canvas.getContext("2d");    if(!ctx)throw new Error("canvas_context_failed");    ctx.fillStyle="#ffffff";ctx.fillRect(0,0,canvas.width,canvas.height);    let y=0;for(const image of images){ctx.drawImage(image,0,y);y+=image.height;}    const pngBlob=await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error("png_generation_failed")),"image/png"));    await navigator.clipboard.write([new ClipboardItem({"image/png":pngBlob})]);    alert("Treino copiado. O WhatsApp do aluno sera aberto agora. Na conversa, pressione Ctrl+V e envie.");    window.location.href=whatsappUrl;  }catch(error){    console.error(error);    alert("O navegador nao permitiu o compartilhamento automatico. O WhatsApp sera aberto; se necessario, use Salvar como JPG como alternativa.");    window.location.href=whatsappUrl;  }}</script></body></html>`);
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
  const base=cleanExerciseCatalogName(value.replace(/\s+/g," ").trim());
  // Se um histórico antigo juntou dois exercícios, transforma em duas sugestões.
  return base.split(/\s+(?:\+|&|e)\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ])/).map(cleanExerciseCatalogName).filter(Boolean);
}
function buildExerciseCatalog(students:Student[],templates:PersonalWorkoutTemplate[]=[]){
  const names=new Map<string,string>();
  const addName=(value:string)=>{
    for(const cleanName of splitExerciseCatalogNames(value)){
      const key=normalizeName(cleanName);
      if(key&&!names.has(key))names.set(key,cleanName);
    }
  };
  for(const student of students){
    // O catálogo deve refletir exercícios prescritos, não transcrições do histórico de aulas.
    // Isso evita sugestões duplicadas com séries, repetições ou cargas gravadas no nome.
    for(const workout of student.workouts)for(const exercise of workout.exercises)addName(exercise.name);
  }
  for(const template of templates)for(const exercise of template.exercises)addName(exercise.name);
  return [...names.values()].sort((a,b)=>a.localeCompare(b,"pt-BR"));
}

function detectWorkoutProtocol(text:string):WorkoutProtocol|null{const v=normalizeName(text);if(/\bb7\b/.test(v))return"B7";if(/\btri set\b|\btriset\b/.test(v))return"TRISET";if(/\bbi set\b|\bbiset\b/.test(v))return"BISET";if(/\bcircuito\b/.test(v))return"CIRCUIT";if(/\bpersonalizado\b|\bmisto\b/.test(v))return"MIXED";if(/\bconvencional\b/.test(v))return"CONVENTIONAL";return null;}
async function downloadWorkoutJpg(student:Student,workout:Workout,collectOnly=false){
  const W=1240,H=1754,margin=90; const groups=new Map<string,Exercise[]>();
  workout.exercises.forEach((ex,index)=>{const block=ex.block?.trim()||sequenceBlockLabel(workout.protocol||"CONVENTIONAL",index,workout.sequenceSize||defaultSequenceSize(workout.protocol||"CONVENTIONAL"))||"Sequência";groups.set(block,[...(groups.get(block)||[]),ex]);});
  const logo=await loadCanvasImage("/logo-danilo.jpg").catch(()=>null);
  const rows:[string,Exercise[]][]=[...groups.entries()]; let page=1, y=0; let canvas!:HTMLCanvasElement; let ctx!:CanvasRenderingContext2D; const generatedBlobs:Blob[]=[];
  const wrapped=(text:string,x:number,startY:number,maxWidth:number,lineHeight:number,maxLines=3)=>{const words=text.replace(/\s+/g," ").trim().split(" ");let current="",lineIndex=0;for(const word of words){const candidate=current?`${current} ${word}`:word;if(ctx.measureText(candidate).width<=maxWidth){current=candidate;continue;}if(current){ctx.fillText(current,x,startY+lineIndex*lineHeight);lineIndex++;if(lineIndex>=maxLines)return startY+lineIndex*lineHeight;}current=word;}if(current&&lineIndex<maxLines){ctx.fillText(current,x,startY+lineIndex*lineHeight);lineIndex++;}return startY+lineIndex*lineHeight;};
  const newPage=()=>{canvas=document.createElement("canvas");canvas.width=W;canvas.height=H;ctx=canvas.getContext("2d")!;ctx.fillStyle="#ffffff";ctx.fillRect(0,0,W,H);ctx.fillStyle="#25272c";ctx.font="700 42px Arial";ctx.fillText(student.name,margin,105);ctx.font="27px Arial";ctx.fillStyle="#555d63";ctx.fillText(workout.name||`Treino ${workout.slot||""}`,margin,145);if(logo){const maxW=250,maxH=105,scale=Math.min(maxW/logo.width,maxH/logo.height);ctx.drawImage(logo,W-margin-logo.width*scale,55,logo.width*scale,logo.height*scale);}ctx.fillStyle="#a8c93b";ctx.fillRect(margin,182,W-margin*2,6);ctx.fillStyle="#25272c";ctx.font="22px Arial";ctx.fillText(`Treino ${workout.slot||"—"} · ${workoutProtocolLabel(workout.protocol||"CONVENTIONAL")} · ${new Date().toLocaleDateString("pt-BR")} · página ${page}`,margin,224);y=275;if(page===1&&workout.notes?.trim()){ctx.fillStyle="#f4f7ec";ctx.fillRect(margin,y-15,W-margin*2,105);ctx.fillStyle="#60752c";ctx.font="700 20px Arial";ctx.fillText("ORIENTAÇÕES DO TREINO",margin+20,y+14);ctx.fillStyle="#444a50";ctx.font="20px Arial";y=wrapped(workout.notes.trim(),margin+20,y+45,W-margin*2-40,26,2)+35;}};
  const savePage=(last=false)=>new Promise<void>(resolve=>{const output=document.createElement("canvas");output.width=W;output.height=last?Math.min(H,Math.max(720,y+95)):H;const outputCtx=output.getContext("2d")!;outputCtx.fillStyle="#ffffff";outputCtx.fillRect(0,0,output.width,output.height);outputCtx.drawImage(canvas,0,0);outputCtx.fillStyle="#77806d";outputCtx.font="18px Arial";outputCtx.fillText("Danilo Modesto Personal · ficha de treino",margin,output.height-34);output.toBlob(blob=>{if(blob){if(collectOnly){generatedBlobs.push(blob);}else{const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`${safeFileName(student.name)}_${safeFileName(workout.name||`Treino_${workout.slot||""}`)}_${page}.jpg`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}}resolve();},"image/jpeg",0.94);});
  newPage();
  for(const [block,items] of rows){const needed=75+items.reduce((total,ex)=>total+(ex.notes?106:78),0);if(y+needed>H-100){await savePage();page++;newPage();}ctx.fillStyle="#eef4df";ctx.fillRect(margin,y-32,W-margin*2,50);ctx.fillStyle="#a8c93b";ctx.fillRect(margin,y-32,8,50);ctx.fillStyle="#25272c";ctx.font="700 28px Arial";ctx.fillText(block,margin+24,y);y+=58;for(const ex of items){ctx.font="700 24px Arial";ctx.fillStyle="#25272c";wrapped(ex.name,margin,y,W-margin*2-310,29,2);ctx.font="22px Arial";const prescription=[ex.sets&&ex.reps?`${ex.sets} × ${ex.reps}`:"",ex.load].filter(Boolean).join(" · ");ctx.fillText(prescription,W-margin-ctx.measureText(prescription).width,y);if(ex.notes){ctx.font="19px Arial";ctx.fillStyle="#707781";wrapped(ex.notes,margin,y+32,W-margin*2,25,2);ctx.fillStyle="#25272c";y+=106;}else y+=78;ctx.strokeStyle="#e5e9df";ctx.beginPath();ctx.moveTo(margin,y-18);ctx.lineTo(W-margin,y-18);ctx.stroke();}}
  await savePage(true);
  return generatedBlobs;
}
function loadCanvasImage(src:string){return new Promise<HTMLImageElement>((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error("image_load_failed"));image.src=src;});}
function safeFileName(value:string){return normalizeName(value).replace(/\s+/g,"_")||"treino";}

function isBirthdayToday(value:string){if(!value)return false;const [y,m,d]=value.split("-").map(Number);const now=new Date();return m===now.getMonth()+1&&d===now.getDate();}
function assessmentDue(student:Student){const last=student.assessments[0];if(!last)return true;const date=new Date(`${last.date}T12:00:00`);return Date.now()-date.getTime()>1000*60*60*24*90;}
function downloadText(filename:string,content:string,type:string){const blob=new Blob([content],{type});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=filename;a.click();URL.revokeObjectURL(url);}

function findPreviousExercise(student:Student,name:string){
  const target=normalizeName(name);
  const sessions=[...student.sessions].sort((a,b)=>b.date.localeCompare(a.date));
  for(const session of sessions){
    const found=session.completedExercises.find(ex=>normalizeName(ex.name)===target);
    if(found)return {...found,date:session.date};
  }
  return null;
}
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
function dateOffset(value:string,days:number){const date=new Date(`${value}T12:00:00`);date.setDate(date.getDate()+days);return localDateKey(date);}
function isoToLocalInput(value?:string){if(!value)return"";const date=new Date(value);if(Number.isNaN(date.getTime()))return"";const local=new Date(date.getTime()-date.getTimezoneOffset()*60000);return local.toISOString().slice(0,16);}
function localInputToIso(value:string){return value?new Date(value).toISOString():undefined;}
function saoPauloDateFromIso(value:string){return new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(value));}
function sameSaoPauloDate(a:string,b:string){try{return saoPauloDateFromIso(a)===saoPauloDateFromIso(b);}catch{return false;}}
function isSundayInSaoPaulo(){const label=new Intl.DateTimeFormat("en-US",{timeZone:"America/Sao_Paulo",weekday:"short"}).format(new Date());return label==="Sun";}
function formatSyncTime(value:string){try{return new Intl.DateTimeFormat("pt-BR",{timeZone:"America/Sao_Paulo",hour:"2-digit",minute:"2-digit"}).format(new Date(value));}catch{return"";}}
function formatSyncDateTime(value:string){try{return new Intl.DateTimeFormat("pt-BR",{timeZone:"America/Sao_Paulo",day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}).format(new Date(value));}catch{return"";}}

function organizeQuickVoiceTranscript(rawText:string):{focus:string;protocol:WorkoutProtocol|null;exercises:Exercise[]}{
  const numberWords:Record<string,string>={
    "um":"1","uma":"1","dois":"2","duas":"2","tres":"3","três":"3",
    "quatro":"4","cinco":"5","seis":"6","sete":"7","oito":"8","nove":"9",
    "dez":"10","onze":"11","doze":"12","treze":"13","quatorze":"14",
    "catorze":"14","quinze":"15","dezesseis":"16","dezessete":"17",
    "dezoito":"18","dezenove":"19","vinte":"20"
  };

  const replaceNumberWords=(value:string)=>value.replace(
    /\b(um|uma|dois|duas|tres|três|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|quatorze|catorze|quinze|dezesseis|dezessete|dezoito|dezenove|vinte)\b/gi,
    word=>numberWords[word.toLocaleLowerCase("pt-BR")]||word
  );

  let text=rawText.replace(/\r?\n/g," ").replace(/\s+/g," ").trim();
  if(!text)return{focus:"",protocol:null,exercises:[]};

  let focus="";
  const focusMatch=text.match(/\bobjetivo\b\s*:?\s*(.+?)(?=\s+(?:m[eé]todo|sistema|protocolo)\b|\s+(?:(?:primeiro|segundo|terceiro|quarto|quinto|sexto|s[eé]timo|oitavo|nono|d[eé]cimo)\s+bloco|bloco\s+(?:\d+|um|uma|dois|duas|tr[eê]s|quatro|cinco|seis|sete|oito|nove|dez))\b|$)/i);
  if(focusMatch){
    focus=focusMatch[1].trim().replace(/^[\s,;:.\-–—]+|[\s,;:.\-–—]+$/g,"");
    const start=focusMatch.index||0;
    text=`${text.slice(0,start)} ${text.slice(start+focusMatch[0].length)}`.replace(/\s+/g," ").trim();
  }

  const protocol=/\bb\s*7\b/i.test(text)?"B7":detectWorkoutProtocol(text);
  text=text.replace(/\b(?:m[eé]todo|sistema|protocolo)\s*:?\s*(?:b\s*7|bi\s*-?\s*set|tri\s*-?\s*set|circuito|convencional|misto|personalizado)\b/gi," ");

  const ordinalBlocks:[RegExp,string][]=[
    [/\bprimeiro\s+bloco\b/gi,"1"],[/\bsegundo\s+bloco\b/gi,"2"],
    [/\bterceiro\s+bloco\b/gi,"3"],[/\bquarto\s+bloco\b/gi,"4"],
    [/\bquinto\s+bloco\b/gi,"5"],[/\bsexto\s+bloco\b/gi,"6"],
    [/\bs[eé]timo\s+bloco\b/gi,"7"],[/\boitavo\s+bloco\b/gi,"8"],
    [/\bnono\s+bloco\b/gi,"9"],[/\bd[eé]cimo\s+bloco\b/gi,"10"]
  ];
  ordinalBlocks.forEach(([pattern,block])=>{text=text.replace(pattern,`\nBloco ${block}: `);});
  text=replaceNumberWords(text);
  text=text.replace(/\bbloco\s+(\d+)\b\s*:?/gi,(_,block)=>`\nBloco ${block}: `);
  text=text.replace(/[ \t]+/g," ").replace(/\n\s*/g,"\n").trim();

  const sections:{block:string;text:string}[]=[];
  const marker=/\bBloco\s+(\d+)\s*:\s*/gi;
  const markers:RegExpExecArray[]=[];
  let markerMatch:RegExpExecArray|null;
  while((markerMatch=marker.exec(text))!==null)markers.push(markerMatch);

  if(markers.length){
    const firstIndex=markers[0].index||0;
    const before=text.slice(0,firstIndex).trim();
    if(before)sections.push({block:"",text:before});
    markers.forEach((match,index)=>{
      const start=(match.index||0)+match[0].length;
      const end=index+1<markers.length?(markers[index+1].index||text.length):text.length;
      sections.push({block:match[1],text:text.slice(start,end).trim()});
    });
  }else{
    sections.push({block:"",text});
  }

  const exercises:Exercise[]=[];
  const prescription=/\b(\d+)\s*(?:s[eé]ries?\s*(?:(?:de|com)\s*|(?:at[eé]\s+a\s*)?)?|[x×]\s*|(?:de|por)\s+)(\d+|falha)\b/gi;

  const cleanExerciseName=(value:string)=>value
    .replace(/^[\s,;:.\-–—•]+/,"")
    .replace(/^(?:(?:e|mais|junto\s+com|depois|seguido\s+de)\s+)+/i,"")
    .replace(/^[\s,;:.\-–—•]+|[\s,;:.\-–—•]+$/g,"")
    .trim();

  for(const section of sections){
    if(!section.text)continue;
    const matches:RegExpExecArray[]=[];
    prescription.lastIndex=0;
    let prescriptionMatch:RegExpExecArray|null;
    while((prescriptionMatch=prescription.exec(section.text))!==null)matches.push(prescriptionMatch);
    let cursor=0;

    matches.forEach((match,index)=>{
      const matchIndex=match.index||0;
      const name=cleanExerciseName(section.text.slice(cursor,matchIndex));
      let afterStart=matchIndex+match[0].length;
      const after=section.text.slice(afterStart);
      const loadMatch=after.match(/^\s*(?:com\s+|carga\s+(?:de\s+)?)?(\d+(?:[.,]\d+)?)\s*(?:kg|quilos?|kilos?)\b(?:\s*(?:de\s*cada\s*lado|cada\s*lado))?/i);
      let load="";

      if(loadMatch){
        load=`${loadMatch[1].replace(",",".")} kg${/cada\s*lado/i.test(loadMatch[0])?" de cada lado":""}`;
        afterStart+=loadMatch[0].length;
      }

      if(name){
        exercises.push({
          id:crypto.randomUUID(),
          block:section.block,
          name,
          sets:match[1]||"",
          reps:/falha/i.test(match[2]||"")?"F":match[2]||"",
          load,
          notes:""
        } as Exercise);
      }

      cursor=afterStart;

      if(index===matches.length-1){
        const remainder=section.text.slice(cursor).replace(/^[\s,;:.\-–—•]+/,"").trim();
        if(remainder&&exercises.length){
          const last=exercises[exercises.length-1];
          if(!/^(?:e|mais|junto\s+com)\b/i.test(remainder))last.notes=remainder;
        }
      }
    });
  }

  const groupSize=protocol==="B7"||protocol==="BISET"?2:protocol==="TRISET"?3:0;
  if(groupSize&&exercises.every(exercise=>!exercise.block?.trim())){
    exercises.forEach((exercise,index)=>{exercise.block=String(Math.floor(index/groupSize)+1);});
  }

  return{focus,protocol,exercises};
}

function extractSessionFocus(rawText:string){
  const match=rawText.match(/\bobjetivo\s*:\s*(.+?)(?=(?:\r?\n|[.;])|(?:\s*[,;\-–—]?\s*(?:sistema|protocolo|bloco)\b)|$)/i);
  if(!match)return{focus:"",text:rawText};
  const focus=match[1].trim().replace(/^[\s,;:.\-–—]+|[\s,;:.\-–—]+$/g,"");
  const text=(rawText.slice(0,match.index)+rawText.slice((match.index||0)+match[0].length)).replace(/^[\s,;:.\-–—]+/,"").trim();
  return{focus,text};
}

function organizeQuickTranscript(rawText:string): Exercise[] {
  const text=rawText.replace(/\r\n?/g,"\n").trim();
  if(!text) return [];

  const numbers:Record<string,string>={
    "um":"1","uma":"1","dois":"2","duas":"2","tres":"3","três":"3",
    "quatro":"4","cinco":"5","seis":"6","sete":"7","oito":"8","nove":"9",
    "dez":"10","onze":"11","doze":"12","treze":"13","quatorze":"14",
    "catorze":"14","quinze":"15","dezesseis":"16","dezessete":"17",
    "dezoito":"18","dezenove":"19","vinte":"20"
  };

  let normalized=text.replace(
    /\b(um|uma|dois|duas|tres|três|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|quatorze|catorze|quinze|dezesseis|dezessete|dezoito|dezenove|vinte)\b/gi,
    value=>numbers[value.toLocaleLowerCase("pt-BR")]||value
  );

  normalized=normalized
    .replace(/\s*[;|]+\s*/g,"\n")
    .replace(/\s*[.!?]+\s+(?=\p{L})/gu,"\n")
    .replace(/\s+(?=bloco\s+\d+\b)/gi,"\n")
    .replace(/\b(?:próximo exercício|proximo exercicio|novo exercício|novo exercicio)\b/gi,"\n")
    .replace(/\n{2,}/g,"\n");

  const output:Exercise[]=[];
  let currentBlock="";

  for(const rawLine of normalized.split(/\n+/)){
    let line=rawLine.trim();
    if(!line) continue;

    const blockMatch=line.match(/^\s*bloco\s+(\d+)\s*[:\-–—]?\s*(.*)$/i);
    if(blockMatch){
      currentBlock=blockMatch[1];
      line=(blockMatch[2]||"").trim();
      if(!line) continue;
    }

    line=line
      .replace(/^\s*(?:\d+\s*[.)\-:]|[-•])\s*/,"")
      .trim();

    if(!line) continue;

    const prescription=line.match(
      /\b(\d+)\s*(?:s[eé]ries?\s*(?:de\s*)?|[x×]\s*|\s+de\s+)(\d+|falha)\b/i
    );

    if(!prescription){
      output.push({
        id:crypto.randomUUID(),
        block:currentBlock,
        name:line.replace(/^[\s,;:.\-–—•]+|[\s,;:.\-–—•]+$/g,"").trim(),
        sets:"",
        reps:"",
        load:"",
        notes:""
      } as Exercise);
      continue;
    }

    const prescriptionIndex=prescription.index||0;

    const name=line
      .slice(0,prescriptionIndex)
      .replace(/^[\s,;:.\-–—•]+|[\s,;:.\-–—•]+$/g,"")
      .trim();

    let tail=line
      .slice(prescriptionIndex+prescription[0].length)
      .replace(/^[\s,;:.\-–—•]+/,"")
      .trim();

    let load="";
    let notes="";

    const loadMatch=tail.match(
      /^(\d+(?:[.,]\d+)?)\s*(?:kg|quilos?|kilos?)\b(?:\s*(?:de\s*cada\s*lado|cada\s*lado))?/i
    );

    if(loadMatch){
      load=`${loadMatch[1].replace(",",".")} kg${/cada\s*lado/i.test(loadMatch[0])?" de cada lado":""}`;
      notes=tail
        .slice(loadMatch[0].length)
        .replace(/^[\s,;:.\-–—•]+/,"")
        .trim();
    }else{
      notes=tail;
    }

    output.push({
      id:crypto.randomUUID(),
      block:currentBlock,
      name:name||`Exercício ${output.length+1}`,
      sets:prescription[1]||"",
      reps:prescription[2]||"",
      load,
      notes
    } as Exercise);
  }

  return output;
}

function formatDate(value:string){if(!value)return"—";const [year,month,day]=value.split("-");return `${day}/${month}/${year}`;}
function calculateAge(value:string){if(!value)return null;const birth=new Date(`${value}T12:00:00`);const now=new Date();let age=now.getFullYear()-birth.getFullYear();if(now.getMonth()<birth.getMonth()||(now.getMonth()===birth.getMonth()&&now.getDate()<birth.getDate()))age--;return age;}
function monthsSince(value:string){if(!value)return null;const start=new Date(`${value}T12:00:00`);const now=new Date();return Math.max(0,(now.getFullYear()-start.getFullYear())*12+now.getMonth()-start.getMonth());}

function performanceActivityEmoji(activity:any){
  if(!activity) return "\uD83D\uDCCC";
  const type=String(activity.type||"");
  if(type==="CYCLING") return "\uD83D\uDEB4";
  if(type==="STRENGTH") return "\uD83C\uDFCB\uFE0F";
  if(type==="PILATES") return "\uD83E\uDD38";
  if(type==="RUNNING") return "\uD83C\uDFC3";
  if(type==="TENNIS") return "\uD83C\uDFBE";
  return "\uD83D\uDCCC";
}

function formatMonths(months:number){const years=Math.floor(months/12);const rest=months%12;return [years?`${years} ano${years>1?"s":""}`:"",rest?`${rest} ${rest===1?"mês":"meses"}`:""].filter(Boolean).join(" e ")||"menos de 1 mês";}
function displayNumber(value:number|null|undefined,suffix:string){return value===null||value===undefined?"—":`${Number(value).toLocaleString("pt-BR",{maximumFractionDigits:1})} ${suffix}`;}
function tabLabel(tab:StudentTab){return({summary:"Dashboard",timeline:"Linha do tempo",workouts:"Treinos",history:"Histórico",assessments:"Avaliações",finance:"Financeiro",files:"Arquivos"})[tab];}
