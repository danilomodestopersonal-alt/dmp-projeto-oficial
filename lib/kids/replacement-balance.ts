import type { KidsClass, KidsData, KidsLesson } from "@/types/kids";

// DMP_KIDS_CREDITOS_TURMAS_ATIVAS_V615_20260919

export const KIDS_REPLACEMENT_BALANCE_START = "2026-08-01";

export type KidsReplacementBalanceEvent = {
  id: string;
  classId: string;
  className: string;
  date: string;
  type: "DUE" | "REPLACED";
  source: "CANCELLED_CONTRACTED" | "LEGACY_CANCELLED_CREDIT" | "FIFTH_CLASS" | "INDIVIDUAL_REPLACEMENT" | "LEGACY_INDIVIDUAL_REPLACEMENT";
  label: string;
  lessonId: string;
};

export type KidsReplacementBalance = {
  classId: string;
  className: string;
  due: number;
  replaced: number;
  balance: number;
  events: KidsReplacementBalanceEvent[];
};

function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function effectiveStart(data: KidsData) {
  return data.semesterStart && data.semesterStart > KIDS_REPLACEMENT_BALANCE_START
    ? data.semesterStart
    : KIDS_REPLACEMENT_BALANCE_START;
}

function lessonHeld(lesson: KidsLesson, group: KidsClass) {
  if (lesson.status === "COMPLETED") return true;
  if (lesson.status !== "SCHEDULED") return false;
  const end = group.endTime || group.startTime || "23:59";
  return new Date(`${lesson.date}T${end}:00`).getTime() <= Date.now();
}

function individualLessonHeld(lesson: KidsLesson, group?: KidsClass) {
  if (lesson.status === "COMPLETED") return true;
  if (lesson.status !== "SCHEDULED") return false;
  const end =
    lesson.kind === "REPLACEMENT"
      ? lesson.replacementEndTime || lesson.replacementStartTime || group?.endTime || group?.startTime || "23:59"
      : group?.endTime || group?.startTime || "23:59";
  return new Date(`${lesson.date}T${end}:00`).getTime() <= Date.now();
}

