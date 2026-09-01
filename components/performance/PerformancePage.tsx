import { FormEvent, useEffect, useMemo, useState } from "react";
import type {
  PerformanceActivity,
  PerformanceActivityType,
  PerformanceAssessment,
  PerformanceData,
  PerformanceGoal,
  PerformanceGoalMetric,
  PerformanceGoalPeriod,
  PerformanceStrengthExercise,
  PerformanceStrengthSystem,
  PerformanceTennisKind,
} from "@/types/performance";
import styles from "./PerformancePage.module.css";
import StravaSyncCard from "./StravaSyncCard";

type Tab = "summary" | "activities" | "goals" | "assessments" | "records";
type Modal = "activity" | "goal" | "assessment" | null;

type ActivityForm = {
  id?: string;
  date: string;
  type: PerformanceActivityType;
  title: string;
  distanceKm: string;
  durationMinutes: string;
  elevationMeters: string;
  calories: string;
  strengthExercises: PerformanceStrengthExercise[];
  strengthSystem: PerformanceStrengthSystem;
  tennisKind: PerformanceTennisKind;
  tennisOpponent: string;
  tennisScore: string;
  notes: string;
};

type GoalForm = {
  id?: string;
  period: PerformanceGoalPeriod;
  year: string;
  month: string;
  activityType: "ALL" | PerformanceActivityType;
  metric: PerformanceGoalMetric;
  target: string;
};

type AssessmentForm = {
  id?: string;
  date: string;
  weightKg: string;
  bodyFatPercent: string;
  muscleMassKg: string;
  waistCm: string;
  abdomenCm: string;
  chestCm: string;
  armCm: string;
  thighCm: string;
  notes: string;
};

const EMPTY_DATA: PerformanceData = {
  version: 1,
  activities: [],
  goals: [],
  assessments: [],
  records: [],
};

const ACTIVITY_LABELS: Record<PerformanceActivityType, string> = {
  CYCLING: "Ciclismo",
  STRENGTH: "Musculação",
  PILATES: "Pilates",
  RUNNING: "Corrida",
  TENNIS: "Tênis",
  OTHER: "Outro",
};

const ACTIVITY_ICONS: Record<PerformanceActivityType, string> = {
  CYCLING: "🚴",
  STRENGTH: "🏋️",
  PILATES: "🧘",
  RUNNING: "🏃",
  TENNIS: "🎾",
  OTHER: "⚡",
};

const STRENGTH_SYSTEM_OPTIONS: { value: PerformanceStrengthSystem; label: string }[] = [
  { value: "TRADITIONAL", label: "Tradicional" },
  { value: "B7", label: "B7" },
  { value: "BISET", label: "Bi-set" },
  { value: "TRISET", label: "Tri-set" },
  { value: "CIRCUIT", label: "Circuito" },
  { value: "DROP_SET", label: "Drop-set" },
  { value: "REST_PAUSE", label: "Rest-pause" },
  { value: "PYRAMID", label: "Pirâmide" },
  { value: "OTHER", label: "Outro" },
];

function strengthSystemLabel(value?: PerformanceStrengthSystem | null) {
  return STRENGTH_SYSTEM_OPTIONS.find(option => option.value === value)?.label || "";
}

const METRIC_LABELS: Record<PerformanceGoalMetric, string> = {
  DISTANCE_KM: "Distância",
  DURATION_MINUTES: "Tempo",
  ELEVATION_METERS: "Altimetria",
  ACTIVITIES: "Treinos",
};

