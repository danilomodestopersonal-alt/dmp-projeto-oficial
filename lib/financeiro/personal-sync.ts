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

function cents(value: number) {
  return Math.round((Number(value) || 0) * 100);
}

function activePersonalTotals(invoices: PersonalInvoice[], competence: string) {
  return invoices
    .filter(
      (invoice) =>
        invoice.competence === competence && !invoice.excludedFromTotals,
    )
    .reduce(
      (totals, invoice) => {
        totals.expected += cents(invoice.expectedAmount);
        totals.received += invoice.payments.reduce(
          (sum, payment) => sum + cents(payment.amount),
          0,
        );
        return totals;
      },
      { expected: 0, received: 0 },
    );
}

type MigrationShare = {
  studentId: string;
  amount: number;
};

type SeptemberMigrationPlan = {
  legacyName: string;
  expectedAmount: number;
  shares: MigrationShare[];
  split: boolean;
};

const SEPTEMBER_MIGRATION_PLANS: SeptemberMigrationPlan[] = [
  {
    legacyName: "Léo e Cida",
    expectedAmount: 980,
    shares: [
      { studentId: "leonardo-scauri", amount: 490 },
      { studentId: "cida-scauri", amount: 490 },
    ],
    split: true,
  },
  {
    legacyName: "João e Bruna",
    expectedAmount: 2000,
    shares: [
      { studentId: "joao-antonio-beltrame-filho", amount: 850 },
      { studentId: "bruna-sickler", amount: 850 },
      { studentId: "benicio-beltrame", amount: 300 },
    ],
    split: true,
  },
  {
    legacyName: "Ruy",
    expectedAmount: 500,
    shares: [{ studentId: "ruy-cesar-silva", amount: 500 }],
    split: false,
  },
  {
    legacyName: "Pedro",
    expectedAmount: 950,
    shares: [{ studentId: "pedro-eroles", amount: 950 }],
    split: false,
  },
  {
    legacyName: "Poeira",
    expectedAmount: 600,
    shares: [{ studentId: "poeira", amount: 600 }],
    split: false,
  },
  {
    legacyName: "Janaina",
    expectedAmount: 600,
    shares: [{ studentId: "janaina-macari", amount: 600 }],
    split: false,
  },
  {
    legacyName: "Juste e Sueli",
    expectedAmount: 900,
    shares: [
      { studentId: "antonio-juste", amount: 300 },
      { studentId: "sueli-juste", amount: 600 },
    ],
    split: true,
  },
  {
    legacyName: "Eduardo",
    expectedAmount: 1200,
    shares: [{ studentId: "eduardo-e-cristiane", amount: 1200 }],
    split: false,
  },
  {
    legacyName: "Luciana",
    expectedAmount: 600,
    shares: [{ studentId: "luciana-grespi", amount: 600 }],
    split: false,
  },
  {
    legacyName: "Juliana",
    expectedAmount: 920,
    shares: [{ studentId: "juliana-revelk", amount: 920 }],
    split: false,
  },
  {
    legacyName: "Juliano Pallone",
    expectedAmount: 1025,
    shares: [
      { studentId: "juliano-pallone", amount: 650 },
      { studentId: "jussara-pallone", amount: 375 },
    ],
    split: true,
  },
  {
    legacyName: "Diego",
    expectedAmount: 600,
    shares: [{ studentId: "diego-tavares", amount: 600 }],
    split: false,
  },
  {
    legacyName: "Rafael e Sylvia",
    expectedAmount: 1280,
    shares: [
      { studentId: "rafael-carminatti", amount: 640 },
      { studentId: "sylvia-cardoso", amount: 640 },
    ],
    split: true,
  },
  {
    legacyName: "Alexandre",
    expectedAmount: 350,
    shares: [{ studentId: "alexandre", amount: 350 }],
    split: false,
  },
  {
    legacyName: "Gra",
    expectedAmount: 950,
    shares: [{ studentId: "graciele-freitas", amount: 950 }],
    split: false,
  },
  {
    legacyName: "Drago",
    expectedAmount: 600,
    shares: [{ studentId: "alessandro-drago", amount: 600 }],
    split: false,
  },
  {
    legacyName: "Rogério",
    expectedAmount: 640,
    shares: [{ studentId: "rogerio-novelli", amount: 640 }],
    split: false,
  },
  {
    legacyName: "Annetta",
    expectedAmount: 450,
    shares: [{ studentId: "gabriel-annetta", amount: 450 }],
    split: false,
  },
];

