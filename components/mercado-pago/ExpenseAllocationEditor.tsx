import { expenseOptionsForPayment } from "../../lib/mercado-pago/expense-options";
import { parseMoney } from "../../lib/financeiro/voz";
import { useState } from "react";
export type ExpenseOption={id:string;name:string;competence:string;dueDay:number;closed:boolean;expectedAmount:number;paid:number;remaining:number};
export type ExpenseSplit={targetId:string;amount:string};
export type RemainderChoice=""|"TRANSFER"|"EXTRA";
const money=new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"});
export const allocationAmount=(value:string)=>parseMoney(value) ?? Number.NaN;
export function allocationTotals(amount:number,splits:ExpenseSplit[],expenses:ExpenseOption[]){
  const distributed=Math.round(splits.reduce((sum,item)=>sum+(Number.isFinite(allocationAmount(item.amount))?Math.round(allocationAmount(item.amount)*100):0),0))/100;
  return {distributed,difference:Math.round((amount-distributed)*100)/100,selectedTotal:Math.round(expenses.filter(e=>splits.some(s=>s.targetId===e.id)).reduce((sum,e)=>sum+e.remaining,0)*100)/100};
}
export function ExpenseAllocationEditor({amount,date,expenses,splits,remainder,category,description,categories,onChange,onRemainder}: {
  amount:number;date:string;expenses:ExpenseOption[];splits:ExpenseSplit[];remainder:RemainderChoice;category:string;description:string;categories:string[];
  onChange:(value:ExpenseSplit[])=>void;onRemainder:(target:RemainderChoice,category:string,description:string)=>void;
}){
  const [search,setSearch]=useState("");
  const options=expenseOptionsForPayment(expenses,date);
  const totals=allocationTotals(amount,splits,expenses);
  const normalized=(value:string)=>value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
  return <div style={{display:"grid",gap:10,minWidth:0}}>
    <strong>Conciliar com contas do planejamento</strong>
    <label>Pesquisar contas<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Descrição ou competência"/></label>
    <div style={{display:"grid",gap:8,maxHeight:260,overflowY:"auto"}}>
      {options.filter(e=>normalized(`${e.name} ${e.competence}`).includes(normalized(search))).map(expense=>{
        const selected=splits.some(s=>s.targetId===expense.id);
        return <label key={expense.id} style={{display:"flex",gap:8,alignItems:"start",padding:10,border:"1px solid #dfe4d8",borderRadius:10}}>
          <input type="checkbox" style={{width:20,flexShrink:0}} checked={selected} onChange={()=>onChange(selected?splits.filter(s=>s.targetId!==expense.id):[...splits,{targetId:expense.id,amount:String(Math.max(0,Math.min(expense.remaining,totals.difference))).replace(".",",")}])}/>
          <span style={{display:"grid",gap:3,minWidth:0,overflowWrap:"anywhere"}}><b>{expense.name} · {expense.competence}</b><small>Vence dia {expense.dueDay} · previsto {money.format(expense.expectedAmount)} · pago {money.format(expense.paid)} · em aberto {money.format(expense.remaining)}</small></span>
        </label>;
      })}
      {!options.length?<p>Nenhuma conta aberta disponível para este PIX.</p>:null}
    </div>
    {splits.map(split=>{const expense=expenses.find(e=>e.id===split.targetId);return <div key={split.targetId} style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"end"}}><label style={{flex:"1 1 170px"}}>{expense?.name||"Conta indisponível"} · {expense?.competence}<input aria-label={`Valor para ${expense?.name||split.targetId}`} inputMode="decimal" value={split.amount} onChange={e=>onChange(splits.map(s=>s.targetId===split.targetId?{...s,amount:e.target.value}:s))}/></label><button type="button" className="secondary" onClick={()=>onChange(splits.filter(s=>s.targetId!==split.targetId))}>Remover</button></div>;})}
    <p>PIX: <b>{money.format(amount)}</b> · Saldo das contas selecionadas: <b>{money.format(totals.selectedTotal)}</b><br/>Total conciliado: <b>{money.format(totals.distributed)}</b> · Diferença: <b>{money.format(totals.difference)}</b></p>
    {totals.difference<0?<p role="alert">O total ultrapassa o PIX. Reduza os valores.</p>:null}
    {totals.difference>0?<><label>Destino da diferença<select value={remainder} onChange={e=>onRemainder(e.target.value as RemainderChoice,category,description)}><option value="">Escolha antes de confirmar...</option><option value="TRANSFER">Transferência / repasse, sem nova despesa</option><option value="EXTRA">Gasto extra separado</option></select></label>{remainder==="EXTRA"?<><label>Categoria da diferença<select value={category} onChange={e=>onRemainder(remainder,e.target.value,description)}><option value="">Selecione...</option>{categories.map(c=><option key={c}>{c}</option>)}</select></label><label>Descrição da diferença<input value={description} onChange={e=>onRemainder(remainder,category,e.target.value)}/></label></>:null}</>:null}
    <small>Pagamento parcial mantém o restante da conta em aberto. A data do PIX é preservada. Esta divisão vale somente para esta movimentação.</small>
  </div>;
}
