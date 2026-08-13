"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./KidsPage.module.css";
import {
  createKidsSeed,
  kidsClassName,
  normalizeKidsData,
} from "@/lib/kids/seed";
import type {
  KidsAttendanceStatus,
  KidsCategory,
  KidsClass,
  KidsData,
  KidsEvent,
  KidsLesson,
  KidsReplacement,
  KidsStudent,
} from "@/types/kids";
import type { FinanceData } from "@/types/financeiro";

type KidsTab = "dashboard" | "agenda" | "classes" | "students" | "replacements" | "events" | "reports";
type AgendaFilter = "ALL" | "COMPLETED" | "CANCELLED";
export type KidsLessonOpenRequest={date:string;time:string;category:KidsCategory};
const categoryLabel: Record<KidsCategory, string> = {
  RED: "Vermelha",
  ORANGE: "Laranja",
  GREEN: "Verde",
  YELLOW: "Amarela",
};
const weekdayLabel = [
  "domingo",
  "segunda",
  "terça",
  "quarta",
  "quinta",
  "sexta",
  "sábado",
];
const statusLabel = {
  SCHEDULED: "Agendada",
  COMPLETED: "Realizada",
  CANCELLED: "Cancelada",
  HOLIDAY: "Feriado",
};
const localeCompare = (a: string, b: string) => a.localeCompare(b, "pt-BR");
const formatDate = (value: string) =>
  new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR");
const currentMonth = () => new Date().toISOString().slice(0, 7);
const groupName=(classes:KidsClass[],id:string)=>classes.find(group=>group.id===id)?.name||"Turma";
const normalizeName=(value:string)=>value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]/g,"");
function whatsappNumber(phone?:string){
  const digits=(phone||"").replace(/\D/g,"");
  if(!digits)return {href:"",missingDdd:false};
  if(digits.length===8||digits.length===9)return {href:"",missingDdd:true};
  if((digits.length===12||digits.length===13)&&digits.startsWith("55"))return {href:`https://wa.me/${digits}`,missingDdd:false};
  if(digits.length===10||digits.length===11)return {href:`https://wa.me/55${digits}`,missingDdd:false};
  return {href:"",missingDdd:false};
}

