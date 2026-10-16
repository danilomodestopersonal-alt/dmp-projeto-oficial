import type {ExpenseSeriesChange} from "../financeiro/expense-series";
import { expensePaymentAllowed } from "./expense-options";
import { createHash } from "node:crypto";
import type { FinanceData, FinancePayment, FinanceHistoryEntry, ExtraExpense } from "../../types/financeiro";
import { paid, roundMoney } from "../financeiro/calculos";

export type ExpenseAllocationInput={targetId:string;amount:number;treatment?:"UPDATE"|"INTEREST"|"DISCOUNT";expectedRemaining?:number};
export type ExpenseRemainder={target:"TRANSFER"|"EXTRA";category?:string;description?:string};
export type ExpenseReconciliation={
  revision:string;fingerprint:string;date:string;amount:number;
  allocations:Array<{expenseId:string;name:string;competence:string;payment:FinancePayment;remaining:number;adjustment?:{treatment:"UPDATE"|"INTEREST"|"DISCOUNT";before:number;after:number;difference:number;extraId?:string;charge?:ExtraExpense;seriesChange?:ExpenseSeriesChange}}>;
  remainder?:{target:"TRANSFER"|"EXTRA";amount:number;extraId?:string;category?:string;description?:string};
};
export type ExpenseMovement={fingerprint:string;sourceId?:string;dateKey:string;amount:number;description:string;kind:"IN"|"OUT"};
const fail=(error:string)=>({ok:false as const,error});
const digest=(value:string)=>createHash("sha256").update(value).digest("hex").slice(0,24);
const cents=(value:number)=>Math.round(value*100);
function validAmount(value:number){return Number.isFinite(value)&&value>0&&Math.abs(value*100-cents(value))<0.00001;}
function openMonth(data:FinanceData,month:string){return Boolean(data.competences[month]&&data.competences[month].status!=="CLOSED");}
export function reconcileExpenses(data:FinanceData,move:ExpenseMovement,input:ExpenseAllocationInput[],remainder:ExpenseRemainder|undefined,revision:string) {
  const month=move.dateKey.slice(0,7);
  if(move.kind!=="OUT"||!validAmount(move.amount)||!/^\d{4}-\d{2}-\d{2}$/.test(move.dateKey)||Number.isNaN(Date.parse(move.dateKey))||new Date(`${move.dateKey}T12:00:00Z`).toISOString().slice(0,10)!==move.dateKey)return fail("Selecione uma saída válida com data e valor em centavos.");
  if(!openMonth(data,month))return fail("A competência da data do PIX está ausente ou fechada.");
  if(!input.length||input.some(a=>!a.targetId||!validAmount(a.amount)))return fail("Selecione uma ou mais contas e informe valores positivos em centavos.");
  if(new Set(input.map(a=>a.targetId)).size!==input.length)return fail("Uma conta não pode aparecer duas vezes.");
  const total=input.reduce((s,a)=>s+cents(a.amount),0),difference=cents(move.amount)-total;
  if(difference<0)return fail("O total distribuído ultrapassa o PIX.");
  if(difference>0&&(!remainder||!["TRANSFER","EXTRA"].includes(remainder.target)))return fail("Escolha o destino da diferença antes de concluir.");
  if(difference>0&&remainder?.target==="EXTRA"&&(!remainder.category?.trim()||!remainder.description?.trim()))return fail("Informe categoria e descrição do gasto da diferença.");
  const allocations:ExpenseReconciliation["allocations"]=[];
  let charges=data.extraExpenses,seriesChanges=data.expenseSeriesChanges||[];
  for(const item of input){
    const expense=data.expenses.find(e=>e.id===item.targetId);
    if(!expense||expense.competence>month)return fail("Conta inexistente ou de competência futura.");
    if(!expensePaymentAllowed(expense.competence,month,data.competences[expense.competence]?.status,data.competences[month]?.status))return fail("A conta ou o mês do pagamento não permite esta conciliação.");
    const available=roundMoney(Math.max(0,expense.expectedAmount-paid(expense.payments)));
    if(item.expectedRemaining!==undefined&&(!Number.isFinite(item.expectedRemaining)||cents(item.expectedRemaining)!==cents(available)))return fail(`Saldo de ${expense.name} mudou. Atualize a seleção antes de confirmar.`);
    if(available<=0)return fail(`Conta ${expense.name} já quitada.`);
    const shortfall=(cents(available)-cents(item.amount))/100;
    if(item.treatment==='DISCOUNT'&&(shortfall<=0||shortfall>0.99||data.competences[expense.competence]?.status==='CLOSED'))return fail('Ajuste de centavos exige diferença entre R$ 0,01 e R$ 0,99 e competência original aberta.');
    const excess=Math.max(0,cents(item.amount)-cents(available))/100;
    if(excess&&!['UPDATE','INTEREST'].includes(item.treatment||''))return fail(`Escolha o tratamento da diferença de ${expense.name}.`);
    if(excess&&item.treatment==='UPDATE'&&data.competences[expense.competence]?.status==='CLOSED')return fail('Competência original fechada: use juros/encargos vinculados, sem alterar a obrigação.');
    const principal=item.treatment==='INTEREST'&&excess?available:item.amount;
    const payment:FinancePayment={id:`mp-expense-${digest(`${move.fingerprint}|${revision}|${expense.id}`)}`,date:move.dateKey,amount:principal,note:`Mercado Pago · ${move.description} · PIX ${move.sourceId||digest(move.fingerprint)} · conciliação ${revision}`};
    if(expense.payments.some(p=>p.id===payment.id))return fail("Conciliação já registrada; atualize antes de continuar.");
    const adjustment:ExpenseReconciliation['allocations'][number]['adjustment']=item.treatment==='DISCOUNT'?{treatment:'DISCOUNT',before:expense.expectedAmount,after:roundMoney(expense.expectedAmount-shortfall),difference:shortfall}:excess?{treatment:item.treatment!,before:expense.expectedAmount,after:item.treatment==='UPDATE'?roundMoney(expense.expectedAmount+excess):expense.expectedAmount,difference:excess}:undefined;
    if(adjustment?.treatment==='INTEREST'){
      const extraId=`mp-interest-${digest(`${move.fingerprint}|${revision}|${expense.id}`)}`;
      if(charges.some(e=>e.id===extraId))return fail('Encargo já registrado.');
      adjustment.extraId=extraId;charges=[...charges,{id:extraId,competence:month,date:move.dateKey,category:'Juros/encargos',description:`Juros/encargos · ${expense.name} (${expense.competence}) · PIX ${move.sourceId||digest(move.fingerprint)}`,amount:excess,paymentMethod:'PIX Mercado Pago',expenseCharge:{expenseId:expense.id,originalCompetence:expense.competence,fingerprint:move.fingerprint,paymentId:payment.id,principal,total:item.amount,revision}}];adjustment.charge=charges.at(-1);
    }
    if(adjustment&&adjustment.treatment!=='INTEREST'&&expense.kind!=='VARIABLE'){
      const [year,m]=expense.competence.split('-').map(Number),from=m===12?`${year+1}-01`:`${year}-${String(m+1).padStart(2,'0')}`,seriesId=expense.seriesId||expense.id;
      if(!seriesChanges.some(c=>c.seriesId===seriesId&&c.from===from)){
        const change:ExpenseSeriesChange={seriesId,from,values:{name:expense.name,dueDay:expense.dueDay,expectedAmount:expense.kind==='CARD'?0:expense.expectedAmount,kind:expense.kind,installmentCurrent:expense.kind==='INSTALLMENT'&&expense.installmentCurrent?expense.installmentCurrent+1:expense.installmentCurrent,installmentTotal:expense.installmentTotal,note:expense.note,paymentLink:expense.paymentLink}};
        adjustment.seriesChange=change;seriesChanges=[...seriesChanges,change];
      }
    }
    allocations.push({expenseId:expense.id,name:expense.name,competence:expense.competence,payment,remaining:roundMoney(available+(adjustment?adjustment.after-adjustment.before:0)-principal),...(adjustment?{adjustment}:{})});
  }
  const receipt:ExpenseReconciliation={revision,fingerprint:move.fingerprint,date:move.dateKey,amount:move.amount,allocations};
  let extras=charges;
  if(difference>0&&remainder){
    receipt.remainder={target:remainder.target,amount:difference/100};
    if(remainder.target==="EXTRA"){
      const extraId=`mp-remainder-${digest(`${move.fingerprint}|${revision}`)}`;
      if(extras.some(e=>e.id===extraId))return fail("Diferença já registrada.");
      receipt.remainder={...receipt.remainder,extraId,category:remainder.category!.trim(),description:remainder.description!.trim()};
      extras=[...extras,{id:extraId,competence:month,date:move.dateKey,description:remainder.description!.trim(),category:remainder.category!.trim(),amount:difference/100,paymentMethod:"PIX Mercado Pago"}];
    }
  }
  const byId=new Map(allocations.map(a=>[a.expenseId,a]));
  const history:FinanceHistoryEntry[]=allocations.map(a=>({id:`history-${a.payment.id}`,occurredAt:new Date().toISOString(),competence:a.competence,kind:"EXPENSE_PAYMENT_ADDED" as const,description:`Mercado Pago · PIX ${move.sourceId||digest(move.fingerprint)} · ${a.name} (${a.competence}) · pago em ${move.dateKey} · conciliação ${revision}${receipt.remainder?` · diferença ${receipt.remainder.amount.toFixed(2)} destinada a ${receipt.remainder.target}${receipt.remainder.description?` (${receipt.remainder.description})`:""}`:""}.`,amount:a.payment.amount,entityId:a.expenseId}));
  for(const a of allocations)if(a.adjustment){const change=a.adjustment;history.push({id:`adjustment-${a.payment.id}`,occurredAt:new Date().toISOString(),competence:change.treatment!=='INTEREST'?a.competence:month,kind:change.treatment!=='INTEREST'?'EXPENSE_UPDATED':'EXTRA_CREATED',description:`PIX ${move.sourceId||digest(move.fingerprint)} · ${a.name} (${a.competence}) · escolha explícita ${change.treatment} · obrigação anterior ${change.before.toFixed(2)} / nova ${change.after.toFixed(2)} · principal ${a.payment.amount.toFixed(2)} · diferença ${change.difference.toFixed(2)} · pago em ${move.dateKey}.`,amount:change.difference,entityId:change.extraId||a.expenseId});}
  if(receipt.remainder?.extraId)history.push({id:`history-${receipt.remainder.extraId}`,occurredAt:new Date().toISOString(),competence:month,kind:"EXTRA_CREATED",description:`Diferença do PIX ${move.sourceId||digest(move.fingerprint)} · ${receipt.remainder.description}.`,amount:receipt.remainder.amount,entityId:receipt.remainder.extraId});
  const next:FinanceData={...data,expenses:data.expenses.map(e=>{const a=byId.get(e.id);return a?{...e,expectedAmount:a.adjustment?.after??e.expectedAmount,payments:[...e.payments,a.payment]}:e;}),extraExpenses:extras,...(seriesChanges.length?{expenseSeriesChanges:seriesChanges}:{}),history:[...(data.history||[]),...history]};
  return {ok:true as const,data:next,receipt};
}
export function reverseExpenseReconciliation(data:FinanceData,receipt:ExpenseReconciliation){
  if(!openMonth(data,receipt.date.slice(0,7)))return fail("O mês do pagamento está fechado.");
  for(const allocation of receipt.allocations){
    const expense=data.expenses.find(e=>e.id===allocation.expenseId);
    if(!expense||!expensePaymentAllowed(expense.competence,receipt.date.slice(0,7),data.competences[expense.competence]?.status,data.competences[receipt.date.slice(0,7)]?.status))return fail("Conta ausente ou mês de pagamento fechado; correção bloqueada.");
    const index=expense.payments.findIndex(p=>p.id===allocation.payment.id),payment=expense.payments[index];
    if(!payment||(payment.date!==allocation.payment.date||payment.amount!==allocation.payment.amount||payment.note!==allocation.payment.note))return fail("O pagamento vinculado foi removido ou alterado; correção bloqueada.");
    const adj=allocation.adjustment;
    if(adj&&expense.expectedAmount!==adj.after)return fail('Valor da obrigação alterado após a conciliação; correção bloqueada.');
    if(adj?.seriesChange&&!data.expenseSeriesChanges?.some(c=>JSON.stringify(c)===JSON.stringify(adj.seriesChange)))return fail('Padrão da recorrência alterado após a conciliação; correção bloqueada.');
    if(adj?.extraId){const charge=data.extraExpenses.find(e=>e.id===adj.extraId);if(!charge||!adj.charge||charge.amount!==adj.charge.amount||charge.competence!==adj.charge.competence||charge.date!==adj.charge.date||charge.description!==adj.charge.description||charge.category!==adj.charge.category||charge.paymentMethod!==adj.charge.paymentMethod||JSON.stringify(charge.expenseCharge)!==JSON.stringify(adj.charge.expenseCharge))return fail('Encargo vinculado alterado ou removido; correção bloqueada.');}
    if(index!==expense.payments.length-1)return fail("A conta possui pagamentos posteriores. Confira esses pagamentos antes de corrigir a conciliação.");
  }
  const extra=receipt.remainder?.extraId?data.extraExpenses.find(e=>e.id===receipt.remainder!.extraId):null;
  if(receipt.remainder?.extraId&&(!extra||extra.amount!==receipt.remainder.amount||extra.description!==receipt.remainder.description||extra.category!==receipt.remainder.category||extra.date!==receipt.date||extra.competence!==receipt.date.slice(0,7)||extra.paymentMethod!=="PIX Mercado Pago"))return fail("O gasto da diferença foi removido ou alterado; correção bloqueada.");
  const chargeIds=new Set(receipt.allocations.map(a=>a.adjustment?.extraId).filter(Boolean));
  const ids=new Set(receipt.allocations.map(a=>a.payment.id));
  const history:FinanceHistoryEntry[]=receipt.allocations.map(a=>({id:`reversal-${a.payment.id}`,occurredAt:new Date().toISOString(),competence:a.competence,kind:"EXPENSE_PAYMENT_DELETED" as const,description:`Correção da conciliação ${receipt.revision} · PIX ${digest(receipt.fingerprint)} · ${a.name}.`,amount:a.payment.amount,entityId:a.expenseId}));
  for(const a of receipt.allocations)if(a.adjustment)history.push({id:`reversal-adjustment-${a.payment.id}`,occurredAt:new Date().toISOString(),competence:a.adjustment.treatment!=='INTEREST'?a.competence:receipt.date.slice(0,7),kind:a.adjustment.treatment!=='INTEREST'?'EXPENSE_UPDATED':'EXTRA_DELETED',description:`Reversão explícita ${a.adjustment.treatment} · conciliação ${receipt.revision} · ${a.name} (${a.competence}) · obrigação ${a.adjustment.after} → ${a.adjustment.before}.`,amount:a.adjustment.difference,entityId:a.adjustment.extraId||a.expenseId});
  if(extra)history.push({id:`reversal-${extra.id}`,occurredAt:new Date().toISOString(),competence:extra.competence,kind:"EXTRA_DELETED",description:`Correção da diferença da conciliação ${receipt.revision}.`,amount:extra.amount,entityId:extra.id});
  return {ok:true as const,data:{...data,expenses:data.expenses.map(e=>receipt.allocations.some(a=>a.expenseId===e.id)?{...e,expectedAmount:receipt.allocations.find(a=>a.expenseId===e.id)?.adjustment?.before??e.expectedAmount,payments:e.payments.filter(p=>!ids.has(p.id))}:e),extraExpenses:data.extraExpenses.filter(e=>e.id!==extra?.id&&!chargeIds.has(e.id)),...(data.expenseSeriesChanges?{expenseSeriesChanges:data.expenseSeriesChanges.filter(c=>!receipt.allocations.some(a=>a.adjustment?.seriesChange&&JSON.stringify(c)===JSON.stringify(a.adjustment.seriesChange)))}:{}),history:[...(data.history||[]),...history]}};
}
