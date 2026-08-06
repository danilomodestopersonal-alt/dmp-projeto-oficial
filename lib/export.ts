import type { Student } from "@/types/models";

function csvEscape(value: string): string {
  return `"${String(value).replaceAll('"', '""')}"`;
}

export function exportStudentSessionsCsv(student: Student): void {
  const header = [
    "Aluno",
    "Data",
    "Treino",
    "Exercício",
    "Séries",
    "Repetições",
    "Carga",
    "Observações"
  ];

  const rows = student.sessions.flatMap(session => {
    if (!session.completedExercises.length) {
      return [[
        student.name,
        session.date,
        session.workoutName,
        "",
        "",
        "",
        "",
        session.notes
      ]];
    }

    return session.completedExercises.map(exercise => [
      student.name,
      session.date,
      session.workoutName,
      exercise.name,
      exercise.sets,
      exercise.reps,
      exercise.load,
      session.notes
    ]);
  });

  const csv = [header, ...rows]
    .map(row => row.map(item => csvEscape(String(item))).join(";"))
    .join("\n");

  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${student.name.replaceAll(" ", "_")}_sessoes.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}
