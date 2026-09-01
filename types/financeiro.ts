export type FinanceCompetenceStatus = "OPEN" | "CLOSED" | "REOPENED";

export type FinancePayment = {
  id: string;
  date: string;
  amount: number;
  note?: string;
};

export type PersonalInvoice = {
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

export type DsReceipt = {
  id: string;
  date: string | null;
  amount: number;
  sourceName?: string;
  note?: string;
};

export type FinanceExpenseKind = "RECURRING" | "INSTALLMENT" | "CARD" | "VARIABLE";

export type FinanceExpense = {
  id: string;
  competence: string;
  name: string;
  dueDay: number;
  expectedAmount: number;
  installmentCurrent?: number | null;
  installmentTotal?: number | null;
  kind: FinanceExpenseKind;
  payments: FinancePayment[];
};

export type ExtraExpense = {
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
  | "PERSONAL_PAYMENT_DELETED"
  | "DS_KID_CREATED"
  | "DS_KID_UPDATED"
  | "DS_KID_DELETED"
  | "DS_RECEIPT_ADDED"
  | "DS_RECEIPT_DELETED"
  | "RANKING_UPDATED"
  | "EXPENSE_CREATED"
  | "EXPENSE_UPDATED"
  | "EXPENSE_DELETED"
  | "EXPENSE_PAYMENT_ADDED"
  | "EXPENSE_PAYMENT_DELETED"
  | "EXTRA_CREATED"
  | "EXTRA_UPDATED"
  | "EXTRA_DELETED"
  | "CATEGORY_CREATED"
  | "CATEGORY_DELETED";

export type FinanceHistoryEntry = {
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

export type FinanceData = {
  version: 1;
  currentCompetence: string;
  competences: Record<string, FinanceCompetenceMeta>;
  dsPercent: number;
  rankingByCompetence: Record<string, number>;
  personalInvoices: PersonalInvoice[];
  dsKids: DsKidEntry[];
  dsReceipts: Record<string, DsReceipt[]>;
  expenses: FinanceExpense[];
  extraExpenses: ExtraExpense[];
  categories: string[];
  history?: FinanceHistoryEntry[];
  metadata?: {
    source?: string;
    importedAt?: string;
    notes?: string[];
  };
};
