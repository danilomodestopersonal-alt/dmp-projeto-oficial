"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type {
  DsKidEntry,
  ExtraExpense,
  FinanceData,
  FinanceExpense,
  FinanceExpenseKind,
  PersonalInvoice,
} from "@/types/financeiro";
import { financeSeedAugust2026 } from "@/lib/financeiro/agosto2026";
import {
  expenseStatus,
  dueDateFor,
  financeSummary,
  financialPendencies,
  invoiceStatus,
  localDateISO,
  paid,
  remaining,
} from "@/lib/financeiro/calculos";
import {
  applyFinanceCommand,
  findDuplicateExpensePayment,
  findDuplicateExtra,
  findDuplicatePersonalPayment,
  isCompetenceEditable,
  nextCompetence,
  type FinanceCommand,
} from "@/lib/financeiro/operacoes";
import {
  categoryTotals,
  competenceComparison,
  expenseKindTotals,
  expenseStatusTotals,
  financeReportCsv,
  personalStatusTotals,
} from "@/lib/financeiro/relatorios";
import { fetchFinanceCloud, loadFinanceData, saveFinanceCloud, saveFinanceData } from "@/lib/financeiro/storage";
import { parseFinanceVoice, parseMoney, suggestCategory, type VoicePreview } from "@/lib/financeiro/voz";
import styles from "./FinanceiroPage.module.css";
import type { KidsData } from "@/types/kids";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const today = () => localDateISO();

type Tab = "summary" | "personal" | "ds" | "expenses" | "extras" | "closing" | "reports";
type Filter = "ALL" | "OPEN" | "PAID" | "OVERDUE";

type Action =
  | { type: "personal-create" }
  | { type: "personal-edit"; invoice: PersonalInvoice }
  | { type: "personal-payment"; invoice: PersonalInvoice }
  | { type: "expense-create"; kind?: FinanceExpenseKind }
  | { type: "expense-edit"; expense: FinanceExpense }
  | { type: "expense-payment"; expense: FinanceExpense }
  | { type: "card-value"; expense: FinanceExpense }
  | { type: "ds-receipt" }
  | { type: "ranking" }
  | { type: "extra-create" }
  | { type: "extra-edit"; extra: ExtraExpense }
  | { type: "kid-create" }
  | { type: "kid-edit"; kid: DsKidEntry }
  | { type: "category-create" }
  | null;

