import type { FinanceData, FinanceExpense, FinancePayment, PersonalInvoice } from "@/types/financeiro";

export type PaymentStatus = "PENDING" | "PARTIAL" | "PAID" | "OVERDUE" | "PARTIAL_OVERDUE";

export const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
export const paid = (payments: FinancePayment[]) => sum(payments.map(item => item.amount));
export const remaining = (expected: number, payments: FinancePayment[]) => Math.max(0, expected - paid(payments));

export function localDateISO(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function dueDateFor(competence: string, dueDay: number) {
  const [year, month] = competence.split("-").map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(Math.min(Math.max(1, dueDay), lastDay)).padStart(2, "0")}`;
}

export function paymentStatus(expected: number, payments: FinancePayment[], dueDate: string, referenceDate = new Date()): PaymentStatus {
  const received = paid(payments);
  if (received >= expected && expected > 0) return "PAID";
  const today = localDateISO(referenceDate);
  const overdue = today > dueDate;
  if (received > 0) return overdue ? "PARTIAL_OVERDUE" : "PARTIAL";
  return overdue ? "OVERDUE" : "PENDING";
}

export function invoiceStatus(invoice: PersonalInvoice, referenceDate = new Date()) {
  return paymentStatus(invoice.expectedAmount, invoice.payments, dueDateFor(invoice.competence, invoice.dueDay), referenceDate);
}

export function expenseStatus(expense: FinanceExpense, referenceDate = new Date()) {
  return paymentStatus(expense.expectedAmount, expense.payments, dueDateFor(expense.competence, expense.dueDay), referenceDate);
}

export function financeSummary(data: FinanceData, competence = data.currentCompetence) {
  const personal = data.personalInvoices.filter(item => item.competence === competence);
  const kids = data.dsKids.filter(item => item.competence === competence);
  const expenses = data.expenses.filter(item => item.competence === competence);
  const extras = data.extraExpenses.filter(item => item.competence === competence);
  const receipts = data.dsReceipts[competence] || [];

  const personalExpected = sum(personal.map(item => item.expectedAmount));
  const personalReceived = sum(personal.map(item => paid(item.payments)));
  const kidsGross = sum(kids.map(item => item.amount));
  const kidsNet = kidsGross * data.dsPercent;
  const ranking = data.rankingByCompetence[competence] || 0;
  const dsSettlement = kidsNet + ranking;
  const dsReceived = sum(receipts.map(item => item.amount));
  const dsBalance = dsSettlement - dsReceived;
  const expensesExpected = sum(expenses.map(item => item.expectedAmount));
  const expensesPaid = sum(expenses.map(item => paid(item.payments)));
  const extrasTotal = sum(extras.map(item => item.amount));
  const projectedRevenue = personalExpected + dsSettlement;
  const realizedRevenue = personalReceived + dsReceived;
  const projectedResult = projectedRevenue - expensesExpected - extrasTotal;
  const realizedResult = realizedRevenue - expensesPaid - extrasTotal;
  const personalOpen = Math.max(0, personalExpected - personalReceived);
  const receivable = personalOpen + Math.max(0, dsBalance);
const payable = Math.max(0, expensesExpected - expensesPaid - extrasTotal);  return {
    personal,
    kids,
    expenses,
    extras,
    receipts,
    personalExpected,
    personalReceived,
    personalOpen,
    kidsGross,
    kidsNet,
    ranking,
    dsSettlement,
    dsReceived,
    dsBalance,
    expensesExpected,
    expensesPaid,
    extrasTotal,
    projectedRevenue,
    realizedRevenue,
    projectedResult,
    realizedResult,
    receivable,
    payable,
  };
}

export function financialPendencies(data: FinanceData, competence = data.currentCompetence, referenceDate = new Date()) {
  const summary = financeSummary(data, competence);
  const personalOverdue = summary.personal.filter(item => ["OVERDUE", "PARTIAL_OVERDUE"].includes(invoiceStatus(item, referenceDate))).length;
  const personalOpen = summary.personal.filter(item => invoiceStatus(item, referenceDate) !== "PAID").length;
  const expensesOverdue = summary.expenses.filter(item => ["OVERDUE", "PARTIAL_OVERDUE"].includes(expenseStatus(item, referenceDate))).length;
  const cardsMissing = summary.expenses.filter(item => item.kind === "CARD" && item.expectedAmount <= 0).length;
  const rankingMissing = !(data.rankingByCompetence[competence] > 0);

  return {
    personalOverdue,
    personalOpen,
    expensesOverdue,
    cardsMissing,
    rankingMissing,
    dsBalance: summary.dsBalance,
  };
}
