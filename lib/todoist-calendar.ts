type ScheduledNote = { done: boolean; dueDate?: string; title?: string; text: string };

// /api/notes already normalizes Todoist due dates to America/Sao_Paulo.
// Do not guess future recurrence dates or create Google events for indicators.
export function todoistCalendarDates(notes: ScheduledNote[]) {
  const dates = new Map<string, string[]>();
  for (const note of notes) {
    const date = note.dueDate || "";
    if (note.done || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const parsed = new Date(date + "T12:00:00Z");
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) continue;
    dates.set(date, [...(dates.get(date) || []), note.title || note.text]);
  }
  return dates;
}
