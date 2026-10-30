import type {FinanceData, InvoiceCancellationAudit, PersonalInvoice} from "@/types/financeiro";

export class CancellationError extends Error {}
const fail = (message: string): never => { throw new CancellationError(message); };
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>JSON.stringify(k)+':'+canonical(v)).join(',') + '}';
  return JSON.stringify(value);
}
export function cancellationRevision(invoice: PersonalInvoice) { return canonical(invoice); }

export type CancellationCommand = {invoiceId:string; action:'CANCEL'|'RESTORE'; reason:string; operationId:string; expectedInvoice:string; confirmed:boolean};
export function changeInvoiceCancellation(data: FinanceData, command: CancellationCommand, operator: string, now: string): FinanceData {
  if (!command || !['CANCEL','RESTORE'].includes(command.action) || command.confirmed !== true) fail('Confirme explicitamente a operação.');
  if (typeof command.reason !== 'string' || command.reason.trim().length < 5 || command.reason.trim().length > 500) fail('Informe um motivo entre 5 e 500 caracteres.');
  if (typeof command.operationId !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(command.operationId)) fail('Identificador de operação inválido.');
  if (!operator.trim()) fail('Operador autenticado não identificado.');
  const history = data.invoiceCancellationAudit || [];
  const retry = history.find(item=>item.operationId===command.operationId);
  if (retry) {
    if (retry.invoiceId!==command.invoiceId || retry.action!==command.action || retry.reason!==command.reason.trim() || retry.operator!==operator) fail('Identificador já utilizado em outra operação.');
    return data;
  }
  const rows = data.personalInvoices.filter(item=>item.id===command.invoiceId);
  if (rows.length !== 1) fail('Cobrança não encontrada ou ambígua. Atualize e confira.');
  const invoice = rows[0];
  if (cancellationRevision(invoice)!==command.expectedInvoice) fail('A cobrança mudou. Atualize e confira antes de confirmar.');
  if (!['OPEN','REOPENED'].includes(data.competences[invoice.competence]?.status)) fail('Competência fechada ou indisponível. Solicite revisão.');
  if (!Array.isArray(invoice.payments) || invoice.payments.length) fail('Cobrança com recebimentos: solicite revisão.');
  if (!Number.isFinite(invoice.expectedAmount) || invoice.expectedAmount <= 0) fail('Valor inválido para esta operação.');
  const cancelling = command.action === 'CANCEL';
  if (cancelling ? invoice.excludedFromTotals || invoice.cancellation?.active : !invoice.cancellation?.active || !invoice.excludedFromTotals) fail('Situação da cobrança mudou. Atualize e confira.');
  const duplicate = data.personalInvoices.some(other=>other.id!==invoice.id && other.competence===invoice.competence && !other.excludedFromTotals && (invoice.studentId ? other.studentId===invoice.studentId : other.studentName.trim().toLowerCase()===invoice.studentName.trim().toLowerCase()));
  if (duplicate) fail('Existe outra cobrança para este aluno e competência. Solicite revisão.');
  if ((data.carriedPendencies||[]).some(row=>row.sourceEntryId===invoice.id)) fail('Cobrança com pendência transferida. Solicite revisão.');
  const next: PersonalInvoice = {...invoice, excludedFromTotals:cancelling,
    autoRenew:cancelling ? false : invoice.cancellation?.previousAutoRenew,
    cancellation:{active:cancelling, previousAutoRenew:cancelling ? invoice.autoRenew : invoice.cancellation?.previousAutoRenew}};
  const audit: InvoiceCancellationAudit = {operationId:command.operationId,invoiceId:invoice.id,action:command.action,reason:command.reason.trim(),operator,occurredAt:now,amount:invoice.expectedAmount,competence:invoice.competence};
  return {...data,personalInvoices:data.personalInvoices.map(item=>item.id===invoice.id?next:item),invoiceCancellationAudit:[...history,audit]};
}

// Ordinary full-document saves cannot cancel, erase, restore or charge a cancelled invoice.
export function cancellationsPreserved(before: FinanceData, after: FinanceData): boolean {
  if (canonical(before.invoiceCancellationAudit||[])!==canonical(after.invoiceCancellationAudit||[])) return false;
  for (const invoice of before.personalInvoices) {
    const rows = after.personalInvoices.filter(item=>item.id===invoice.id);
    if (!invoice.cancellation) continue;
    if (rows.length!==1 || canonical(rows[0].cancellation)!==canonical(invoice.cancellation)) return false;
    if (invoice.cancellation.active && canonical(rows[0])!==canonical(invoice)) return false;
    if (invoice.cancellation.active && after.personalInvoices.some(item=>item.id!==invoice.id && !item.excludedFromTotals && item.competence===invoice.competence && (invoice.studentId ? item.studentId===invoice.studentId : item.studentName.trim().toLowerCase()===invoice.studentName.trim().toLowerCase()))) return false;
  }
  return after.personalInvoices.every(invoice=>!invoice.cancellation || before.personalInvoices.some(item=>item.id===invoice.id && !!item.cancellation));
}
