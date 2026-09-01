import type {
  DsKidEntry,
  ExtraExpense,
  FinanceData,
  FinanceExpense,
  FinanceExpenseKind,
  FinanceHistoryEntry,
  FinanceHistoryKind,
  PersonalInvoice,
} from "@/types/financeiro";

export type FinanceCommand =
  | { type: "SWITCH_COMPETENCE"; competence: string }
  | { type: "CREATE_NEXT_COMPETENCE"; fromCompetence: string }
  | { type: "CLOSE_COMPETENCE"; competence: string; createNext?: boolean }
  | { type: "REOPEN_COMPETENCE"; competence: string }
  | { type: "PERSONAL_CREATE"; competence: string; studentName: string; dueDay: number; expectedAmount: number }
  | { type: "PERSONAL_UPDATE"; id: string; studentName: string; dueDay: number; expectedAmount: number }
  | { type: "PERSONAL_DELETE"; id: string }
  | { type: "PERSONAL_PAYMENT_ADD"; invoiceId: string; date: string; amount: number; note?: string }
  | { type: "PERSONAL_PAYMENT_DELETE"; invoiceId: string; paymentId: string }
  | { type: "DS_KID_CREATE"; competence: string; studentName: string; amount: number; dueDay?:number|null; billingMode?:"SINGLE"|"INSTALLMENT"|"RECURRING"; tennisCategory?:"RED"|"ORANGE"|"GREEN"|null; installmentCurrent?: number | null; installmentTotal?: number | null }
  | { type: "DS_KID_UPDATE"; id: string; studentName: string; amount: number; dueDay?:number|null; billingMode?:"SINGLE"|"INSTALLMENT"|"RECURRING"; tennisCategory?:"RED"|"ORANGE"|"GREEN"|null; installmentCurrent?: number | null; installmentTotal?: number | null }
  | { type: "DS_KID_DELETE"; id: string }
  | { type: "DS_RECEIPT_ADD"; competence: string; date: string; amount: number; sourceName?: string; note?: string }
  | { type: "DS_RECEIPT_DELETE"; competence: string; receiptId: string }
  | { type: "RANKING_SET"; competence: string; amount: number }
  | { type: "EXPENSE_CREATE"; competence: string; name: string; dueDay: number; expectedAmount: number; kind: FinanceExpenseKind; installmentCurrent?: number | null; installmentTotal?: number | null }
  | { type: "EXPENSE_UPDATE"; id: string; name: string; dueDay: number; expectedAmount: number; kind: FinanceExpenseKind; installmentCurrent?: number | null; installmentTotal?: number | null }
  | { type: "EXPENSE_DELETE"; id: string }
  | { type: "EXPENSE_PAYMENT_ADD"; expenseId: string; date: string; amount: number; note?: string }
  | { type: "EXPENSE_PAYMENT_DELETE"; expenseId: string; paymentId: string }
  | { type: "EXTRA_CREATE"; competence: string; date: string; description: string; category: string; paymentMethod?: string; amount: number }
  | { type: "EXTRA_UPDATE"; id: string; date: string; description: string; category: string; paymentMethod?: string; amount: number }
  | { type: "EXTRA_DELETE"; id: string }
  | { type: "CATEGORY_CREATE"; name: string; competence: string }
  | { type: "CATEGORY_DELETE"; name: string; competence: string };