function splitPayments(
  payments: PersonalInvoice["payments"],
  shares: MigrationShare[],
) {
  const shareCents = shares.map((share) => cents(share.amount));
  const totalShareCents = shareCents.reduce((sum, amount) => sum + amount, 0);

  return shares.map((share, shareIndex) =>
    payments.map((payment) => {
      const paymentCents = cents(payment.amount);
      let allocated = 0;

      for (let index = 0; index <= shareIndex; index += 1) {
        if (index === shares.length - 1) {
          allocated = paymentCents;
          for (let earlier = 0; earlier < shares.length - 1; earlier += 1) {
            allocated -= Math.round(
              (paymentCents * shareCents[earlier]) / totalShareCents,
            );
          }
          break;
        }

        if (index === shareIndex) {
          allocated = Math.round(
            (paymentCents * shareCents[index]) / totalShareCents,
          );
        }
      }

      return {
        ...payment,
        id: `${payment.id}-${share.studentId}`,
        amount: allocated / 100,
      };
    }),
  );
}

function applySeptemberPersonalMigration(
  invoices: PersonalInvoice[],
  students: Student[],
  competence: string,
) {
  if (competence !== "2026-09") return;

  const before = activePersonalTotals(invoices, competence);
  let changed = false;

  for (const plan of SEPTEMBER_MIGRATION_PLANS) {
    const legacyNormalized = normalizePersonalName(plan.legacyName);
    const nameMatches = invoices
      .map((invoice, index) => ({ invoice, index }))
      .filter(
        ({ invoice }) =>
          invoice.competence === competence &&
          !invoice.excludedFromTotals &&
          normalizePersonalName(invoice.studentName) === legacyNormalized,
      );
    const matches = nameMatches.filter(
      ({ invoice }) =>
        cents(invoice.expectedAmount) === cents(plan.expectedAmount),
    );

    if (!matches.length) {
      const alreadySplit =
        plan.split &&
        invoices.some(
          (invoice) =>
            invoice.competence === competence &&
            invoice.excludedFromTotals === true &&
            normalizePersonalName(invoice.studentName) === legacyNormalized &&
            cents(invoice.expectedAmount) === cents(plan.expectedAmount),
        );
      if (alreadySplit) continue;
      if (nameMatches.length) {
        throw new Error(
          `Migração Personal interrompida: ${plan.legacyName} está com valor diferente do esperado.`,
        );
      }
      continue;
    }
    if (matches.length !== 1) {
      throw new Error(
        `Migração Personal interrompida: encontrei ${matches.length} lançamentos ativos para ${plan.legacyName}.`,
      );
    }

    const row = matches[0];
    const legacy = row.invoice;

    // Lançamentos individuais já migrados não devem ser reprocessados.
    if (!plan.split && legacy.studentId && legacy.profileManaged === true) {
      continue;
    }

    const shareTotal = plan.shares.reduce(
      (sum, share) => sum + cents(share.amount),
      0,
    );
    if (shareTotal !== cents(plan.expectedAmount)) {
      throw new Error(
        `Migração Personal inválida: o rateio de ${plan.legacyName} não fecha o valor original.`,
      );
    }

    const targets = plan.shares.map((share) => {
      const student = students.find(
        (candidate) => candidate.id === share.studentId,
      );
      if (!student) {
        throw new Error(
          `Migração Personal interrompida: cadastro ${share.studentId} não encontrado.`,
        );
      }
      return { student, share };
    });

    for (const { student, share } of targets) {
      student.financialActive = true;
      student.monthlyAmount = share.amount;
      student.financeDueDay = legacy.dueDay;
    }

    if (!plan.split) {
      const target = targets[0];
      const duplicates = invoices.filter(
        (invoice, index) =>
          index !== row.index &&
          invoice.competence === competence &&
          !invoice.excludedFromTotals &&
          invoice.studentId === target.student.id,
      );
      if (duplicates.length) {
        throw new Error(
          `Migração Personal interrompida: já existe outro lançamento ativo para ${target.student.name}.`,
        );
      }

      invoices[row.index] = {
        ...legacy,
        studentId: target.student.id,
        studentName: target.student.name.trim(),
        expectedAmount: target.share.amount,
        profileManaged: true,
        autoRenew:
          target.student.status === "ACTIVE" &&
          target.student.financialActive === true,
        excludedFromTotals: false,
      };
      changed = true;
      continue;
    }

    for (const { student } of targets) {
      const duplicate = invoices.find(
        (invoice, index) =>
          index !== row.index &&
          invoice.competence === competence &&
          !invoice.excludedFromTotals &&
          invoice.studentId === student.id,
      );
      if (duplicate) {
        throw new Error(
          `Migração Personal interrompida: já existe outro lançamento ativo para ${student.name}.`,
        );
      }
    }

    const dividedPayments = splitPayments(legacy.payments, plan.shares);

    invoices[row.index] = {
      ...legacy,
      autoRenew: false,
      excludedFromTotals: true,
    };

    targets.forEach(({ student, share }, targetIndex) => {
      invoices.push({
        id: `personal-migrated-${competence}-${student.id}`,
        competence,
        studentId: student.id,
        studentName: student.name.trim(),
        dueDay: legacy.dueDay,
        expectedAmount: share.amount,
        payments: dividedPayments[targetIndex],
        profileManaged: true,
        autoRenew:
          student.status === "ACTIVE" && student.financialActive === true,
        excludedFromTotals: false,
      });
    });
    changed = true;
  }

  if (!changed) return;

  const after = activePersonalTotals(invoices, competence);
  if (
    before.expected !== after.expected ||
    before.received !== after.received
  ) {
    throw new Error(
      "Migração Personal interrompida: a conferência de totais não fechou. Nenhum dado deve ser salvo.",
    );
  }
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
  const competenceKeys = Object.keys(finance.competences).sort();
  const managedCompetence =
    competenceKeys[competenceKeys.length - 1] || competence;

  // Migração única dos lançamentos legados de setembro para os cadastros
  // individuais. O total previsto e o total recebido são conferidos antes
  // de qualquer gravação pelo FinanceiroPage.
  applySeptemberPersonalMigration(
    nextInvoices,
    nextStudents,
    managedCompetence,
  );

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

  // O cadastro do aluno controla valor e vencimento somente na competência
  // financeira mais recente. Competências anteriores continuam históricas e
  // nunca são reescritas quando o valor mensal muda no cadastro.
  for (const student of nextStudents) {
    if (student.financialActive !== true) continue;
    if (student.status !== "ACTIVE") continue;
    if (!Number.isFinite(student.monthlyAmount)) continue;
    if (!Number.isFinite(student.financeDueDay)) continue;

    const linkedRows = nextInvoices
      .map((invoice, index) => ({ invoice, index }))
      .filter(
        ({ invoice }) =>
          invoice.competence === managedCompetence &&
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
    if (startMonth && managedCompetence < startMonth) continue;

    nextInvoices.push({
      id: id("personal"),
      competence: managedCompetence,
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
    if (
      invoice.competence !== managedCompetence ||
      !invoice.studentId
    ) {
      continue;
    }

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
