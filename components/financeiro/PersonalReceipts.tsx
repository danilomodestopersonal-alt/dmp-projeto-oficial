import type { PersonalInvoice } from "../../types/financeiro";
import { paid, remaining, roundMoney } from "../../lib/financeiro/calculos";

const competenceLabel = (value: string) => { const [year, month] = value.split("-").map(Number); return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(new Date(year, month - 1, 1)); };
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const formatDate = (value: string) => { const [y, m, d] = value.split("-"); return `${d}/${m}/${y}`; };

export function PersonalManageButton({ invoice, className, onManage, editable = true }: { invoice: PersonalInvoice; className?: string; editable?: boolean; onManage: () => void }) {
  return <button type="button" className={className} disabled={!invoice.profileManaged && !editable} title={invoice.profileManaged ? "Gerenciar recebimentos desta mensalidade" : "Editar mensalidade manual"} onClick={onManage}>{invoice.profileManaged ? "Recebimentos" : "Editar"}</button>;
}

export function PaymentHistory({ title, payments, onDelete, className, editable = true }: { title: string; payments: PersonalInvoice["payments"]; onDelete: (payment: PersonalInvoice["payments"][number]) => void; className?: string; editable?: boolean }) {
  return <div className={className}><strong>{title}</strong>{payments.length ? payments.slice().sort((a, b) => b.date.localeCompare(a.date)).map(payment => <div key={payment.id}><span>{formatDate(payment.date)}{payment.note ? ` · ${payment.note}` : ""}</span><strong>{money.format(payment.amount)}</strong><button type="button" disabled={!editable} onClick={() => { if (editable) onDelete(payment); }}>Excluir</button></div>) : <span className="muted">Nenhum pagamento registrado.</span>}</div>;
}

export function PersonalReceipts({ invoice, editable, classes, onDelete }: { invoice: PersonalInvoice; editable: boolean; classes: Record<string, string>; onDelete: (payment: PersonalInvoice["payments"][number]) => void }) {
  const received = paid(invoice.payments);
  const excess = roundMoney(Math.max(0, received - invoice.expectedAmount));
  return <>
    <p className={classes.formHint}><strong>{invoice.studentName}</strong> · {competenceLabel(invoice.competence)}</p>
    <div className={classes.formHint}>Previsto: {money.format(invoice.expectedAmount)} · Recebido: {money.format(received)} · {excess > 0 ? `Excedente: ${money.format(excess)}` : `Em aberto: ${money.format(remaining(invoice.expectedAmount, invoice.payments))}`}</div>
    <p className="muted">O valor da mensalidade é gerenciado no cadastro do aluno.</p>
    {!editable ? <p className="muted">Competência fechada. Exclusão indisponível.</p> : null}
    <PaymentHistory title="Recebimentos registrados" payments={invoice.payments} editable={editable} className={classes.paymentHistory} onDelete={onDelete} />
  </>;
}
