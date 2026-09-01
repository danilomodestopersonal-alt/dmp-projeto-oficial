import type { FinanceData, PersonalInvoice } from "@/types/financeiro";
import type { Student } from "@/types/models";

export type PersonalFinanceAudit = {
  linked: number;
  profilesImported: number;
  created: number;
  renewalStopped: number;
  ambiguous: number;
  unmatchedInvoices: number;
};

export const normalizePersonalName = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function id(prefix: string) {
  const suffix =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${suffix}`;
}

function uniqueStudentByName(students: Student[], name: string) {
  const normalized = normalizePersonalName(name);
  const matches = students.filter(
    (student) => normalizePersonalName(student.name) === normalized,
  );
  return matches.length === 1 ? matches[0] : null;
}

export function preparePersonalRenewalForNextMonth(
  finance: FinanceData,
  students: Student[],
  competence: string,
) {
  let changed = false;
  const invoices = finance.personalInvoices.map((invoice) => {
    if (invoice.competence !== competence || invoice.excludedFromTotals) return invoice;

    const student =
      (invoice.studentId
        ? students.find((candidate) => candidate.id === invoice.studentId)
        : null) || uniqueStudentByName(students, invoice.studentName);

    if (!student) return invoice;

    const shouldRenew =
      student.status === "ACTIVE" && student.financialActive !== false;

    const next: PersonalInvoice = {
      ...invoice,
      studentId: student.id,
      autoRenew: shouldRenew,
    };

    if (
      next.studentId !== invoice.studentId ||
      next.autoRenew !== invoice.autoRenew
    ) {
      changed = true;
      return next;
    }
    return invoice;
  });

  return {
    data: changed ? { ...finance, personalInvoices: invoices } : finance,
    changed,
  };
}

export function reconcilePersonalFinance(
  finance: FinanceData,
  students: Student[],
  competence: string,
): {
  data: FinanceData;
  students: Student[];
  changedFinance: boolean;
  changedStudents: boolean;
  audit: PersonalFinanceAudit;
} {
  const nextInvoices = finance.personalInvoices.map((invoice) => ({ ...invoice }));
  const nextStudents = students.map((student) => ({ ...student }));

  let linked = 0;
  let profilesImported = 0;
  let created = 0;
  let renewalStopped = 0;
  let ambiguous = 0;
  let unmatchedInvoices = 0;

  const currentInvoiceIndexes = nextInvoices
    .map((invoice, index) => ({ invoice, index }))
    .filter(
      ({ invoice }) =>
        invoice.competence === competence && !invoice.excludedFromTotals,
    );

  const candidateMap = new Map<string, { index: number; invoice: PersonalInvoice }[]>();

  for (const row of currentInvoiceIndexes) {
    const byId = row.invoice.studentId
      ? nextStudents.find((student) => student.id === row.invoice.studentId)
      : null;
    const student = byId || uniqueStudentByName(nextStudents, row.invoice.studentName);

    if (!student) {
      unmatchedInvoices += 1;
      continue;
    }

    const list = candidateMap.get(student.id) || [];
    list.push(row);
    candidateMap.set(student.id, list);
  }

  for (const student of nextStudents) {
    const candidates = candidateMap.get(student.id) || [];
    if (!candidates.length) continue;

    let winner: { index: number; invoice: PersonalInvoice } | null = null;

    const idMatches = candidates.filter(
      ({ invoice }) => invoice.studentId === student.id,
    );

    if (idMatches.length === 1) {
      winner = idMatches[0];
      ambiguous += candidates.length - 1;
    } else if (idMatches.length > 1) {
      ambiguous += candidates.length;
      continue;
    } else if (candidates.length === 1) {
      winner = candidates[0];
    } else {
      ambiguous += candidates.length;
      continue;
    }

    const invoice = nextInvoices[winner.index];

    if (student.financialActive === undefined) {
      student.financialActive = true;
      student.monthlyAmount = invoice.expectedAmount;
      student.financeDueDay = invoice.dueDay;
      profilesImported += 1;
    }

    const shouldRenew =
      student.status === "ACTIVE" && student.financialActive === true;

    nextInvoices[winner.index] = {
      ...invoice,
      studentId: student.id,
      studentName: student.name.trim(),
      profileManaged: true,
      autoRenew: shouldRenew,
      excludedFromTotals: false,
    };
    linked += 1;
  }

  // Depois que os cadastros antigos foram preenchidos pelo Financeiro,
  // o cadastro do aluno passa a ser a fonte da configuração recorrente.
  for (const student of nextStudents) {
    if (student.financialActive !== true) continue;
    if (student.status !== "ACTIVE") continue;
    if (!Number.isFinite(student.monthlyAmount)) continue;
    if (!Number.isFinite(student.financeDueDay)) continue;

    const linkedRows = nextInvoices
      .map((invoice, index) => ({ invoice, index }))
      .filter(
        ({ invoice }) =>
          invoice.competence === competence &&
          !invoice.excludedFromTotals &&
          invoice.studentId === student.id,
      );

    if (linkedRows.length > 1) {
      ambiguous += linkedRows.length;
      continue;
    }

    if (linkedRows.length === 1) {
      const row = linkedRows[0];
      const invoice = row.invoice;
      nextInvoices[row.index] = {
        ...invoice,
        studentName: student.name.trim(),
        dueDay: Math.min(31, Math.max(1, Math.trunc(Number(student.financeDueDay)))),
        expectedAmount: Number(student.monthlyAmount) || 0,
        profileManaged: true,
        autoRenew: true,
        excludedFromTotals: false,
      };
      continue;
    }

    const startMonth = student.startDate?.slice(0, 7) || "";
    if (startMonth && competence < startMonth) continue;

    nextInvoices.push({
      id: id("personal"),
      competence,
      studentId: student.id,
      studentName: student.name.trim(),
      dueDay: Math.min(31, Math.max(1, Math.trunc(Number(student.financeDueDay)))),
      expectedAmount: Number(student.monthlyAmount) || 0,
      payments: [],
      profileManaged: true,
      autoRenew: true,
      excludedFromTotals: false,
    });
    created += 1;
  }

  // Desativar/arquivar nunca apaga o mês atual: apenas impede renovação futura.
  for (let index = 0; index < nextInvoices.length; index += 1) {
    const invoice = nextInvoices[index];
    if (invoice.competence !== competence || !invoice.studentId) continue;

    const student = nextStudents.find(
      (candidate) => candidate.id === invoice.studentId,
    );
    if (!student) continue;

    if (
      (student.status !== "ACTIVE" || student.financialActive === false) &&
      invoice.autoRenew !== false
    ) {
      nextInvoices[index] = { ...invoice, autoRenew: false };
      renewalStopped += 1;
    }
  }

  const nextFinance = { ...finance, personalInvoices: nextInvoices };

  return {
    data: nextFinance,
    students: nextStudents,
    changedFinance:
      JSON.stringify(nextInvoices) !== JSON.stringify(finance.personalInvoices),
    changedStudents:
      JSON.stringify(nextStudents) !== JSON.stringify(students),
    audit: {
      linked,
      profilesImported,
      created,
      renewalStopped,
      ambiguous,
      unmatchedInvoices,
    },
  };
}