function id(prefix: string) {
  const suffix = typeof globalThis.crypto?.randomUUID === "function"
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${suffix}`;
}

function nowIso() {
  return new Date().toISOString();
}

function historyEntry(competence: string, kind: FinanceHistoryKind, description: string, amount?: number, entityId?: string): FinanceHistoryEntry {
  return { id: id("history"), occurredAt: nowIso(), competence, kind, description, amount, entityId };
}

function withHistory(data: FinanceData, entry: FinanceHistoryEntry): FinanceData {
  return { ...data, history: [...(data.history || []), entry] };
}

export function isCompetenceEditable(data: FinanceData, competence = data.currentCompetence) {
  return data.competences[competence]?.status !== "CLOSED";
}

export function nextCompetence(value: string) {
  const [year, month] = value.split("-").map(Number);
  const date = new Date(year, month, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function previousCompetence(value: string) {
  const [year, month] = value.split("-").map(Number);
  const date = new Date(year, month - 2, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function generateNextCompetence(data: FinanceData, fromCompetence: string) {
  const target = nextCompetence(fromCompetence);
  if (data.competences[target]) {
    return { ...data, currentCompetence: target };
  }

  const sourcePersonal = data.personalInvoices
    .filter(item => item.competence === fromCompetence)
    .filter(item => !item.excludedFromTotals)
    .filter(item => item.autoRenew !== false);
  const sourceKids = data.dsKids
    .filter(item => item.competence === fromCompetence)
    .filter(item=>!item.excludedFromTotals)
    .filter(item=>!!item.studentId)
    .filter(item=>item.billingMode!=="SINGLE");
  const sourceExpenses = data.expenses.filter(item => item.competence === fromCompetence);

  const personalInvoices: PersonalInvoice[] = sourcePersonal.map(item => ({
    ...item,
    id: id("personal"),
    competence: target,
    payments: [],
  }));

  const dsKids: DsKidEntry[] = sourceKids
    .filter(item => !(item.installmentCurrent && item.installmentTotal && item.installmentCurrent >= item.installmentTotal))
    .map(item => ({
      ...item,
      id: id("kid"),
      competence: target,
      installmentCurrent: item.installmentCurrent && item.installmentTotal
        ? Math.min(item.installmentCurrent + 1, item.installmentTotal)
        : item.installmentCurrent ?? null,
    }));

  const expenses: FinanceExpense[] = sourceExpenses.flatMap(item => {
    if (item.kind === "VARIABLE") return [];
    if (item.kind === "INSTALLMENT" && item.installmentCurrent && item.installmentTotal && item.installmentCurrent >= item.installmentTotal) return [];
    return [{
      ...item,
      id: id("expense"),
      competence: target,
      expectedAmount: item.kind === "CARD" ? 0 : item.expectedAmount,
      installmentCurrent: item.kind === "INSTALLMENT" && item.installmentCurrent && item.installmentTotal
        ? Math.min(item.installmentCurrent + 1, item.installmentTotal)
        : item.installmentCurrent ?? null,
      payments: [],
    }];
  });

  const created: FinanceData = {
    ...data,
    currentCompetence: target,
    competences: {
      ...data.competences,
      [target]: { status: "OPEN", openedAt: nowIso() },
    },
    rankingByCompetence: { ...data.rankingByCompetence, [target]: 0 },
    personalInvoices: [...data.personalInvoices, ...personalInvoices],
    dsKids: [...data.dsKids, ...dsKids],
    dsReceipts: { ...data.dsReceipts, [target]: [] },
    expenses: [...data.expenses, ...expenses],
  };

  return withHistory(created, historyEntry(target, "COMPETENCE_CREATED", `Competência ${target} criada automaticamente a partir de ${fromCompetence}.`));
}

function commandCompetence(data: FinanceData, command: FinanceCommand): string {
  if ("competence" in command && typeof command.competence === "string") return command.competence;
  if ("fromCompetence" in command) return command.fromCompetence;
  if ("invoiceId" in command) return data.personalInvoices.find(item => item.id === command.invoiceId)?.competence || data.currentCompetence;
  if ("expenseId" in command) return data.expenses.find(item => item.id === command.expenseId)?.competence || data.currentCompetence;
  if ("id" in command) {
    return data.personalInvoices.find(item => item.id === command.id)?.competence
      || data.dsKids.find(item => item.id === command.id)?.competence
      || data.expenses.find(item => item.id === command.id)?.competence
      || data.extraExpenses.find(item => item.id === command.id)?.competence
      || data.currentCompetence;
  }
  return data.currentCompetence;
}

function isMutatingCommand(command: FinanceCommand) {
  return !["SWITCH_COMPETENCE", "CREATE_NEXT_COMPETENCE", "REOPEN_COMPETENCE"].includes(command.type);
}

export function applyFinanceCommand(data: FinanceData, command: FinanceCommand): FinanceData {
  const competence = commandCompetence(data, command);
  if (isMutatingCommand(command) && command.type !== "CLOSE_COMPETENCE" && !isCompetenceEditable(data, competence)) return data;

  switch (command.type) {
    case "SWITCH_COMPETENCE":
      return data.competences[command.competence] ? { ...data, currentCompetence: command.competence } : data;

    case "CREATE_NEXT_COMPETENCE":
      return generateNextCompetence(data, command.fromCompetence);

    case "CLOSE_COMPETENCE": { const closed: FinanceData = {
        ...data,
        competences: {
          ...data.competences,
          [command.competence]: { ...(data.competences[command.competence] || { status: "OPEN" }), status: "CLOSED", closedAt: nowIso() },
        },
      };
      const withLog = withHistory(closed, historyEntry(command.competence, "COMPETENCE_CLOSED", `Competência ${command.competence} fechada.`));
      return command.createNext ? generateNextCompetence(withLog, command.competence) : withLog;
    }

    case "REOPEN_COMPETENCE": {
      const reopened: FinanceData = {
        ...data,
        competences: {
          ...data.competences,
          [command.competence]: { ...(data.competences[command.competence] || { status: "OPEN" }), status: "REOPENED", reopenedAt: nowIso() },
        },
      };
      return withHistory(reopened, historyEntry(command.competence, "COMPETENCE_REOPENED", `Competência ${command.competence} reaberta.`));
    }

    case "PERSONAL_CREATE": { const invoice: PersonalInvoice = { id: id("personal"), competence: command.competence, studentName: command.studentName.trim(), dueDay: command.dueDay, expectedAmount: command.expectedAmount, payments: [], autoRenew:true, profileManaged:false, excludedFromTotals:false };
      return withHistory({ ...data, personalInvoices: [...data.personalInvoices, invoice] }, historyEntry(command.competence, "PERSONAL_CREATED", `Mensalidade de ${invoice.studentName} criada.`, invoice.expectedAmount, invoice.id));
    }

    case "PERSONAL_UPDATE": { const current = data.personalInvoices.find(item => item.id === command.id); if (!current) return data;
      const updated = data.personalInvoices.map(item => item.id === command.id ? { ...item, studentName: command.studentName.trim(), dueDay: command.dueDay, expectedAmount: command.expectedAmount } : item);
      return withHistory({ ...data, personalInvoices: updated }, historyEntry(current.competence, "PERSONAL_UPDATED", `Mensalidade de ${command.studentName.trim()} atualizada.`, command.expectedAmount, command.id));
    }

    case "PERSONAL_DELETE": { const current = data.personalInvoices.find(item => item.id === command.id); if (!current) return data;
      return withHistory({ ...data, personalInvoices: data.personalInvoices.filter(item => item.id !== command.id) }, historyEntry(current.competence, "PERSONAL_DELETED", `Mensalidade de ${current.studentName} excluída.`, current.expectedAmount, current.id));
    }

    case "PERSONAL_PAYMENT_ADD": { const invoice = data.personalInvoices.find(item => item.id === command.invoiceId); if (!invoice) return data;
      const payment = { id: id("payment"), date: command.date, amount: command.amount, note: command.note?.trim() || undefined };
      const updated = data.personalInvoices.map(item => item.id === command.invoiceId ? { ...item, payments: [...item.payments, payment] } : item);
      return withHistory({ ...data, personalInvoices: updated }, historyEntry(invoice.competence, "PERSONAL_PAYMENT_ADDED", `Recebimento de ${invoice.studentName} registrado.`, command.amount, invoice.id));
    }

    case "PERSONAL_PAYMENT_DELETE": { const invoice = data.personalInvoices.find(item => item.id === command.invoiceId); if (!invoice) return data; const payment = invoice.payments.find(item => item.id === command.paymentId); if (!payment) return data;
      const updated = data.personalInvoices.map(item => item.id === command.invoiceId ? { ...item, payments: item.payments.filter(p => p.id !== command.paymentId) } : item);
      return withHistory({ ...data, personalInvoices: updated }, historyEntry(invoice.competence, "PERSONAL_PAYMENT_DELETED", `Recebimento de ${invoice.studentName} removido.`, payment.amount, invoice.id));
    }

    case "DS_KID_CREATE": { const kid: DsKidEntry = { id: id("kid"), competence: command.competence, studentName: command.studentName.trim(), amount: command.amount, dueDay:command.dueDay??null, billingMode:command.billingMode||"RECURRING", tennisCategory:command.tennisCategory??null, installmentCurrent: command.installmentCurrent ?? null, installmentTotal: command.installmentTotal ?? null };
      return withHistory({ ...data, dsKids: [...data.dsKids, kid] }, historyEntry(command.competence, "DS_KID_CREATED", `Aluno Kids ${kid.studentName} criado.`, kid.amount, kid.id));
    }

    case "DS_KID_UPDATE": { const current = data.dsKids.find(item => item.id === command.id); if (!current) return data;
      const updated = data.dsKids.map(item => item.id === command.id ? { ...item, studentName: command.studentName.trim(), amount: command.amount, dueDay:command.dueDay??null, billingMode:command.billingMode||item.billingMode||"RECURRING", tennisCategory:command.tennisCategory??null, installmentCurrent: command.installmentCurrent ?? null, installmentTotal: command.installmentTotal ?? null } : item);
      return withHistory({ ...data, dsKids: updated }, historyEntry(current.competence, "DS_KID_UPDATED", `Aluno Kids ${command.studentName.trim()} atualizado.`, command.amount, command.id));
    }

    case "DS_KID_DELETE": { const current = data.dsKids.find(item => item.id === command.id); if (!current) return data;
      return withHistory({ ...data, dsKids: data.dsKids.filter(item => item.id !== command.id) }, historyEntry(current.competence, "DS_KID_DELETED", `Aluno Kids ${current.studentName} excluído.`, current.amount, current.id));
    }

    case "DS_RECEIPT_ADD": { const receipt = { id: id("dsreceipt"), date: command.date, amount: command.amount, sourceName: command.sourceName?.trim() || undefined, note: command.note?.trim() || undefined };
      const updated = { ...data, dsReceipts: { ...data.dsReceipts, [command.competence]: [...(data.dsReceipts[command.competence] || []), receipt] } };
      return withHistory(updated, historyEntry(command.competence, "DS_RECEIPT_ADDED", `Recebimento da DS registrado${receipt.sourceName ? ` · ${receipt.sourceName}` : ""}.`, command.amount, receipt.id));
    }

    case "DS_RECEIPT_DELETE": { const receipt = (data.dsReceipts[command.competence] || []).find(item => item.id === command.receiptId); if (!receipt) return data;
      const updated = { ...data, dsReceipts: { ...data.dsReceipts, [command.competence]: (data.dsReceipts[command.competence] || []).filter(item => item.id !== command.receiptId) } };
      return withHistory(updated, historyEntry(command.competence, "DS_RECEIPT_DELETED", "Recebimento da DS removido.", receipt.amount, receipt.id));
    }

    case "RANKING_SET": {
      return withHistory({ ...data, rankingByCompetence: { ...data.rankingByCompetence, [command.competence]: command.amount } }, historyEntry(command.competence, "RANKING_UPDATED", "Valor do ranking atualizado.", command.amount));
    }

    case "EXPENSE_CREATE": { const expense: FinanceExpense = { id: id("expense"), competence: command.competence, name: command.name.trim(), dueDay: command.dueDay, expectedAmount: command.expectedAmount, installmentCurrent: command.installmentCurrent ?? null, installmentTotal: command.installmentTotal ?? null, kind: command.kind, payments: [] };
      return withHistory({ ...data, expenses: [...data.expenses, expense] }, historyEntry(command.competence, "EXPENSE_CREATED", `Despesa ${expense.name} criada.`, expense.expectedAmount, expense.id));
    }

    case "EXPENSE_UPDATE": { const current = data.expenses.find(item => item.id === command.id); if (!current) return data;
      const updated = data.expenses.map(item => item.id === command.id ? { ...item, name: command.name.trim(), dueDay: command.dueDay, expectedAmount: command.expectedAmount, kind: command.kind, installmentCurrent: command.installmentCurrent ?? null, installmentTotal: command.installmentTotal ?? null } : item);
      return withHistory({ ...data, expenses: updated }, historyEntry(current.competence, "EXPENSE_UPDATED", `Despesa ${command.name.trim()} atualizada.`, command.expectedAmount, command.id));
    }

    case "EXPENSE_DELETE": { const current = data.expenses.find(item => item.id === command.id); if (!current) return data;
      return withHistory({ ...data, expenses: data.expenses.filter(item => item.id !== command.id) }, historyEntry(current.competence, "EXPENSE_DELETED", `Despesa ${current.name} excluída.`, current.expectedAmount, current.id));
    }

    case "EXPENSE_PAYMENT_ADD": { const expense = data.expenses.find(item => item.id === command.expenseId); if (!expense) return data;
      const payment = { id: id("payment"), date: command.date, amount: command.amount, note: command.note?.trim() || undefined };
      const updated = data.expenses.map(item => item.id === command.expenseId ? { ...item, payments: [...item.payments, payment] } : item);
      return withHistory({ ...data, expenses: updated }, historyEntry(expense.competence, "EXPENSE_PAYMENT_ADDED", `Pagamento de ${expense.name} registrado.`, command.amount, expense.id));
    }

    case "EXPENSE_PAYMENT_DELETE": { const expense = data.expenses.find(item => item.id === command.expenseId); if (!expense) return data; const payment = expense.payments.find(item => item.id === command.paymentId); if (!payment) return data;
      const updated = data.expenses.map(item => item.id === command.expenseId ? { ...item, payments: item.payments.filter(p => p.id !== command.paymentId) } : item);
      return withHistory({ ...data, expenses: updated }, historyEntry(expense.competence, "EXPENSE_PAYMENT_DELETED", `Pagamento de ${expense.name} removido.`, payment.amount, expense.id));
    }

    case "EXTRA_CREATE": { const extra: ExtraExpense = { id: id("extra"), competence: command.competence, date: command.date, description: command.description.trim(), category: command.category.trim() || "Outros", paymentMethod: command.paymentMethod?.trim() || "", amount: command.amount };
      const categories = data.categories.includes(extra.category) ? data.categories : [...data.categories, extra.category].sort((a, b) => a.localeCompare(b, "pt-BR"));
      return withHistory({ ...data, categories, extraExpenses: [...data.extraExpenses, extra] }, historyEntry(command.competence, "EXTRA_CREATED", `Gasto extra ${extra.description} criado.`, extra.amount, extra.id));
    }

    case "EXTRA_UPDATE": { const current = data.extraExpenses.find(item => item.id === command.id); if (!current) return data; const category = command.category.trim() || "Outros";
      const categories = data.categories.includes(category) ? data.categories : [...data.categories, category].sort((a, b) => a.localeCompare(b, "pt-BR"));
      const updated = data.extraExpenses.map(item => item.id === command.id ? { ...item, date: command.date, description: command.description.trim(), category, paymentMethod: command.paymentMethod?.trim() || "", amount: command.amount } : item);
      return withHistory({ ...data, categories, extraExpenses: updated }, historyEntry(current.competence, "EXTRA_UPDATED", `Gasto extra ${command.description.trim()} atualizado.`, command.amount, command.id));
    }

    case "EXTRA_DELETE": { const current = data.extraExpenses.find(item => item.id === command.id); if (!current) return data;
      return withHistory({ ...data, extraExpenses: data.extraExpenses.filter(item => item.id !== command.id) }, historyEntry(current.competence, "EXTRA_DELETED", `Gasto extra ${current.description} excluído.`, current.amount, current.id));
    }

    case "CATEGORY_CREATE": { const name = command.name.trim(); if (!name || data.categories.some(item => item.toLocaleLowerCase("pt-BR") === name.toLocaleLowerCase("pt-BR"))) return data;
      return withHistory({ ...data, categories: [...data.categories, name].sort((a, b) => a.localeCompare(b, "pt-BR")) }, historyEntry(command.competence, "CATEGORY_CREATED", `Categoria ${name} criada.`));
    }

    case "CATEGORY_DELETE": { if (data.extraExpenses.some(item => item.category === command.name)) return data;
      return withHistory({ ...data, categories: data.categories.filter(item => item !== command.name) }, historyEntry(command.competence, "CATEGORY_DELETED", `Categoria ${command.name} excluída.`));
    }
  }
}

export function findDuplicatePersonalPayment(invoice: PersonalInvoice, date: string, amount: number) {
  return invoice.payments.some(payment => payment.date === date && Math.abs(payment.amount - amount) < 0.005);
}

export function findDuplicateExpensePayment(expense: FinanceExpense, date: string, amount: number) {
  return expense.payments.some(payment => payment.date === date && Math.abs(payment.amount - amount) < 0.005);
}

export function findDuplicateExtra(data: FinanceData, competence: string, date: string, description: string, amount: number, ignoreId?: string) {
  const normalized = description.trim().toLocaleLowerCase("pt-BR");
  return data.extraExpenses.some(item => item.id !== ignoreId
    && item.competence === competence
    && item.date === date
    && item.description.trim().toLocaleLowerCase("pt-BR") === normalized
    && Math.abs(item.amount - amount) < 0.005);
}
