import type { FinanceExpense, PersonalInvoice } from "@/types/financeiro";

export type VoicePreview = {
  kind: "extra" | "personal" | "ds" | "expense" | "card" | "ranking";
  amount: number;
  label: string;
  category?: string;
  invoiceId?: string;
  expenseId?: string;
};

export function parseMoney(value: string) {
  const cleaned = value.trim().replace(/\s/g, "").replace(/R\$/gi, "");
  if (!cleaned) return null;
  if (cleaned.includes(",")) {
    const parsed = Number(cleaned.replace(/\./g, "").replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (/^\d{1,3}(?:\.\d{3})+$/.test(cleaned)) {
    const parsed = Number(cleaned.replace(/\./g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

export function suggestCategory(text: string) {
  const t = normalizeVoice(text);
  if (/padaria|ifood|marmita|pizza|lanche|sorvete|agua de coco/.test(t)) return "Alimentação";
  if (/mercado|covabra|pague menos/.test(t)) return "Mercado";
  if (/combust|posto|estacion|lava car/.test(t)) return "Transporte";
  if (/pintor|reforma/.test(t)) return "Reforma da Casa";
  if (/casa|lamp|travesseiro/.test(t)) return "Casa";
  if (/farmacia|remedio|saude/.test(t)) return "Saúde";
  return "Outros";
}

function normalizeVoice(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

const ptNumberValues: Record<string, number> = {
  zero: 0, um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9,
  dez: 10, onze: 11, doze: 12, treze: 13, catorze: 14, quatorze: 14, quinze: 15, dezesseis: 16, dezessete: 17, dezoito: 18, dezenove: 19,
  vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60, setenta: 70, oitenta: 80, noventa: 90,
  cem: 100, cento: 100, duzentos: 200, trezentos: 300, quatrocentos: 400, quinhentos: 500, seiscentos: 600, setecentos: 700, oitocentos: 800, novecentos: 900,
};

function extractVoiceAmount(raw: string) {
  const normalized = normalizeVoice(raw).replace(/r\$/g, " ").replace(/reais?/g, " ").replace(/\s+/g, " ").trim();
  const numericThousands = normalized.match(/(?:^|\s)(\d+(?:[.,]\d{1,2})?)\s+mil\b/);
  if (numericThousands) {
    const value = parseMoney(numericThousands[1]);
    if (value !== null && value > 0) return value * 1000;
  }

  const numeric = normalized.match(/(?:^|\s)(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)(?=\s|$)/);
  if (numeric) {
    const value = parseMoney(numeric[1]);
    if (value !== null && value > 0) return value;
  }

  const tokens = normalized.split(/\s+/);
  let best: { start: number; end: number; amount: number } | null = null;
  for (let i = 0; i < tokens.length; i++) {
    if (!(tokens[i] in ptNumberValues) && tokens[i] !== "mil") continue;
    let total = 0;
    let group = 0;
    let j = i;
    let used = false;
    for (; j < tokens.length; j++) {
      const token = tokens[j];
      if (token === "e") continue;
      if (token === "mil") {
        total += (group || 1) * 1000;
        group = 0;
        used = true;
        continue;
      }
      if (token in ptNumberValues) {
        group += ptNumberValues[token];
        used = true;
        continue;
      }
      break;
    }
    const amount = total + group;
    if (used && amount > 0 && (!best || j - i > best.end - best.start)) best = { start: i, end: j, amount };
  }
  return best?.amount ?? null;
}

function matchName<T extends { studentName?: string; name?: string }>(text: string, items: T[]) {
  const normalized = normalizeVoice(text);
  const ranked = items
    .map(item => {
      const candidate = normalizeVoice(item.studentName || item.name || "")
        .replace(/\b(cartao|cartao de credito)\b/g, "")
        .trim();
      if (!candidate) return { item, score: 0, full: false, length: 0 };
      const full = normalized.includes(candidate);
      const words = candidate.split(/\s+/).filter(word => word.length > 2);
      const hits = words.filter(word => normalized.includes(word)).length;
      const score = full ? 100 + words.length : hits;
      return { item, score, full, length: candidate.length };
    })
    .filter(result => result.score > 0)
    .sort((a, b) => b.score - a.score || Number(b.full) - Number(a.full) || b.length - a.length);

  return ranked[0]?.item || null;
}

function cleanExpenseLabel(raw: string) {
  const normalized = normalizeVoice(raw)
    .replace(/r\$/g, " ")
    .replace(/\b(reais?|paguei|gastei|comprei|hoje|ontem|amanha)\b/g, " ")
    .replace(/\b(zero|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|catorze|quatorze|quinze|dezesseis|dezessete|dezoito|dezenove|vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa|cem|cento|duzentos|trezentos|quatrocentos|quinhentos|seiscentos|setecentos|oitocentos|novecentos|mil|e)\b/g, " ")
    .replace(/\b\d{1,3}(?:\.\d{3})*(?:[.,]\d{1,2})?\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return "Gasto extra";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

export function parseFinanceVoice(text: string, personal: PersonalInvoice[], expenses: FinanceExpense[]): VoicePreview | null {
  const amount = extractVoiceAmount(text);
  if (amount === null) return null;
  const normalized = normalizeVoice(text).replace(/\s+/g, " ");

  if (/\branking\b/.test(normalized)) return { kind: "ranking", amount, label: "Ranking do mês" };

  if (/\b(ds|d s)\b/.test(normalized) && /\b(recebi|recebimento|depositou|transferiu|pagou)\b/.test(normalized)) {
    return { kind: "ds", amount, label: "Recebimento DS" };
  }

  if (/\bfatura\b/.test(normalized)) {
    const card = matchName(normalized, expenses.filter(item => item.kind === "CARD"));
    if (card) return { kind: "card", amount, label: `Fatura ${card.name}`, expenseId: card.id };
  }

  if (/\b(paguei|pago|quitei)\b/.test(normalized)) {
    const expense = matchName(normalized, expenses);
    if (expense) return { kind: "expense", amount, label: `Pagamento de ${expense.name}`, expenseId: expense.id };
  }

  if (/\b(pagou|recebi)\b/.test(normalized)) {
    const invoice = matchName(normalized, personal.map(item => ({ ...item, name: item.studentName })));
    if (invoice) return { kind: "personal", amount, label: `Pagamento de ${invoice.studentName}`, invoiceId: invoice.id };
  }

  const label = cleanExpenseLabel(text);
  return { kind: "extra", amount, label, category: suggestCategory(label) };
}
