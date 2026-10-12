import type {FinanceData,FinanceExpense} from '../../types/financeiro';
export type ExpenseEditScope='CURRENT'|'CURRENT_AND_FUTURE';
export type ExpenseEditValues=Pick<FinanceExpense,'name'|'dueDay'|'expectedAmount'|'kind'|'installmentCurrent'|'installmentTotal'|'note'|'paymentLink'>;
export type ExpenseSeriesChange={seriesId:string;from:string;values:ExpenseEditValues};
const values=(e:FinanceExpense):ExpenseEditValues=>({name:e.name,dueDay:e.dueDay,expectedAmount:e.expectedAmount,kind:e.kind,installmentCurrent:e.installmentCurrent,installmentTotal:e.installmentTotal,note:e.note,paymentLink:e.paymentLink});
function nextMonth(month:string){const [y,m]=month.split('-').map(Number);return m===12?`${y+1}-01`:`${y}-${String(m+1).padStart(2,'0')}`;}
export function expenseSeriesValues(data:FinanceData,expense:FinanceExpense,month:string){
 const c=data.expenseSeriesChanges?.filter(c=>c.seriesId===(expense.seriesId||expense.id)&&c.from<=month).sort((a,b)=>b.from.localeCompare(a.from))[0];if(!c)return undefined;
 const offset=(Number(month.slice(0,4))-Number(c.from.slice(0,4)))*12+Number(month.slice(5))-Number(c.from.slice(5));
 return {...c.values,...(c.values.kind==='INSTALLMENT'&&c.values.installmentCurrent?{installmentCurrent:c.values.installmentCurrent+offset}:{})};
}
export function editExpenseSeries(data:FinanceData,id:string,next:ExpenseEditValues,scope:ExpenseEditScope='CURRENT'){
 next=values(next as FinanceExpense);
 const current=data.expenses.find(e=>e.id===id),fail=(error:string)=>({ok:false as const,error});
 if(!current||!data.competences[current.competence]||data.competences[current.competence].status==='CLOSED')return fail('Conta inexistente ou competência fechada.');
 const paid=current.payments.reduce((s,p)=>s+p.amount,0);
 if(current.payments.length&&paid>=current.expectedAmount)return fail('Conta já paga: seus dados e pagamentos não podem ser reescritos.');
 if(!['RECURRING','INSTALLMENT','CARD','VARIABLE'].includes(next.kind)||!next.name.trim()||!Number.isInteger(next.dueDay)||next.dueDay<1||next.dueDay>31||!Number.isFinite(next.expectedAmount)||next.expectedAmount<paid||next.expectedAmount<0||Math.abs(next.expectedAmount*100-Math.round(next.expectedAmount*100))>0.00001)return fail('Confira nome, vencimento e valor; o previsto não pode ser menor que os pagamentos.');
 if(next.kind==='INSTALLMENT'&&(!Number.isInteger(next.installmentTotal)||!Number.isInteger(next.installmentCurrent)||Number(next.installmentCurrent)<1||Number(next.installmentCurrent)>Number(next.installmentTotal)))return fail('Confira parcela atual e total de parcelas.');
 if(!['CURRENT','CURRENT_AND_FUTURE'].includes(scope))return fail('Escolha o escopo da edição.');
 const recurring=current.kind!=='VARIABLE',seriesId=current.seriesId||current.id,skipped:string[]=[],changed:unknown[]=[];
 const expenses=data.expenses.map(e=>{
  if(e.id!==id&&!(scope==='CURRENT_AND_FUTURE'&&recurring&&(e.seriesId||e.id)===seriesId&&e.competence>current.competence))return e;
  if(e.id!==id&&(!data.competences[e.competence]||data.competences[e.competence]?.status==='CLOSED'||e.payments.length)){skipped.push(`${e.name} · ${e.competence} (paga/parcial ou fechada)`);return e;}
  const futureIndex=next.kind==='INSTALLMENT'&&e.id!==id?Number(next.installmentCurrent)+(Number(e.competence.slice(0,4))-Number(current.competence.slice(0,4)))*12+Number(e.competence.slice(5))-Number(current.competence.slice(5)):next.installmentCurrent;
  if(next.kind==='INSTALLMENT'&&Number(futureIndex)>Number(next.installmentTotal)){skipped.push(`${e.name} · ${e.competence} (fora do parcelamento)`);return e;}
  const update={...next,name:next.name.trim(),note:next.note?.trim()||undefined,paymentLink:next.paymentLink?.trim()||undefined,...(e.id!==id?{installmentCurrent:next.kind==='INSTALLMENT'?futureIndex:e.installmentCurrent}:{} )};
  changed.push({id:e.id,competence:e.competence,before:values(e),after:update});return {...e,...update};
 });
 let changes=data.expenseSeriesChanges||[];
 if(recurring){const from=scope==='CURRENT'?nextMonth(current.competence):current.competence;
  if(scope==='CURRENT_AND_FUTURE')changes=changes.filter(c=>c.seriesId!==seriesId||c.from<from);
  if(scope==='CURRENT_AND_FUTURE'||!changes.some(c=>c.seriesId===seriesId&&c.from===from))changes=[...changes,{seriesId,from,values:scope==='CURRENT'?{...values(current),expectedAmount:current.kind==='CARD'?0:current.expectedAmount,...(current.kind==='INSTALLMENT'&&current.installmentCurrent?{installmentCurrent:current.installmentCurrent+1}:{})}:next}];
 }
 return {ok:true as const,data:{...data,expenses,...(recurring?{expenseSeriesChanges:changes}:{})},skipped,audit:`Edição ${scope==='CURRENT'?'somente esta':'esta e próximas'} · início ${current.competence} · antes/depois ${JSON.stringify(changed)}${skipped.length?' · protegidas: '+skipped.join('; '):''}`};
}
