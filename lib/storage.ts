import type { Student } from "@/types/models";

const STORAGE_KEY = "dmp_oficial_v2_2026";

export function loadStudents(fallback: Student[]): Student[] {
  if (typeof window === "undefined") return fallback;
  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (!saved) return fallback;

  try {
    const parsed = JSON.parse(saved) as Student[];
    return parsed.map(student => ({
      ...student,
      restrictions: student.restrictions || "",
      startDate: student.startDate || "",
      birthDate: student.birthDate || "",
      sessions: student.sessions || [],
      workouts: student.workouts || [],
      assessments: student.assessments || []
    }));
  } catch {
    return fallback;
  }
}

export function saveStudents(students: Student[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(students));
}

export function resetImportedData(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}
