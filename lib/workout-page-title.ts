export function workoutPageTitle(view:string,tab:string,studentName?:string) {
  const specific=["workout-editor","planned-session","historical-workout","free-session"].includes(view) || (view==="student" && tab==="workouts");
  return specific && studentName ? `Treino — ${studentName}` : "DMP - Danilo Modesto Personal";
}