export default function KidsPage({ onBack, openRequest }: { onBack: () => void; openRequest?:KidsLessonOpenRequest|null }) {
  const [data, setData] = useState<KidsData | null>(null);
  const [tab, setTab] = useState<KidsTab>("dashboard");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [month, setMonth] = useState(currentMonth());
  const [lessonId, setLessonId] = useState<string | null>(null);
  const [classId, setClassId] = useState<string | null>(null);
  const [studentId, setStudentId] = useState<string | null>(null);
  const [reportKind, setReportKind] = useState<"student" | "class">("student");
  const [reportId, setReportId] = useState("");
  const [agendaFilter, setAgendaFilter] = useState<AgendaFilter>("ALL");
  const [vacanciesOnly, setVacanciesOnly] = useState(false);
  const [showReplacementForm,setShowReplacementForm]=useState(false);
  const [showInactiveStudents,setShowInactiveStudents]=useState(false);
  const [showNewStudentForm,setShowNewStudentForm]=useState(false);

  useEffect(() => {
    void load();
  }, []);
  useEffect(()=>{
    if(!data||!openRequest)return;
    const target=data.lessons.find(lesson=>{
      const lessonClass=data.classes.find(group=>group.id===lesson.classId);
      return lesson.date===openRequest.date&&lessonClass?.category===openRequest.category&&lessonClass.startTime===openRequest.time;
    });
    if(target){setTab("agenda");setLessonId(target.id);}
  },[data,openRequest]);
  async function load() {
    setLoading(true);
    try {
      const response = await fetch("/api/kids", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      let next = normalizeKidsData(payload.data || createKidsSeed());
      try {
        const financeResponse = await fetch("/api/finance", {
          cache: "no-store",
        });
        if (financeResponse.ok) {
          const financePayload = await financeResponse.json();
          if (financePayload.data)
            next = mergeFinanceProfiles(next, financePayload.data);
        }
      } catch {}
      setData(next);
      if (
        !payload.data ||
        JSON.stringify(next) !== JSON.stringify(payload.data)
      )
        await persist(next, "Dados das aulas atualizados.");
    } catch {
      setNotice("Não foi possível carregar o Tênis Kids.");
    } finally {
      setLoading(false);
    }
  }
  async function persist(next: KidsData, message = "Alterações salvas.") {
    const stamped = { ...next, updatedAt: new Date().toISOString() };
    setData(stamped);
    setSaving(true);
    try {
      const response = await fetch("/api/kids", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(stamped),
      });
      if (!response.ok) throw new Error();
      setNotice(message);
      return true;
    } catch {
      setNotice("Erro ao salvar. Tente novamente.");
      return false;
    } finally {
      setSaving(false);
    }
  }
  async function syncStudentFinance(student:KidsStudent,studentClasses:KidsClass[]){
    if(student.monthlyAmount===undefined)return;
    try{
      const response=await fetch("/api/finance",{cache:"no-store"});
      if(!response.ok)throw new Error();
      const payload=await response.json();
      const finance=payload.data as FinanceData|undefined;
      if(!finance)throw new Error();
      const competence=finance.currentCompetence;
      const nameKey=normalizeName(student.name);
      const sameStudent=(item:FinanceData["dsKids"][number])=>item.id===student.id||normalizeName(item.studentName)===nameKey;
      const currentIndex=finance.dsKids.findIndex(item=>item.competence===competence&&sameStudent(item));
      const previousIndex=finance.dsKids.findIndex(item=>item.competence!==competence&&sameStudent(item));
      if(student.billingMode==="ONE_TIME"&&currentIndex<0&&previousIndex>=0)return;
      const category=studentClasses.find(group=>group.students.some(item=>item.id===student.id&&item.active))?.category;
      const billingMode:FinanceData["dsKids"][number]["billingMode"]=student.billingMode==="ONE_TIME"?"SINGLE":student.billingMode==="INSTALLMENTS"?"INSTALLMENT":"RECURRING";
      const nextEntry={
        id:currentIndex>=0?finance.dsKids[currentIndex].id:student.id,
        competence,
        studentName:student.name.trim(),
        amount:Number(student.monthlyAmount)||0,
        dueDay:student.dueDay||null,
        billingMode,
        tennisCategory:category&&category!=="YELLOW"?category:null,
        installmentCurrent:student.billingMode==="INSTALLMENTS"?(finance.dsKids[currentIndex]?.installmentCurrent||1):null,
        installmentTotal:student.billingMode==="INSTALLMENTS"?(student.installmentCount||null):null,
      };
      const nextKids=[...finance.dsKids];
      if(currentIndex>=0)nextKids[currentIndex]=nextEntry;else nextKids.push(nextEntry);
      const save=await fetch("/api/finance",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({...finance,dsKids:nextKids})});
      if(!save.ok)throw new Error();
    }catch{
      setNotice("Cadastro salvo na DS, mas o Financeiro não atualizou. Tente salvar a criança novamente.");
    }
  }
  function updateEvent(event:KidsEvent){
    if(!data)return;
    void persist({...data,events:(data.events||[]).map(item=>item.id===event.id?event:item)},"Evento atualizado.");
  }
  const classes = data?.classes || [];
  const lessons = data?.lessons || [];
  const monthLessons = useMemo(
    () =>
      lessons
        .filter((item) => item.date.startsWith(month))
        .sort(
          (a, b) =>
            a.date.localeCompare(b.date) ||
            lessonTime(a).localeCompare(lessonTime(b)),
        ),
    [lessons, month, classes],
  );
  const allKids = useMemo(() => {
    const map = new Map<
      string,
      {
        id: string;
        name: string;
        categories: KidsCategory[];
        classIds: string[];
      }
    >();
    classes.forEach((group) =>
      group.students
        .filter((student) => student.active)
        .forEach((student) => {
          const current = map.get(student.id);
          if (current) {
            if (!current.categories.includes(group.category))
              current.categories.push(group.category);
            current.classIds.push(group.id);
          } else
            map.set(student.id, {
              id: student.id,
              name: student.name,
              categories: [group.category],
              classIds: [group.id],
            });
        }),
    );
    return [...map.values()].sort((a, b) => localeCompare(a.name, b.name));
  }, [classes]);
  const inactiveKids = useMemo(()=>{
    const map=new Map<string,{id:string;name:string;categories:KidsCategory[];classIds:string[]}>();
    classes.forEach(group=>group.students.filter(student=>!student.active).forEach(student=>{
      const current=map.get(student.id);
      if(current){if(!current.categories.includes(group.category))current.categories.push(group.category);current.classIds.push(group.id);}
      else map.set(student.id,{id:student.id,name:student.name,categories:[group.category],classIds:[group.id]});
    }));
    return [...map.values()].filter(student=>!allKids.some(active=>active.id===student.id)).sort((a,b)=>localeCompare(a.name,b.name));
  },[classes,allKids]);
  function classTime(id: string) {
    return classes.find((item) => item.id === id)?.startTime || "";
  }
  function lessonTime(lesson:KidsLesson){
    return lesson.replacementStartTime || classTime(lesson.classId);
  }
  function studentProfile(id:string){
    for(const item of classes){
      const student=item.students.find(candidate=>candidate.id===id);
      if(student)return student;
    }
    return undefined;
  }
  function group(id: string) {
    return classes.find((item) => item.id === id);
  }
  function lessonGroup(lesson:KidsLesson):KidsClass|undefined{
    const regular=group(lesson.classId);
    if(regular)return regular;
    if(lesson.kind!=="REPLACEMENT"||!lesson.replacementCategory)return undefined;
    return {
      id:lesson.classId,
      name:lesson.replacementName||"Aula avulsa de reposição",
      weekday:new Date(`${lesson.date}T12:00:00`).getDay(),
      startTime:lesson.replacementStartTime||"",
      endTime:lesson.replacementEndTime||"",
      category:lesson.replacementCategory,
      teacher:"Danilo Modesto",
      students:(lesson.replacementStudentIds||[]).map(studentProfile).filter(Boolean) as KidsStudent[],
      active:true,
      updatedAt:lesson.updatedAt,
    };
  }
  function openLesson(id: string) {
    setLessonId(id);
    setClassId(null);
  }
  function openClass(id: string) {
    setClassId(id);
    setLessonId(null);
    setStudentId(null);
  }
  function openStudent(id: string) {
    setStudentId(id);
    setClassId(null);
    setLessonId(null);
  }
  function openAgenda(filter: AgendaFilter) {
    setAgendaFilter(filter);
    setTab("agenda");
  }
  function updateLesson(next: KidsLesson) {
    if (!data) return;
    const current=data.lessons.find(item=>item.id===next.id);
    const currentReplacementIds=new Set(current?.replacementStudentIds||[]);
    const nextReplacementIds=new Set(next.replacementStudentIds||[]);
    const relatedGroup = lessonGroup(next);
    let replacements = [...(data.replacements || [])];
    if (
      next.status === "CANCELLED" &&
      next.replacementEligible &&
      relatedGroup && next.kind!=="REPLACEMENT"
    ) {
      for (const student of relatedGroup.students.filter(
        (item) =>
          item.active && (!item.startDate || item.startDate <= next.date),
      )) {
        if (
          !replacements.some(
            (item) =>
              item.sourceLessonId === next.id && item.studentId === student.id,
          )
        )
          replacements.push({
            id: `replacement-${next.id}-${student.id}`,
            studentId: student.id,
            classId: next.classId,
            sourceLessonId: next.id,
            sourceDate: next.date,
            reason: next.notes || "Aula cancelada com direito à reposição",
            status: "PENDING",
          });
      }
    } else
      replacements = replacements.filter(
        (item) =>
          item.sourceLessonId !== next.id || item.status === "COMPLETED",
      );
    for(const studentId of nextReplacementIds){
      if(currentReplacementIds.has(studentId))continue;
      const credit=replacements.find(item=>item.studentId===studentId&&item.status==="PENDING");
      if(credit){
        credit.status="SCHEDULED";
        credit.scheduledDate=next.date;
        credit.destinationLessonId=next.id;
      }
    }
    for(const studentId of currentReplacementIds){
      if(nextReplacementIds.has(studentId))continue;
      const credit=replacements.find(item=>item.studentId===studentId&&item.destinationLessonId===next.id&&item.status==="SCHEDULED");
      if(credit){
        credit.status="PENDING";
        delete credit.scheduledDate;
        delete credit.destinationLessonId;
      }
    }
    void persist(
      {
        ...data,
        lessons: data.lessons.map((item) =>
          item.id === next.id ? next : item,
        ),
        replacements,
      },
      "Aula salva com sucesso.",
    );
    setLessonId(null);
  }
  function createReplacementLesson(input:{date:string;startTime:string;endTime:string;category:KidsCategory;studentIds:string[]}){
    if(!data)return;
    const id=`replacement-lesson-${crypto.randomUUID()}`;
    const nextLesson:KidsLesson={
      id,classId:"replacement",date:input.date,status:"SCHEDULED",kind:"REPLACEMENT",
      replacementName:`Reposição coletiva · Bola ${categoryLabel[input.category]}`,
      replacementCategory:input.category,replacementStartTime:input.startTime,replacementEndTime:input.endTime,
      replacementCapacity:input.studentIds.length,replacementStudentIds:input.studentIds,
      attendance:Object.fromEntries(input.studentIds.map(studentId=>[studentId,"PRESENT"])),
      objective:"",plannedPlan:"",actualPlan:"",notes:"",replacementEligible:false,replacementStatus:"NONE",updatedAt:new Date().toISOString(),
    };
    const replacements=(data.replacements||[]).map(item=>{
      if(input.studentIds.includes(item.studentId)&&item.status==="PENDING")
        return {...item,status:"SCHEDULED" as const,scheduledDate:input.date,destinationLessonId:id};
      return item;
    });
    void persist({...data,lessons:[...data.lessons,nextLesson],replacements},"Aula avulsa de reposição criada.");
    setShowReplacementForm(false);setTab("replacements");setLessonId(id);
  }
  function updateClass(next: KidsClass) {
    if (!data) return;
    void persist(
      {
        ...data,
        classes: data.classes.map((item) =>
          item.id === next.id ? next : item,
        ),
      },
      "Turma atualizada.",
    );
    setClassId(null);
  }
  async function updateStudentClasses(nextClasses: KidsClass[]) {
    if (!data) return;
    const saved=await persist(
      { ...data, classes: nextClasses },
      "Cadastro da criança atualizado.",
    );
    if(saved&&studentId){
      const student=nextClasses.flatMap(group=>group.students).find(item=>item.id===studentId);
      if(student)await syncStudentFinance(student,nextClasses);
    }
    setStudentId(null);
  }
  function createStudent(input:{name:string;classId:string;startDate:string}) {
    if (!data) return;
    const clean=input.name.trim();
    if(!clean)return;
    const id=`kid-${crypto.randomUUID()}`;
    const nextClasses=data.classes.map(group=>group.id===input.classId?{
      ...group,
      students:[...group.students,{id,name:clean,active:true,startDate:input.startDate}].sort((a,b)=>localeCompare(a.name,b.name)),
      updatedAt:new Date().toISOString(),
    }:group);
    void persist({...data,classes:nextClasses},"Aluno cadastrado na DS.");
    setShowNewStudentForm(false);
    setTab("students");
    setStudentId(id);
  }

  const today = new Date().toISOString().slice(0, 10);
  const todayLessons = lessons
    .filter((item) => item.date === today)
    .sort((a, b) => lessonTime(a).localeCompare(lessonTime(b)));
  const completed = lessons.filter(
    (item) =>
      item.status === "COMPLETED" ||
      (item.status === "SCHEDULED" &&
        lessonHasPassed(item, classes)),
  ).length;
  const cancelled = lessons.filter(
    (item) => item.status === "CANCELLED",
  ).length;
  const capacity = classes
    .filter((item) => item.active)
    .reduce(
      (total, item) =>
        total + (item.category === "RED" || item.category === "ORANGE" ? 6 : 4),
      0,
    );
  const occupied = classes
    .filter((item) => item.active)
    .reduce(
      (total, item) =>
        total + item.students.filter((student) => student.active).length,
      0,
    );
  const occupancy = capacity ? Math.round((occupied / capacity) * 100) : 0;
  const displayedLessons = (
    agendaFilter === "ALL"
      ? monthLessons
      : lessons.filter((item) =>
          agendaFilter === "COMPLETED"
            ? item.status === "COMPLETED" ||
              (item.status === "SCHEDULED" && lessonHasPassed(item, classes))
            : agendaFilter === "CANCELLED"
              ? item.status === "CANCELLED"
              : item.replacementStatus === "PENDING" ||
                item.replacementStatus === "SCHEDULED",
        )
  )
    .slice()
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        lessonTime(a).localeCompare(lessonTime(b)),
    );

  if (loading)
    return (
      <section className={styles.loading}>
        <img src="/logo-ctds.png" alt="CT DS Tennis" />
        <strong>Carregando Aulas Kids...</strong>
      </section>
    );
  if (!data)
    return (
      <section className={styles.loading}>
        <strong>Não foi possível abrir o módulo.</strong>
        <button onClick={() => void load()}>Tentar novamente</button>
      </section>
    );

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div>
          <button className={styles.back} onClick={onBack}>
            ← Voltar ao DMP
          </button>
          <p>CT DS TENNIS · GESTÃO PEDAGÓGICA</p>
          <h1>Aulas Kids</h1>
          <span>
            Semestre de {formatDate(data.semesterStart)} a{" "}
            {formatDate(data.semesterEnd)}
          </span>
        </div>
        <img src="/logo-ctds.png" alt="CT DS Tennis" />
      </header>
      <nav className={styles.tabs}>
        {(
          [
            ["dashboard", "Visão geral"],
            ["agenda", "Agenda"],
            ["classes", "Turmas"],
            ["students", "Alunos"],
            ["replacements", "Reposições"],
            ["events", "Eventos"],
            ["reports", "Relatórios"],
          ] as [KidsTab, string][]
        ).map(([value, label]) => (
          <button
            key={value}
            className={tab === value ? styles.active : ""}
            onClick={() => setTab(value)}
          >
            {label}
          </button>
        ))}
      </nav>
      {notice ? (
        <div className={styles.notice}>
          {notice}
          <button onClick={() => setNotice("")}>×</button>
        </div>
      ) : null}
      {saving ? <div className={styles.saving}>Salvando...</div> : null}

      {tab === "dashboard" ? (
        <>
          <section className={styles.stats}>
            <button className={styles.stat} onClick={()=>{setVacanciesOnly(false);setTab("classes");}}>
              <span>🎾</span>
              <div>
                <small>Turmas / aulas realizadas</small>
                <strong>{classes.filter((item)=>item.active).length} turmas</strong>
                <small>{completed} aulas realizadas</small>
              </div>
              <b>›</b>
            </button>
            <Stat
              label="Alunos ativos"
              value={allKids.length}
              icon="👥"
              onClick={() => setTab("students")}
            />
            <Stat
              label="Canceladas"
              value={cancelled}
              icon="🌧️"
              onClick={() => openAgenda("CANCELLED")}
            />
            <Stat
              label="Ocupação das vagas"
              value={occupancy}
              suffix={`% · ${occupied}/${capacity}`}
              icon="📊"
              onClick={() => {
                setVacanciesOnly(true);
                setTab("classes");
              }}
            />
          </section>
          <section className={styles.panel}>
            <div className={styles.panelHead}>
              <div>
                <h2>Aulas de hoje</h2>
                <p>
                  Abra uma aula para registrar presença, objetivo e plano
                  realizado.
                </p>
              </div>
              <button onClick={() => setTab("agenda")}>Abrir agenda</button>
            </div>
            {todayLessons.length ? (
              <div className={styles.lessonList}>
                {todayLessons.map((lesson) => (
                  <LessonRow
                    key={lesson.id}
                    lesson={lesson}
                    group={lessonGroup(lesson)}
                    onClick={() => openLesson(lesson.id)}
                  />
                ))}
              </div>
            ) : (
              <Empty
                title="Nenhuma aula Kids hoje"
                text="Consulte as próximas aulas na agenda do semestre."
              />
            )}
          </section>
          <section className={styles.grid2}>
            <article className={styles.panel}>
              <h2>Próximas aulas</h2>
              <div className={styles.lessonList}>
                {lessons
                  .filter(
                    (item) => item.date >= today && item.status === "SCHEDULED",
                  )
                  .sort(
                    (a, b) =>
                      a.date.localeCompare(b.date) ||
                      lessonTime(a).localeCompare(lessonTime(b)),
                  )
                  .slice(0, 6)
                  .map((lesson) => (
                    <LessonRow
                      key={lesson.id}
                      lesson={lesson}
                      group={lessonGroup(lesson)}
                      onClick={() => openLesson(lesson.id)}
                    />
                  ))}
              </div>
            </article>
            <article className={styles.panel}>
              <h2>Todos os alunos</h2>
              <p>Clique na criança para consultar suas turmas e seus dados.</p>
              <div className={styles.kidsRoster}>
                {allKids.map((student) => (
                  <button
                    key={student.id}
                    onClick={() => openStudent(student.id)}
                  >
                    <span className={styles.categoryDots}>
                      {student.categories.map((category) => (
                        <CategoryDot key={category} category={category} />
                      ))}
                    </span>
                    <strong>{student.name}</strong>
                    <small>
                      {student.classIds.length} turma
                      {student.classIds.length === 1 ? "" : "s"}
                    </small>
                    <span>›</span>
                  </button>
                ))}
              </div>
            </article>
          </section>
        </>
      ) : null}

      {tab === "agenda" ? (
        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <div>
              <h2>
                {agendaFilter === "ALL"
                  ? "Agenda do semestre"
                  : agendaFilter === "COMPLETED"
                    ? "Aulas realizadas"
                    : agendaFilter === "CANCELLED"
                      ? "Aulas canceladas"
                      : "Reposições pendentes"}
              </h2>
              <p>
                Aulas, feriados, cancelamentos e reposições em uma única lista.
              </p>
            </div>
            {agendaFilter === "ALL" ? (
              <input
                type="month"
                value={month}
                min="2026-08"
                max="2026-12"
                onChange={(event) => setMonth(event.target.value)}
              />
            ) : (
              <button onClick={() => setAgendaFilter("ALL")}>
                Ver agenda completa
              </button>
            )}
          </div>
          <div className={styles.lessonList}>
            {displayedLessons.length ? (
              displayedLessons.map((lesson) => (
                <LessonRow
                  key={lesson.id}
                  lesson={lesson}
                  group={lessonGroup(lesson)}
                  onClick={() => openLesson(lesson.id)}
                />
              ))
            ) : (
              <Empty
                title="Nenhuma aula encontrada"
                text={
                  agendaFilter === "ALL"
                    ? "Escolha outro mês do semestre."
                    : "Não há registros nesta categoria."
                }
              />
            )}
          </div>
        </section>
      ) : null}

      {tab === "classes" ? (
        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <div>
              <h2>{vacanciesOnly ? "Turmas com vagas" : "Turmas"}</h2>
              <p>
                {vacanciesOnly
                  ? "Veja rapidamente onde ainda é possível matricular crianças."
                  : "Relação inicial importada da agenda. Confira e edite quando necessário."}
              </p>
            </div>
            {vacanciesOnly ? (
              <button onClick={() => setVacanciesOnly(false)}>Ver todas</button>
            ) : null}
          </div>
          <div className={styles.classGrid}>
            {classes
              .filter(
                (item) =>
                  !vacanciesOnly ||
                  item.students.filter((student) => student.active).length <
                    (item.category === "RED" || item.category === "ORANGE"
                      ? 6
                      : 4),
              )
              .slice()
              .sort(
                (a, b) =>
                  a.weekday - b.weekday ||
                  a.startTime.localeCompare(b.startTime),
              )
              .map((item) => {
                const enrolled = item.students.filter(
                  (student) => student.active,
                ).length;
                const slots =
                  item.category === "RED" || item.category === "ORANGE" ? 6 : 4;
                return (
                  <button
                    className={styles.classCard}
                    key={item.id}
                    onClick={() => openClass(item.id)}
                  >
                    <CategoryDot category={item.category} />
                    <span>
                      <strong>{item.name}</strong>
                      <small>
                        {enrolled}/{slots} alunos ·{" "}
                        {Math.max(0, slots - enrolled)} vagas disponíveis
                      </small>
                    </span>
                    <b>Abrir</b>
                  </button>
                );
              })}
          </div>
        </section>
      ) : null}

      {tab === "students" ? (
        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <div>
              <h2>{showInactiveStudents?"Alunos inativos":"Alunos"}</h2>
              <p>{showInactiveStudents?"Cadastros preservados fora das chamadas atuais.":"Cadastro único das crianças e todas as suas turmas."}</p>
            </div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap",justifyContent:"flex-end"}}>
              {!showInactiveStudents?<button className={styles.primary} onClick={()=>setShowNewStudentForm(true)}>+ Novo aluno</button>:null}
              <button onClick={()=>setShowInactiveStudents(current=>!current)}>{showInactiveStudents?"Ver alunos ativos":`Ver alunos inativos (${inactiveKids.length})`}</button>
            </div>
          </div>
          <div className={styles.kidsRoster}>
            {(showInactiveStudents?inactiveKids:allKids).map((student) => (
              <button key={student.id} onClick={() => openStudent(student.id)}>
                <span className={styles.categoryDots}>
                  {student.categories.map((category) => (
                    <CategoryDot key={category} category={category} />
                  ))}
                </span>
                <strong>{student.name}</strong>
                <small>{student.classIds.length} turma{student.classIds.length === 1 ? "" : "s"}</small>
                <span>›</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {tab === "replacements" ? (
        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <div><h2>Controle de reposições</h2><p>Créditos individuais, aulas agendadas e histórico de utilização.</p></div>
            <button className={styles.primary} onClick={()=>setShowReplacementForm(true)}>+ Aula avulsa de reposição</button>
          </div>
          <ReplacementBoard replacements={data.replacements||[]} students={allKids}/>
        </section>
      ) : null}

      {tab === "events" ? <KidsEvents events={data.events||[]} onSave={updateEvent}/> : null}

      {tab === "reports" ? (
        <Reports
          data={data}
          kind={reportKind}
          setKind={setReportKind}
          reportId={reportId}
          setReportId={setReportId}
        />
      ) : null}
      {lessonId ? (
        <LessonEditor
          lesson={lessons.find((item) => item.id === lessonId)!}
          group={lessonGroup(lessons.find((item) => item.id === lessonId)!)!}
          replacements={data.replacements||[]}
          allStudents={classes.flatMap(item=>item.students).filter((item,index,array)=>array.findIndex(candidate=>candidate.id===item.id)===index)}
          onClose={() => setLessonId(null)}
          onSave={updateLesson}
        />
      ) : null}
      {showReplacementForm ? <ReplacementLessonForm replacements={data.replacements||[]} students={classes.flatMap(item=>item.students).filter((item,index,array)=>array.findIndex(candidate=>candidate.id===item.id)===index)} classes={classes} lessons={lessons} onClose={()=>setShowReplacementForm(false)} onSave={createReplacementLesson}/> : null}
      {showNewStudentForm?<NewStudentForm classes={classes.filter(item=>item.active)} semesterStart={data.semesterStart} onClose={()=>setShowNewStudentForm(false)} onSave={createStudent}/>:null}
      {classId ? (
        <ClassEditor
          group={group(classId)!}
          semesterStart={data.semesterStart}
          onClose={() => setClassId(null)}
          onSave={updateClass}
        />
      ) : null}
      {studentId ? (
        <StudentEditor
          studentId={studentId}
          data={data}
          classes={classes}
          lessons={lessons}
          replacements={data.replacements || []}
          semesterStart={data.semesterStart}
          onClose={() => setStudentId(null)}
          onOpenClass={openClass}
          onSave={updateStudentClasses}
        />
      ) : null}
    </div>
  );
}

function NewStudentForm({classes,semesterStart,onClose,onSave}:{classes:KidsClass[];semesterStart:string;onClose:()=>void;onSave:(input:{name:string;classId:string;startDate:string})=>void}){
  const [name,setName]=useState("");
  const [classId,setClassId]=useState(classes[0]?.id||"");
  const [startDate,setStartDate]=useState(semesterStart);
  return <div className={styles.modalBackdrop}><section className={styles.modal}>
    <div className={styles.modalHead}><div><h2>Novo aluno</h2><p>Cadastre a criança na DS e escolha a turma inicial.</p></div><button onClick={onClose}>×</button></div>
    <div className={styles.formGrid}>
      <label>Nome da criança<input value={name} onChange={event=>setName(event.target.value)} autoFocus placeholder="Nome completo"/></label>
      <label>Turma<select value={classId} onChange={event=>setClassId(event.target.value)}>{classes.map(group=><option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
      <label>Início na turma<input type="date" min={semesterStart} value={startDate} onChange={event=>setStartDate(event.target.value)}/></label>
    </div>
    {!classes.length?<p>Nenhuma turma ativa disponível.</p>:null}
    <div className={styles.modalActions}><button onClick={onClose}>Cancelar</button><button className={styles.primary} disabled={!name.trim()||!classId} onClick={()=>onSave({name,classId,startDate})}>Cadastrar e completar dados</button></div>
  </section></div>;
}

function KidsEvents({events,onSave}:{events:KidsEvent[];onSave:(event:KidsEvent)=>void}){
  const [query,setQuery]=useState("");
  const [year,setYear]=useState("ALL");
  const [month,setMonth]=useState("ALL");
  const years=[...new Set(events.map(item=>item.year))].sort();
  const normalized=query.trim().toLocaleLowerCase("pt-BR");
  const filtered=events.filter(event=>(year==="ALL"||String(event.year)===year)&&(month==="ALL"||event.startDate.slice(5,7)===month)&&(!normalized||`${event.name} ${event.description||""}`.toLocaleLowerCase("pt-BR").includes(normalized))).sort((a,b)=>{
    const todayKey=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
    const aPast=(a.endDate||a.startDate)<todayKey;const bPast=(b.endDate||b.startDate)<todayKey;
    if(aPast!==bPast)return aPast?1:-1;
    return aPast?b.startDate.localeCompare(a.startDate):a.startDate.localeCompare(b.startDate);
  });
  const visibleYears=[...new Set(filtered.map(item=>item.year))].sort();
  return <section className={styles.panel}>
    <div className={styles.panelHead}><div><h2>Eventos DS Tennis</h2><p>Calendário anual, informações e pastas de trabalho no Google Drive.</p></div></div>
    <div className={styles.eventFilters}><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Buscar evento..."/><select value={year} onChange={event=>setYear(event.target.value)}><option value="ALL">Todos os anos</option>{years.map(value=><option key={value} value={value}>{value}</option>)}</select><select value={month} onChange={event=>setMonth(event.target.value)}><option value="ALL">Todos os meses</option>{Array.from({length:12},(_,index)=>{const value=String(index+1).padStart(2,"0");return <option key={value} value={value}>{new Date(2026,index,1).toLocaleDateString("pt-BR",{month:"long"})}</option>;})}</select></div>
    {visibleYears.map(value=><div key={value} className={styles.eventsYear}>
      <h3>{value}</h3>
      <div className={styles.eventsGrid}>{filtered.filter(item=>item.year===value).map(event=><KidsEventCard key={event.id} event={event} onSave={onSave}/>)}</div>
    </div>)}
    {!filtered.length?<Empty title="Nenhum evento encontrado" text="Altere os filtros ou pesquise outro nome."/>:null}
  </section>;
}

function KidsEventCard({event,onSave}:{event:KidsEvent;onSave:(event:KidsEvent)=>void}){
  const [editing,setEditing]=useState(false);
  const [driveUrl,setDriveUrl]=useState(event.driveUrl||"");
  const date=event.endDate&&event.endDate!==event.startDate?`${formatDate(event.startDate)} a ${formatDate(event.endDate)}`:formatDate(event.startDate);
  const past=(event.endDate||event.startDate)<new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  return <article className={`${styles.eventCard} ${past?styles.eventPast:""}`}>
    <div className={styles.eventDate}><span>{new Date(`${event.startDate}T12:00:00`).toLocaleDateString("pt-BR",{month:"short"}).replace(".","")}</span><strong>{new Date(`${event.startDate}T12:00:00`).getDate()}</strong></div>
    <div className={styles.eventInfo}><small>{date}</small><h3>{event.name}</h3>{event.description?<p>{event.description}</p>:null}
      {editing?<div className={styles.eventDriveEdit}><input value={driveUrl} onChange={e=>setDriveUrl(e.target.value)} placeholder="Cole o link da pasta no Google Drive"/><button className={styles.primary} onClick={()=>{onSave({...event,driveUrl:driveUrl.trim()});setEditing(false);}}>Salvar</button></div>:null}
    </div>
    <div className={styles.eventActions}><span className={past?styles.eventDone:styles.eventUpcoming}>{past?"Realizado":"Programado"}</span>{event.driveUrl?<a href={event.driveUrl} target="_blank" rel="noreferrer">📁 Abrir pasta</a>:null}<button onClick={()=>setEditing(current=>!current)}>{event.driveUrl?"Editar link":"+ Pasta do Drive"}</button></div>
  </article>;
}

function ReplacementBoard({replacements,students}:{replacements:KidsReplacement[];students:{id:string;name:string}[]}){
  const studentName=(id:string)=>students.find(item=>item.id===id)?.name||"Aluno";
  const sections:[KidsReplacement["status"],string][]=[["PENDING","Pendentes"],["SCHEDULED","Agendadas"],["COMPLETED","Utilizadas"]];
  return <div className={styles.grid2}>{sections.map(([status,label])=><article key={status} className={styles.cancelBox}><h3>{label} · {replacements.filter(item=>item.status===status).length}</h3>{replacements.filter(item=>item.status===status).sort((a,b)=>localeCompare(studentName(a.studentId),studentName(b.studentId))).map(item=><div key={item.id} className={styles.replacementLine}><strong>{studentName(item.studentId)}</strong><small>{status==="PENDING"?`Aula perdida em ${formatDate(item.sourceDate)}`:status==="SCHEDULED"?`Marcada para ${formatDate(item.scheduledDate||item.sourceDate)}`:`Reposta em ${formatDate(item.completedDate||item.scheduledDate||item.sourceDate)}${item.attendance==="ABSENT"?" · faltou, crédito consumido":""}`}</small></div>)}</article>)}</div>;
}

function ReplacementLessonForm({replacements,students,classes,lessons,onClose,onSave}:{replacements:KidsReplacement[];students:KidsStudent[];classes:KidsClass[];lessons:KidsLesson[];onClose:()=>void;onSave:(input:{date:string;startTime:string;endTime:string;category:KidsCategory;studentIds:string[]})=>void}){
  const replacementCategory=(item:KidsReplacement)=>{
    const sourceLesson=lessons.find(lesson=>lesson.id===item.sourceLessonId);
    const sourceClassId=sourceLesson?.classId||item.classId;
    return classes.find(group=>group.id===sourceClassId)?.category;
  };
  const [date,setDate]=useState(new Date().toISOString().slice(0,10));
  const [startTime,setStartTime]=useState("16:00");
  const [endTime,setEndTime]=useState("17:00");
  const [category,setCategory]=useState<KidsCategory>(()=>{
    const firstPending=replacements.find(item=>item.status==="PENDING");
    return firstPending?replacementCategory(firstPending)||"RED":"RED";
  });
  const [selected,setSelected]=useState<string[]>([]);
  const [showStudents,setShowStudents]=useState(false);
  const pending=replacements.filter(item=>item.status==="PENDING"&&replacementCategory(item)===category).map(item=>students.find(student=>student.id===item.studentId)).filter((item,index,array):item is KidsStudent=>Boolean(item)&&array.findIndex(candidate=>candidate?.id===item?.id)===index).sort((a,b)=>localeCompare(a.name,b.name));
  useEffect(()=>{setSelected(current=>current.filter(id=>pending.some(student=>student.id===id)));setShowStudents(false);},[category]);
  return <div className={styles.modalBackdrop}><section className={styles.modal}><div className={styles.modalHead}><div><h2>Nova aula avulsa de reposição</h2><p>Escolha individualmente as crianças confirmadas.</p></div><button onClick={onClose}>×</button></div><div className={styles.formGrid}><label>Data<input type="date" value={date} onChange={event=>setDate(event.target.value)}/></label><label>Categoria<select value={category} onChange={event=>setCategory(event.target.value as KidsCategory)}>{Object.entries(categoryLabel).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><label>Início<input type="time" value={startTime} onChange={event=>setStartTime(event.target.value)}/></label><label>Fim<input type="time" value={endTime} onChange={event=>setEndTime(event.target.value)}/></label></div><button type="button" className={styles.primary} onClick={()=>setShowStudents(current=>!current)}>+ Adicionar alunos {pending.length?`(${pending.length} disponíveis)`:""}</button>{showStudents?<><h3>Crianças com reposição pendente · {selected.length} selecionada{selected.length===1?"":"s"}</h3><div className={styles.attendance}>{pending.map(student=><button type="button" key={student.id} className={selected.includes(student.id)?styles.present:""} onClick={()=>setSelected(current=>current.includes(student.id)?current.filter(id=>id!==student.id):[...current,student.id])}><span>{selected.includes(student.id)?"✓":"+"}</span><strong>{student.name}</strong><small>{selected.includes(student.id)?"Adicionada":"Adicionar"}</small></button>)}</div>{!pending.length?<Empty title={`Nenhuma reposição pendente na bola ${categoryLabel[category].toLowerCase()}`} text="Somente crianças com crédito pendente desta categoria aparecem aqui."/>:null}</>:null}<div className={styles.modalActions}><button onClick={onClose}>Cancelar</button><button className={styles.primary} disabled={!date||!startTime||!endTime||!selected.length} onClick={()=>onSave({date,startTime,endTime,category,studentIds:selected})}>Criar aula</button></div></section></div>;
}

function Stat({
  label,
  value,
  suffix = "",
  icon,
  onClick,
}: {
  label: string;
  value: number;
  suffix?: string;
  icon: string;
  onClick: () => void;
}) {
  return (
    <button className={styles.stat} onClick={onClick}>
      <span>{icon}</span>
      <div>
        <small>{label}</small>
        <strong>
          {value}
          {suffix}
        </strong>
      </div>
      <b>›</b>
    </button>
  );
}
function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className={styles.empty}>
      <strong>{title}</strong>
      <span>{text}</span>
    </div>
  );
}
function CategoryDot({ category }: { category: KidsCategory }) {
  return (
    <i
      className={`${styles.ball} ${styles[category.toLowerCase()]}`}
      title={`Bola ${categoryLabel[category]}`}
    />
  );
}
function LessonRow({
  lesson,
  group,
  onClick,
}: {
  lesson: KidsLesson;
  group?: KidsClass;
  onClick: () => void;
}) {
  if (!group) return null;
  const present = Object.values(lesson.attendance).filter(
    (value) => value === "PRESENT",
  ).length;
  return (
    <button className={styles.lessonRow} onClick={onClick}>
      <CategoryDot category={group.category} />
      <span>
        <strong>
          {formatDate(lesson.date)} · {group.startTime} · {group.name}
        </strong>
        <small>
          {lesson.status === "SCHEDULED" && lessonHasPassed(lesson, [group])
            ? "Realizada"
            : statusLabel[lesson.status]}
          {lesson.theme ? ` — ${lesson.theme}` : ""}
          {lesson.status === "COMPLETED"
            ? ` · ${present}/${group.students.filter((item) => item.active).length} presentes`
            : ""}
          {lesson.replacementStatus !== "NONE"
            ? ` · Reposição ${lesson.replacementStatus.toLowerCase()}`
            : ""}
        </small>
      </span>
      <b>Abrir</b>
    </button>
  );
}

function LessonEditor({
  lesson,
  group,
  replacements,
  allStudents,
  onClose,
  onSave,
}: {
  lesson: KidsLesson;
  group: KidsClass;
  replacements:KidsReplacement[];
  allStudents:KidsStudent[];
  onClose: () => void;
  onSave: (next: KidsLesson) => void;
}) {
  const [draft, setDraft] = useState({
    ...lesson,
    attendance: { ...lesson.attendance },
  });
  const [replacementStudent,setReplacementStudent]=useState("");
  const regularStudents = group.students
    .filter(
      (item) =>
        item.active && (!item.startDate || item.startDate <= lesson.date),
    )
  const extraStudents=(draft.replacementStudentIds||[]).map(id=>allStudents.find(item=>item.id===id)).filter(Boolean) as KidsStudent[];
  const students=[...regularStudents,...extraStudents.filter(item=>!regularStudents.some(regular=>regular.id===item.id))].sort((a,b)=>localeCompare(a.name,b.name));
  const pendingStudents=replacements.filter(item=>item.status==="PENDING").map(item=>allStudents.find(student=>student.id===item.studentId)).filter((item,index,array):item is KidsStudent=>Boolean(item)&&array.findIndex(candidate=>candidate?.id===item?.id)===index).filter(item=>!students.some(current=>current.id===item.id)).sort((a,b)=>localeCompare(a.name,b.name));
  useEffect(() => {
    if (
      draft.status !== "HOLIDAY" &&
      Object.keys(draft.attendance).length === 0
    )
      setDraft((current) => ({
        ...current,
        attendance: Object.fromEntries(
          students.map((item) => [item.id, "PRESENT"]),
        ),
      }));
  }, []);
  function toggle(id: string) {
    setDraft((current) => ({
      ...current,
      attendance: {
        ...current.attendance,
        [id]: current.attendance[id] === "ABSENT" ? "PRESENT" : "ABSENT",
      },
    }));
  }
  function allPresent() {
    setDraft((current) => ({
      ...current,
      attendance: Object.fromEntries(
        students.map((item) => [item.id, "PRESENT"]),
      ),
    }));
  }
  async function imageFile(file?: File) {
    if (!file) return;
    const dataUrl =
      file.type === "application/pdf"
        ? await readFile(file)
        : await compressImage(file);
    setDraft((current) => ({
      ...current,
      image: { name: file.name, dataUrl, mimeType: file.type },
    }));
  }
  function status(value: KidsLesson["status"]) {
    setDraft((current) => ({
      ...current,
      status: value,
      replacementEligible:
        value === "CANCELLED" ? current.replacementEligible : false,
      replacementStatus:
        value === "CANCELLED" ? current.replacementStatus : "NONE",
    }));
  }
  return (
    <div className={styles.modalBackdrop}>
      <section className={styles.modal}>
        <div className={styles.modalHead}>
          <div>
            <CategoryDot category={group.category} />
            <h2>{group.name}</h2>
            <p>
              {formatDate(draft.date)} · {group.startTime} · Bola{" "}
              {categoryLabel[group.category]}
            </p>
          </div>
          <button onClick={onClose}>×</button>
        </div>
        {draft.status === "HOLIDAY" ? (
          <div className={styles.holiday}>
            Feriado — aula cancelada sem direito à reposição.
          </div>
        ) : (
          <>
            <label>
              Situação
              <select
                value={draft.status}
                onChange={(event) =>
                  status(event.target.value as KidsLesson["status"])
                }
              >
                <option value="SCHEDULED">Agendada</option>
                <option value="COMPLETED">Realizada</option>
                <option value="CANCELLED">Aula cancelada</option>
              </select>
            </label>
            {draft.status === "CANCELLED" ? (
              <div className={styles.cancelBox}>
                <label>
                  <input
                    type="checkbox"
                    checked={draft.replacementEligible}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        replacementEligible: event.target.checked,
                        replacementStatus:
                          event.target.checked &&
                          current.replacementStatus === "NONE"
                            ? "PENDING"
                            : event.target.checked
                              ? current.replacementStatus
                              : "NONE",
                      }))
                    }
                  />{" "}
                  Aula com direito à reposição
                </label>
                {draft.replacementEligible ? (
                  <>
                    <label>
                      Situação da reposição
                      <select
                        value={draft.replacementStatus}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            replacementStatus: event.target
                              .value as KidsLesson["replacementStatus"],
                          }))
                        }
                      >
                        <option value="PENDING">Pendente</option>
                        <option value="SCHEDULED">Agendada</option>
                        <option value="COMPLETED">Realizada</option>
                      </select>
                    </label>
                    <label>
                      Data da reposição
                      <input
                        type="date"
                        value={draft.replacementDate || ""}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            replacementDate: event.target.value,
                          }))
                        }
                      />
                    </label>
                  </>
                ) : null}
              </div>
            ) : null}
            <div className={styles.attendanceHead}>
              <h3>Chamada</h3>
              <button onClick={allPresent}>Todos presentes</button>
            </div>
            {pendingStudents.length ? <div className={styles.cancelBox}>
              <strong>Adicionar criança em reposição</strong>
              <div className={styles.inlineActions}>
                <select value={replacementStudent} onChange={event=>setReplacementStudent(event.target.value)}><option value="">Selecione a criança</option>{pendingStudents.map(student=><option key={student.id} value={student.id}>{student.name}</option>)}</select>
                <button disabled={!replacementStudent} onClick={()=>{if(!replacementStudent)return;setDraft(current=>({...current,replacementStudentIds:[...(current.replacementStudentIds||[]),replacementStudent],attendance:{...current.attendance,[replacementStudent]:"PRESENT"}}));setReplacementStudent("");}}>Adicionar</button>
              </div>
            </div>:null}
            <div className={styles.attendance}>
              {students.map((student) => {
                const value = (draft.attendance[student.id] ||
                  "PRESENT") as KidsAttendanceStatus;
                return (
                  <button
                    key={student.id}
                    className={
                      value === "PRESENT" ? styles.present : styles.absent
                    }
                    onClick={() => toggle(student.id)}
                  >
                    <span>{value === "PRESENT" ? "✓" : "×"}</span>
                    <strong>{student.name}</strong>
                    <small>{value === "PRESENT" ? "Presente" : "Falta"}</small>
                    {(draft.replacementStudentIds||[]).includes(student.id)?<em onClick={(event)=>{event.stopPropagation();setDraft(current=>({...current,replacementStudentIds:(current.replacementStudentIds||[]).filter(id=>id!==student.id)}));}}>Remover reposição</em>:null}
                  </button>
                );
              })}
            </div>
            <div className={styles.formGrid}>
              <label>
                Tema da aula
                <textarea
                  rows={2}
                  value={draft.theme || ""}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      theme: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                Foco pedagógico
                <textarea
                  rows={2}
                  value={draft.pedagogicalFocus || ""}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      pedagogicalFocus: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                Objetivo da aula
                <textarea
                  rows={2}
                  value={draft.objective}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      objective: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                Estações / exercícios
                <textarea
                  rows={5}
                  value={(draft.stations || []).join("\n\n")}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      stations: event.target.value
                        .split(/\n\s*\n/)
                        .filter(Boolean),
                    }))
                  }
                />
              </label>
              <label>
                Dica ao professor
                <textarea
                  rows={2}
                  value={draft.teacherTip || ""}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      teacherTip: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                Plano previsto
                <textarea
                  rows={5}
                  value={draft.plannedPlan}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      plannedPlan: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                Plano realizado
                <textarea
                  rows={3}
                  value={draft.actualPlan}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      actualPlan: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                Observações
                <textarea
                  rows={3}
                  value={draft.notes}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      notes: event.target.value,
                    }))
                  }
                />
              </label>
            </div>
            <div className={styles.imageBox}>
              <strong>Anexo do plano de aula</strong>
              {draft.image ? (
                <>
                  {draft.image.mimeType === "application/pdf" ? (
                    <a
                      href={draft.image.dataUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      📄 Abrir {draft.image.name}
                    </a>
                  ) : (
                    <img src={draft.image.dataUrl} alt={draft.image.name} />
                  )}
                  <div>
                    <label className={styles.fileButton}>
                      Substituir
                      <input
                        type="file"
                        accept="image/*,.pdf,application/pdf"
                        onChange={(event) =>
                          void imageFile(event.target.files?.[0])
                        }
                      />
                    </label>
                    <button
                      onClick={() =>
                        setDraft((current) => ({
                          ...current,
                          image: undefined,
                        }))
                      }
                    >
                      Excluir anexo
                    </button>
                  </div>
                </>
              ) : (
                <label className={styles.fileButton}>
                  Anexar imagem ou PDF
                  <input
                    type="file"
                    accept="image/*,.pdf,application/pdf"
                    onChange={(event) =>
                      void imageFile(event.target.files?.[0])
                    }
                  />
                </label>
              )}
            </div>
          </>
        )}
        <div className={styles.modalActions}>
          <button onClick={onClose}>Cancelar</button>
          <button
            className={styles.primary}
            onClick={() =>
              onSave({
                ...draft,
                updatedAt: new Date().toISOString(),
              })
            }
          >
            Salvar aula
          </button>
        </div>
      </section>
    </div>
  );
}

