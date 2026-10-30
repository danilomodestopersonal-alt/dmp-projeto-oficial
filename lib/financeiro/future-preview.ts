import type { FinanceData } from "@/types/financeiro";
import type { Student } from "@/types/models";
import { applyFinanceCommand, nextCompetence } from "./operacoes";
import { preparePersonalRenewalForNextMonth } from "./personal-sync";

// This return value is a view model only. Never pass it to storage or the API.
export function futureFinanceView(base: FinanceData, selected: string, currentMonth: string, students: Student[]) {
  const future = selected > currentMonth;
  if (!future || base.competences[selected]) return { data: { ...base, currentCompetence: selected }, projected: false, unavailable: false };
  const from = Object.keys(base.competences).filter(month => month < selected).sort().at(-1);
  const unavailable = () => ({ data: { ...base, currentCompetence: selected }, projected: false, unavailable: true });
  if (!from || !/^\d{4}-(0[1-9]|1[0-2])$/.test(selected)) return unavailable();
  let view = structuredClone(base);
  let month = from;
  let steps = 0;
  while (month < selected && steps < 120) {
    view = preparePersonalRenewalForNextMonth(view, students, month).data;
    view = applyFinanceCommand(view, { type: "CREATE_NEXT_COMPETENCE", fromCompetence: month });
    month = nextCompetence(month);
    steps++;
  }
  if (month !== selected) return unavailable();
  // Preserve separately registered future entries; renewal must not duplicate them.
  for (const key of ["personalInvoices", "dsKids", "expenses"] as const) {
    const existing = base[key].filter(item => item.competence === selected);
    const identity = (item: typeof existing[number]) => "seriesId" in item ? item.seriesId || item.id : "studentId" in item ? item.studentId || item.id : item.id;
    const identities = new Set(existing.map(identity));
    const projected = view[key].filter(item => item.competence === selected && !identities.has(identity(item)));
    // Keep every persisted record intact; append only projected entries of the viewed month.
    (view[key] as Array<typeof existing[number]>) = [...base[key], ...projected];
  }
  return { data: { ...view, history: base.history, invoiceCancellationAudit: base.invoiceCancellationAudit,
    rankingByCompetence: { ...view.rankingByCompetence, ...base.rankingByCompetence },
    eventsByCompetence: { ...view.eventsByCompetence, ...base.eventsByCompetence },
    dsReceipts: base.dsReceipts, dsReturns: base.dsReturns, otherReceipts: base.otherReceipts,
    currentCompetence: selected }, projected: true, unavailable: false };
}
