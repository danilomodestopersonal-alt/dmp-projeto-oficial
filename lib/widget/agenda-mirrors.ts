import type { CalendarEvent } from "@/types/models";
import type { widgetAgendaProjection, widgetCommitments } from "./v2";

type AgendaItem = ReturnType<typeof widgetAgendaProjection>["items"][number];
type TaskItem = ReturnType<typeof widgetCommitments>[number];

// A name/time match is not identity. Only an explicit Todoist link AND the
// same occurrence can join the two representations. Ambiguous links stay visible.
export function mergeAgendaMirrors(projected: AgendaItem[], tasks: TaskItem[], google: CalendarEvent[]) {
  const links = new Map(google.map(event => [event.id, (event as CalendarEvent & { widgetTodoistTaskId?: string }).widgetTodoistTaskId]));
  const removed = new Set<AgendaItem>();
  const commitments = tasks.map(task => {
    const sameOccurrence = tasks.filter(other => other.id === task.id && other.date === task.date && other.start === task.start);
    const mirrors = projected.filter(event => event.source === "google" && !event.historyOnly && event.type === "Compromisso" &&
      links.get(event.id) === task.id && event.date === task.date && event.start === task.start && event.allDay === task.allDay);
    if (sameOccurrence.length !== 1 || mirrors.length !== 1) return task;
    removed.add(mirrors[0]);
    // Keep the Todoist identity/action and the proven mirror's displayed interval.
    return { ...task, end: mirrors[0].end };
  });
  return [...projected.filter(event => !removed.has(event)), ...commitments];
}
