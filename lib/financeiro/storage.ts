import type { FinanceData, FinanceHistoryEntry } from "@/types/financeiro";

const STORAGE_KEY = "dmp_finance_v1";

function hasCurrentShape(value: unknown): value is FinanceData {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<FinanceData>;
  return data.version === 1
    && typeof data.currentCompetence === "string"
    && !!data.competences
    && typeof data.competences === "object"
    && typeof data.dsPercent === "number"
    && !!data.rankingByCompetence
    && typeof data.rankingByCompetence === "object"
    && Array.isArray(data.personalInvoices)
    && Array.isArray(data.dsKids)
    && !!data.dsReceipts
    && typeof data.dsReceipts === "object"
    && Array.isArray(data.expenses)
    && Array.isArray(data.extraExpenses)
    && Array.isArray(data.categories);
}

function uniqueIds<T extends { id: string }>(items: T[], prefix: string): T[] {
  const used = new Set<string>();
  return items.map((item, index) => {
    const base = typeof item.id === "string" && item.id.trim()
      ? item.id.trim()
      : `${prefix}-${index + 1}`;
    let id = base;
    let suffix = 2;
    while (used.has(id)) {
      id = `${base}-${suffix}`;
      suffix += 1;
    }
    used.add(id);
    return id === item.id ? item : { ...item, id };
  });
}

function normalizeHistory(items: unknown): FinanceHistoryEntry[] {
  if (!Array.isArray(items)) return [];
  return uniqueIds(
    items.filter(item => item && typeof item === "object" && typeof (item as FinanceHistoryEntry).description === "string") as FinanceHistoryEntry[],
    "history"
  );
}

export function normalizeFinanceData(value: unknown, fallback: FinanceData): FinanceData {
  if (!hasCurrentShape(value)) return fallback;

  const currentCompetence = value.competences[value.currentCompetence]
    ? value.currentCompetence
    : Object.keys(value.competences).sort().at(-1) || fallback.currentCompetence;

  return {
    ...value,
    currentCompetence,
    personalInvoices: uniqueIds(value.personalInvoices, "personal").map(item => ({ ...item, payments: uniqueIds(Array.isArray(item.payments) ? item.payments : [], `personal-payment-${item.id}`) })),
    dsKids: uniqueIds(value.dsKids, "kid"),
    expenses: uniqueIds(value.expenses, "expense").map(item => ({ ...item, payments: uniqueIds(Array.isArray(item.payments) ? item.payments : [], `expense-payment-${item.id}`) })),
    extraExpenses: uniqueIds(value.extraExpenses, "extra"),
    carriedPendencies: uniqueIds(Array.isArray(value.carriedPendencies) ? value.carriedPendencies : [], "carryover"),
    dsReceipts: Object.fromEntries(
      Object.entries(value.dsReceipts).map(([competence, receipts]) => [
        competence,
        uniqueIds(Array.isArray(receipts) ? receipts : [], `ds-${competence}`),
      ])
    ),
    categories: [...new Set(value.categories.filter(item => typeof item === "string" && item.trim()).map(item => item.trim()))].sort((a, b) => a.localeCompare(b, "pt-BR")),
    history: normalizeHistory(value.history).length ? normalizeHistory(value.history) : normalizeHistory(fallback.history),
  };
}

export function loadFinanceData(fallback: FinanceData): FinanceData {
  if (typeof window === "undefined") return fallback;
  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (!saved) return fallback;
  try {
    return normalizeFinanceData(JSON.parse(saved), fallback);
  } catch {
    return fallback;
  }
}

export function saveFinanceData(data: FinanceData) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export async function fetchFinanceCloud(fallback: FinanceData): Promise<FinanceData | null> {
  const response = await fetch("/api/finance", { cache: "no-store" });
  if (!response.ok) throw new Error("Falha ao carregar o Financeiro da nuvem.");
  const result = await response.json();
  if (!hasCurrentShape(result?.data)) return null;
  return normalizeFinanceData(result.data, fallback);
}

export async function saveFinanceCloud(data: FinanceData) {
  const response = await fetch("/api/finance", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error("Falha ao salvar o Financeiro na nuvem.");
  return response.json();
}