function ClassEditor({
  group,
  semesterStart,
  onClose,
  onSave,
}: {
  group: KidsClass;
  semesterStart: string;
  onClose: () => void;
  onSave: (next: KidsClass) => void;
}) {
  const [draft, setDraft] = useState({
    ...group,
    students: group.students.map((item) => ({
      ...item,
      startDate: item.startDate || semesterStart,
    })),
  });
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState(semesterStart);
  function add() {
    const clean = name.trim();
    if (!clean) return;
    setDraft((current) => ({
      ...current,
      students: [
        ...current.students,
        {
          id: `kid-${crypto.randomUUID()}`,
          name: clean,
          active: true,
          startDate,
        },
      ].sort((a, b) => localeCompare(a.name, b.name)),
    }));
    setName("");
  }
  return (
    <div className={styles.modalBackdrop}>
      <section className={styles.modal}>
        <div className={styles.modalHead}>
          <div>
            <CategoryDot category={draft.category} />
            <h2>Editar turma</h2>
            <p>{draft.name}</p>
          </div>
          <button onClick={onClose}>×</button>
        </div>
        <div className={styles.formGrid}>
          <label>
            Nome da turma
            <input
              value={draft.name}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
            />
          </label>
          <label>
            Professor
            <input
              value={draft.teacher}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  teacher: event.target.value,
                }))
              }
            />
          </label>
          <label>
            Dia
            <select
              value={draft.weekday}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  weekday: Number(event.target.value),
                }))
              }
            >
              {weekdayLabel.map((label, index) => (
                <option value={index} key={label}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Horário
            <input
              type="time"
              value={draft.startTime}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  startTime: event.target.value,
                }))
              }
            />
          </label>
          <label>
            Categoria
            <select
              value={draft.category}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  category: event.target.value as KidsCategory,
                }))
              }
            >
              {Object.entries(categoryLabel).map(([value, label]) => (
                <option value={value} key={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <h3>Crianças</h3>
        <div className={styles.studentEdit}>
          {draft.students.map((student) => (
            <div key={student.id}>
              <input
                value={student.name}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    students: current.students.map((item) =>
                      item.id === student.id
                        ? { ...item, name: event.target.value }
                        : item,
                    ),
                  }))
                }
              />
              <input
                aria-label={`Início de ${student.name}`}
                title="Início na turma"
                type="date"
                min={semesterStart}
                value={student.startDate || semesterStart}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    students: current.students.map((item) =>
                      item.id === student.id
                        ? { ...item, startDate: event.target.value }
                        : item,
                    ),
                  }))
                }
              />
              <label>
                <input
                  type="checkbox"
                  checked={student.active}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      students: current.students.map((item) =>
                        item.id === student.id
                          ? { ...item, active: event.target.checked }
                          : item,
                      ),
                    }))
                  }
                />{" "}
                Ativo
              </label>
            </div>
          ))}
        </div>
        <div className={styles.addStudent}>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Nome da criança"
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                add();
              }
            }}
          />
          <label>
            Início na turma
            <input
              type="date"
              min={semesterStart}
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
          </label>
          <button onClick={add}>+ Adicionar</button>
        </div>
        <div className={styles.modalActions}>
          <button onClick={onClose}>Cancelar</button>
          <button
            className={styles.primary}
            onClick={() =>
              onSave({
                ...draft,
                name: kidsClassName(
                  draft.category,
                  draft.weekday,
                  draft.startTime,
                ),
                updatedAt: new Date().toISOString(),
              })
            }
          >
            Salvar turma
          </button>
        </div>
      </section>
    </div>
  );
}

