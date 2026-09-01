import type { DsKidEntry, FinanceData } from "@/types/financeiro";
import type { KidsClass, KidsData, KidsStudent } from "@/types/kids";

export type KidsFinanceAudit = {
  linked: number;
  created: number;
  excluded: number;
  legacyIncluded: number;
};

type KidsProfile = {
  student: KidsStudent;
  classes: KidsClass[];
};

type ReconcileOptions = {
  createMissing?: boolean;
  updateFromProfile?: boolean;
  onlyStudentId?: string;
};

const normalizeName = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const aliasPairs = [
  ["Nina Zelenika", "Nina Romanelli Zelenika"],
  ["Pedro Gracitelli", "Pedro Barbosa Gracitelli"],
  ["Theo Vargas", "Theo Santa Rosa Vargas"],
  ["Caio Vargas", "Caio Santa Rosa Vargas"],
  ["Beatriz Roma", "Beatriz Roma Ferrari"],
  ["Eduardo Tenca", "Eduardo Santiago Tenca"],
  ["Luis Felipe Barb.", "Luis Felipe Barbosa de Oliveira"],
  ["Elisa Marques", "Elisa L. Marques Decrescenso"],
  ["Murilo Bitencourt", "Murilo Bittencourt Tonetto"],
  ["Jorge Abrantes", "Jorge Abrantes Marques"],
  ["Felipe Grespam", "Felipe Martins Grespam"],
  ["Enrico Colbano", "Enrico Colbano Martins"],
  ["Larissa Ibe", "Larissa Lopez Ibe"],
  ["João Vasconcelos", "João Vasconcelos Nogueira"],
  ["Livi Marques", "Livia Marques dos Santos"],
  ["Marheus Di Piero", "Matheus Di Piero"],
  ["Ana Amelia", "Ana Amelia de Oliv. Lopes"],
  ["Leandro", "Leandro Cantarin Quartaroli Filho"],
  ["Stela", "Stella Castilha Quartaroli"],
  ["Elis Constanza", "Elisa Golçalves Della Constanza"],
  ["Luca Capabianco", "Luca Fray Cappabianco"],
  ["Bruna Palone", "Bruna Oliveira Pallone"],
  ["Rafaela Masson", "Rafaela Squizzato Masson"],
  ["Felipe Juste", "Felipe de Campos Juste"],
  ["Bruno Oyamada", "Bruno Oyamada da Silva"],
  ["Joaquim Tonelatti", "Joaquim Tonelatti Martins"],
  ["Murilo Duarte", "Murilo Carieri Duarte"],
  ["Gustavo Grespam", "Gustavo Martins Grespam"],
  ["Laura Staut", "Laura Staut Gonçalves"],
  ["Ricardo Gandara", "Ricardo Gandara Monteiro"],
  ["Hekena Zelenika", "Helena Romanelli Zelenika"],
  ["Matheus Leite", "Matheus Leite Victorino de Paula"],
  ["Luiza Kimori", "Luiza Kimori Pereira"],
  ["Luisa Staut", "Luiza Staut"],
] as const;

function namesEquivalent(a: string, b: string) {
  const left = normalizeName(a);
  const right = normalizeName(b);
  if (!left || !right) return false;
  if (left === right) return true;
  return aliasPairs.some(([first, second]) => {
    const x = normalizeName(first);
    const y = normalizeName(second);
    return (left === x && right === y) || (left === y && right === x);
  });
}

function activeProfiles(kids: KidsData) {
  const profiles = new Map<string, KidsProfile>();
  for (const group of kids.classes) {
    for (const student of group.students) {
      if (!student.active) continue;
      const current = profiles.get(student.id);
      if (!current) {
        profiles.set(student.id, { student, classes: [group] });
        continue;
      }
      current.classes.push(group);
      if (
        current.student.monthlyAmount === undefined &&
        student.monthlyAmount !== undefined
      ) {
        current.student = student;
      }
    }
  }
  return [...profiles.values()];
}

function matchesProfile(item: DsKidEntry, profile: KidsProfile) {
  if (item.studentId) return item.studentId === profile.student.id;
  if (item.id === profile.student.id) return true;
  return namesEquivalent(item.studentName, profile.student.name);
}

function candidateScore(item: DsKidEntry, profile: KidsProfile) {
  if (item.studentId === profile.student.id) return 1000;
  if (item.id === profile.student.id) return 950;
  if (normalizeName(item.studentName) === normalizeName(profile.student.name))
    return 900;
  return 700;
}

function profileBillingMode(
  student: KidsStudent,
  fallback?: DsKidEntry["billingMode"],
): DsKidEntry["billingMode"] {
  if (student.billingMode === "ONE_TIME") return "SINGLE";
  if (student.billingMode === "INSTALLMENTS") return "INSTALLMENT";
  if (student.billingMode === "RECURRING") return "RECURRING";
  return fallback || "RECURRING";
}

function profileCategory(
  profile: KidsProfile,
  fallback?: DsKidEntry["tennisCategory"],
): DsKidEntry["tennisCategory"] {
  const value =
    profile.classes.find((group) => group.active)?.category ||
    profile.classes[0]?.category;
  if (value === "RED" || value === "ORANGE" || value === "GREEN") return value;
  return fallback ?? null;
}