function latestLessonPerDate(lessons: KidsLesson[]) {
  const byDate = new Map<string, KidsLesson>();
  for (const lesson of lessons) {
    const current = byDate.get(lesson.date);
    const currentUpdated = String(current?.updatedAt || "");
    const nextUpdated = String(lesson.updatedAt || "");
    if (!current || nextUpdated >= currentUpdated) byDate.set(lesson.date, lesson);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function computeKidsClassReplacementBalance(
  data: KidsData,
  classId: string,
  throughDate = localDateKey(),
): KidsReplacementBalance {
  const group = data.classes.find((item) => item.id === classId);
  const className = group?.name || "Turma";
  if (!group) return { classId, className, due: 0, replaced: 0, balance: 0, events: [] };

  const start = effectiveStart(data);
  const regularLessons = latestLessonPerDate(
    data.lessons.filter(
      (lesson) =>
        lesson.classId === classId &&
        lesson.kind !== "REPLACEMENT" &&
        lesson.date >= start &&
        lesson.date <= throughDate,
    ),
  );

  const byMonth = new Map<string, KidsLesson[]>();
  for (const lesson of regularLessons) {
    const month = lesson.date.slice(0, 7);
    const bucket = byMonth.get(month) || [];
    bucket.push(lesson);
    byMonth.set(month, bucket);
  }

  const events: KidsReplacementBalanceEvent[] = [];
  for (const monthLessons of byMonth.values()) {
    monthLessons.sort((a, b) => a.date.localeCompare(b.date));
    monthLessons.forEach((lesson, index) => {
      if (index < 4) {
        if (lesson.status === "CANCELLED") {
          events.push({
            id: `${classId}-${lesson.date}-due`,
            classId,
            className,
            date: lesson.date,
            type: "DUE",
            source: "CANCELLED_CONTRACTED",
            label: "Aula regular cancelada",
            lessonId: lesson.id,
          });
        }
        return;
      }

      // O pacote mensal cobre quatro aulas. A 5ª ocorrência só vira crédito se aconteceu.
      // Se a 5ª for cancelada/feriado, não gera crédito e também não cria nova dívida.
      if (lessonHeld(lesson, group)) {
        events.push({
          id: `${classId}-${lesson.date}-replaced`,
          classId,
          className,
          date: lesson.date,
          type: "REPLACED",
          source: "FIFTH_CLASS",
          label: "5ª aula do mês · aula reposta",
          lessonId: lesson.id,
        });
      }
    });
  }

  events.sort((a, b) => b.date.localeCompare(a.date) || a.type.localeCompare(b.type));
  const due = events.filter((item) => item.type === "DUE").length;
  const replaced = events.filter((item) => item.type === "REPLACED").length;
  return { classId, className, due, replaced, balance: replaced - due, events };
}

export function computeKidsReplacementBalances(data: KidsData, throughDate = localDateKey()) {
  return data.classes
    .map((group) => computeKidsClassReplacementBalance(data, group.id, throughDate))
    .sort((a, b) => a.className.localeCompare(b.className, "pt-BR"));
}

function individualReplacementEvents(
  data: KidsData,
  studentId: string,
  throughDate: string,
): KidsReplacementBalanceEvent[] {
  const start = effectiveStart(data);
  const lessonEvents = data.lessons
    .filter(
      (lesson) =>
        lesson.date >= start &&
        lesson.date <= throughDate &&
        (lesson.replacementStudentIds || []).includes(studentId),
    )
    // A vaga utilizada consome a reposição quando a aula acontece.
    // A falta continua registrada na chamada, mas não devolve o crédito.
    .filter((lesson) => individualLessonHeld(lesson, data.classes.find((group) => group.id === lesson.classId)))
    .map((lesson): KidsReplacementBalanceEvent => {
      const group = data.classes.find((item) => item.id === lesson.classId);
      const absent = lesson.attendance?.[studentId] === "ABSENT";
      return {
        id: `student:${studentId}:${lesson.id}:individual-replaced`,
        classId: lesson.classId,
        className: group?.name || lesson.replacementName || "Aula avulsa de reposição",
        date: lesson.date,
        type: "REPLACED",
        source: "INDIVIDUAL_REPLACEMENT",
        label: absent
          ? "Reposição consumida · falta registrada"
          : "Reposição individual realizada",
        lessonId: lesson.id,
      };
    });

  const lessonIds = new Set(
    data.lessons
      .filter((lesson) => (lesson.replacementStudentIds || []).includes(studentId))
      .map((lesson) => lesson.id),
  );

  // Preserva eventuais reposições individuais antigas já concluídas antes da mudança de critério.
  const legacyEvents = (data.replacements || [])
    .filter((item) => item.studentId === studentId && item.status === "COMPLETED")
    .filter((item) => (item.completedDate || item.scheduledDate || item.sourceDate) >= start)
    .filter((item) => (item.completedDate || item.scheduledDate || item.sourceDate) <= throughDate)
    .filter((item) => !item.destinationLessonId || !lessonIds.has(item.destinationLessonId))
    .map((item): KidsReplacementBalanceEvent => ({
      id: `student:${studentId}:${item.id}:legacy-replaced`,
      classId: item.classId,
      className: data.classes.find((group) => group.id === item.classId)?.name || "Reposição individual",
      date: item.completedDate || item.scheduledDate || item.sourceDate,
      type: "REPLACED",
      source: "LEGACY_INDIVIDUAL_REPLACEMENT",
      label: "Reposição individual realizada",
      lessonId: item.destinationLessonId || item.sourceLessonId,
    }));

  return [...lessonEvents, ...legacyEvents];
}

function preservedCancelledCreditEvents(
  data: KidsData,
  studentId: string,
  throughDate: string,
  activeDueEvents: KidsReplacementBalanceEvent[],
): KidsReplacementBalanceEvent[] {
  const start = effectiveStart(data);
  const activeDates = new Set(activeDueEvents.map((event) => event.date));
  const byDate = new Map<string, KidsReplacementBalanceEvent>();

  for (const credit of data.replacements || []) {
    if (
      credit.studentId !== studentId ||
      credit.sourceDate < start ||
      credit.sourceDate > throughDate ||
      activeDates.has(credit.sourceDate)
    ) continue;

    const lesson = data.lessons.find((item) => item.id === credit.sourceLessonId);
    if (lesson && (lesson.status !== "CANCELLED" || !lesson.replacementEligible)) continue;
    if (
      lesson &&
      !computeKidsClassReplacementBalance(data, credit.classId, throughDate).events.some(
        (event) => event.type === "DUE" && event.lessonId === lesson.id,
      )
    ) continue;
    const group = data.classes.find((item) => item.id === credit.classId);
    const event: KidsReplacementBalanceEvent = {
      id: `student:${studentId}:${credit.sourceDate}:preserved-due`,
      classId: credit.classId,
      className: group?.name || "Turma anterior",
      date: credit.sourceDate,
      type: "DUE",
      source: "LEGACY_CANCELLED_CREDIT",
      label: "Aula regular cancelada",
      lessonId: credit.sourceLessonId,
    };

    const current = byDate.get(credit.sourceDate);
    const currentActive = current
      ? data.classes.find((item) => item.id === current.classId)?.students.some(
          (student) => student.id === studentId && student.active,
        )
      : false;
    const nextActive = group?.students.some(
      (student) => student.id === studentId && student.active,
    );
    if (!current || (nextActive && !currentActive)) byDate.set(credit.sourceDate, event);
  }

  return [...byDate.values()];
}

export function computeKidsStudentReplacementBalance(
  data: KidsData,
  studentId: string,
  throughDate = localDateKey(),
): KidsReplacementBalance {
  const memberships = data.classes.flatMap((group) =>
    group.students
      .filter((student) => student.id === studentId && student.active)
      .map((student) => ({ group, student })),
  );

  const activeCollectiveEvents = memberships.flatMap(({ group, student }) => {
    const start = student.startDate || data.semesterStart || KIDS_REPLACEMENT_BALANCE_START;
    return computeKidsClassReplacementBalance(data, group.id, throughDate).events.filter(
      (event) => event.date >= start,
    );
  });
  const activeDueEvents = activeCollectiveEvents.filter((event) => event.type === "DUE");
  const preservedDueEvents = preservedCancelledCreditEvents(
    data,
    studentId,
    throughDate,
    activeDueEvents,
  );

  const events = [
    ...activeCollectiveEvents,
    ...preservedDueEvents,
    ...individualReplacementEvents(data, studentId, throughDate),
  ];

  const unique = new Map<string, KidsReplacementBalanceEvent>();
  for (const event of events) unique.set(event.id, event);

  const ordered = [...unique.values()].sort(
    (a, b) => b.date.localeCompare(a.date) || a.className.localeCompare(b.className, "pt-BR"),
  );
  const due = ordered.filter((item) => item.type === "DUE").length;
  const replaced = ordered.filter((item) => item.type === "REPLACED").length;

  return {
    classId: `student:${studentId}`,
    className: "Saldo da criança",
    due,
    replaced,
    balance: replaced - due,
    events: ordered,
  };
}

export function kidsBalanceSigned(value: number) {
  return value > 0 ? `+${value}` : String(value);
}