function StudentEditor({
  studentId,
  data,
  classes,
  lessons,
  replacements,
  semesterStart,
  onClose,
  onOpenClass,
  onSave,
}: {
  studentId: string;
  data: KidsData;
  classes: KidsClass[];
  lessons: KidsLesson[];
  replacements: KidsReplacement[];
  semesterStart: string;
  onClose: () => void;
  onOpenClass: (id: string) => void;
  onSave: (classes: KidsClass[]) => void;
}) {
  const [draft, setDraft] = useState(
    classes.map((group) => ({
      ...group,
      students: group.students.map((student) => ({ ...student })),
    })),
  );
  const source = classes
    .flatMap((group) => group.students)
    .find((student) => student.id === studentId);
  const [profile, setProfile] = useState<KidsStudent>({
    ...source!,
    name: source?.name || "",
  });
  const [newClassId, setNewClassId] = useState("");
  const [newStartDate, setNewStartDate] = useState(semesterStart);
  const memberships = draft.filter((group) =>
    group.students.some(
      (student) => student.id === studentId && student.active,
    ),
  );
  const available = draft.filter(
    (group) =>
      !group.students.some(
        (student) => student.id === studentId && student.active,
      ),
  );
  function patchMembership(
    groupId: string,
    patch: { startDate?: string; active?: boolean },
  ) {
    setDraft((current) =>
      current.map((group) =>
        group.id === groupId
          ? {
              ...group,
              students: group.students.map((student) =>
                student.id === studentId ? { ...student, ...patch } : student,
              ),
            }
          : group,
      ),
    );
  }
  function addMembership() {
    if (!newClassId || !source) return;
    setDraft((current) =>
      current.map((group) => {
        if (group.id !== newClassId) return group;
        const existing = group.students.find(
          (student) => student.id === studentId,
        );
        return {
          ...group,
          students: existing
            ? group.students.map((student) =>
                student.id === studentId
                  ? {
                      ...student,
                      ...profile,
                      startDate: newStartDate,
                      active: true,
                    }
                  : student,
              )
            : [
                ...group.students,
                {
                  ...source,
                  ...profile,
                  startDate: newStartDate,
                  active: true,
                },
              ].sort((a, b) => localeCompare(a.name, b.name)),
        };
      }),
    );
    setNewClassId("");
  }
  function save() {
    const updated = draft.map((group) => ({
      ...group,
      students: group.students.map((student) =>
        student.id === studentId
          ? {
              ...student,
              ...profile,
              name: profile.name.trim() || student.name,
              active:profile.active ? student.active : false,
            }
          : student,
      ),
      updatedAt: new Date().toISOString(),
    }));
    onSave(updated);
  }
  async function pickContact(target: "father" | "mother") {
    const nav = navigator as Navigator & {
      contacts?: {
        select: (
          fields: string[],
          options: { multiple: boolean },
        ) => Promise<Array<{ name?: string[]; tel?: string[] }>>;
      };
    };
    if (!nav.contacts?.select) {
      alert(
        "Neste aparelho, use o preenchimento manual ou importe pelo arquivo de contatos.",
      );
      return;
    }
    try {
      const selected = await nav.contacts.select(["name", "tel"], {
        multiple: false,
      });
      const contact = selected[0];
      if (!contact) return;
      setProfile((current) => ({
        ...current,
        [`${target}Name`]:
          contact.name?.[0] || current[`${target}Name` as keyof KidsStudent],
        [`${target}Phone`]:
          contact.tel?.[0] || current[`${target}Phone` as keyof KidsStudent],
      }));
    } catch {}
  }
  const credits = replacements
    .filter((item) => item.studentId === studentId)
    .sort((a, b) => b.sourceDate.localeCompare(a.sourceDate));
  const completedLessons = lessons.filter(
    (lesson) =>
      (lesson.status === "COMPLETED" ||
        (lesson.status === "SCHEDULED" &&
          lessonHasPassed(lesson, memberships))) &&
      memberships.some((group) => group.id === lesson.classId),
  );
  const present = completedLessons.filter(
    (lesson) => lesson.attendance[studentId] !== "ABSENT",
  ).length;
  const absent = completedLessons.filter(
    (lesson) => lesson.attendance[studentId] === "ABSENT",
  ).length;
  const cancelledLessons=lessons.filter(lesson=>lesson.status==="CANCELLED"&&classes.some(group=>group.id===lesson.classId&&group.students.some(student=>student.id===studentId&&(!student.startDate||student.startDate<=lesson.date)))).sort((a,b)=>b.date.localeCompare(a.date));
  function printStudentReport() {
    printReport(buildReport({ ...data, classes: draft }, "student", studentId));
  }
  return (
    <div className={styles.modalBackdrop}>
      <section className={styles.modal}>
        <div className={styles.modalHead}>
          <div>
            <span className={styles.categoryDots}>
              {memberships.map((group) => (
                <CategoryDot key={group.id} category={group.category} />
              ))}
            </span>
            <h2>Dados da criança</h2>
            <p>
              {memberships.length} turma{memberships.length === 1 ? "" : "s"} ·{" "}
              {present} presenças · {absent} faltas
            </p>
            <button onClick={printStudentReport}>
              🖨️ Baixar relatório PDF
            </button>
          </div>
          <button onClick={onClose}>×</button>
        </div>
        <div className={styles.formGrid}>
          <label>
            Nome da criança
            <input
              value={profile.name}
              onChange={(event) =>
                setProfile((current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
            />
          </label>
          <label>
            Data de nascimento
            {profile.birthDate ? (
              <small>Idade atual: {ageFromBirth(profile.birthDate)} anos</small>
            ) : null}
            <input
              type="date"
              value={profile.birthDate || ""}
              onChange={(event) =>
                setProfile((current) => ({
                  ...current,
                  birthDate: event.target.value,
                }))
              }
            />
          </label>
          <label>
            Situação do cadastro
            <select value={profile.active?"ACTIVE":"INACTIVE"} onChange={event=>setProfile(current=>({...current,active:event.target.value==="ACTIVE"}))}>
              <option value="ACTIVE">Aluno ativo</option>
              <option value="INACTIVE">Aluno inativo</option>
            </select>
            <small>Ao inativar, a criança sai de todas as turmas e chamadas futuras, sem apagar o histórico.</small>
          </label>
          <label>
            Nome do pai
            <input
              value={profile.fatherName || ""}
              onChange={(event) =>
                setProfile((current) => ({
                  ...current,
                  fatherName: event.target.value,
                }))
              }
            />
            <button onClick={() => void pickContact("father")}>
              Buscar nos contatos
            </button>
          </label>
          <label>
            Telefone do pai
            <input
              type="tel"
              value={profile.fatherPhone || ""}
              onChange={(event) =>
                setProfile((current) => ({
                  ...current,
                  fatherPhone: event.target.value,
                }))
              }
            />
            {profile.fatherPhone ? (()=>{const wa=whatsappNumber(profile.fatherPhone);return (
              <span>
                <a href={`tel:${profile.fatherPhone}`}>Ligar</a>
                {wa.href?<> · <a href={wa.href} target="_blank" rel="noreferrer">WhatsApp</a></>:null}
                {wa.missingDdd?<> · Falta o DDD para usar o WhatsApp.</>:null}
              </span>
            );})() : null}
          </label>
          <label>
            Nome da mãe
            <input
              value={profile.motherName || ""}
              onChange={(event) =>
                setProfile((current) => ({
                  ...current,
                  motherName: event.target.value,
                }))
              }
            />
            <button onClick={() => void pickContact("mother")}>
              Buscar nos contatos
            </button>
          </label>
          <label>
            Telefone da mãe
            <input
              type="tel"
              value={profile.motherPhone || ""}
              onChange={(event) =>
                setProfile((current) => ({
                  ...current,
                  motherPhone: event.target.value,
                }))
              }
            />
            {profile.motherPhone ? (()=>{const wa=whatsappNumber(profile.motherPhone);return (
              <span>
                <a href={`tel:${profile.motherPhone}`}>Ligar</a>
                {wa.href?<> · <a href={wa.href} target="_blank" rel="noreferrer">WhatsApp</a></>:null}
                {wa.missingDdd?<> · Falta o DDD para usar o WhatsApp.</>:null}
              </span>
            );})() : null}
          </label>
          <label>
            Valor mensal
            <input
              type="number"
              min="0"
              step="0.01"
              value={profile.monthlyAmount || ""}
              onChange={(event) =>
                setProfile((current) => ({
                  ...current,
                  monthlyAmount: Number(event.target.value) || undefined,
                }))
              }
            />
            <small>{new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(profile.monthlyAmount||0)}</small>
          </label>
          <label>
            Dia do vencimento
            <input
              type="number"
              min="1"
              max="31"
              value={profile.dueDay || ""}
              onChange={(event) =>
                setProfile((current) => ({
                  ...current,
                  dueDay: Number(event.target.value) || undefined,
                }))
              }
            />
          </label>
          <label>
            Forma de cobrança
            <select
              value={profile.billingMode || "RECURRING"}
              onChange={(event) =>
                setProfile((current) => ({
                  ...current,
                  billingMode: event.target.value as KidsStudent["billingMode"],
                }))
              }
            >
              <option value="ONE_TIME">Uma parcela</option>
              <option value="RECURRING">Recorrente</option>
              <option value="INSTALLMENTS">Parcelado</option>
            </select>
          </label>
          {profile.billingMode === "INSTALLMENTS" ? (
            <label>
              Quantidade de parcelas
              <input
                type="number"
                min="1"
                value={profile.installmentCount || ""}
                onChange={(event) =>
                  setProfile((current) => ({
                    ...current,
                    installmentCount: Number(event.target.value) || undefined,
                  }))
                }
              />
            </label>
          ) : null}
          <label>
            Observações
            <textarea
              rows={3}
              value={profile.notes || ""}
              onChange={(event) =>
                setProfile((current) => ({
                  ...current,
                  notes: event.target.value,
                }))
              }
            />
          </label>
        </div>
        <h3>
          Reposições da criança (
          {credits.filter((item) => item.status !== "COMPLETED").length}{" "}
          pendentes)
        </h3>
        <div className={styles.lessonList}>
          {credits.length ? (
            credits.map((item) => (
              <article key={item.id} className={styles.lessonRow}>
                <span>
                  <strong>
                    {formatDate(item.sourceDate)} · {item.reason}
                  </strong>
                  <small>
                    {item.status === "COMPLETED"
                      ? `Reposta em ${formatDate(item.completedDate || item.scheduledDate || item.sourceDate)}`
                      : item.status === "SCHEDULED"
                        ? `Agendada para ${formatDate(item.scheduledDate || item.sourceDate)}`
                        : "Pendente"}
                  </small>
                </span>
              </article>
            ))
          ) : (
            <p>Nenhuma reposição registrada.</p>
          )}
        </div>
        <h3>Aulas canceladas da criança ({cancelledLessons.length})</h3>
        <div className={styles.lessonList}>{cancelledLessons.length?cancelledLessons.map(lesson=><article key={lesson.id} className={styles.lessonRow}><span><strong>{formatDate(lesson.date)} · {groupName(classes,lesson.classId)}</strong><small>{lesson.notes||"Aula cancelada"}{lesson.replacementEligible?" · com direito à reposição":" · sem reposição"}</small></span></article>):<p>Nenhuma aula cancelada registrada.</p>}</div>
        <h3>Turmas da criança</h3>
        <div className={styles.enrollmentList}>
          {memberships.map((group) => {
            const student = group.students.find(
              (item) => item.id === studentId,
            )!;
            return (
              <article key={group.id}>
                <CategoryDot category={group.category} />
                <span>
                  <strong>{group.name}</strong>
                  <small>
                    {weekdayLabel[group.weekday]}, {group.startTime} · Bola{" "}
                    {categoryLabel[group.category]}
                  </small>
                </span>
                <label>
                  Início
                  <input
                    type="date"
                    min={semesterStart}
                    value={student.startDate || semesterStart}
                    onChange={(event) =>
                      patchMembership(group.id, {
                        startDate: event.target.value,
                      })
                    }
                  />
                </label>
                <button onClick={() => onOpenClass(group.id)}>
                  Abrir turma
                </button>
                <button
                  className={styles.removeEnrollment}
                  onClick={() => {
                    if (confirm(`Retirar ${profile.name} de ${group.name}?`))
                      patchMembership(group.id, { active: false });
                  }}
                >
                  Retirar
                </button>
              </article>
            );
          })}
        </div>
        {available.length ? (
          <div className={styles.addEnrollment}>
            <h3>Adicionar em outra turma</h3>
            <select
              value={newClassId}
              onChange={(event) => setNewClassId(event.target.value)}
            >
              <option value="">Selecione a turma</option>
              {available.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
            <label>
              Início na turma
              <input
                type="date"
                min={semesterStart}
                value={newStartDate}
                onChange={(event) => setNewStartDate(event.target.value)}
              />
            </label>
            <button onClick={addMembership} disabled={!newClassId}>
              + Adicionar turma
            </button>
          </div>
        ) : null}
        <div className={styles.modalActions}>
          <button onClick={onClose}>Cancelar</button>
          <button className={styles.primary} onClick={save}>
            Salvar criança
          </button>
        </div>
      </section>
    </div>
  );
}

function Reports({
  data,
  kind,
  setKind,
  reportId,
  setReportId,
}: {
  data: KidsData;
  kind: "student" | "class";
  setKind: (value: "student" | "class") => void;
  reportId: string;
  setReportId: (value: string) => void;
}) {
  const students = useMemo(() => {
    const map = new Map<string, string>();
    data.classes.forEach((group) =>
      group.students
        .filter((item) => item.active)
        .forEach((item) => map.set(item.id, item.name)),
    );
    return [...map].sort((a, b) => localeCompare(a[1], b[1]));
  }, [data.classes]);
  const options =
    kind === "student"
      ? students
      : data.classes
          .map((item) => [item.id, item.name] as [string, string])
          .sort((a, b) => localeCompare(a[1], b[1]));
  const selected = reportId || options[0]?.[0] || "";
  const report = buildReport(data, kind, selected);
  function print() {
    printReport(report);
  }
  async function share() {
    if (navigator.share) {
      await navigator.share({ title: report.title, text: report.text });
    } else print();
  }
  return (
    <section className={styles.panel}>
      <div className={styles.panelHead}>
        <div>
          <h2>Relatórios</h2>
          <p>Relatórios profissionais com a identidade CT DS Tennis.</p>
        </div>
      </div>
      <div className={styles.reportToolbar}>
        <select
          value={kind}
          onChange={(event) => {
            setKind(event.target.value as "student" | "class");
            setReportId("");
          }}
        >
          <option value="student">Relatório individual</option>
          <option value="class">Relatório da turma</option>
        </select>
        <select
          value={selected}
          onChange={(event) => setReportId(event.target.value)}
        >
          {options.map(([id, name]) => (
            <option value={id} key={id}>
              {name}
            </option>
          ))}
        </select>
        <button onClick={print}>Imprimir / PDF</button>
        <button className={styles.primary} onClick={() => void share()}>
          Compartilhar
        </button>
      </div>
      <article className={styles.report}>
        <img src="/logo-ctds.png" alt="CT DS Tennis" />
        <h2>{report.title}</h2>
        <p>{report.subtitle}</p>
        <div dangerouslySetInnerHTML={{ __html: report.body }} />
      </article>
    </section>
  );
}

type Report = { title: string; subtitle: string; body: string; text: string };
function buildReport(
  data: KidsData,
  kind: "student" | "class",
  id: string,
): Report {
  const eligible = (lesson: KidsLesson) => lesson.status !== "HOLIDAY";
  if (kind === "class") {
    const group = data.classes.find((item) => item.id === id);
    if (!group) return { title: "Relatório", subtitle: "", body: "", text: "" };
    const lessons = data.lessons.filter((item) => item.classId === id);
    const completed = lessons.filter(
      (item) =>
        item.status === "COMPLETED" ||
        (item.status === "SCHEDULED" && lessonHasPassed(item, [group])),
    );
    const cancelled = lessons.filter((item) => item.status === "CANCELLED");
    const holiday = lessons.filter((item) => item.status === "HOLIDAY");
    const rows = group.students
      .filter((item) => item.active)
      .sort((a, b) => localeCompare(a.name, b.name))
      .map((student) => {
        const eligibleLessons = completed.filter(
          (item) => !student.startDate || student.startDate <= item.date,
        );
        const present = eligibleLessons.filter(
          (item) => item.attendance[student.id] !== "ABSENT",
        ).length;
        const absent = eligibleLessons.filter(
          (item) => item.attendance[student.id] === "ABSENT",
        ).length;
        const rate =
          present + absent
            ? Math.round((present / (present + absent)) * 100)
            : 0;
        return `<tr><td>${escapeHtml(student.name)}</td><td>${present}</td><td>${absent}</td><td>${rate}%</td></tr>`;
      })
      .join("");
    const history = lessons
      .filter((item) => item.date <= localDate())
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((item) => `<li><b>${formatDate(item.date)}</b> — ${item.status === "SCHEDULED" && lessonHasPassed(item, [group]) ? "Realizada" : statusLabel[item.status]}${item.theme ? ` — ${escapeHtml(item.theme)}` : ""}</li>`)
      .join("");
    const body = `<div class="metrics"><b>${completed.length}<small>Aulas realizadas</small></b><b>${cancelled.length}<small>Canceladas</small></b><b>${holiday.length}<small>Feriados</small></b><b>${lessons.filter((item) => item.replacementStatus === "COMPLETED").length}<small>Reposições</small></b></div><table><thead><tr><th>Aluno</th><th>Presenças</th><th>Faltas</th><th>Frequência</th></tr></thead><tbody>${rows}</tbody></table><h3>Histórico das aulas</h3><ul>${history || "<li>Nenhuma aula no período.</li>"}</ul>`;
    return {
      title: group.name,
      subtitle: `Bola ${categoryLabel[group.category]} · ${weekdayLabel[group.weekday]}, ${group.startTime}`,
      body,
      text: `${group.name}: ${completed.length} aulas dadas, ${cancelled.length} canceladas e ${holiday.length} feriados.`,
    };
  }
  const occurrences = data.classes.flatMap((group) =>
    group.students
      .filter((student) => student.id === id)
      .map((student) => ({ group, student })),
  );
  const name = occurrences[0]?.student.name || "Aluno";
  const lessonSet = data.lessons.filter(
    (lesson) =>
      occurrences.some(
        (item) =>
          item.group.id === lesson.classId &&
          (!item.student.startDate || item.student.startDate <= lesson.date),
      ) && eligible(lesson),
  );
  const completed = lessonSet.filter(
    (item) =>
      item.status === "COMPLETED" ||
      (item.status === "SCHEDULED" && lessonHasPassed(item, data.classes)),
  );
  const present = completed.filter(
    (item) => item.attendance[id] !== "ABSENT",
  ).length;
  const absent = completed.filter(
    (item) => item.attendance[id] === "ABSENT",
  ).length;
  const cancelled = lessonSet.filter(
    (item) => item.status === "CANCELLED",
  ).length;
  const rate =
    present + absent ? Math.round((present / (present + absent)) * 100) : 0;
  const replacements = lessonSet.filter(
    (item) => item.replacementStatus !== "NONE",
  );
  const contents = lessonSet
    .filter((item) => item.date <= localDate())
    .filter((item) => item.objective || item.actualPlan)
    .sort((a, b) => b.date.localeCompare(a.date))
    .map(
      (item) =>
        `<li><b>${formatDate(item.date)}</b> — ${item.status === "SCHEDULED" && lessonHasPassed(item, data.classes) ? "Realizada" : statusLabel[item.status]}${item.theme ? ` — ${escapeHtml(item.theme)}` : ""}${item.objective ? `<br>${escapeHtml(item.objective)}` : ""}</li>`,
    )
    .join("");
  const body = `<div class="metrics"><b>${present}<small>Presenças</small></b><b>${absent}<small>Faltas</small></b><b>${cancelled}<small>Aulas canceladas</small></b><b>${rate}%<small>Frequência</small></b><b>${replacements.filter((item) => item.replacementStatus === "COMPLETED").length}<small>Reposições</small></b></div><h3>Turmas</h3><p>${occurrences.map((item) => escapeHtml(item.group.name)).join(" · ")}</p><h3>Objetivos e conteúdos</h3><ul>${contents || "<li>Nenhum conteúdo registrado.</li>"}</ul>`;
  return {
    title: `Relatório de ${name}`,
    subtitle: `Período: ${formatDate(data.semesterStart)} a ${formatDate(data.semesterEnd)}`,
    body,
    text: `${name}: ${present} presenças, ${absent} faltas, ${cancelled} aulas canceladas e ${rate}% de frequência.`,
  };
}
function reportHtml(report: Report) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(report.title)}</title><style>body{font-family:Arial,sans-serif;color:#173d37;max-width:850px;margin:30px auto;padding:24px}header{display:flex;justify-content:space-between;border-bottom:4px solid #ef7d00;padding-bottom:18px}img{width:160px;object-fit:contain;background:#fff}h1{margin:0}.teacher{font-weight:700;color:#ef7d00}.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:28px 0}.metrics b{border:1px solid #ddd;border-radius:14px;padding:18px;font-size:24px}.metrics small{display:block;font-size:12px;color:#666;margin-top:5px}table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:10px;border-bottom:1px solid #ddd}@media print{body{margin:0}}</style></head><body><header><div><h1>${escapeHtml(report.title)}</h1><p>${escapeHtml(report.subtitle)}</p><p class="teacher">Professor Danilo Modesto</p></div><img src="${location.origin}/logo-ctds.png"></header><main>${report.body || "<p>Nenhum dado disponível para este relatório.</p>"}</main></body></html>`;
}
function printReport(report: Report) {
  const win = window.open("", "_blank", "width=900,height=900");
  if (!win) return;
  win.document.open();
  win.document.write(reportHtml(report));
  win.document.close();
  const run = () => {
    win.focus();
    win.print();
  };
  if (win.document.readyState === "complete") setTimeout(run, 350);
  else win.addEventListener("load", () => setTimeout(run, 200), { once: true });
}
function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[char]!,
  );
}
function localDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
function lessonHasPassed(lesson: KidsLesson, classes: KidsClass[]) {
  const group = classes.find((item) => item.id === lesson.classId);
  if (!group) return lesson.date < localDate();
  return new Date(`${lesson.date}T${group.endTime || group.startTime}:00`).getTime() <= Date.now();
}
function mergeFinanceProfiles(kids: KidsData, finance: FinanceData): KidsData {
  const normalize = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  const entries = finance.dsKids.filter(
    (item) => item.competence === finance.currentCompetence,
  );
  return {
    ...kids,
    classes: kids.classes.map((group) => ({
      ...group,
      students: group.students.map((student) => {
        if (student.monthlyAmount !== undefined) return student;
        const entry = entries.find(
          (item) => normalize(item.studentName) === normalize(student.name),
        );
        if (!entry) return student;
        return {
          ...student,
          monthlyAmount: entry.amount,
          dueDay: entry.dueDay || undefined,
          billingMode:
            entry.billingMode === "SINGLE"
              ? "ONE_TIME"
              : entry.billingMode === "INSTALLMENT"
                ? "INSTALLMENTS"
                : "RECURRING",
          installmentCount: entry.installmentTotal || undefined,
        };
      }),
    })),
  };
}
function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const image = new Image();
      image.onerror = reject;
      image.onload = () => {
        const max = 1600;
        const ratio = Math.min(1, max / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(image.width * ratio);
        canvas.height = Math.round(image.height * ratio);
        canvas
          .getContext("2d")
          ?.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}
function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}
function ageFromBirth(value: string) {
  const birth = new Date(`${value}T12:00:00`);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const month = now.getMonth() - birth.getMonth();
  if (month < 0 || (month === 0 && now.getDate() < birth.getDate())) age--;
  return Math.max(0, age);
}