export function reconcileKidsFinance(
  finance: FinanceData,
  kids: KidsData,
  options: ReconcileOptions = {},
) {
  const competence = finance.currentCompetence;
  const profiles = activeProfiles(kids).filter(
    (profile) =>
      !options.onlyStudentId || profile.student.id === options.onlyStudentId,
  );
  const nextKids = finance.dsKids.map((item) => ({ ...item }));
  const claimed = new Set<number>();
  let created = 0;

  for (const profile of profiles) {
    const candidates = nextKids
      .map((item, index) => ({ item, index }))
      .filter(
        ({ item, index }) =>
          item.competence === competence &&
          !claimed.has(index) &&
          matchesProfile(item, profile),
      )
      .sort(
        (a, b) =>
          candidateScore(b.item, profile) - candidateScore(a.item, profile),
      );

    const historicalSingle = nextKids.some(
      (item) =>
        item.competence < competence &&
        !item.excludedFromTotals &&
        item.billingMode === "SINGLE" &&
        matchesProfile(item, profile),
    );

    if (historicalSingle) {
      for (const candidate of candidates) {
        claimed.add(candidate.index);
        nextKids[candidate.index] = {
          ...nextKids[candidate.index],
          studentId: profile.student.id,
          studentName: profile.student.name.trim(),
          billingMode: "SINGLE",
          excludedFromTotals: true,
        };
      }
      continue;
    }

    const winner = candidates[0];

    if (!winner) {
      if (!options.createMissing) continue;

      const historicalMatch = nextKids.some(
        (item) =>
          item.competence !== competence && matchesProfile(item, profile),
      );
      if (profile.student.billingMode === "ONE_TIME" && historicalMatch)
        continue;
      if (profile.student.monthlyAmount === undefined) continue;

      const mode = profileBillingMode(profile.student);
      nextKids.push({
        id: `kid-${profile.student.id}-${competence}`,
        studentId: profile.student.id,
        competence,
        studentName: profile.student.name.trim(),
        amount: Number(profile.student.monthlyAmount) || 0,
        dueDay: profile.student.dueDay ?? null,
        billingMode: mode,
        tennisCategory: profileCategory(profile),
        installmentCurrent: mode === "INSTALLMENT" ? 1 : null,
        installmentTotal:
          mode === "INSTALLMENT"
            ? profile.student.installmentCount ?? null
            : null,
        excludedFromTotals: false,
      });
      created += 1;
      continue;
    }

    claimed.add(winner.index);
    const current = winner.item;

    const linked: DsKidEntry = {
      ...current,
      studentId: profile.student.id,
      studentName: profile.student.name.trim(),
      excludedFromTotals: false,
    };

    // Ao apenas reconciliar/auditar, o Financeiro é a fonte da verdade.
    // Valor, cobrança, parcelas e vencimento existentes são preservados.
    if (options.updateFromProfile) {
      const mode = profileBillingMode(profile.student, current.billingMode);
      linked.amount =
        profile.student.monthlyAmount !== undefined
          ? Number(profile.student.monthlyAmount) || 0
          : current.amount;
      linked.dueDay = profile.student.dueDay ?? current.dueDay ?? null;
      linked.billingMode = mode;
      linked.tennisCategory = profileCategory(profile, current.tennisCategory);
      linked.installmentCurrent =
        mode === "INSTALLMENT"
          ? current.installmentCurrent || 1
          : null;
      linked.installmentTotal =
        mode === "INSTALLMENT"
          ? profile.student.installmentCount ??
            current.installmentTotal ??
            null
          : null;
    }

    nextKids[winner.index] = linked;

    for (const duplicate of candidates.slice(1)) {
      claimed.add(duplicate.index);
      nextKids[duplicate.index] = {
        ...nextKids[duplicate.index],
        excludedFromTotals: true,
      };
    }
  }

  // Segurança: qualquer registro da competência que não conseguiu vínculo
  // com uma criança ativa permanece guardado, mas NÃO entra no Kids bruto.
  for (let index = 0; index < nextKids.length; index += 1) {
    const item = nextKids[index];
    if (item.competence !== competence) continue;
    if (item.studentId) continue;
    if (claimed.has(index)) continue;
    if (!item.excludedFromTotals) {
      nextKids[index] = { ...item, excludedFromTotals: true };
    }
  }

  const next: FinanceData = { ...finance, dsKids: nextKids };
  const current = nextKids.filter((item) => item.competence === competence);
  const audit: KidsFinanceAudit = {
    linked: current.filter(
      (item) => !item.excludedFromTotals && !!item.studentId,
    ).length,
    created,
    excluded: current.filter((item) => item.excludedFromTotals).length,
    legacyIncluded: current.filter(
      (item) => !item.excludedFromTotals && !item.studentId,
    ).length,
  };

  return {
    data: next,
    changed: JSON.stringify(next.dsKids) !== JSON.stringify(finance.dsKids),
    audit,
  };
}
