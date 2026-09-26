import type {
  KidsAttendanceStatus,
  KidsCategory,
  KidsData,
  KidsLesson,
  KidsReplacementUsage,
} from "@/types/kids";

export const KIDS_REPLACEMENT_INTEGRITY_VERSION = 616;

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function sameIds(left: string[], right: string[]) {
  const a = unique(left).sort();
  const b = unique(right).sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

export function activeStudentIdsForCategory(
  data: Pick<KidsData, "classes">,
  category: KidsCategory,
  date: string,
) {
  return unique(
    data.classes
      .filter((group) => group.active && group.category === category)
      .flatMap((group) =>
        group.students
          .filter(
            (student) =>
              student.active && (!student.startDate || student.startDate <= date),
          )
          .map((student) => student.id),
      ),
  );
}

function isV616HistoricalRepairTarget(lesson: KidsLesson) {
  if (lesson.kind !== "REPLACEMENT" || lesson.date !== "2026-09-19") return false;
  return (
    (lesson.replacementCategory === "RED" && lesson.replacementStartTime === "14:00") ||
    (lesson.replacementCategory === "ORANGE" && lesson.replacementStartTime === "15:00")
  );
}

function usageFor(lesson: KidsLesson, studentId: string): KidsReplacementUsage {
  return {
    id: `replacement-usage:${lesson.id}:${studentId}`,
    studentId,
    lessonId: lesson.id,
    date: lesson.date,
    attendance: lesson.attendance?.[studentId] === "ABSENT" ? "ABSENT" : "PRESENT",
    recordedAt: lesson.updatedAt,
  };
}

export function replacementRosterIsValid(lesson: KidsLesson) {
  const roster = unique(lesson.replacementStudentIds || []);
  if (!roster.length) return true;
  if (!roster.length || roster.length !== (lesson.replacementStudentIds || []).length) return false;
  return roster.every((studentId) => {
    const status = lesson.attendance?.[studentId];
    return status === "PRESENT" || status === "ABSENT";
  });
}

export function recordCompletedReplacement(
  data: KidsData,
  lesson: KidsLesson,
): KidsData {
  if (lesson.status !== "COMPLETED" || !(lesson.replacementStudentIds || []).length) return data;
  const roster = unique(lesson.replacementStudentIds || []);
  const rosterAttendance = Object.fromEntries(
    roster.map((studentId) => [
      studentId,
      lesson.attendance?.[studentId] === "ABSENT" ? "ABSENT" : "PRESENT",
    ]),
  ) as Record<string, KidsAttendanceStatus>;
  const normalizedLesson: KidsLesson = {
    ...lesson,
    replacementStudentIds: roster,
    replacementOriginalStudentIds: unique(
      lesson.replacementOriginalStudentIds?.length
        ? lesson.replacementOriginalStudentIds
        : roster,
    ),
    replacementCapacity: roster.length,
    replacementRosterLocked: true,
    replacementIntegrityVersion: KIDS_REPLACEMENT_INTEGRITY_VERSION,
    attendance:
      lesson.kind === "REPLACEMENT"
        ? rosterAttendance
        : { ...lesson.attendance, ...rosterAttendance },
  };
  const rosterSet = new Set(roster);
  const currentUsages = data.replacementUsages || [];
  const staleUsageIds = new Set(
    currentUsages
      .filter((usage) => usage.lessonId === normalizedLesson.id && !rosterSet.has(usage.studentId))
      .map((usage) => usage.id),
  );
  const usages = new Map(
    currentUsages
      .filter((usage) => !staleUsageIds.has(usage.id))
      .map((usage) => [usage.id, usage]),
  );
  let usageChanged = staleUsageIds.size > 0;
  for (const studentId of roster) {
    const usage = usageFor(normalizedLesson, studentId);
    const current = usages.get(usage.id);
    if (
      !current ||
      current.studentId !== usage.studentId ||
      current.lessonId !== usage.lessonId ||
      current.date !== usage.date ||
      current.attendance !== usage.attendance
    ) {
      usages.set(usage.id, usage);
      usageChanged = true;
    }
  }
  const currentLesson = data.lessons.find((item) => item.id === normalizedLesson.id);
  const lessonChanged =
    !currentLesson ||
    !sameIds(currentLesson.replacementStudentIds || [], roster) ||
    !sameIds(currentLesson.replacementOriginalStudentIds || [], normalizedLesson.replacementOriginalStudentIds || []) ||
    currentLesson.replacementCapacity !== normalizedLesson.replacementCapacity ||
    currentLesson.replacementRosterLocked !== true ||
    currentLesson.replacementIntegrityVersion !== KIDS_REPLACEMENT_INTEGRITY_VERSION ||
    roster.some(
      (studentId) =>
        currentLesson.attendance?.[studentId] !== normalizedLesson.attendance[studentId],
    );
  if (!lessonChanged && !usageChanged) return data;
  return {
    ...data,
    lessons: lessonChanged
      ? data.lessons.map((item) =>
          item.id === normalizedLesson.id ? normalizedLesson : item,
        )
      : data.lessons,
    replacementUsages: usageChanged
      ? [...usages.values()]
      : data.replacementUsages,
  };
}

export function repairKidsReplacementIntegrity(data: KidsData): KidsData {
  let changed = false;
  let lessons = data.lessons.map((lesson) => {
    if (!isV616HistoricalRepairTarget(lesson) || !lesson.replacementCategory) {
      return lesson;
    }
    const expected = activeStudentIdsForCategory(
      data,
      lesson.replacementCategory,
      lesson.date,
    );
    if (!expected.length) return lesson;
    const attendance = { ...lesson.attendance };
    for (const studentId of expected) {
      if (attendance[studentId] !== "PRESENT" && attendance[studentId] !== "ABSENT") {
        attendance[studentId] = "ABSENT";
      }
    }
    if (
      sameIds(lesson.replacementStudentIds || [], expected) &&
      lesson.replacementRosterLocked &&
      lesson.replacementIntegrityVersion === KIDS_REPLACEMENT_INTEGRITY_VERSION
    ) {
      return lesson;
    }
    changed = true;
    return {
      ...lesson,
      replacementStudentIds: expected,
      replacementOriginalStudentIds: expected,
      replacementRosterMode: "LEVEL_ALL" as const,
      replacementCapacity: expected.length,
      replacementRosterLocked: true,
      replacementIntegrityVersion: KIDS_REPLACEMENT_INTEGRITY_VERSION,
      attendance,
    };
  });

  let repaired: KidsData = changed ? { ...data, lessons } : data;
  for (const lesson of lessons) {
    if (lesson.status !== "COMPLETED" || !(lesson.replacementStudentIds || []).length) continue;
    const before = repaired;
    repaired = recordCompletedReplacement(repaired, lesson);
    if (repaired !== before) changed = true;
  }
  return changed ? repaired : data;
}

export function completedReplacementRosterChanged(
  current: KidsLesson | undefined,
  next: KidsLesson,
) {
  if (!current || !(current.replacementStudentIds || []).length) return false;
  if (current.status !== "COMPLETED" && !current.replacementRosterLocked) return false;
  return !sameIds(
    current.replacementStudentIds || [],
    next.replacementStudentIds || [],
  );
}
