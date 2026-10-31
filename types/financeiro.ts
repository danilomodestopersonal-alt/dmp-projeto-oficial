import type {ExpenseSeriesChange} from "../lib/financeiro/expense-series";
import type {PixMetadata} from "../lib/mercado-pago/pix-payer";

export type FinanceCompetenceStatus = "OPEN" | "CLOSED" | "REOPENED";

export type FinancePayment = {
  mercadoPago?:PixMetadata;
  id: string;
  date: string;
  amount: number;
  note?: string;
};

export type OtherReceipt = FinancePayment & {competence:string;description:string;fingerprint:string};

export type InvoiceCancellationAudit = {
  operationId: string; invoiceId: string; action: "CANCEL" | "RESTORE";
  reason: string; occurredAt: string; operator: string; amount: number; competence: string;
};

export type PersonalInvoice = {
  cancellation?: { active: boolean; previousAutoRenew?: boolean };
  id: string;
  competence: string;
  studentId?: string | null;
  studentName: string;
  dueDay: number;
  expectedAmount: number;
  payments: FinancePayment[];
  profileManaged?: boolean;
  autoRenew?: boolean;
  excludedFromTotals?: boolean;
};

export type DsKidBillingMode = "SINGLE" | "INSTALLMENT" | "RECURRING";

export type DsKidEntry = {
  id: string;
  competence: string;
  studentId?: string | null;
  excludedFromTotals?: boolean;
  studentName: string;
  amount: number;
  dueDay?: number | null;
  billingMode?: DsKidBillingMode;
  tennisCategory?: "RED" | "ORANGE" | "GREEN" | null;
  installmentCurrent?: number | null;
  installmentTotal?: number | null;
};

export type FinanceCarryoverKind = "SINGLE" | "MONTHLY" | "INSTALLMENT" | "OTHER";

export type FinanceCarryoverEntry = {
  id: string;
  competence: string;
  originCompetence: string;
  scope: "DS_KIDS";
  studentId?: string | null;
  studentName: string;
  amount: number;
  kind: FinanceCarryoverKind;
  note?: string;
  sourceEntryId?: string | null;
};

export type DsReceipt = {
  mercadoPago?:PixMetadata;
  id: string;
  date: string | null;
  amount: number;
  sourceName?: string;
  note?: string;
};

export type DsReturnPayment = {
  id: string;
  date: string;
  amount: number;
  note?: string;
};

export type FinanceExpenseKind = "RECURRING" | "INSTALLMENT" | "CARD" | "VARIABLE";

export type FinanceExpense = {
  seriesId?: string;
  startCompetence?: string;
  id: string;
  competence: string;
  name: string;
  dueDay: number;
  expectedAmount: number;
  installmentCurrent?: number | null;
  installmentTotal?: number | null;
  kind: FinanceExpenseKind;
  note?: string;
  paymentLink?: string;
  payments: FinancePayment[];
};

export type ExtraExpense = {
  expenseCharge?:{expenseId:string;originalCompetence:string;fingerprint:string;paymentId:string;principal:number;total:number;revision:string};
  id: string;
  competence: string;
  date: string;
  description: string;
  category: string;
  paymentMethod?: string;
  amount: number;
};

export type FinanceHistoryKind =
  | "IMPORT"
  | "COMPETENCE_CREATED"
  | "COMPETENCE_CLOSED"
  | "COMPETENCE_REOPENED"
  | "PERSONAL_CREATED"
  | "PERSONAL_UPDATED"
  | "PERSONAL_DELETED"
  | "PERSONAL_PAYMENT_ADDED"
  | "OTHER_RECEIPT_ADDED"
  | "PERSONAL_PAYMENT_DELETED"
  | "DS_KID_CREATED"
  | "DS_KID_UPDATED"
  | "DS_KID_DELETED"
  | "DS_RECEIPT_ADDED"
  | "DS_RECEIPT_DELETED"
  | "DS_RETURN_ADDED"
  | "DS_RETURN_DELETED"
  | "DS_OPENING_BALANCE_UPDATED"
  | "RANKING_UPDATED"
  | "EVENTS_UPDATED"
  | "EXPENSE_CREATED"
  | "EXPENSE_UPDATED"
  | "EXPENSE_DELETED"
  | "EXPENSE_PAYMENT_ADDED"
  | "EXPENSE_PAYMENT_DELETED"
  | "EXTRA_CREATED"
  | "EXTRA_UPDATED"
  | "EXTRA_DELETED"
  | "CATEGORY_CREATED"
  | "CATEGORY_RENAMED"
  | "CATEGORY_ARCHIVED"
  | "CATEGORY_DELETED"
  | "CARRYOVER_CREATED"
  | "CARRYOVER_UPDATED"
  | "CARRYOVER_DELETED";

export type FinanceHistoryEntry = {
  mercadoPago?:PixMetadata;
  id: string;
  occurredAt: string;
  competence: string;
  kind: FinanceHistoryKind;
  description: string;
  amount?: number;
  entityId?: string;
};

export type FinanceCompetenceMeta = {
  status: FinanceCompetenceStatus;
  openedAt?: string;
  closedAt?: string;
  reopenedAt?: string;
};

export type PriorPlanning = {
  id:string; competence:string; originCompetence:string;
  kind:"DS_CREDIT"|"DS_DEBT"|"PERSONAL"|"EXPENSE"|"OTHER_CREDIT"|"OTHER_DEBT";
  sourceId:string; amount:number; reason:string; active:boolean;
};
export type FinanceOperationAudit = {
  operationId:string; request:string; occurredAt:string; operator:string;
  competence:string; entityId:string; action:string; reason:string; before:unknown; after:unknown;
};
export type DsBankLink = {
  id:string; fingerprint:string; aliases:string[]; competence:string; returnId:string;
  amount:number; date:string; identity:string; createdReturn:boolean; active:boolean;
};
export type FinanceData = {
  priorPlanning?:PriorPlanning[];
  priorPlanningAudit?:FinanceOperationAudit[];
  dsBankLinks?:DsBankLink[];
  dsBankAudit?:FinanceOperationAudit[];
  version: 1;
  currentCompetence: string;
  competences: Record<string, FinanceCompetenceMeta>;
  dsPercent: number;
  rankingByCompetence: Record<string, number>;
  eventsByCompetence?: Record<string, number>;
  invoiceCancellationAudit?: InvoiceCancellationAudit[];
  personalInvoices: PersonalInvoice[];
  dsKids: DsKidEntry[];
  dsReceipts: Record<string, DsReceipt[]>;
  dsReturns?: Record<string, DsReturnPayment[]>;
  dsOpeningBalances?: Record<string, number>;
  expenses: FinanceExpense[];
  expenseContinuations?: FinanceExpense[];
  expenseSeriesChanges?: ExpenseSeriesChange[];
  expenseSeriesStops?: Record<string,string>;
  extraExpenses: ExtraExpense[];
  otherReceipts?: OtherReceipt[];
  carriedPendencies?: FinanceCarryoverEntry[];
  categories: string[];
  history?: FinanceHistoryEntry[];
  metadata?: {
    source?: string;
    importedAt?: string;
    notes?: string[];
  };
};