export default function FinanceiroPage() {
  const [data, setData] = useState<FinanceData>(financeSeedAugust2026);
  const [loaded, setLoaded] = useState(false);
  const [cloudWritable, setCloudWritable] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [tab, setTab] = useState<Tab>("summary");
  const [action, setAction] = useState<Action>(null);
  const [voiceText, setVoiceText] = useState("");
  const [voicePreview, setVoicePreview] = useState<VoicePreview | null>(null);
  const [listFilter, setListFilter] = useState<Filter>("ALL");
  const [undoDeletion, setUndoDeletion] = useState<FinanceData | null>(null);
  const competence = data.currentCompetence;
  const summary = useMemo(() => financeSummary(data, competence), [data, competence]);
  const pendencies = useMemo(() => financialPendencies(data, competence), [data, competence]);
  const editable = isCompetenceEditable(data, competence);
  const competences = useMemo(() => Object.keys(data.competences).sort().reverse(), [data.competences]);
  const weeklyDue = useMemo(() => {
    const now=new Date();const day=now.getDay();const monday=new Date(now);monday.setDate(now.getDate()-(day===0?6:day-1));const sunday=new Date(monday);sunday.setDate(monday.getDate()+6);
    const start=localDateISO(monday),end=localDateISO(sunday);
    return summary.expenses.filter(item=>remaining(item.expectedAmount,item.payments)>0).map(item=>({...item,dueDate:dueDateFor(competence,item.dueDay),open:remaining(item.expectedAmount,item.payments)})).filter(item=>item.dueDate>=start&&item.dueDate<=end).sort((a,b)=>a.dueDate.localeCompare(b.dueDate)||a.name.localeCompare(b.name,"pt-BR"));
  },[summary.expenses,competence]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const local = loadFinanceData(financeSeedAugust2026);
      try {
        const cloud = await fetchFinanceCloud(financeSeedAugust2026);
        if (cancelled) return;
        const base=cloud||local;
        let next=base;
        try{const kidsResponse=await fetch("/api/kids",{cache:"no-store"});if(kidsResponse.ok){const kidsPayload=await kidsResponse.json();if(kidsPayload.data)next=base;}}catch{}
        if (cloud) {
          setData(next);
          saveFinanceData(next);
        } else {
          setData(next);
        }
        setCloudWritable(true);
      } catch (error) {
        console.error("Financeiro: nuvem indisponível; usando backup local.", error);
        if (!cancelled) {
          setData(local);
          setCloudWritable(false);
        }
      } finally {
        if (!cancelled) setLoaded(true);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!loaded) return;
    saveFinanceData(data);
    if (!cloudWritable) return;
    const timer = window.setTimeout(() => {
      setSyncing(true);
      void saveFinanceCloud(data)
        .catch(error => console.error("Financeiro: erro ao salvar na nuvem.", error))
        .finally(() => setSyncing(false));
    }, 450);
    return () => window.clearTimeout(timer);
  }, [data, loaded, cloudWritable]);

  function dispatch(command: FinanceCommand) {
    if(command.type.endsWith("_DELETE"))setUndoDeletion(data);
    setData(current => applyFinanceCommand(current, command));
  }

  function undoLastDeletion(){if(!undoDeletion)return;setData(undoDeletion);setUndoDeletion(null);}

  function requireEditable() {
    if (editable) return true;
    window.alert("Esta competência está fechada. Reabra o mês na aba Fechamento para alterar dados.");
    return false;
  }

  function openAction(next: Exclude<Action, null>) {
    if (!requireEditable()) return;
    setAction(next);
  }

  useEffect(() => {
    const quickAction=window.sessionStorage.getItem("dmp_finance_quick_action");
    if(quickAction!=="extra")return;
    window.sessionStorage.removeItem("dmp_finance_quick_action");
    setTab("extras");
    setAction({type:"extra-create"});
  }, []);

  function startVoice() {
    if (!requireEditable()) return;
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      window.alert("O reconhecimento de voz não está disponível neste navegador.");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = "pt-BR";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onresult = (event: any) => {
      const text = event.results?.[0]?.[0]?.transcript || "";
      setVoiceText(text);
      setVoicePreview(parseFinanceVoice(text, summary.personal, summary.expenses));
    };
    recognition.onerror = () => window.alert("Não consegui entender. Tente novamente.");
    recognition.start();
  }

  useEffect(()=>{
    if(window.sessionStorage.getItem("dmp_finance_voice_start")!=="1")return;
    window.sessionStorage.removeItem("dmp_finance_voice_start");
    const timer=window.setTimeout(()=>startVoice(),350);
    return()=>window.clearTimeout(timer);
  },[]);

  function confirmVoice() {
    if (!voicePreview || !requireEditable()) return;
    const preview = voicePreview;
    if (preview.kind === "extra") {
      if (findDuplicateExtra(data, competence, today(), preview.label, preview.amount)) {
        window.alert("Esse gasto já parece estar lançado hoje. Nada foi duplicado.");
        return;
      }
      dispatch({ type: "EXTRA_CREATE", competence, date: today(), description: preview.label, category: preview.category || "Outros", amount: preview.amount });
    } else if (preview.kind === "ds") {
      dispatch({ type: "DS_RECEIPT_ADD", competence, date: today(), amount: preview.amount, sourceName: "DS", note: "Lançado por voz" });
    } else if (preview.kind === "ranking") {
      dispatch({ type: "RANKING_SET", competence, amount: preview.amount });
    } else if (preview.kind === "card" && preview.expenseId) {
      const card = summary.expenses.find(item => item.id === preview.expenseId);
      if (card) dispatch({ type: "EXPENSE_UPDATE", id: card.id, name: card.name, dueDay: card.dueDay, expectedAmount: preview.amount, kind: card.kind, installmentCurrent: card.installmentCurrent, installmentTotal: card.installmentTotal });
    } else if (preview.kind === "expense" && preview.expenseId) {
      const expense = summary.expenses.find(item => item.id === preview.expenseId);
      if (expense) {
        if (findDuplicateExpensePayment(expense, today(), preview.amount)) {
          window.alert("Esse pagamento já parece estar registrado hoje. Nada foi duplicado.");
          return;
        }
        dispatch({ type: "EXPENSE_PAYMENT_ADD", expenseId: expense.id, date: today(), amount: preview.amount, note: "Lançado por voz" });
      }
    } else if (preview.kind === "personal" && preview.invoiceId) {
      const invoice = summary.personal.find(item => item.id === preview.invoiceId);
      if (invoice) {
        if (findDuplicatePersonalPayment(invoice, today(), preview.amount)) {
          window.alert("Esse recebimento já parece estar registrado hoje. Nada foi duplicado.");
          return;
        }
        dispatch({ type: "PERSONAL_PAYMENT_ADD", invoiceId: invoice.id, date: today(), amount: preview.amount, note: "Lançado por voz" });
      }
    }
    setVoiceText("");
    setVoicePreview(null);
  }

  const recent = useMemo(() => {
    const rows: { id: string; date: string; label: string; amount: number; direction: "IN" | "OUT" }[] = [];
    summary.personal.forEach(invoice => invoice.payments.forEach(payment => rows.push({ id: payment.id, date: payment.date, label: `${invoice.studentName} · Personal`, amount: payment.amount, direction: "IN" })));
    summary.receipts.forEach(receipt => rows.push({ id: receipt.id, date: receipt.date || `${competence}-01`, label: receipt.sourceName ? `${receipt.sourceName} · DS` : "Recebimento DS", amount: receipt.amount, direction: "IN" }));
    summary.expenses.forEach(expense => expense.payments.forEach(payment => rows.push({ id: payment.id, date: payment.date, label: expense.name, amount: payment.amount, direction: "OUT" })));
    summary.extras.forEach(extra => rows.push({ id: extra.id, date: extra.date, label: extra.description, amount: extra.amount, direction: "OUT" }));
    return rows.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);
  }, [summary, competence]);

  function closeCompetence(createNext: boolean) {
    const warnings = [
      pendencies.personalOpen ? `${pendencies.personalOpen} mensalidades de Personal em aberto` : "",
      summary.expenses.filter(item => item.expectedAmount > 0 && expenseStatus(item) !== "PAID").length ? `${summary.expenses.filter(item => item.expectedAmount > 0 && expenseStatus(item) !== "PAID").length} contas em aberto` : "",
      summary.dsBalance > 0 ? `${money.format(summary.dsBalance)} ainda a receber da DS` : "",
      pendencies.cardsMissing ? `${pendencies.cardsMissing} cartões sem valor de fatura` : "",
      pendencies.rankingMissing ? "ranking DS ainda não informado" : "",
    ].filter(Boolean);
    const suffix = warnings.length ? `\n\nPendências atuais:\n• ${warnings.join("\n• ")}\n\nO fechamento continuará guardando essas informações.` : "";
    const next = nextCompetence(competence);
    const message = createNext
      ? `Fechar ${competenceLabel(competence)} e abrir ${competenceLabel(next)}?${suffix}`
      : `Fechar ${competenceLabel(competence)}?${suffix}`;
    if (!window.confirm(message)) return;
    dispatch({ type: "CLOSE_COMPETENCE", competence, createNext });
    if (createNext) setTab("summary");
  }

  function reopenCompetence() {
    if (!window.confirm(`Reabrir ${competenceLabel(competence)} para edição?`)) return;
    dispatch({ type: "REOPEN_COMPETENCE", competence });
  }

  function createNextCompetence() {
    const next = nextCompetence(competence);
    if (!data.competences[next] && !window.confirm(`Criar ${competenceLabel(next)} copiando mensalidades, Kids, contas recorrentes e parcelamentos ainda ativos?`)) return;
    dispatch({ type: "CREATE_NEXT_COMPETENCE", fromCompetence: competence });
    setTab("summary");
  }

  function downloadReport() {
    const csv = financeReportCsv(data, competence);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `DMP_Financeiro_${competence}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <header className={`dashboard-topbar ${styles.topbar}`}>
        <div>
          <p className="dashboard-eyebrow">Gestão financeira</p>
          <h1>Financeiro</h1>
          <p>{competenceLabel(competence)} · <strong>{competenceStatusLabel(data.competences[competence]?.status)}</strong> · {syncing ? "sincronizando..." : cloudWritable ? "nuvem ativa" : "backup local"}</p>
        </div>
        <div className={styles.topActions}>
          <label className={styles.competencePicker}>
            <span>Competência</span>
            <select value={competence} onChange={event => dispatch({ type: "SWITCH_COMPETENCE", competence: event.target.value })}>
              {competences.map(item => <option key={item} value={item}>{competenceLabel(item)}</option>)}
            </select>
          </label>
          <button className="secondary" onClick={() => openAction({ type: "extra-create" })}>+ Lançar</button>
          <button className={`primary ${styles.micButton}`} onClick={startVoice}>🎤 Falar</button>
        </div>
      </header>

      <section className={`dashboard-content ${styles.content}`}>
        {undoDeletion ? <div className={styles.undoStrip}><span>Exclusão realizada.</span><button onClick={undoLastDeletion}>Desfazer</button></div> : null}
        <nav className={styles.tabs}>
          {([
            ["summary", "Resumo"], ["personal", "Personal"], ["ds", "DS Tênis"],
            ["expenses", "Despesas"], ["extras", "Gastos extras"],
            ["closing", "Fechamento"], ["reports", "Relatórios"],
          ] as [Tab, string][]).map(([key, label]) => (
            <button key={key} className={tab === key ? styles.activeTab : ""} onClick={() => setTab(key)}>{label}</button>
          ))}
        </nav>

        {!editable ? <section className={styles.closedBanner}><strong>🔒 {competenceLabel(competence)} está fechada.</strong><span>Os dados estão em modo somente leitura. Para corrigir algo, use Reabrir na aba Fechamento.</span></section> : null}

        {voiceText ? (
          <section className={`panel ${styles.voicePreview}`}>
            <div><span className="muted">Você disse</span><strong>“{voiceText}”</strong></div>
            {voicePreview ? <div><span className="muted">Vou registrar</span><strong>{voicePreview.label} · {money.format(voicePreview.amount)}</strong></div> : <div><strong>Não ficou claro.</strong><span className="muted">Tente uma frase mais específica.</span></div>}
            <div className={styles.inlineActions}>
              <button className="secondary" onClick={() => { setVoiceText(""); setVoicePreview(null); }}>Cancelar</button>
              {voicePreview ? <button className="primary" onClick={confirmVoice}>Confirmar</button> : null}
            </div>
          </section>
        ) : null}

        {tab === "summary" ? (
          <>
            <div className={styles.kpiGrid}>
              <Kpi label="Receitas previstas" value={summary.projectedRevenue} tone="income" />
              <Kpi label="Receitas recebidas" value={summary.realizedRevenue} tone="income" />
              <Kpi label="Despesas previstas" value={summary.expensesExpected} tone="expense" />
              <Kpi label="Despesas pagas" value={summary.expensesPaid} tone="expense" />
              <Kpi label="Saldo projetado" value={summary.projectedResult} />
              <Kpi label="A receber" value={summary.receivable} tone="income" />
              <Kpi label="A pagar" value={summary.payable} tone="expense" />
            </div>

            <section className={`panel ${styles.weeklyDue}`}>
              <div className="panel-head"><div><h2>Vencimentos da semana</h2><p className="muted">Somente contas previstas que ainda estão em aberto.</p></div><button className="secondary" onClick={()=>setTab("expenses")}>Ver despesas</button></div>
              {weeklyDue.length?<div className={styles.list}>{weeklyDue.map(item=><div className={`${styles.row} ${styles.staticRow}`} key={item.id}><span><strong>{item.name}</strong><small>Vence em {formatDate(item.dueDate)}</small></span><strong className={styles.outValue}>{money.format(item.open)}</strong></div>)}</div>:<Empty text="Nenhuma conta em aberto vence nesta semana."/>}
            </section>

            <section className="panel">
              <div className="panel-head"><div><h2>Ações rápidas</h2><p className="muted">Rotina diária em poucos toques.</p></div></div>
              <div className={styles.actionGrid}>
                <button className="secondary" onClick={() => setTab("personal")}>Receber Personal</button>
                <button className="secondary" onClick={() => openAction({ type: "ds-receipt" })}>Recebimento DS</button>
                <button className="secondary" onClick={() => setTab("expenses")}>Pagar conta</button>
                <button className="primary" onClick={() => openAction({ type: "extra-create" })}>+ Gasto extra</button>
              </div>
            </section>

            <div className={styles.threeCol}>
              <MiniSummary title="Personal" rows={[["Previsto", summary.personalExpected], ["Recebido", summary.personalReceived], ["Falta", summary.personalOpen]]} onClick={() => setTab("personal")} />
              <MiniSummary title="DS Tênis" rows={[["Kids líquido", summary.kidsNet], ["Ranking", summary.ranking], [summary.dsBalance >= 0 ? "A receber" : "A devolver", Math.abs(summary.dsBalance)]]} onClick={() => setTab("ds")} />
              <MiniSummary title="Despesas" rows={[["Previstas", summary.expensesExpected], ["Pagas", summary.expensesPaid], ["Gastos extras", summary.extrasTotal]]} onClick={() => setTab("expenses")} />
            </div>

            <section className="panel">
              <div className="panel-head"><div><h2>Movimentações recentes</h2><p className="muted">Seu extrato interno do Financeiro.</p></div></div>
              <div className={styles.list}>{recent.length ? recent.map(item => <div className={`${styles.row} ${styles.staticRow}`} key={item.id}><span><strong>{item.label}</strong><small>{formatDate(item.date)}</small></span><strong className={item.direction === "IN" ? styles.inValue : styles.outValue}>{item.direction === "IN" ? "+ " : "− "}{money.format(item.amount)}</strong></div>) : <Empty text="Nenhuma movimentação registrada nesta competência." />}</div>
            </section>
          </>
        ) : null}

        {tab === "personal" ? (
          <section className="panel">
            <div className="panel-head"><div><h2>Personal · {competenceLabel(competence)}</h2><p className="muted">{money.format(summary.personalReceived)} recebidos de {money.format(summary.personalExpected)} previstos.</p></div><button className="primary" disabled={!editable} onClick={() => openAction({ type: "personal-create" })}>+ Mensalidade</button></div>
            <FilterBar value={listFilter} onChange={setListFilter} />
            <div className={styles.list}>
              {summary.personal.filter(invoice => matchesFilter(invoiceStatus(invoice), listFilter)).sort(compareDueDay).map(invoice => {
                const received = paid(invoice.payments); const missing = remaining(invoice.expectedAmount, invoice.payments); const status = invoiceStatus(invoice);
                return <div className={styles.rowShell} key={invoice.id}><button className={`${styles.row} ${styles.rowMain}`} disabled={!editable} onClick={() => openAction({ type: "personal-payment", invoice })}><span><strong>{invoice.studentName}</strong><small>Vence dia {invoice.dueDay} · {statusLabel(status)}{invoice.payments.length ? ` · ${invoice.payments.length} recebimento${invoice.payments.length > 1 ? "s" : ""}` : ""}</small></span><span className={styles.right}><strong>{money.format(invoice.expectedAmount)}</strong><small className={missing ? styles.openText : styles.paidText}>{missing ? `${money.format(missing)} falta` : `✓ ${money.format(received)} recebido`}</small></span></button><button className={styles.manageButton} disabled={!editable} onClick={() => openAction({ type: "personal-edit", invoice })}>Editar</button></div>;
              })}
            </div>
          </section>
        ) : null}

        {tab === "ds" ? (
          <div className="finance-ds-single">
            <section className="panel">
              <div className="panel-head"><div><h2>Acerto DS Tênis</h2><p className="muted">Saldo recalculado automaticamente.</p></div><button className="secondary" disabled={!editable} onClick={() => openAction({ type: "ranking" })}>Editar ranking</button></div>
              {competence === "2026-08" && summary.ranking === 6500 ? <div className={styles.importNote}><strong>Conferência da planilha</strong><span>O Resumo DS informa Ranking de R$ 6.500,00. Outro quadro da planilha mostra R$ 7.000,00. O DMP está usando R$ 6.500,00; altere aqui se necessário.</span></div> : null}
              <div className={styles.calc}><Calc label="Kids bruto" value={summary.kidsGross} /><Calc label={`Sua parte (${Math.round(data.dsPercent * 100)}%)`} value={summary.kidsNet} /><Calc label="Ranking" value={summary.ranking} /><Calc label="Acerto do mês" value={summary.dsSettlement} strong /><Calc label="Recebido da DS" value={summary.dsReceived} /><Calc label={summary.dsBalance >= 0 ? "A receber da DS" : "A devolver para DS"} value={Math.abs(summary.dsBalance)} strong /></div>
              <button className={`primary ${styles.fullButton}`} disabled={!editable} onClick={() => openAction({ type: "ds-receipt" })}>+ Registrar recebimento DS</button>
              <div className={styles.receiptList}>{summary.receipts.length ? summary.receipts.map(receipt => <div key={receipt.id} className={styles.receipt}><span>{receipt.sourceName || "DS"}<small>{receipt.date ? formatDate(receipt.date) : "Data não informada na planilha"}</small></span><div className={styles.receiptActions}><strong>{money.format(receipt.amount)}</strong><button disabled={!editable} onClick={() => { if (window.confirm(`Excluir recebimento de ${money.format(receipt.amount)} da DS?`)) dispatch({ type: "DS_RECEIPT_DELETE", competence, receiptId: receipt.id }); }}>Excluir</button></div></div>) : <Empty text="Nenhum recebimento da DS registrado." />}</div>
            </section>
            <section className="panel">
              <div className="panel-head"><div><h2>Alunos Kids</h2><p className="muted">{summary.kids.length} registros · {money.format(summary.kidsGross)} bruto.</p></div><button className="primary" disabled={!editable} onClick={() => openAction({ type: "kid-create" })}>+ Kids</button></div>
              <div className={`${styles.list} ${styles.scrollList}`}>{summary.kids.slice().sort((a,b)=>a.studentName.localeCompare(b.studentName,"pt-BR")).map(kid => <div className={styles.rowShell} key={kid.id}><div className={`${styles.row} ${styles.staticRow} ${styles.rowMain}`}><span><strong><FinanceCategoryDot category={kid.tennisCategory}/>{kid.studentName}</strong><small>{kid.installmentCurrent && kid.installmentTotal ? `${kid.installmentCurrent}/${kid.installmentTotal}` : kid.installmentTotal ? `${kid.installmentTotal} parcelas · atual a configurar` : "Parcelas a configurar"}</small></span><strong>{money.format(kid.amount)}</strong></div><button className={styles.manageButton} disabled={!editable} onClick={() => openAction({ type: "kid-edit", kid })}>Editar</button></div>)}</div>
            </section>
          </div>
        ) : null}

        {tab === "expenses" ? <ExpenseList title="Despesas" items={summary.expenses} filter={listFilter} setFilter={setListFilter} editable={editable} onCreate={() => openAction({ type: "expense-create" })} onPay={expense => openAction({ type: "expense-payment", expense })} onEdit={expense => openAction({ type: "expense-edit", expense })} /> : null}

        {tab === "extras" ? (
          <div className={styles.twoColWide}>
            <section className="panel">
              <div className="panel-head"><div><h2>Gastos extras</h2><p className="muted">{summary.extras.length} lançamentos · {money.format(summary.extrasTotal)} realizados.</p></div></div>
              <div className={`${styles.list} ${styles.scrollList}`}>{[...summary.extras].sort((a, b) => b.date.localeCompare(a.date)).map(extra => <div className={styles.rowShell} key={extra.id}><div className={`${styles.row} ${styles.staticRow} ${styles.rowMain}`}><span><strong>{extra.description}</strong><small>{formatDate(extra.date)} · {extra.category}{extra.paymentMethod ? ` · ${extra.paymentMethod}` : ""}</small></span><strong>{money.format(extra.amount)}</strong></div><button className={styles.manageButton} disabled={!editable} onClick={() => openAction({ type: "extra-edit", extra })}>Editar</button></div>)}</div>
            </section>
            <section className="panel">
              <div className="panel-head"><div><h2>Panorama dos gastos</h2><p className="muted">Visão rápida dos gastos extras de {competenceLabel(competence)}.</p></div></div>
              <div className={styles.extraPanoramaTotal}><span>Total no mês</span><strong>{money.format(summary.extrasTotal)}</strong></div>
              <div className={styles.extraCategoryBreakdown}>{categoryTotals(data, competence).length ? categoryTotals(data, competence).map(item => { const pct=summary.extrasTotal?Math.round((item.value/summary.extrasTotal)*100):0; return <div key={item.label}><span><strong>{item.label}</strong><small>{pct}% do total</small></span><b>{money.format(item.value)}</b></div>; }) : <Empty text="Sem gastos extras nesta competência." />}</div>
              <div className={styles.extraQuickAdd}><div><strong>Incluir gasto</strong><small>Abra o lançamento rápido e registre valor, categoria e forma de pagamento.</small></div><button className="primary" disabled={!editable} onClick={() => openAction({ type: "extra-create" })}>+ Incluir gasto</button></div>
              <details className={styles.categoryManager}><summary>Gerenciar categorias</summary><div className={styles.categoryList}>{data.categories.map(category => { const used = data.extraExpenses.some(item => item.category === category); return <div className={styles.categoryChip} key={category}><span>{category}</span><button disabled={!editable || used} title={used ? "Categoria em uso" : "Excluir categoria"} onClick={() => { if (window.confirm(`Excluir a categoria “${category}”?`)) dispatch({ type: "CATEGORY_DELETE", name: category, competence }); }}>×</button></div>; })}</div><button className="secondary" disabled={!editable} onClick={() => openAction({ type: "category-create" })}>+ Categoria</button></details>
            </section>
          </div>
        ) : null}

        {tab === "closing" ? <ClosingTab data={data} competence={competence} summary={summary} pendencies={pendencies} editable={editable} onClose={closeCompetence} onReopen={reopenCompetence} onCreateNext={createNextCompetence} onSwitch={value => dispatch({ type: "SWITCH_COMPETENCE", competence: value })} /> : null}

        {tab === "reports" ? <ReportsTab data={data} competence={competence} onDownload={downloadReport} /> : null}
      </section>

      {action ? <FinanceActionModal action={action} data={data} competence={competence} onClose={() => setAction(null)} dispatch={dispatch} /> : null}
      <button className={styles.floatingMic} disabled={!editable} onClick={startVoice} aria-label="Lançar por voz">🎤</button>
    </>
  );
}

function FinanceActionModal({ action, data, competence, onClose, dispatch }: { action: Exclude<Action, null>; data: FinanceData; competence: string; onClose: () => void; dispatch: (command: FinanceCommand) => void }) {
  const invoice = action.type === "personal-edit" || action.type === "personal-payment" ? action.invoice : null;
  const expense = action.type === "expense-edit" || action.type === "expense-payment" || action.type === "card-value" ? action.expense : null;
  const kid = action.type === "kid-edit" ? action.kid : null;
  const extra = action.type === "extra-edit" ? action.extra : null;
  const defaultKind: FinanceExpenseKind = action.type === "expense-create" ? action.kind || "RECURRING" : expense?.kind || "RECURRING";
  const isPayment = action.type === "personal-payment" || action.type === "expense-payment";
  const initialAmount = action.type === "personal-payment" && invoice ? remaining(invoice.expectedAmount, invoice.payments)
    : action.type === "expense-payment" && expense ? remaining(expense.expectedAmount, expense.payments)
      : action.type === "card-value" && expense ? expense.expectedAmount
        : action.type === "ranking" ? data.rankingByCompetence[competence] || 0
          : kid ? kid.amount
            : extra ? extra.amount
              : action.type === "personal-edit" && invoice ? invoice.expectedAmount
                : action.type === "expense-edit" && expense ? expense.expectedAmount
                  : 0;

  const [amount, setAmount] = useState(initialAmount ? String(initialAmount).replace(".", ",") : "");
  const [date, setDate] = useState(extra?.date || today());
  const [name, setName] = useState(invoice?.studentName || kid?.studentName || expense?.name || "");
  const [description, setDescription] = useState(extra?.description || "");
  const [category, setCategory] = useState(extra?.category || data.categories[0] || "Outros");
  const [method, setMethod] = useState(extra?.paymentMethod || "");
  const [dueDay, setDueDay] = useState(String(invoice?.dueDay || kid?.dueDay || expense?.dueDay || 10));
  const [kind, setKind] = useState<FinanceExpenseKind>(defaultKind);
  const [installmentCurrent, setInstallmentCurrent] = useState(String(kid?.installmentCurrent || expense?.installmentCurrent || ""));
  const [installmentTotal, setInstallmentTotal] = useState(String(kid?.installmentTotal || expense?.installmentTotal || ""));
  const [sourceName, setSourceName] = useState("DS");
  const [note, setNote] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [kidBillingMode,setKidBillingMode]=useState<"SINGLE"|"INSTALLMENT"|"RECURRING">(kid?.billingMode||"RECURRING");
  const [kidCategory,setKidCategory]=useState<"RED"|"ORANGE"|"GREEN"|null>(kid?.tennisCategory||null);

  function numericAmount() { return parseMoney(amount); }
  function validDay() { return Math.min(31, Math.max(1, Number(dueDay) || 1)); }
  function optNumber(value: string) { const parsed = Number(value); return value && Number.isFinite(parsed) && parsed > 0 ? parsed : null; }

  function submit(event: FormEvent) {
    event.preventDefault();
    const numeric = numericAmount();

    if (action.type === "category-create") {
      if (!newCategory.trim()) return;
      dispatch({ type: "CATEGORY_CREATE", name: newCategory, competence });
      onClose(); return;
    }

    if (action.type === "personal-create" || action.type === "personal-edit") {
      if (!name.trim() || numeric === null || numeric < 0) return;
      if (action.type === "personal-create") dispatch({ type: "PERSONAL_CREATE", competence, studentName: name, dueDay: validDay(), expectedAmount: numeric });
      else dispatch({ type: "PERSONAL_UPDATE", id: action.invoice.id, studentName: name, dueDay: validDay(), expectedAmount: numeric });
      onClose(); return;
    }

    if (action.type === "personal-payment") {
      if (numeric === null || numeric <= 0) return;
      if (findDuplicatePersonalPayment(action.invoice, date, numeric)) { window.alert("Esse recebimento já está registrado com a mesma data e valor."); return; }
      dispatch({ type: "PERSONAL_PAYMENT_ADD", invoiceId: action.invoice.id, date, amount: numeric, note });
      onClose(); return;
    }

    if (action.type === "expense-create" || action.type === "expense-edit") {
      if (!name.trim() || numeric === null || numeric < 0) return;
      const current = optNumber(installmentCurrent); const total = optNumber(installmentTotal);
      if (action.type === "expense-create") dispatch({ type: "EXPENSE_CREATE", competence, name, dueDay: validDay(), expectedAmount: numeric, kind, installmentCurrent: current, installmentTotal: total });
      else dispatch({ type: "EXPENSE_UPDATE", id: action.expense.id, name, dueDay: validDay(), expectedAmount: numeric, kind, installmentCurrent: current, installmentTotal: total });
      onClose(); return;
    }

    if (action.type === "expense-payment") {
      if (numeric === null || numeric <= 0) return;
      if (findDuplicateExpensePayment(action.expense, date, numeric)) { window.alert("Esse pagamento já está registrado com a mesma data e valor."); return; }
      dispatch({ type: "EXPENSE_PAYMENT_ADD", expenseId: action.expense.id, date, amount: numeric, note });
      onClose(); return;
    }

    if (action.type === "card-value") {
      if (numeric === null || numeric < 0) return;
      dispatch({ type: "EXPENSE_UPDATE", id: action.expense.id, name: action.expense.name, dueDay: action.expense.dueDay, expectedAmount: numeric, kind: action.expense.kind, installmentCurrent: action.expense.installmentCurrent, installmentTotal: action.expense.installmentTotal });
      onClose(); return;
    }

    if (action.type === "ranking") {
      if (numeric === null || numeric < 0) return;
      dispatch({ type: "RANKING_SET", competence, amount: numeric }); onClose(); return;
    }

    if (action.type === "ds-receipt") {
      if (numeric === null || numeric <= 0) return;
      dispatch({ type: "DS_RECEIPT_ADD", competence, date, amount: numeric, sourceName, note }); onClose(); return;
    }

    if (action.type === "kid-create" || action.type === "kid-edit") {
      if (!name.trim() || numeric === null || numeric < 0) return;
      const total = kidBillingMode==="INSTALLMENT"?optNumber(installmentTotal):null;
      const current = kidBillingMode==="INSTALLMENT"?(optNumber(installmentCurrent)||1):null;
      if(kidBillingMode==="INSTALLMENT"&&!total)return;
      const payload={studentName:name,amount:numeric,dueDay:validDay(),billingMode:kidBillingMode,tennisCategory:kidCategory,installmentCurrent:current,installmentTotal:total};
      if (action.type === "kid-create") dispatch({ type: "DS_KID_CREATE", competence, ...payload });
      else dispatch({ type: "DS_KID_UPDATE", id: action.kid.id, ...payload });
      onClose(); return;
    }

    if (action.type === "extra-create" || action.type === "extra-edit") {
      if (numeric === null || numeric <= 0 || !description.trim()) return;
      const finalCategory = category || suggestCategory(description);
      if (findDuplicateExtra(data, competence, date, description, numeric, extra?.id)) { window.alert("Esse gasto já parece estar lançado com a mesma data, descrição e valor."); return; }
      if (action.type === "extra-create") dispatch({ type: "EXTRA_CREATE", competence, date, description, category: finalCategory, paymentMethod: method, amount: numeric });
      else dispatch({ type: "EXTRA_UPDATE", id: action.extra.id, date, description, category: finalCategory, paymentMethod: method, amount: numeric });
      onClose(); return;
    }
  }

  const title = modalTitle(action);
  const isInstallment = kind === "INSTALLMENT";

  return <div className={styles.modalBackdrop} onMouseDown={event => { if (event.currentTarget === event.target) onClose(); }}><form className={`${styles.modal} ${(action.type === "personal-edit" || action.type === "expense-edit") ? styles.modalLarge : ""}`} onSubmit={submit}><div className={styles.modalHead}><div><span className="muted">Financeiro · {competenceLabel(competence)}</span><h2>{title}</h2></div><button type="button" className="text-button" onClick={onClose}>Fechar</button></div>

    {action.type === "personal-create" || action.type === "personal-edit" ? <><label>Aluno<input value={name} onChange={event => setName(event.target.value)} autoFocus /></label><div className={styles.formGrid}><label>Mensalidade<input value={amount} onChange={event => setAmount(event.target.value)} placeholder="0,00" /></label><label>Vencimento (dia)<input type="number" min="1" max="31" value={dueDay} onChange={event => setDueDay(event.target.value)} /></label></div>{action.type === "personal-edit" ? <PaymentHistory title="Recebimentos registrados" payments={action.invoice.payments} onDelete={payment => { if (window.confirm(`Excluir recebimento de ${money.format(payment.amount)} em ${formatDate(payment.date)}?`)) dispatch({ type: "PERSONAL_PAYMENT_DELETE", invoiceId: action.invoice.id, paymentId: payment.id }); }} /> : null}</> : null}

    {action.type === "personal-payment" ? <><div className={styles.formGrid}><label>Valor recebido<input value={amount} onChange={event => setAmount(event.target.value)} autoFocus /></label><label>Data<input type="date" value={date} onChange={event => setDate(event.target.value)} /></label></div><label>Observação<input value={note} onChange={event => setNote(event.target.value)} placeholder="Opcional" /></label><p className={styles.formHint}>Previsto {money.format(action.invoice.expectedAmount)} · já recebido {money.format(paid(action.invoice.payments))} · falta {money.format(remaining(action.invoice.expectedAmount, action.invoice.payments))}</p></> : null}

    {action.type === "expense-create" || action.type === "expense-edit" ? <><label>Conta / despesa<input value={name} onChange={event => setName(event.target.value)} autoFocus /></label><div className={styles.formGrid}><label>Valor previsto<input value={amount} onChange={event => setAmount(event.target.value)} placeholder="0,00" /></label><label>Vencimento (dia)<input type="number" min="1" max="31" value={dueDay} onChange={event => setDueDay(event.target.value)} /></label></div><label>Tipo<select value={kind} onChange={event => setKind(event.target.value as FinanceExpenseKind)}><option value="RECURRING">Recorrente</option><option value="INSTALLMENT">Parcelamento</option><option value="CARD">Cartão</option><option value="VARIABLE">Variável / só este mês</option></select></label>{isInstallment ? <div className={styles.formGrid}><label>Parcela atual<input type="number" min="1" value={installmentCurrent} onChange={event => setInstallmentCurrent(event.target.value)} /></label><label>Total de parcelas<input type="number" min="1" value={installmentTotal} onChange={event => setInstallmentTotal(event.target.value)} /></label></div> : null}{action.type === "expense-edit" ? <PaymentHistory title="Pagamentos registrados" payments={action.expense.payments} onDelete={payment => { if (window.confirm(`Excluir pagamento de ${money.format(payment.amount)} em ${formatDate(payment.date)}?`)) dispatch({ type: "EXPENSE_PAYMENT_DELETE", expenseId: action.expense.id, paymentId: payment.id }); }} /> : null}</> : null}

    {action.type === "expense-payment" ? <><div className={styles.formGrid}><label>Valor pago<input value={amount} onChange={event => setAmount(event.target.value)} autoFocus /></label><label>Data<input type="date" value={date} onChange={event => setDate(event.target.value)} /></label></div><label>Observação<input value={note} onChange={event => setNote(event.target.value)} placeholder="Opcional" /></label><p className={styles.formHint}>Previsto {money.format(action.expense.expectedAmount)} · já pago {money.format(paid(action.expense.payments))} · falta {money.format(remaining(action.expense.expectedAmount, action.expense.payments))}</p></> : null}

    {action.type === "card-value" ? <label>Valor da fatura<input value={amount} onChange={event => setAmount(event.target.value)} autoFocus /></label> : null}
    {action.type === "ranking" ? <label>Ranking do mês<input value={amount} onChange={event => setAmount(event.target.value)} autoFocus /></label> : null}

    {action.type === "ds-receipt" ? <><div className={styles.formGrid}><label>Valor recebido<input value={amount} onChange={event => setAmount(event.target.value)} autoFocus /></label><label>Data<input type="date" value={date} onChange={event => setDate(event.target.value)} /></label></div><label>Origem<input value={sourceName} onChange={event => setSourceName(event.target.value)} placeholder="DS" /></label><label>Observação<input value={note} onChange={event => setNote(event.target.value)} placeholder="Opcional" /></label></> : null}

    {action.type === "kid-create" || action.type === "kid-edit" ? <><label>Aluno Kids<input value={name} onChange={event => setName(event.target.value)} autoFocus /></label><div className={styles.formGrid}><label>Valor<input value={amount} onChange={event => setAmount(event.target.value)} /></label><label>Vencimento (dia)<input type="number" min="1" max="31" value={dueDay} onChange={event=>setDueDay(event.target.value)}/></label></div><label>Forma de cobrança<select value={kidBillingMode} onChange={event=>setKidBillingMode(event.target.value as typeof kidBillingMode)}><option value="SINGLE">Parcela única</option><option value="INSTALLMENT">Parcelado por quantidade de meses</option><option value="RECURRING">Recorrente sem término</option></select></label>{kidBillingMode==="INSTALLMENT"?<div className={styles.formGrid}><label>Parcela atual<input type="number" min="1" value={installmentCurrent||"1"} onChange={event=>setInstallmentCurrent(event.target.value)}/></label><label>Quantidade de parcelas<input type="number" min="1" value={installmentTotal} onChange={event=>setInstallmentTotal(event.target.value)}/></label></div>:null}<fieldset className={styles.categoryPicker}><legend>Categoria DS Tênis</legend>{([null,"RED","ORANGE","GREEN"] as const).map(value=><button type="button" key={value||"NONE"} className={kidCategory===value?styles.categorySelected:""} onClick={()=>setKidCategory(value)}>{value===null?"Sem categoria":value==="RED"?"🔴 Vermelha":value==="ORANGE"?"🟠 Laranja":"🟢 Verde"}</button>)}</fieldset></> : null}

    {action.type === "extra-create" || action.type === "extra-edit" ? <><label>Descrição<input value={description} onChange={event => { setDescription(event.target.value); if (!category) setCategory(suggestCategory(event.target.value)); }} placeholder="Ex.: Padaria" autoFocus /></label><div className={styles.formGrid}><label>Valor<input value={amount} onChange={event => setAmount(event.target.value)} placeholder="0,00" /></label><label>Data<input type="date" value={date} onChange={event => setDate(event.target.value)} /></label></div><div className={styles.formGrid}><label>Categoria<select value={category} onChange={event => setCategory(event.target.value)}>{data.categories.map(item => <option key={item}>{item}</option>)}</select></label><label>Forma de pagamento<input value={method} onChange={event => setMethod(event.target.value)} placeholder="Pix, Débito..." /></label></div></> : null}

    {action.type === "category-create" ? <label>Nova categoria<input value={newCategory} onChange={event => setNewCategory(event.target.value)} autoFocus placeholder="Ex.: Saúde" /></label> : null}

    <div className={styles.modalActions}>
      {action.type === "personal-edit" ? <button type="button" className={styles.dangerButton} onClick={() => { if (window.confirm(`Excluir a mensalidade de ${action.invoice.studentName}?`)) { dispatch({ type: "PERSONAL_DELETE", id: action.invoice.id }); onClose(); } }}>Excluir mensalidade</button> : null}
      {action.type === "expense-edit" ? <button type="button" className={styles.dangerButton} onClick={() => { if (window.confirm(`Excluir ${action.expense.name}?`)) { dispatch({ type: "EXPENSE_DELETE", id: action.expense.id }); onClose(); } }}>Excluir conta</button> : null}
      {action.type === "kid-edit" ? <button type="button" className={styles.dangerButton} onClick={() => { if (window.confirm(`Excluir ${action.kid.studentName} da lista Kids deste mês?`)) { dispatch({ type: "DS_KID_DELETE", id: action.kid.id }); onClose(); } }}>Excluir Kids</button> : null}
      {action.type === "extra-edit" ? <button type="button" className={styles.dangerButton} onClick={() => { if (window.confirm(`Excluir o gasto “${action.extra.description}”?`)) { dispatch({ type: "EXTRA_DELETE", id: action.extra.id }); onClose(); } }}>Excluir gasto</button> : null}
      <span className={styles.modalSpacer} />
      <button type="button" className="secondary" onClick={onClose}>Cancelar</button><button className="primary">Salvar</button>
    </div>
  </form></div>;
}

function ExpenseList({ title, items, filter, setFilter, editable, onCreate, onPay, onEdit }: { title: string; items: FinanceExpense[]; filter: Filter; setFilter: (value: Filter) => void; editable: boolean; onCreate: () => void; onPay: (expense: FinanceExpense) => void; onEdit: (expense: FinanceExpense) => void }) {
  const filtered = items.filter(item => matchesFilter(expenseStatus(item), filter)).sort(compareDueDay);
  return <section className="panel"><div className="panel-head"><div><h2>{title}</h2><p className="muted">Contas recorrentes, parcelamentos e despesas do mês.</p></div><button className="primary" disabled={!editable} onClick={onCreate}>+ Nova conta</button></div><FilterBar value={filter} onChange={setFilter} /><div className={styles.list}>{filtered.length ? filtered.map(expense => { const missing = remaining(expense.expectedAmount, expense.payments); return <div className={styles.rowShell} key={expense.id}><button className={`${styles.row} ${styles.rowMain}`} disabled={!editable} onClick={() => onPay(expense)}><span><strong>{expense.name}</strong><small>{expense.installmentCurrent && expense.installmentTotal ? `${expense.installmentCurrent}/${expense.installmentTotal} · ` : ""}vence dia {expense.dueDay} · {expenseKindLabel(expense.kind)} · {statusLabel(expenseStatus(expense))}</small></span><span className={styles.right}><strong>{money.format(expense.expectedAmount)}</strong><small className={missing ? styles.openText : styles.paidText}>{missing ? `${money.format(missing)} falta` : "✓ Pago"}</small></span></button><button className={styles.manageButton} disabled={!editable} onClick={() => onEdit(expense)}>Editar</button></div>; }) : <Empty text="Nenhuma conta neste filtro." />}</div></section>;
}

function ClosingTab({ data, competence, summary, pendencies, editable, onClose, onReopen, onCreateNext, onSwitch }: { data: FinanceData; competence: string; summary: ReturnType<typeof financeSummary>; pendencies: ReturnType<typeof financialPendencies>; editable: boolean; onClose: (createNext: boolean) => void; onReopen: () => void; onCreateNext: () => void; onSwitch: (value: string) => void }) {
  const next = nextCompetence(competence);
  const monthHistory = (data.history || []).filter(item => item.competence === competence).slice().sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  const accountsOpen = summary.expenses.filter(item => item.expectedAmount > 0 && expenseStatus(item) !== "PAID").length;
  const monthChecked = !pendencies.personalOpen && !accountsOpen && Math.abs(summary.dsBalance) < .01 && !pendencies.cardsMissing && !pendencies.rankingMissing;
  return <div className={styles.twoCol}>
    <section className="panel">
      <div className="panel-head"><div><h2>Fechamento · {competenceLabel(competence)}</h2><p className="muted">Congele o mês e prepare a competência seguinte.</p></div></div>
      <div className={styles.closingStatus}><span>Status atual</span><strong>{competenceStatusLabel(data.competences[competence]?.status)}</strong></div>
      <div className={monthChecked?styles.monthCheckOk:styles.monthCheckWarning}><strong>{monthChecked?"✓ Conferência do mês concluída":"⚠ Conferência do mês requer atenção"}</strong><span>{monthChecked?"Personal, despesas e DS estão conferidos.":"Revise os itens indicados abaixo antes de fechar."}</span></div>
      <div className={styles.calc}><Calc label="Resultado realizado" value={summary.realizedResult} strong /><Calc label="Saldo projetado" value={summary.projectedResult} /><Calc label="Personal em aberto" value={summary.personalOpen} /><Calc label="Saldo DS" value={summary.dsBalance} /><Calc label="Contas a pagar" value={summary.payable} /></div>
      <div className={styles.checkList}><span className={!pendencies.personalOpen ? styles.checkOk : ""}>● {pendencies.personalOpen ? `${pendencies.personalOpen} mensalidades de Personal em aberto` : "Personal conferido"}</span><span className={!accountsOpen ? styles.checkOk : ""}>● {accountsOpen ? `${accountsOpen} contas ainda em aberto` : "Despesas conferidas"}</span><span className={Math.abs(summary.dsBalance) < .01 ? styles.checkOk : ""}>● {Math.abs(summary.dsBalance) < .01 ? "DS acertada" : `${money.format(Math.abs(summary.dsBalance))} ${summary.dsBalance >= 0 ? "a receber da DS" : "a devolver para DS"}`}</span><span className={!pendencies.cardsMissing ? styles.checkOk : ""}>● {pendencies.cardsMissing ? `${pendencies.cardsMissing} cartões sem valor de fatura` : "Faturas dos cartões conferidas"}</span><span className={!pendencies.rankingMissing ? styles.checkOk : ""}>● {pendencies.rankingMissing ? "Ranking DS ainda não informado" : "Ranking DS conferido"}</span></div>
      {editable ? <div className={styles.closingActions}><button className="secondary" onClick={() => onClose(false)}>Fechar somente este mês</button><button className="primary" onClick={() => onClose(true)}>Fechar e abrir {competenceLabel(next)}</button><button className="text-button" onClick={onCreateNext}>{data.competences[next] ? `Ir para ${competenceLabel(next)}` : `Criar ${competenceLabel(next)} sem fechar agora`}</button></div> : <div className={styles.closingActions}><button className="primary" onClick={onReopen}>Reabrir competência</button>{data.competences[next] ? <button className="secondary" onClick={() => onSwitch(next)}>Ir para {competenceLabel(next)}</button> : <button className="secondary" onClick={onCreateNext}>Criar {competenceLabel(next)}</button>}</div>}
    </section>
    <section className="panel">
      <div className="panel-head"><div><h2>Histórico do mês</h2><p className="muted">Alterações importantes ficam registradas automaticamente.</p></div></div>
      <div className={`${styles.historyList} ${styles.scrollList}`}>{monthHistory.length ? monthHistory.map(item => <div className={styles.historyItem} key={item.id}><span><strong>{item.description}</strong><small>{formatDateTime(item.occurredAt)}</small></span>{typeof item.amount === "number" ? <strong>{money.format(item.amount)}</strong> : null}</div>) : <Empty text="O histórico começará a registrar as alterações feitas a partir desta versão." />}</div>
    </section>
  </div>;
}

function ReportsTab({ data, competence, onDownload }: { data: FinanceData; competence: string; onDownload: () => void }) {
  const summary = financeSummary(data, competence);
  const categories = categoryTotals(data, competence);
  const expenseKinds = expenseKindTotals(data, competence);
  const personalStatuses = personalStatusTotals(data, competence);
  const expenseStatuses = expenseStatusTotals(data, competence);
  const comparison = competenceComparison(data).slice().reverse();
  const maxCategory = Math.max(1, ...categories.map(item => item.value));
  return <>
    <div className={styles.reportHeader}><div><h2>Relatórios · {competenceLabel(competence)}</h2><p className="muted">Leitura gerencial e exportação dos dados do mês.</p></div><div className={styles.inlineActions}><button className="secondary" onClick={() => window.print()}>Imprimir</button><button className="primary" onClick={onDownload}>Exportar CSV</button></div></div>
    <div className={styles.kpiGrid}><Kpi label="Resultado realizado" value={summary.realizedResult} emphasis /><Kpi label="Margem realizada" value={summary.realizedRevenue ? (summary.realizedResult / summary.realizedRevenue) * 100 : 0} percent /><Kpi label="Personal pagos" text={`${personalStatuses.paid} de ${personalStatuses.total}`} /><Kpi label="Contas pagas" text={`${expenseStatuses.paid} de ${expenseStatuses.total}`} /></div>
    <div className={styles.twoCol}>
      <section className="panel"><div className="panel-head"><div><h2>Gastos extras por categoria</h2><p className="muted">Onde o dinheiro variável foi gasto.</p></div></div><div className={styles.bars}>{categories.length ? categories.map(item => <div className={styles.barRow} key={item.label}><div><span>{item.label}</span><strong>{money.format(item.value)}</strong></div><div className={styles.barTrack}><span style={{ width: `${Math.max(3, (item.value / maxCategory) * 100)}%` }} /></div></div>) : <Empty text="Sem gastos extras nesta competência." />}</div></section>
      <section className="panel"><div className="panel-head"><div><h2>Despesas por tipo</h2><p className="muted">Recorrentes, parcelamentos, cartões e variáveis.</p></div></div><div className={styles.calc}>{expenseKinds.map(item => <div className={styles.reportKind} key={item.kind}><span><strong>{item.label}</strong><small>{item.count} item{item.count === 1 ? "" : "s"}</small></span><span className={styles.right}><strong>{money.format(item.expected)}</strong><small>{money.format(item.paid)} pago</small></span></div>)}</div></section>
    </div>
    <section className="panel"><div className="panel-head"><div><h2>Comparativo por competência</h2><p className="muted">O histórico cresce automaticamente a cada mês.</p></div></div><div className={styles.tableWrap}><table className={styles.reportTable}><thead><tr><th>Mês</th><th>Status</th><th>Receitas</th><th>Despesas</th><th>Resultado realizado</th><th>A receber</th><th>A pagar</th></tr></thead><tbody>{comparison.map(item => <tr key={item.competence}><td>{competenceLabel(item.competence)}</td><td>{competenceStatusLabel(item.status)}</td><td>{money.format(item.realizedRevenue)}</td><td>{money.format(item.totalExpensesPaid)}</td><td className={item.realizedResult >= 0 ? styles.inValue : styles.outValue}>{money.format(item.realizedResult)}</td><td>{money.format(item.receivable)}</td><td>{money.format(item.payable)}</td></tr>)}</tbody></table></div></section>
  </>;
}

function PaymentHistory({ title, payments, onDelete }: { title: string; payments: PersonalInvoice["payments"]; onDelete: (payment: PersonalInvoice["payments"][number]) => void }) {
  return <div className={styles.paymentHistory}><strong>{title}</strong>{payments.length ? payments.slice().sort((a, b) => b.date.localeCompare(a.date)).map(payment => <div key={payment.id}><span>{formatDate(payment.date)}{payment.note ? ` · ${payment.note}` : ""}</span><strong>{money.format(payment.amount)}</strong><button type="button" onClick={() => onDelete(payment)}>Excluir</button></div>) : <span className="muted">Nenhum pagamento registrado.</span>}</div>;
}

function mergeKidsFinance(finance:FinanceData,kids:KidsData):FinanceData{
  const competence=finance.currentCompetence;const normalize=(value:string)=>value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]/g,"");
  const profiles=new Map<string,{student:KidsData["classes"][number]["students"][number];category:KidsData["classes"][number]["category"]}>();
  for(const group of kids.classes)for(const student of group.students)if(student.active&&!profiles.has(student.id))profiles.set(student.id,{student,category:group.category});
  const merged=[...finance.dsKids.filter(item=>item.competence===competence)];
  for(const {student,category} of profiles.values()){
    if(student.monthlyAmount===undefined)continue;const index=merged.findIndex(item=>normalize(item.studentName)===normalize(student.name));
    const billingMode=student.billingMode==="ONE_TIME"?"SINGLE":student.billingMode==="INSTALLMENTS"?"INSTALLMENT":"RECURRING";
    const next:DsKidEntry={id:index>=0?merged[index].id:`kids-${student.id}-${competence}`,competence,studentName:student.name,amount:student.monthlyAmount||0,dueDay:student.dueDay||null,billingMode,tennisCategory:category==="YELLOW"?"GREEN":category,installmentTotal:student.installmentCount||null,installmentCurrent:index>=0?merged[index].installmentCurrent:null};
    if(index>=0)merged[index]=next;else merged.push(next);
  }
  return {...finance,dsKids:[...finance.dsKids.filter(item=>item.competence!==competence),...merged]};
}

function FilterBar({ value, onChange }: { value: Filter; onChange: (value: Filter) => void }) {
  return <div className={styles.filters}>{([ ["ALL", "Todos"], ["OPEN", "Em aberto"], ["OVERDUE", "Vencidos"], ["PAID", "Pagos"] ] as const).map(([key, label]) => <button key={key} className={value === key ? styles.activeFilter : ""} onClick={() => onChange(key)}>{label}</button>)}</div>;
}

function compareDueDay(a:{dueDay?:number|null},b:{dueDay?:number|null}) { const ad=a.dueDay&&a.dueDay>0?a.dueDay:Number.MAX_SAFE_INTEGER; const bd=b.dueDay&&b.dueDay>0?b.dueDay:Number.MAX_SAFE_INTEGER; return ad-bd; }
function FinanceCategoryDot({category}:{category?:"RED"|"ORANGE"|"GREEN"|null}) { return category?<span className={`${styles.financeCategoryDot} ${styles[category.toLowerCase()]}`} aria-label={`Categoria ${category.toLowerCase()}`}/>:null; }
function matchesFilter(status: string, filter: Filter) { if (filter === "ALL") return true; if (filter === "PAID") return status === "PAID"; if (filter === "OVERDUE") return status.includes("OVERDUE"); return status !== "PAID"; }
function Kpi({ label, value, text, emphasis = false, percent = false, tone = "neutral" }: { label: string; value?: number; text?: string; emphasis?: boolean; percent?: boolean; tone?: "neutral" | "income" | "expense" | "resultPositive" | "resultNegative" | "resultZero" }) { const toneClass = tone === "income" ? styles.kpiIncome : tone === "expense" ? styles.kpiExpense : tone === "resultPositive" ? styles.kpiResultPositive : tone === "resultNegative" ? styles.kpiResultNegative : tone === "resultZero" ? styles.kpiResultZero : ""; return <article className={`${styles.kpi} ${emphasis ? styles.kpiEmphasis : ""} ${toneClass}`}><span>{label}</span><strong>{text ?? (percent ? `${(value || 0).toFixed(1).replace(".", ",")}%` : money.format(value || 0))}</strong></article>; }
function Pending({ text, onClick, danger = false }: { text: string; onClick: () => void; danger?: boolean }) { return <button className={`${styles.pending} ${danger ? styles.pendingDanger : ""}`} onClick={onClick}><span>●</span><strong>{text}</strong><span>›</span></button>; }
function MiniSummary({ title, rows, onClick }: { title: string; rows: [string, number][]; onClick: () => void }) { return <section className={`panel ${styles.mini}`}><div className="panel-head"><h2>{title}</h2><button className="text-button" onClick={onClick}>Ver</button></div>{rows.map(([label, value]) => <div className={styles.miniRow} key={label}><span>{label}</span><strong>{money.format(value)}</strong></div>)}</section>; }
function Calc({ label, value, strong = false }: { label: string; value: number; strong?: boolean }) { return <div className={`${styles.calcRow} ${strong ? styles.calcStrong : ""}`}><span>{label}</span><strong>{money.format(value)}</strong></div>; }
function Empty({ text }: { text: string }) { return <div className={styles.empty}>{text}</div>; }
function competenceLabel(value: string) { const [year, month] = value.split("-").map(Number); const label = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(new Date(year, month - 1, 1)); return label.charAt(0).toUpperCase() + label.slice(1); }
function formatDate(value: string) { const [y, m, d] = value.split("-"); return `${d}/${m}/${y}`; }
function formatDateTime(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date); }
function statusLabel(status: string) { return ({ PENDING: "Pendente", PARTIAL: "Parcial", PAID: "Pago", OVERDUE: "Vencido", PARTIAL_OVERDUE: "Parcial vencido" } as Record<string, string>)[status] || status; }
function competenceStatusLabel(status?: string) { return status === "CLOSED" ? "Fechada" : status === "REOPENED" ? "Reaberta" : "Aberta"; }
function expenseKindLabel(kind: FinanceExpenseKind) { return ({ RECURRING: "Recorrente", INSTALLMENT: "Parcelamento", CARD: "Cartão", VARIABLE: "Variável" } as Record<FinanceExpenseKind, string>)[kind]; }
function modalTitle(action: Exclude<Action, null>) { if (action.type === "personal-create") return "Nova mensalidade Personal"; if (action.type === "personal-edit") return `Editar · ${action.invoice.studentName}`; if (action.type === "personal-payment") return `Receber · ${action.invoice.studentName}`; if (action.type === "expense-create") return action.kind === "CARD" ? "Novo cartão" : "Nova despesa"; if (action.type === "expense-edit") return `Editar · ${action.expense.name}`; if (action.type === "expense-payment") return `Pagar · ${action.expense.name}`; if (action.type === "card-value") return `Fatura · ${action.expense.name}`; if (action.type === "ranking") return "Ranking do mês"; if (action.type === "ds-receipt") return "Recebimento da DS"; if (action.type === "kid-create") return "Novo aluno Kids"; if (action.type === "kid-edit") return `Editar Kids · ${action.kid.studentName}`; if (action.type === "extra-create") return "Novo gasto extra"; if (action.type === "extra-edit") return `Editar gasto · ${action.extra.description}`; return "Nova categoria"; }