const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function localToday() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function uid() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `perf-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function toNumber(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function fmtDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function fmtHours(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  if (!hours) return `${rest} min`;
  return rest ? `${hours}h ${rest}min` : `${hours}h`;
}

function fmtNumber(value: number, decimals = 0) {
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function emptyActivity(): ActivityForm {
  return {
    date: localToday(),
    type: "CYCLING",
    title: "",
    distanceKm: "",
    durationMinutes: "",
    elevationMeters: "",
    calories: "",
    strengthExercises: [emptyStrengthExercise()],
    strengthSystem: "TRADITIONAL",
    tennisKind: "TRAINING",
    tennisOpponent: "",
    tennisScore: "",
    notes: "",
  };
}

function emptyStrengthExercise(): PerformanceStrengthExercise {
  return { id: uid(), block: "", name: "", sets: "", reps: "", load: "", notes: "" };
}
function normalizeStrengthVoice(value:string){
  return value
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"")
    .replace(/[^a-z0-9\s]/g," ")
    .replace(/\s+/g," ")
    .trim();
}
function detectStrengthSystem(text:string):PerformanceStrengthSystem|null{
  const value=normalizeStrengthVoice(text);
  if(/\bb7\b/.test(value))return"B7";
  if(/\btri set\b|\btriset\b/.test(value))return"TRISET";
  if(/\bbi set\b|\bbiset\b/.test(value))return"BISET";
  if(/\bcircuito\b/.test(value))return"CIRCUIT";
  if(/\bdrop set\b|\bdropset\b/.test(value))return"DROP_SET";
  if(/\brest pause\b/.test(value))return"REST_PAUSE";
  if(/\bpiramide\b/.test(value))return"PYRAMID";
  if(/\bconvencional\b|\btradicional\b/.test(value))return"TRADITIONAL";
  return null;
}
function extractStrengthFocus(rawText:string){
  const match=rawText.match(/\bobjetivo\s*:\s*(.+?)(?=(?:\r?\n|[.;])|(?:\s*[,;\-–—]?\s*(?:sistema|protocolo|bloco)\b)|$)/i);
  if(!match)return{focus:"",text:rawText};
  const focus=match[1].trim().replace(/^[\s,;:.\-–—]+|[\s,;:.\-–—]+$/g,"");
  const text=(rawText.slice(0,match.index)+rawText.slice((match.index||0)+match[0].length))
    .replace(/^[\s,;:.\-–—]+/,"")
    .trim();
  return{focus,text};
}
function organizeStrengthTranscript(rawText:string,system:PerformanceStrengthSystem):PerformanceStrengthExercise[]{
  const numberWords:Record<string,string>={
    "um":"1","uma":"1","dois":"2","duas":"2","tres":"3","três":"3",
    "quatro":"4","cinco":"5","seis":"6","sete":"7","oito":"8","nove":"9",
    "dez":"10","onze":"11","doze":"12","treze":"13","quatorze":"14",
    "catorze":"14","quinze":"15","dezesseis":"16","dezessete":"17",
    "dezoito":"18","dezenove":"19","vinte":"20"
  };

  let text=rawText
    .replace(/\r\n?/g,"\n")
    .replace(/\b(?:sistema|protocolo)\s*:?\s*(?:convencional|tradicional|b7|bi[- ]?set|tri[- ]?set|circuito|drop[- ]?set|rest[- ]?pause|pir[aâ]mide|outro)[.,;:]?/gi,"")
    .trim();

  text=text.replace(
    /\b(um|uma|dois|duas|tres|três|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|quatorze|catorze|quinze|dezesseis|dezessete|dezoito|dezenove|vinte)\b/gi,
    value=>numberWords[value.toLocaleLowerCase("pt-BR")]||value
  );

  text=text
    .replace(/\s*[;|]+\s*/g,"\n")
    .replace(/\s*[.!?]+\s+(?=[A-Za-zÀ-ÿ])/g,"\n")
    .replace(/\s+(?=bloco\s+\d+\b)/gi,"\n")
    .replace(/\b(?:próximo exercício|proximo exercicio|novo exercício|novo exercicio)\b/gi,"\n")
    .replace(/\n{2,}/g,"\n");

  const output:PerformanceStrengthExercise[]=[];
  let currentBlock="";

  for(const rawLine of text.split(/\n+/)){
    let line=rawLine.trim();
    if(!line)continue;

    const blockMatch=line.match(/^bloco\s+(\d+)\s*[:\-–—]?\s*(.*)$/i);
    if(blockMatch){
      currentBlock=`Bloco ${blockMatch[1]}`;
      line=(blockMatch[2]||"").trim();
      if(!line)continue;
    }

    line=line.replace(/^\s*(?:\d+\s*[.)\-:]|[-•])\s*/,"").trim();
    if(!line)continue;

    let prescription=line.match(/\b(\d+)\s*[x×]\s*(\d+|f|falha)\b/i);
    if(!prescription){
      prescription=line.match(/\b(\d+)\s*s[eé]ries?\s*(?:de\s*)?(\d+|f|falha)\b/i);
    }
    if(!prescription){
      const failure=line.match(/\b(\d+)\s*s[eé]ries?\s*(?:at[eé]\s*a\s*)?falha\b/i);
      if(failure)prescription=[failure[0],failure[1],"F"] as RegExpMatchArray;
    }

    if(!prescription){
      output.push({
        id:uid(),
        block:currentBlock,
        name:line.replace(/^[\s,;:.\-–—•]+|[\s,;:.\-–—•]+$/g,"").trim(),
        sets:"",
        reps:"",
        load:"",
        notes:""
      });
      continue;
    }

    const prescriptionIndex=prescription.index||0;
    const name=line
      .slice(0,prescriptionIndex)
      .replace(/^[\s,;:.\-–—•]+|[\s,;:.\-–—•]+$/g,"")
      .trim();

    const tail=line
      .slice(prescriptionIndex+prescription[0].length)
      .replace(/^[\s,;:.\-–—•]+/,"")
      .trim();

    let load="";
    let notes="";
    const loadMatch=tail.match(/^(\d+(?:[.,]\d+)?)\s*(?:kg|quilos?|kilos?)\b(?:\s*(?:de\s*cada\s*lado|cada\s*lado))?/i);

    if(loadMatch){
      load=`${loadMatch[1].replace(",",".")} kg${/cada\s*lado/i.test(loadMatch[0])?" de cada lado":""}`;
      notes=tail.slice(loadMatch[0].length).replace(/^[\s,;:.\-–—•]+/,"").trim();
    }else{
      notes=tail;
    }

    output.push({
      id:uid(),
      block:currentBlock,
      name:name||`Exercício ${output.length+1}`,
      sets:prescription[1]||"",
      reps:/^(?:f|falha)$/i.test(prescription[2]||"")?"F":prescription[2]||"",
      load,
      notes
    });
  }

  const automaticSize=system==="B7"||system==="BISET"?2:system==="TRISET"?3:0;
  if(automaticSize){
    return output.map((exercise,index)=>({
      ...exercise,
      block:exercise.block?.trim()||`Bloco ${Math.floor(index/automaticSize)+1}`
    }));
  }
  if(system==="CIRCUIT"){
    return output.map(exercise=>({...exercise,block:exercise.block?.trim()||"Bloco 1"}));
  }
  return output;
}

function emptyGoal(): GoalForm {
  const now = new Date();
  return {
    period: "MONTHLY",
    year: String(now.getFullYear()),
    month: String(now.getMonth() + 1),
    activityType: "ALL",
    metric: "DISTANCE_KM",
    target: "",
  };
}

function emptyAssessment(): AssessmentForm {
  return {
    date: localToday(),
    weightKg: "",
    bodyFatPercent: "",
    muscleMassKg: "",
    waistCm: "",
    abdomenCm: "",
    chestCm: "",
    armCm: "",
    thighCm: "",
    notes: "",
  };
}

export default function PerformancePage({openActivityId}:{openActivityId?:string|null}) {
  const [data, setData] = useState<PerformanceData>(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("summary");
  const [modal, setModal] = useState<Modal>(null);
  const [activityForm, setActivityForm] = useState<ActivityForm>(emptyActivity());
  const [strengthTranscript,setStrengthTranscript]=useState("");
  const [strengthListening,setStrengthListening]=useState(false);
  const [goalForm, setGoalForm] = useState<GoalForm>(emptyGoal());
  const [assessmentForm, setAssessmentForm] = useState<AssessmentForm>(emptyAssessment());
  const [filterType, setFilterType] = useState<"ALL" | PerformanceActivityType>("ALL");
  const [filterYear, setFilterYear] = useState(String(new Date().getFullYear()));
  const [detailActivity, setDetailActivity] = useState<PerformanceActivity | null>(null);

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    if(!openActivityId || !data.activities.length)return;
    const target=data.activities.find(activity=>activity.id===openActivityId);
    if(target){
      setTab("activities");
      setDetailActivity(target);
    }
  },[openActivityId,data.activities]);

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/performance", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Falha ao carregar Performance.");
      const incoming = result.data ?? EMPTY_DATA;
      setData({ ...EMPTY_DATA, ...incoming });
    } catch (err) {
      console.error(err);
      setError("Não foi possível carregar o Performance. Os outros módulos do DMP não foram afetados.");
    } finally {
      setLoading(false);
    }
  }

  async function persist(next: PerformanceData) {
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/performance", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Falha ao salvar Performance.");
      setData(next);
      return true;
    } catch (err) {
      console.error(err);
      setError("Não foi possível salvar. Tente novamente.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const monthActivities = useMemo(
    () => data.activities.filter(a => a.date.startsWith(`${currentYear}-${String(currentMonth).padStart(2, "0")}`)),
    [data.activities, currentMonth, currentYear]
  );

  const yearActivities = useMemo(
    () => data.activities.filter(a => a.date.startsWith(`${currentYear}-`)),
    [data.activities, currentYear]
  );

  const monthTotals = useMemo(() => summarize(monthActivities), [monthActivities]);
  const yearTotals = useMemo(() => summarize(yearActivities), [yearActivities]);

  const monthlySeries = useMemo(() => {
    const output = Array.from({ length: 12 }, (_, index) => ({
      month: index + 1,
      km: 0,
      minutes: 0,
      elevation: 0,
      count: 0,
    }));
    yearActivities.forEach(activity => {
      const month = Number(activity.date.slice(5, 7));
      const item = output[month - 1];
      if (!item) return;
      item.km += activity.distanceKm || 0;
      item.minutes += activity.durationMinutes || 0;
      item.elevation += activity.elevationMeters || 0;
      item.count += 1;
    });
    return output;
  }, [yearActivities]);

  const derivedRecords = useMemo(() => {
    const withDistance = data.activities.filter(a => (a.distanceKm || 0) > 0).sort((a, b) => (b.distanceKm || 0) - (a.distanceKm || 0));
    const withDuration = data.activities.filter(a => (a.durationMinutes || 0) > 0).sort((a, b) => (b.durationMinutes || 0) - (a.durationMinutes || 0));
    const withElevation = data.activities.filter(a => (a.elevationMeters || 0) > 0).sort((a, b) => (b.elevationMeters || 0) - (a.elevationMeters || 0));
    return {
      distance: withDistance[0],
      duration: withDuration[0],
      elevation: withElevation[0],
    };
  }, [data.activities]);

  const filteredActivities = useMemo(() => {
    return [...data.activities]
      .filter(activity => filterType === "ALL" || activity.type === filterType)
      .filter(activity => !filterYear || activity.date.startsWith(`${filterYear}-`))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [data.activities, filterType, filterYear]);

  const latestAssessment = [...data.assessments].sort((a, b) => b.date.localeCompare(a.date))[0];

  const activeGoals = useMemo(() => {
    return [...data.goals].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [data.goals]);

  function goalProgress(goal: PerformanceGoal) {
    const scoped = data.activities.filter(activity => {
      if (goal.activityType && activity.type !== goal.activityType) return false;
      if (!activity.date.startsWith(`${goal.year}-`)) return false;
      if (goal.period === "MONTHLY") {
        return activity.date.startsWith(`${goal.year}-${String(goal.month || 1).padStart(2, "0")}`);
      }
      return true;
    });
    const summary = summarize(scoped);
    const value = goal.metric === "DISTANCE_KM" ? summary.distance
      : goal.metric === "DURATION_MINUTES" ? summary.minutes
      : goal.metric === "ELEVATION_METERS" ? summary.elevation
      : summary.count;
    return { value, percent: goal.target > 0 ? Math.min(100, Math.round((value / goal.target) * 100)) : 0 };
  }

  function stopStrengthVoice(){
    const voiceWindow=window as any;
    voiceWindow.__dmpPerformanceShouldListen=false;
    const recognition=voiceWindow.__dmpPerformanceRecognition;
    if(recognition){
      recognition.onend=null;
      try{recognition.stop();}catch{}
    }
    voiceWindow.__dmpPerformanceRecognition=null;
    voiceWindow.__dmpPerformanceLastFinal="";
    voiceWindow.__dmpPerformanceLastAt=0;
    setStrengthListening(false);
  }
  function listenStrengthWorkout(){
    const SpeechRecognition=(window as any).SpeechRecognition||(window as any).webkitSpeechRecognition;
    if(!SpeechRecognition){
      alert("O reconhecimento de voz não está disponível neste navegador. Use o campo de texto.");
      return;
    }

    const voiceWindow=window as any;
    if(voiceWindow.__dmpPerformanceShouldListen){
      stopStrengthVoice();
      return;
    }

    voiceWindow.__dmpPerformanceShouldListen=true;

    const normalizeVoice=(value:string)=>normalizeStrengthVoice(value);
    const appendUnique=(current:string,incoming:string)=>{
      const clean=incoming.replace(/\s+/g," ").trim();
      if(!clean)return current;
      const now=Date.now();
      const normalized=normalizeVoice(clean);
      const last=String(voiceWindow.__dmpPerformanceLastFinal||"");
      const lastNormalized=normalizeVoice(last);
      const lastAt=Number(voiceWindow.__dmpPerformanceLastAt||0);

      if(lastNormalized&&now-lastAt<3500&&normalized===lastNormalized){
        voiceWindow.__dmpPerformanceLastAt=now;
        return current;
      }
      voiceWindow.__dmpPerformanceLastFinal=clean;
      voiceWindow.__dmpPerformanceLastAt=now;
      return `${current.trim()} ${clean}`.trim();
    };

    const start=()=>{
      if(!voiceWindow.__dmpPerformanceShouldListen)return;
      const recognition=new SpeechRecognition();
      voiceWindow.__dmpPerformanceRecognition=recognition;
      recognition.lang="pt-BR";
      recognition.continuous=true;
      recognition.interimResults=false;
      recognition.maxAlternatives=1;

      recognition.onstart=()=>setStrengthListening(true);
      recognition.onresult=(event:any)=>{
        for(let i=event.resultIndex||0;i<event.results.length;i++){
          if(event.results[i]?.isFinal===false)continue;
          const spoken=String(event.results[i]?.[0]?.transcript||"").trim();
          if(spoken)setStrengthTranscript(current=>appendUnique(current,spoken));
        }
      };
      recognition.onerror=(event:any)=>{
        if(["not-allowed","service-not-allowed","audio-capture"].includes(event.error)){
          stopStrengthVoice();
        }
      };
      recognition.onend=()=>{
        voiceWindow.__dmpPerformanceRecognition=null;
        if(voiceWindow.__dmpPerformanceShouldListen)window.setTimeout(start,350);
        else setStrengthListening(false);
      };

      try{recognition.start();}
      catch{
        if(voiceWindow.__dmpPerformanceShouldListen)window.setTimeout(start,350);
      }
    };

    start();
  }
  function organizeStrengthFromVoice(){
    const raw=strengthTranscript.trim();
    if(!raw)return;

    const extracted=extractStrengthFocus(raw);
    const detected=detectStrengthSystem(extracted.text)||activityForm.strengthSystem;
    const parsed=organizeStrengthTranscript(extracted.text,detected);

    setActivityForm(current=>({
      ...current,
      type:"STRENGTH",
      title:current.title.trim()?current.title:(extracted.focus||"Musculação"),
      strengthSystem:detected,
      strengthExercises:parsed.length?parsed:current.strengthExercises,
    }));
  }
  function openNewActivity() {
    stopStrengthVoice();
    setStrengthTranscript("");
    setActivityForm(emptyActivity());
    setModal("activity");
  }

  function openEditActivity(activity: PerformanceActivity) {
    setActivityForm({
      id: activity.id,
      date: activity.date,
      type: activity.type,
      title: activity.title,
      distanceKm: activity.distanceKm?.toString() || "",
      durationMinutes: activity.durationMinutes?.toString() || "",
      elevationMeters: activity.elevationMeters?.toString() || "",
      calories: activity.calories?.toString() || "",
      strengthExercises: activity.strengthExercises?.length
        ? activity.strengthExercises.map(item => ({ ...item }))
        : [emptyStrengthExercise()],
      strengthSystem: activity.strengthSystem || "TRADITIONAL",
      tennisKind: activity.tennisKind || "TRAINING",
      tennisOpponent: activity.tennisOpponent || "",
      tennisScore: activity.tennisScore || "",
      notes: activity.notes || "",
    });
    stopStrengthVoice();
    setStrengthTranscript("");
    setModal("activity");
  }

  async function submitActivity(event: FormEvent) {
    event.preventDefault();
    if (!activityForm.date || !activityForm.title.trim()) return;
    const timestamp = new Date().toISOString();
    const existing = activityForm.id ? data.activities.find(a => a.id === activityForm.id) : null;
    const activity: PerformanceActivity = {
      id: existing?.id || uid(),
      date: activityForm.date,
      type: activityForm.type,
      title: activityForm.title.trim(),
      distanceKm: toNumber(activityForm.distanceKm),
      durationMinutes: toNumber(activityForm.durationMinutes),
      elevationMeters: toNumber(activityForm.elevationMeters),
      calories: toNumber(activityForm.calories),
      strengthExercises: activityForm.type === "STRENGTH"
        ? activityForm.strengthExercises.filter(item => item.name.trim()).map(item => ({
            ...item,
            name: item.name.trim(),
            sets: item.sets.trim(),
            reps: item.reps.trim(),
            load: item.load.trim(),
            block: item.block?.trim() || "",
            notes: item.notes?.trim() || "",
          }))
        : undefined,
      strengthSystem: activityForm.type === "STRENGTH" ? activityForm.strengthSystem : null,
      tennisKind: activityForm.type === "TENNIS" ? activityForm.tennisKind : null,
      tennisOpponent: activityForm.type === "TENNIS" && activityForm.tennisKind === "MATCH" ? activityForm.tennisOpponent.trim() || null : null,
      tennisScore: activityForm.type === "TENNIS" && activityForm.tennisKind === "MATCH" ? activityForm.tennisScore.trim() || null : null,
      notes: activityForm.notes.trim() || undefined,
      source: existing?.source || "MANUAL",
      externalId: existing?.externalId || null,
      createdAt: existing?.createdAt || timestamp,
      updatedAt: timestamp,
    };
    const activities = existing
      ? data.activities.map(item => item.id === activity.id ? activity : item)
      : [activity, ...data.activities];
    if (await persist({ ...data, activities })) {
      stopStrengthVoice();
      setStrengthTranscript("");
      setModal(null);
    }
  }

  async function deleteActivity(id: string) {
    if (!window.confirm("Excluir esta atividade?")) return;
    await persist({ ...data, activities: data.activities.filter(item => item.id !== id) });
  }

  function openNewGoal() {
    setGoalForm(emptyGoal());
    setModal("goal");
  }

  function openEditGoal(goal: PerformanceGoal) {
    setGoalForm({
      id: goal.id,
      period: goal.period,
      year: String(goal.year),
      month: String(goal.month || currentMonth),
      activityType: goal.activityType || "ALL",
      metric: goal.metric,
      target: String(goal.target),
    });
    setModal("goal");
  }

  async function submitGoal(event: FormEvent) {
    event.preventDefault();
    const target = toNumber(goalForm.target);
    if (!target || target <= 0) return;
    const timestamp = new Date().toISOString();
    const existing = goalForm.id ? data.goals.find(g => g.id === goalForm.id) : null;
    const goal: PerformanceGoal = {
      id: existing?.id || uid(),
      year: Number(goalForm.year),
      month: goalForm.period === "MONTHLY" ? Number(goalForm.month) : null,
      period: goalForm.period,
      activityType: goalForm.activityType === "ALL" ? null : goalForm.activityType,
      metric: goalForm.metric,
      target,
      createdAt: existing?.createdAt || timestamp,
      updatedAt: timestamp,
    };
    const goals = existing ? data.goals.map(g => g.id === goal.id ? goal : g) : [goal, ...data.goals];
    if (await persist({ ...data, goals })) setModal(null);
  }

  async function deleteGoal(id: string) {
    if (!window.confirm("Excluir esta meta?")) return;
    await persist({ ...data, goals: data.goals.filter(item => item.id !== id) });
  }

  function openNewAssessment() {
    setAssessmentForm(emptyAssessment());
    setModal("assessment");
  }

  function openEditAssessment(item: PerformanceAssessment) {
    setAssessmentForm({
      id: item.id,
      date: item.date,
      weightKg: item.weightKg?.toString() || "",
      bodyFatPercent: item.bodyFatPercent?.toString() || "",
      muscleMassKg: item.muscleMassKg?.toString() || "",
      waistCm: item.waistCm?.toString() || "",
      abdomenCm: item.abdomenCm?.toString() || "",
      chestCm: item.chestCm?.toString() || "",
      armCm: item.armCm?.toString() || "",
      thighCm: item.thighCm?.toString() || "",
      notes: item.notes || "",
    });
    setModal("assessment");
  }

  async function submitAssessment(event: FormEvent) {
    event.preventDefault();
    if (!assessmentForm.date) return;
    const timestamp = new Date().toISOString();
    const existing = assessmentForm.id ? data.assessments.find(a => a.id === assessmentForm.id) : null;
    const item: PerformanceAssessment = {
      id: existing?.id || uid(),
      date: assessmentForm.date,
      weightKg: toNumber(assessmentForm.weightKg),
      bodyFatPercent: toNumber(assessmentForm.bodyFatPercent),
      muscleMassKg: toNumber(assessmentForm.muscleMassKg),
      waistCm: toNumber(assessmentForm.waistCm),
      abdomenCm: toNumber(assessmentForm.abdomenCm),
      chestCm: toNumber(assessmentForm.chestCm),
      armCm: toNumber(assessmentForm.armCm),
      thighCm: toNumber(assessmentForm.thighCm),
      notes: assessmentForm.notes.trim() || undefined,
      createdAt: existing?.createdAt || timestamp,
      updatedAt: timestamp,
    };
    const assessments = existing ? data.assessments.map(a => a.id === item.id ? item : a) : [item, ...data.assessments];
    if (await persist({ ...data, assessments })) setModal(null);
  }

  async function deleteAssessment(id: string) {
    if (!window.confirm("Excluir esta avaliação?")) return;
    await persist({ ...data, assessments: data.assessments.filter(item => item.id !== id) });
  }

  const weekNow=new Date();
  const weekStartDate=new Date(weekNow);
  const weekDay=(weekNow.getDay()+6)%7;
  weekStartDate.setDate(weekNow.getDate()-weekDay);
  weekStartDate.setHours(0,0,0,0);
  const performanceDateKey=(date:Date)=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
  const weekStartKey=performanceDateKey(weekStartDate);
  const weekEndKey=performanceDateKey(weekNow);
  const weekActivities=data.activities.filter(activity=>activity.date>=weekStartKey&&activity.date<=weekEndKey);
  const weekTotals=summarize(weekActivities);
  const weekByType=(Object.keys(ACTIVITY_LABELS) as PerformanceActivityType[])
    .map(type=>({type,count:weekActivities.filter(activity=>activity.type===type).length}))
    .filter(item=>item.count>0);

  if (loading) {
    return <section className={styles.loading}>Carregando Performance...</section>;
  }

  return (
    <>
      <header className={`dashboard-topbar ${styles.header}`}>
        <div>
          <p className="dashboard-eyebrow">Seu centro de desempenho</p>
          <h1>Performance</h1>
          <p>Treinos, evolução, metas, avaliações e recordes em um só lugar.</p>
        </div>
        <div className="hero-actions">
          <button className="primary" onClick={openNewActivity}>+ Registrar atividade</button>
        </div>
      </header>

      <section className={`dashboard-content ${styles.page}`}>
        {error ? <div className={styles.error}>{error}</div> : null}

        <div className={styles.hero}>
          <div className={styles.heroCopy}>
            <span className={styles.heroBadge}>DMP PERFORMANCE</span>
            <h2>{MONTHS[currentMonth - 1]} em movimento.</h2>
            <p>Seu painel pessoal de consistência, volume e evolução física.</p>
            <div className={styles.heroMiniStats}>
              <span><strong>{fmtNumber(monthTotals.distance, 1)}</strong> km no mês</span>
              <span><strong>{monthTotals.count}</strong> atividades</span>
              <span><strong>{fmtNumber(monthTotals.elevation)}</strong> m de subida</span>
            </div>
          </div>
          <img src="/performance-mural.png" alt="Mural pessoal de ciclismo" className={styles.heroImage} />
        </div>

        <nav className={styles.tabs} aria-label="Áreas do Performance">
          {([
            ["summary", "Resumo"],
            ["activities", "Atividades"],
            ["goals", "Metas"],
            ["assessments", "Avaliações"],
            ["records", "Recordes"],
          ] as [Tab, string][]).map(([key, label]) => (
            <button key={key} className={tab === key ? styles.tabActive : ""} onClick={() => setTab(key)}>{label}</button>
          ))}
        </nav>

        {tab === "summary" ? (
          <div className={styles.stack}>
            {(()=>{
              const now=new Date();
              const weekday=(now.getDay()+6)%7;
              const start=new Date(now);
              start.setHours(0,0,0,0);
              start.setDate(start.getDate()-weekday);

              const weekActivities=data.activities.filter(activity=>{
                const date=new Date(activity.date+"T12:00:00");
                return date>=start&&date<=now;
              });

              const weekTotals=summarize(weekActivities);
              const modalities=(Object.keys(ACTIVITY_LABELS) as PerformanceActivityType[])
                .map(type=>({type,count:weekActivities.filter(activity=>activity.type===type).length}))
                .filter(item=>item.count>0);

              return <section className={styles.panel}>
                <div className={styles.panelHeader}>
                  <div>
                    <span className={styles.kicker}>RESUMO DA SEMANA</span>
                    <h2>Esta semana</h2>
                  </div>
                  <span className={styles.statusChip}>{weekTotals.count} atividade{weekTotals.count===1?"":"s"}</span>
                </div>

                <div className={styles.measureGrid}>
                  <div className={styles.measure}><span>Distância</span><strong>{fmtNumber(weekTotals.distance,1)} km</strong></div>
                  <div className={styles.measure}><span>Tempo</span><strong>{fmtHours(weekTotals.minutes)}</strong></div>
                  <div className={styles.measure}><span>Altimetria</span><strong>{fmtNumber(weekTotals.elevation)} m</strong></div>
                  <div className={styles.measure}><span>Treinos</span><strong>{weekTotals.count}</strong></div>
                </div>

                {modalities.length?<div className={styles.recordBySport}>
                  {modalities.map(item=>
                    <div key={item.type}>
                      <span>{ACTIVITY_ICONS[item.type]}</span>
                      <div>
                        <strong>{ACTIVITY_LABELS[item.type]}</strong>
                        <small>{item.count} atividade{item.count===1?"":"s"} nesta semana</small>
                      </div>
                    </div>
                  )}
                </div>:null}
              </section>;
            })()}

            <div className={styles.statsGrid}>
              <Metric label="Distância no mês" value={`${fmtNumber(monthTotals.distance, 1)} km`} detail={`${fmtNumber(yearTotals.distance, 1)} km no ano`} icon="↗" />
              <Metric label="Tempo no mês" value={fmtHours(monthTotals.minutes)} detail={`${fmtHours(yearTotals.minutes)} no ano`} icon="◷" />
              <Metric label="Altimetria no mês" value={`${fmtNumber(monthTotals.elevation)} m`} detail={`${fmtNumber(yearTotals.elevation)} m no ano`} icon="△" />
              <Metric label="Treinos no mês" value={String(monthTotals.count)} detail={`${yearTotals.count} no ano`} icon="✓" />
            </div>

            {/* PERFORMANCE SEMANAL DMP */}
            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <div><span className={styles.kicker}>ESTA SEMANA</span><h2>Performance semanal</h2></div>
                <span className={styles.statusChip}>{weekActivities.length} atividade{weekActivities.length===1?"":"s"}</span>
              </div>

              <div className={styles.measureGrid}>
                <div className={styles.measure}><span>Dist&acirc;ncia</span><strong>{fmtNumber(weekTotals.distance,1)} km</strong></div>
                <div className={styles.measure}><span>Tempo</span><strong>{fmtHours(weekTotals.minutes)}</strong></div>
                <div className={styles.measure}><span>Eleva&ccedil;&atilde;o</span><strong>{fmtNumber(weekTotals.elevation)} m</strong></div>
                <div className={styles.measure}><span>Treinos</span><strong>{weekTotals.count}</strong></div>
              </div>

              {weekByType.length?
                <div className={styles.recordBySport}>
                  {weekByType.map(item=>
                    <div key={item.type}>
                      <span>{ACTIVITY_ICONS[item.type]}</span>
                      <div><strong>{ACTIVITY_LABELS[item.type]}</strong><small>{item.count} atividade{item.count===1?"":"s"} nesta semana</small></div>
                    </div>
                  )}
                </div>
              :null}
            </section>

            <div className={styles.twoColumns}>
              <section className={styles.panel}>
                <div className={styles.panelHeader}>
                  <div><span className={styles.kicker}>EVOLUÇÃO {currentYear}</span><h2>Distância por mês</h2></div>
                  <span className={styles.statusChip}>12 meses</span>
                </div>
                <MonthlyBars series={monthlySeries.map(item => item.km)} currentMonth={currentMonth} />
              </section>

              <section className={styles.panel}>
                <div className={styles.panelHeader}>
                  <div><span className={styles.kicker}>METAS</span><h2>Progresso atual</h2></div>
                  <button className="secondary" onClick={() => setTab("goals")}>Ver metas</button>
                </div>
                {activeGoals.length ? activeGoals.slice(0, 4).map(goal => <GoalProgress key={goal.id} goal={goal} progress={goalProgress(goal)} />) : <Empty text="Crie sua primeira meta mensal ou anual." action="Criar meta" onClick={openNewGoal} />}
              </section>
            </div>

            <div className={styles.twoColumns}>
              <section className={styles.panel}>
                <div className={styles.panelHeader}>
                  <div><span className={styles.kicker}>ÚLTIMAS ATIVIDADES</span><h2>Histórico recente</h2></div>
                  <button className="secondary" onClick={() => setTab("activities")}>Ver histórico</button>
                </div>
                {data.activities.length ? data.activities.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5).map(activity => <ActivityRow key={activity.id} activity={activity} compact onClick={() => setDetailActivity(activity)} />) : <Empty text="Nenhuma atividade registrada ainda." action="Registrar" onClick={openNewActivity} />}
              </section>

              <section className={styles.panel}>
                <div className={styles.panelHeader}>
                  <div><span className={styles.kicker}>AVALIAÇÃO FÍSICA</span><h2>Última leitura</h2></div>
                  <button className="secondary" onClick={() => setTab("assessments")}>Ver avaliações</button>
                </div>
                {latestAssessment ? <AssessmentSummary item={latestAssessment} /> : <Empty text="Registre peso, composição corporal e medidas." action="Nova avaliação" onClick={openNewAssessment} />}
              </section>
            </div>

            <StravaSyncCard onSynced={() => void loadData()} />
          </div>
        ) : null}

        {tab === "activities" ? (
          <section className={styles.panel}>
            <div className={styles.panelHeaderWrap}>
              <div><span className={styles.kicker}>HISTÓRICO</span><h2>Atividades</h2><p>{filteredActivities.length} registro{filteredActivities.length === 1 ? "" : "s"}</p></div>
              <button className="primary" onClick={openNewActivity}>+ Nova atividade</button>
            </div>
            <div className={styles.filters}>
              <select value={filterType} onChange={e => setFilterType(e.target.value as typeof filterType)}>
                <option value="ALL">Todas as modalidades</option>
                {Object.entries(ACTIVITY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <input type="number" value={filterYear} onChange={e => setFilterYear(e.target.value)} placeholder="Ano" />
            </div>
            <div className={styles.list}>
              {filteredActivities.length ? filteredActivities.map(activity => (
                <div className={styles.editableRow} key={activity.id}>
                  <ActivityRow activity={activity} onClick={() => setDetailActivity(activity)} />
                  <div className={styles.rowActions}><button className="secondary" onClick={() => openEditActivity(activity)}>Editar</button><button className={styles.dangerButton} onClick={() => void deleteActivity(activity.id)}>Excluir</button></div>
                </div>
              )) : <Empty text="Nenhuma atividade encontrada com estes filtros." action="Registrar atividade" onClick={openNewActivity} />}
            </div>
          </section>
        ) : null}

        {tab === "goals" ? (
          <section className={styles.panel}>
            <div className={styles.panelHeaderWrap}>
              <div><span className={styles.kicker}>PLANEJAMENTO</span><h2>Metas mensais e anuais</h2><p>Transforme consistência em números claros.</p></div>
              <button className="primary" onClick={openNewGoal}>+ Nova meta</button>
            </div>
            <div className={styles.goalGrid}>
              {activeGoals.length ? activeGoals.map(goal => {
                const progress = goalProgress(goal);
                return <article className={styles.goalCard} key={goal.id}>
                  <div className={styles.goalTop}><span>{goal.activityType ? ACTIVITY_LABELS[goal.activityType] : "Todas as atividades"}</span><strong>{progress.percent}%</strong></div>
                  <h3>{METRIC_LABELS[goal.metric]}</h3>
                  <p>{goal.period === "MONTHLY" ? `${MONTHS[(goal.month || 1) - 1]} ${goal.year}` : `Ano ${goal.year}`}</p>
                  <Progress value={progress.percent} />
                  <div className={styles.goalValues}><span>{formatMetric(progress.value, goal.metric)}</span><span>de {formatMetric(goal.target, goal.metric)}</span></div>
                  <div className={styles.rowActions}><button className="secondary" onClick={() => openEditGoal(goal)}>Editar</button><button className={styles.dangerButton} onClick={() => void deleteGoal(goal.id)}>Excluir</button></div>
                </article>;
              }) : <Empty text="Nenhuma meta criada ainda." action="Criar primeira meta" onClick={openNewGoal} />}
            </div>
          </section>
        ) : null}

        {tab === "assessments" ? (
          <section className={styles.panel}>
            <div className={styles.panelHeaderWrap}>
              <div><span className={styles.kicker}>CORPO & COMPOSIÇÃO</span><h2>Avaliações físicas</h2><p>Acompanhe mudanças de composição e medidas.</p></div>
              <button className="primary" onClick={openNewAssessment}>+ Nova avaliação</button>
            </div>
            {data.assessments.length ? (
              <div className={styles.assessmentTable}>
                {[...data.assessments].sort((a,b) => b.date.localeCompare(a.date)).map(item => (
                  <article className={styles.assessmentRow} key={item.id}>
                    <div className={styles.assessmentDate}><strong>{fmtDate(item.date)}</strong><span>{item.notes || "Avaliação física"}</span></div>
                    <Measure label="Peso" value={item.weightKg} unit="kg" />
                    <Measure label="Gordura" value={item.bodyFatPercent} unit="%" />
                    <Measure label="Massa muscular" value={item.muscleMassKg} unit="kg" />
                    <Measure label="Cintura" value={item.waistCm} unit="cm" />
                    <div className={styles.rowActions}><button className="secondary" onClick={() => openEditAssessment(item)}>Editar</button><button className={styles.dangerButton} onClick={() => void deleteAssessment(item.id)}>Excluir</button></div>
                  </article>
                ))}
              </div>
            ) : <Empty text="Nenhuma avaliação registrada ainda." action="Registrar avaliação" onClick={openNewAssessment} />}
          </section>
        ) : null}

        {tab === "records" ? (
          <div className={styles.stack}>
            <div className={styles.recordGrid}>
              <RecordCard title="Maior distância" activity={derivedRecords.distance} metric="distance" />
              <RecordCard title="Maior duração" activity={derivedRecords.duration} metric="duration" />
              <RecordCard title="Maior altimetria" activity={derivedRecords.elevation} metric="elevation" />
            </div>
            <section className={styles.panel}>
              <div className={styles.panelHeader}><div><span className={styles.kicker}>RECORDES PESSOAIS</span><h2>Melhores marcas por modalidade</h2></div></div>
              <div className={styles.recordBySport}>
                {(Object.keys(ACTIVITY_LABELS) as PerformanceActivityType[]).map(type => {
                  const activities = data.activities.filter(a => a.type === type);
                  if (!activities.length) return null;
                  const best = [...activities].sort((a,b) => (b.distanceKm || 0) - (a.distanceKm || 0))[0];
                  return <div key={type}><span>{ACTIVITY_ICONS[type]}</span><div><strong>{ACTIVITY_LABELS[type]}</strong><small>{best.distanceKm ? `${fmtNumber(best.distanceKm,1)} km · ${fmtDate(best.date)}` : `${activities.length} atividade${activities.length === 1 ? "" : "s"}`}</small></div></div>;
                })}
              </div>
            </section>
          </div>
        ) : null}
      </section>

      {detailActivity ? (
        <ModalShell title={detailActivity.title} eyebrow="DETALHES DA ATIVIDADE" onClose={() => setDetailActivity(null)}>
          <div className={styles.stack}>
            <div className={styles.measureGrid}>
              <div className={styles.measure}><span>Data</span><strong>{fmtDate(detailActivity.date)}</strong></div>
              <DurationMeasure label="Tempo em movimento" value={detailActivity.durationMinutes} />
              {detailActivity.type === "CYCLING" || detailActivity.type === "RUNNING" || detailActivity.source === "STRAVA" ? <>
                <Measure label="Distância" value={detailActivity.distanceKm} unit="km" />
                <DurationMeasure label="Tempo decorrido" value={detailActivity.elapsedMinutes} />
                <Measure label="Velocidade média" value={detailActivity.averageSpeedKmh} unit="km/h" />
                <Measure label="Velocidade máxima" value={detailActivity.maxSpeedKmh} unit="km/h" />
                <Measure label="Elevação" value={detailActivity.elevationMeters} unit="m" />
                <Measure label="FC média" value={detailActivity.heartRateAverage} unit="bpm" />
                <Measure label="FC máxima" value={detailActivity.heartRateMax} unit="bpm" />
                <Measure label="Potência média" value={detailActivity.powerAverage} unit="W" />
                <Measure label="Potência ponderada" value={detailActivity.powerWeighted} unit="W" />
                <Measure label="Potência máxima" value={detailActivity.powerMax} unit="W" />
                <Measure label="Calorias" value={detailActivity.calories} unit="kcal" />
                <Measure label="Esforço relativo" value={detailActivity.relativeEffort} unit="" />
              </> : null}
            </div>
            {detailActivity.type === "STRENGTH" && detailActivity.strengthSystem ? <div className={styles.assessmentHeadline}><strong>Sistema de treino</strong><span>{strengthSystemLabel(detailActivity.strengthSystem)}</span></div> : null}
            {detailActivity.type === "STRENGTH" && detailActivity.strengthExercises?.length ? <div className={styles.exerciseDetails}><strong>Exercícios</strong>{detailActivity.strengthExercises.map(item => <div key={item.id}><span>{item.block ? `${item.block} · ` : ""}{item.name}</span><small>{[item.sets && `${item.sets} séries`, item.reps && `${item.reps} reps`, item.load && item.load, item.notes].filter(Boolean).join(" · ")}</small></div>)}</div> : null}
            {detailActivity.type === "TENNIS" ? <div className={styles.exerciseDetails}><strong>{detailActivity.tennisKind === "MATCH" ? "Partida" : "Treino de tênis"}</strong>{detailActivity.tennisOpponent ? <div><span>Adversário</span><small>{detailActivity.tennisOpponent}</small></div> : null}{detailActivity.tennisScore ? <div><span>Placar</span><small>{detailActivity.tennisScore}</small></div> : null}</div> : null}
            {detailActivity.gearName ? <div className={styles.assessmentHeadline}><strong>Equipamento</strong><span>{detailActivity.gearName}</span></div> : null}
            {detailActivity.description ? <div className={styles.assessmentHeadline}><strong>Descrição</strong><span>{detailActivity.description}</span></div> : null}
            {detailActivity.notes ? <div className={styles.assessmentHeadline}><strong>Observações</strong><span>{detailActivity.notes}</span></div> : null}
            <div className={styles.rowActions}>
              <button className="secondary" onClick={() => { setDetailActivity(null); openEditActivity(detailActivity); }}>Editar atividade</button>
              <button className="secondary" onClick={() => setDetailActivity(null)}>Fechar</button>
            </div>
          </div>
        </ModalShell>
      ) : null}

      {modal === "activity" ? (
        <ModalShell title={activityForm.id ? "Editar atividade" : "Registrar atividade"} eyebrow="PERFORMANCE" onClose={() => {stopStrengthVoice();setStrengthTranscript("");setModal(null);}}>
          <form onSubmit={submitActivity} className={styles.form}>
            <div className={styles.formGrid}>
              <Field label="Data"><input type="date" value={activityForm.date} onChange={e => setActivityForm({...activityForm,date:e.target.value})} required /></Field>
              <Field label="Modalidade"><select value={activityForm.type} onChange={e => setActivityForm({...activityForm,type:e.target.value as PerformanceActivityType})}>{Object.entries(ACTIVITY_LABELS).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
              <Field label="Título" full><input value={activityForm.title} onChange={e => setActivityForm({...activityForm,title:e.target.value})} placeholder="Ex.: Pedal Speed, Musculação A, Pilates..." required /></Field>
              <Field label="Duração (min)"><input inputMode="numeric" value={activityForm.durationMinutes} onChange={e => setActivityForm({...activityForm,durationMinutes:e.target.value})} placeholder="0" /></Field>
              {activityForm.type === "CYCLING" || activityForm.type === "RUNNING" || activityForm.type === "OTHER" ? <>
                <Field label="Distância (km)"><input inputMode="decimal" value={activityForm.distanceKm} onChange={e => setActivityForm({...activityForm,distanceKm:e.target.value})} placeholder="0,0" /></Field>
                <Field label="Altimetria (m)"><input inputMode="numeric" value={activityForm.elevationMeters} onChange={e => setActivityForm({...activityForm,elevationMeters:e.target.value})} placeholder="0" /></Field>
                <Field label="Calorias"><input inputMode="numeric" value={activityForm.calories} onChange={e => setActivityForm({...activityForm,calories:e.target.value})} placeholder="Opcional" /></Field>
              </> : null}
              {activityForm.type === "STRENGTH" ? <><div className={`${styles.fieldFull} ${styles.strengthVoicePanel}`}><div><strong>🎤 Montar treino por voz / texto</strong><p>Fale ou cole o treino como você faz com os alunos. Depois toque em “Revisar e montar” e confira tudo antes de salvar.</p></div><textarea rows={7} value={strengthTranscript} onChange={e=>setStrengthTranscript(e.target.value)} placeholder={'Objetivo: Peito + tríceps\nSistema: B7\nBloco 1\nSupino reto — 3x15 — 30 kg\nTríceps polia — 3xF — 25 kg'}/><div className="hero-actions"><button type="button" className="secondary" onClick={listenStrengthWorkout}>{strengthListening?"⏹ Parar":"🎤 Falar"}</button><button type="button" className="primary" onClick={organizeStrengthFromVoice} disabled={!strengthTranscript.trim()}>Revisar e montar</button></div></div><Field label="Sistema de treino" full><select value={activityForm.strengthSystem} onChange={e => setActivityForm({...activityForm,strengthSystem:e.target.value as PerformanceStrengthSystem})}>{STRENGTH_SYSTEM_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></Field></> : null}
              {activityForm.type === "TENNIS" ? <>
                <Field label="Tipo"><select value={activityForm.tennisKind} onChange={e => setActivityForm({...activityForm,tennisKind:e.target.value as PerformanceTennisKind})}><option value="TRAINING">Treino</option><option value="MATCH">Partida</option></select></Field>
                {activityForm.tennisKind === "MATCH" ? <><Field label="Contra quem"><input value={activityForm.tennisOpponent} onChange={e => setActivityForm({...activityForm,tennisOpponent:e.target.value})} placeholder="Nome do adversário" /></Field><Field label="Placar"><input value={activityForm.tennisScore} onChange={e => setActivityForm({...activityForm,tennisScore:e.target.value})} placeholder="Ex.: 6/4 6/3" /></Field></> : null}
              </> : null}
              {activityForm.type === "STRENGTH" ? <div className={`${styles.fieldFull} ${styles.exerciseEditor}`}><div className={styles.exerciseEditorHead}><div><strong>Revisão do treino</strong><small>Corrija bloco, exercício, séries, reps, carga e observação antes de salvar.</small></div><button type="button" className="secondary" onClick={() => setActivityForm({...activityForm,strengthExercises:[...activityForm.strengthExercises,emptyStrengthExercise()]})}>+ Exercício</button></div>{activityForm.strengthExercises.map((item,index) => <div className={`${styles.exerciseEditorRow} ${styles.strengthExerciseEditorRow}`} key={item.id}><input aria-label="Bloco" value={item.block||""} onChange={e => setActivityForm({...activityForm,strengthExercises:activityForm.strengthExercises.map(current => current.id === item.id ? {...current,block:e.target.value} : current)})} placeholder="Bloco" /><input aria-label={`Exercício ${index+1}`} value={item.name} onChange={e => setActivityForm({...activityForm,strengthExercises:activityForm.strengthExercises.map(current => current.id === item.id ? {...current,name:e.target.value} : current)})} placeholder="Exercício" /><input aria-label="Séries" value={item.sets} onChange={e => setActivityForm({...activityForm,strengthExercises:activityForm.strengthExercises.map(current => current.id === item.id ? {...current,sets:e.target.value} : current)})} placeholder="Séries" /><input aria-label="Repetições" value={item.reps} onChange={e => setActivityForm({...activityForm,strengthExercises:activityForm.strengthExercises.map(current => current.id === item.id ? {...current,reps:e.target.value} : current)})} placeholder="Reps" /><input aria-label="Carga" value={item.load} onChange={e => setActivityForm({...activityForm,strengthExercises:activityForm.strengthExercises.map(current => current.id === item.id ? {...current,load:e.target.value} : current)})} placeholder="Carga" /><input aria-label="Observação" value={item.notes||""} onChange={e => setActivityForm({...activityForm,strengthExercises:activityForm.strengthExercises.map(current => current.id === item.id ? {...current,notes:e.target.value} : current)})} placeholder="Observação" /><button type="button" className={styles.exerciseRemove} onClick={() => setActivityForm({...activityForm,strengthExercises:activityForm.strengthExercises.length === 1 ? [emptyStrengthExercise()] : activityForm.strengthExercises.filter(current => current.id !== item.id)})}>×</button></div>)}</div> : null}
              <Field label="Observações" full><textarea rows={4} value={activityForm.notes} onChange={e => setActivityForm({...activityForm,notes:e.target.value})} placeholder="Sensações, intensidade, terreno, observações do treino..." /></Field>
            </div>
            <ModalActions saving={saving} onCancel={() => {stopStrengthVoice();setStrengthTranscript("");setModal(null);}} label="Salvar atividade" />
          </form>
        </ModalShell>
      ) : null}

      {modal === "goal" ? (
        <ModalShell title={goalForm.id ? "Editar meta" : "Nova meta"} eyebrow="META DE PERFORMANCE" onClose={() => setModal(null)}>
          <form onSubmit={submitGoal} className={styles.form}>
            <div className={styles.formGrid}>
              <Field label="Período"><select value={goalForm.period} onChange={e => setGoalForm({...goalForm,period:e.target.value as PerformanceGoalPeriod})}><option value="MONTHLY">Mensal</option><option value="YEARLY">Anual</option></select></Field>
              <Field label="Ano"><input type="number" value={goalForm.year} onChange={e => setGoalForm({...goalForm,year:e.target.value})} required /></Field>
              {goalForm.period === "MONTHLY" ? <Field label="Mês"><select value={goalForm.month} onChange={e => setGoalForm({...goalForm,month:e.target.value})}>{MONTHS.map((month,index) => <option key={month} value={index+1}>{month}</option>)}</select></Field> : null}
              <Field label="Modalidade"><select value={goalForm.activityType} onChange={e => setGoalForm({...goalForm,activityType:e.target.value as GoalForm["activityType"]})}><option value="ALL">Todas</option>{Object.entries(ACTIVITY_LABELS).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
              <Field label="Métrica"><select value={goalForm.metric} onChange={e => setGoalForm({...goalForm,metric:e.target.value as PerformanceGoalMetric})}>{Object.entries(METRIC_LABELS).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
              <Field label="Meta"><input inputMode="decimal" value={goalForm.target} onChange={e => setGoalForm({...goalForm,target:e.target.value})} placeholder="Ex.: 800" required /></Field>
            </div>
            <ModalActions saving={saving} onCancel={() => setModal(null)} label="Salvar meta" />
          </form>
        </ModalShell>
      ) : null}

      {modal === "assessment" ? (
        <ModalShell title={assessmentForm.id ? "Editar avaliação" : "Nova avaliação física"} eyebrow="EVOLUÇÃO CORPORAL" onClose={() => setModal(null)}>
          <form onSubmit={submitAssessment} className={styles.form}>
            <div className={styles.formGrid}>
              <Field label="Data"><input type="date" value={assessmentForm.date} onChange={e => setAssessmentForm({...assessmentForm,date:e.target.value})} required /></Field>
              <Field label="Peso (kg)"><input inputMode="decimal" value={assessmentForm.weightKg} onChange={e => setAssessmentForm({...assessmentForm,weightKg:e.target.value})} /></Field>
              <Field label="Gordura corporal (%)"><input inputMode="decimal" value={assessmentForm.bodyFatPercent} onChange={e => setAssessmentForm({...assessmentForm,bodyFatPercent:e.target.value})} /></Field>
              <Field label="Massa muscular (kg)"><input inputMode="decimal" value={assessmentForm.muscleMassKg} onChange={e => setAssessmentForm({...assessmentForm,muscleMassKg:e.target.value})} /></Field>
              <Field label="Cintura (cm)"><input inputMode="decimal" value={assessmentForm.waistCm} onChange={e => setAssessmentForm({...assessmentForm,waistCm:e.target.value})} /></Field>
              <Field label="Abdômen (cm)"><input inputMode="decimal" value={assessmentForm.abdomenCm} onChange={e => setAssessmentForm({...assessmentForm,abdomenCm:e.target.value})} /></Field>
              <Field label="Peitoral (cm)"><input inputMode="decimal" value={assessmentForm.chestCm} onChange={e => setAssessmentForm({...assessmentForm,chestCm:e.target.value})} /></Field>
              <Field label="Braço (cm)"><input inputMode="decimal" value={assessmentForm.armCm} onChange={e => setAssessmentForm({...assessmentForm,armCm:e.target.value})} /></Field>
              <Field label="Coxa (cm)"><input inputMode="decimal" value={assessmentForm.thighCm} onChange={e => setAssessmentForm({...assessmentForm,thighCm:e.target.value})} /></Field>
              <Field label="Observações" full><textarea rows={4} value={assessmentForm.notes} onChange={e => setAssessmentForm({...assessmentForm,notes:e.target.value})} /></Field>
            </div>
            <ModalActions saving={saving} onCancel={() => setModal(null)} label="Salvar avaliação" />
          </form>
        </ModalShell>
      ) : null}
    </>
  );
}

function summarize(activities: PerformanceActivity[]) {
  return activities.reduce((acc, activity) => ({
    distance: acc.distance + (activity.distanceKm || 0),
    minutes: acc.minutes + (activity.durationMinutes || 0),
    elevation: acc.elevation + (activity.elevationMeters || 0),
    count: acc.count + 1,
  }), { distance: 0, minutes: 0, elevation: 0, count: 0 });
}

function Metric({label,value,detail,icon}:{label:string;value:string;detail:string;icon:string}) {
  return <article className={styles.metric}><div className={styles.metricIcon}>{icon}</div><div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div></article>;
}

function MonthlyBars({series,currentMonth}:{series:number[];currentMonth:number}) {
  const max = Math.max(1, ...series);
  return <div className={styles.chart} role="img" aria-label="Gráfico de distância mensal">
    {series.map((value,index) => <div className={styles.barColumn} key={index}><div className={styles.barValue}>{value > 0 ? fmtNumber(value,0) : ""}</div><div className={styles.barTrack}><div className={`${styles.barFill} ${index+1 === currentMonth ? styles.barCurrent : ""}`} style={{height:`${Math.max(value ? 8 : 2,(value/max)*100)}%`}} /></div><span>{MONTHS[index].slice(0,3)}</span></div>)}
  </div>;
}

function GoalProgress({goal,progress}:{goal:PerformanceGoal;progress:{value:number;percent:number}}) {
  return <div className={styles.goalProgress}><div><strong>{goal.activityType ? ACTIVITY_LABELS[goal.activityType] : "Geral"} · {METRIC_LABELS[goal.metric]}</strong><span>{progress.percent}%</span></div><Progress value={progress.percent}/><small>{formatMetric(progress.value,goal.metric)} de {formatMetric(goal.target,goal.metric)}</small></div>;
}

function Progress({value}:{value:number}) {
  return <div className={styles.progress}><div style={{width:`${Math.max(0,Math.min(100,value))}%`}} /></div>;
}

function formatMetric(value:number,metric:PerformanceGoalMetric) {
  if (metric === "DISTANCE_KM") return `${fmtNumber(value,1)} km`;
  if (metric === "DURATION_MINUTES") return fmtHours(value);
  if (metric === "ELEVATION_METERS") return `${fmtNumber(value)} m`;
  return `${fmtNumber(value)} treino${value === 1 ? "" : "s"}`;
}

function ActivityRow({activity,compact=false,onClick}:{activity:PerformanceActivity;compact?:boolean;onClick?:()=>void}) {
  return <div className={`${styles.activityRow} ${compact ? styles.activityCompact : ""}`} role={onClick ? "button" : undefined} tabIndex={onClick ? 0 : undefined} onClick={onClick} onKeyDown={event => { if (onClick && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onClick(); } }}><div className={styles.activityIcon}>{ACTIVITY_ICONS[activity.type]}</div><div className={styles.activityMain}><strong>{activity.title}</strong><span>{fmtDate(activity.date)} · {ACTIVITY_LABELS[activity.type]}{activity.type === "STRENGTH" && activity.strengthSystem ? " · " + strengthSystemLabel(activity.strengthSystem) : ""}{activity.source === "STRAVA" ? " · Strava" : ""}</span></div><div className={styles.activityMetrics}>{activity.type === "STRENGTH" && activity.strengthExercises?.length ? <span><strong>{activity.strengthExercises.length}</strong> exercício{activity.strengthExercises.length === 1 ? "" : "s"}</span> : null}{activity.type === "TENNIS" ? <span><strong>{activity.tennisKind === "MATCH" ? "Partida" : "Treino"}</strong>{activity.tennisOpponent ? `vs. ${activity.tennisOpponent}` : ""}</span> : null}{activity.distanceKm ? <span><strong>{fmtNumber(activity.distanceKm,1)}</strong> km</span> : null}{activity.durationMinutes ? <span><strong>{fmtHours(activity.durationMinutes)}</strong></span> : null}{activity.averageSpeedKmh ? <span><strong>{fmtNumber(activity.averageSpeedKmh,1)}</strong> km/h</span> : null}{activity.elevationMeters ? <span><strong>{fmtNumber(activity.elevationMeters)}</strong> m ↑</span> : null}</div></div>;
}

function AssessmentSummary({item}:{item:PerformanceAssessment}) {
  return <div><div className={styles.assessmentHeadline}><strong>{fmtDate(item.date)}</strong><span>{item.notes || "Última avaliação registrada"}</span></div><div className={styles.measureGrid}><Measure label="Peso" value={item.weightKg} unit="kg"/><Measure label="Gordura" value={item.bodyFatPercent} unit="%"/><Measure label="Massa muscular" value={item.muscleMassKg} unit="kg"/><Measure label="Cintura" value={item.waistCm} unit="cm"/></div></div>;
}

function Measure({label,value,unit}:{label:string;value?:number|null;unit:string}) {
  return <div className={styles.measure}><span>{label}</span><strong>{value == null ? "—" : `${fmtNumber(value,1)} ${unit}`}</strong></div>;
}

function DurationMeasure({label,value}:{label:string;value?:number|null}) {
  return <div className={styles.measure}><span>{label}</span><strong>{value == null ? "—" : fmtHours(value)}</strong></div>;
}

function RecordCard({title,activity,metric}:{title:string;activity?:PerformanceActivity;metric:"distance"|"duration"|"elevation"}) {
  let value = "—";
  if (activity) value = metric === "distance" ? `${fmtNumber(activity.distanceKm || 0,1)} km` : metric === "duration" ? fmtHours(activity.durationMinutes || 0) : `${fmtNumber(activity.elevationMeters || 0)} m`;
  return <article className={styles.recordCard}><span className={styles.trophy}>★</span><span>{title}</span><strong>{value}</strong><small>{activity ? `${activity.title} · ${fmtDate(activity.date)}` : "Registre atividades para gerar recordes"}</small></article>;
}

function Empty({text,action,onClick}:{text:string;action:string;onClick:()=>void}) {
  return <div className={styles.empty}><span>◎</span><p>{text}</p><button className="secondary" onClick={onClick}>{action}</button></div>;
}

function ModalShell({title,eyebrow,onClose,children}:{title:string;eyebrow:string;onClose:()=>void;children:React.ReactNode}) {
  return <div className={styles.backdrop} role="presentation"><div className={styles.modal} role="dialog" aria-modal="true" aria-label={title}><div className={styles.modalHeader}><div><span className={styles.kicker}>{eyebrow}</span><h2>{title}</h2></div><button className="secondary" onClick={onClose}>Fechar</button></div>{children}</div></div>;
}

function Field({label,full=false,children}:{label:string;full?:boolean;children:React.ReactNode}) {
  return <label className={`${styles.field} ${full ? styles.fieldFull : ""}`}><span>{label}</span>{children}</label>;
}

function ModalActions({saving,onCancel,label}:{saving:boolean;onCancel:()=>void;label:string}) {
  return <div className={styles.modalActions}><button type="button" className="secondary" onClick={onCancel}>Cancelar</button><button className="primary" disabled={saving}>{saving ? "Salvando..." : label}</button></div>;
}
