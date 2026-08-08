import type { FinanceData, FinanceExpenseKind } from "@/types/financeiro";
import { expenseStatus, financeSummary, invoiceStatus, paid, sum } from "@/lib/financeiro/calculos";

export function categoryTotals(data: FinanceData, competence = data.currentCompetence) {
  const totals = new Map<string, number>();
  data.extraExpenses
    .filter(item => item.competence === competence)
    .forEach(item => totals.set(item.category || "Outros", (totals.get(item.category || "Outros") || 0) + item.amount));
  return [...totals.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, "pt-BR"));
}

export function expenseKindTotals(data: FinanceData, competence = data.currentCompetence) {
  const labels: Record<FinanceExpenseKind, string> = {
    RECURRING: "Recorrentes",
    INSTALLMENT: "Parcelamentos",
    CARD: "Cartões",
    VARIABLE: "Variáveis",
  };
  const kinds: FinanceExpenseKind[] = ["RECURRING", "INSTALLMENT", "CARD", "VARIABLE"];
  return kinds.map(kind => {
    const items = data.expenses.filter(item => item.competence === competence && item.kind === kind);
    return {
      kind,
      label: labels[kind],
      expected: sum(items.map(item => item.expectedAmount)),
      paid: sum(items.map(item => paid(item.payments))),
      count: items.length,
    };
  });
}

export function personalStatusTotals(data: FinanceData, competence = data.currentCompetence) {
  const items = data.personalInvoices.filter(item => item.competence === competence);
  return {
    total: items.length,
    paid: items.filter(item => invoiceStatus(item) === "PAID").length,
    overdue: items.filter(item => invoiceStatus(item).includes("OVERDUE")).length,
    open: items.filter(item => invoiceStatus(item) !== "PAID").length,
  };
}

export function expenseStatusTotals(data: FinanceData, competence = data.currentCompetence) {
  const items = data.expenses.filter(item => item.competence === competence);
  return {
    total: items.length,
    paid: items.filter(item => expenseStatus(item) === "PAID").length,
    overdue: items.filter(item => expenseStatus(item).includes("OVERDUE")).length,
    open: items.filter(item => expenseStatus(item) !== "PAID").length,
  };
}

export function competenceComparison(data: FinanceData) {
  return Object.keys(data.competences)
    .sort()
    .map(competence => ({ competence, status: data.competences[competence]?.status || "OPEN", ...financeSummary(data, competence) }));
}

function csvCell(value: string | number | null | undefined) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function csvRow(values: (string | number | null | undefined)[]) {
  return values.map(csvCell).join(";");
}

export function financeReportCsv(data: FinanceData, competence = data.currentCompetence) {
  const summary = financeSummary(data, competence);
  const lines: string[] = [];

  lines.push(csvRow(["DMP Financeiro", competence]));
  lines.push(csvRow(["Resumo", "Valor"]));
  lines.push(csvRow(["Receitas previstas", summary.projectedRevenue.toFixed(2)]));
  lines.push(csvRow(["Receitas recebidas", summary.realizedRevenue.toFixed(2)]));
  lines.push(csvRow(["Despesas previstas", summary.expensesExpected.toFixed(2)]));
  lines.push(csvRow(["Despesas pagas", (summary.expensesPaid + summary.extrasTotal).toFixed(2)]));
  lines.push(csvRow(["Resultado projetado", summary.projectedResult.toFixed(2)]));
  lines.push(csvRow(["Resultado realizado", summary.realizedResult.toFixed(2)]));
  lines.push(csvRow(["A receber", summary.receivable.toFixed(2)]));
  lines.push(csvRow(["A pagar", summary.payable.toFixed(2)]));
  lines.push("");

  lines.push(csvRow(["PERSONAL"]));
  lines.push(csvRow(["Aluno", "Vencimento", "Previsto", "Recebido", "Status"]));
  summary.personal.forEach(item => lines.push(csvRow([
    item.studentName,
    item.dueDay,
    item.expectedAmount.toFixed(2),
    paid(item.payments).toFixed(2),
    invoiceStatus(item),
  ])));
  lines.push("");

  lines.push(csvRow(["DS TENIS"]));
  lines.push(csvRow(["Kids bruto", summary.kidsGross.toFixed(2)]));
  lines.push(csvRow(["Kids liquido", summary.kidsNet.toFixed(2)]));
  lines.push(csvRow(["Ranking", summary.ranking.toFixed(2)]));
  lines.push(csvRow(["Acerto", summary.dsSettlement.toFixed(2)]));
  lines.push(csvRow(["Recebido", summary.dsReceived.toFixed(2)]));
  lines.push(csvRow(["Saldo", summary.dsBalance.toFixed(2)]));
  lines.push(csvRow(["Aluno Kids", "Valor", "Parcela atual", "Parcelas"]));
  summary.kids.forEach(item => lines.push(csvRow([item.studentName, item.amount.toFixed(2), item.installmentCurrent, item.installmentTotal])));
  lines.push("");

  lines.push(csvRow(["DESPESAS"]));
  lines.push(csvRow(["Conta", "Tipo", "Vencimento", "Previsto", "Pago", "Parcela atual", "Parcelas", "Status"]));
  summary.expenses.forEach(item => lines.push(csvRow([
    item.name,
    item.kind,
    item.dueDay,
    item.expectedAmount.toFixed(2),
    paid(item.payments).toFixed(2),
    item.installmentCurrent,
    item.installmentTotal,
    expenseStatus(item),
  ])));
  lines.push("");

  lines.push(csvRow(["GASTOS EXTRAS"]));
  lines.push(csvRow(["Data", "Descricao", "Categoria", "Forma", "Valor"]));
  summary.extras
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .forEach(item => lines.push(csvRow([item.date, item.description, item.category, item.paymentMethod, item.amount.toFixed(2)])));

  return `\uFEFF${lines.join("\r\n")}`;
}
