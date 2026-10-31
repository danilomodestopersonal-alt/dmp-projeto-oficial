import type {FinanceData} from "@/types/financeiro";
export function originalDsBalance(data: FinanceData, competence: string) {
  const transferred = new Set((data.carriedPendencies || []).filter(item => item.originCompetence === competence && item.sourceEntryId).map(item => item.sourceEntryId as string));
  const kidsBase = data.dsKids.filter(item => item.competence === competence && !item.excludedFromTotals && !!item.studentId && !transferred.has(item.id)).reduce((total, item) => total + item.amount, 0);
  const carried = (data.carriedPendencies || []).filter(item => item.competence === competence && item.scope === "DS_KIDS").reduce((total, item) => total + item.amount, 0);
  const settlement = Math.round((((kidsBase + carried) * data.dsPercent) + (data.rankingByCompetence[competence] || 0) + (data.eventsByCompetence?.[competence] || 0)) * 100) / 100;
  const received = (data.dsReceipts[competence] || []).reduce((total, item) => total + item.amount, 0);
  const returned = (data.dsReturns?.[competence] || []).reduce((total, item) => total + item.amount, 0);
  return Math.round(((data.dsOpeningBalances?.[competence] || 0) + settlement - received + returned) * 100) / 100;
}

