import { expenseOptionsForPayment } from "../../lib/mercado-pago/expense-options";
import { parseMoney } from "../../lib/financeiro/voz";
import { useState } from "react";
export type ExpenseOption={id:string;name:string;competence:string;dueDay:number;closed:boolean;expectedAmount:number;paid:number;remaining:number};
export type ExpenseSplit={targetId:string;amount:string;treatment?:""|"UPDATE"|"INTEREST"|"DISCOUNT"};
export type RemainderChoice=""|"TRANSFER"|"EXTRA";
const money=new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"});
export const allocationAmount=(value:string)=>parseMoney(value) ?? Number.NaN;
export function allocationTotals(amount:number,splits:ExpenseSplit[],expenses:ExpenseOption[]){
  const distributed=Math.round(splits.reduce((sum,item)=>sum+(Number.isFinite(allocationAmount(item.amount))?Math.round(allocationAmount(item.amount)*100):0),0))/100;
  return {distributed,difference:Math.round((amount-distributed)*100)/100,selectedTotal:Math.round(expenses.filter(e=>splits.some(s=>s.targetId===e.id)).reduce((sum,e)=>sum+e.remaining,0)*100)/100};
}
export function allocationError(amount:number,splits:ExpenseSplit[],expenses:ExpenseOption[],remainder:RemainderChoice,category:string,description:string){
 if(!splits.length||new Set(splits.map(s=>s.targetId)).size!==splits.length)return 'Selecione contas distintas.';
 for(const s of splits){const value=allocationAmount(s.amount),e=expenses.find(e=>e.id===s.targetId);if(!e||e.remaining<=0||!Number.isFinite(value)||value<=0||Math.abs(value*100-Math.round(value*100))>0.00001)return 'Confira contas e valores positivos em centavos.';if(s.treatment==='DISCOUNT'&&(e.closed||Math.round((e.remaining-value)*100)<1||Math.round((e.remaining-value)*100)>99))return 'Ajuste de centavos exige diferença de R$ 0,01 a R$ 0,99 em competência aberta.';if(Math.round(value*100)>Math.round(e.remaining*100)&&(!s.treatment||s.treatment==='UPDATE'&&e.closed))return 'Escolha o tratamento da diferença; competência fechada permite somente juros/encargos.';}
 const {difference}=allocationTotals(amount,splits,expenses);return difference<0?'O total ultrapassa o PIX.':difference>0&&(!remainder||remainder==='EXTRA'&&(!category.trim()||!description.trim()))?'Escolha o destino do saldo restante.':'';
}
export function ExpenseAllocationEditor({amount,date,expenses,splits,remainder,category,description,categories,onChange,onRemainder}: {
  amount:number;date:string;expenses:ExpenseOption[];splits:ExpenseSplit[];remainder:RemainderChoice;category:string;description:string;categories:string[];
  onChange:(value:ExpenseSplit[])=>void;onRemainder:(target:RemainderChoice,category:string,description:string)=>void;
}){
  const [search,setSearch]=useState("");
  const [showAccounts,setShowAccounts]=useState(false);
  const options=expenseOptionsForPayment(expenses,date);
  const totals=allocationTotals(amount,splits,expenses);
  const normalized=(value:string)=>value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
  return <div style={{display:"grid",gap:10,minWidth:0}}>
    <strong>Conciliar com contas do planejamento</strong>
    <button type="button" className="secondary" aria-expanded={showAccounts} onClick={()=>setShowAccounts(!showAccounts)}>{showAccounts?"Fechar seleção de contas":splits.length?"Adicionar mais contas":"Selecionar conta"}</button>
    {showAccounts?<><label>Pesquisar contas<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Descrição ou competência"/></label>
    <div style={{display:"grid",gap:8,maxHeight:260,overflowY:"auto"}}>
      {options.filter(e=>normalized(`${e.name} ${e.competence}`).includes(normalized(search))).map(expense=>{
        const selected=splits.some(s=>s.targetId===expense.id);
        return <label key={expense.id} style={{display:"flex",gap:8,alignItems:"start",padding:10,border:"1px solid #dfe4d8",borderRadius:10}}>
          <input type="checkbox" style={{width:20,flexShrink:0}} checked={selected} onChange={()=>onChange(selected?splits.filter(s=>s.targetId!==expense.id):[...splits,{targetId:expense.id,amount:String(expense.remaining).replace(".",",")}])}/>
          <span style={{display:"grid",gap:3,minWidth:0,overflowWrap:"anywhere"}}><b>{expense.name} · {expense.competence}</b><small>Vence dia {expense.dueDay} · previsto {money.format(expense.expectedAmount)} · pago {money.format(expense.paid)} · em aberto {money.format(expense.remaining)}</small></span>
        </label>;
      })}
      {!options.length?<p>Nenhuma conta aberta disponível para este PIX.</p>:null}
    </div>
    </>:null}
    {splits.map(split=>{const expense=expenses.find(e=>e.id===split.targetId),excess=expense?Math.round((allocationAmount(split.amount)-expense.remaining)*100)/100:0;return <div key={split.targetId} style={{display:"grid",gap:8,minWidth:0,padding:10,border:"1px solid #dfe4d8",borderRadius:10}}><strong>{expense?.name||"Conta indisponível"} · {expense?.competence}</strong><small>Saldo atual: {money.format(expense?.remaining||0)}</small><label style={{minWidth:0}}>Valor a baixar nesta conta<input style={{width:"100%",minWidth:0,boxSizing:"border-box"}} aria-label={`Valor para ${expense?.name||split.targetId}`} inputMode="decimal" value={split.amount} onChange={e=>onChange(splits.map(s=>s.targetId===split.targetId?{...s,amount:e.target.value,treatment:""}:s))}/></label>{excess>0?<><p role="alert">Diferença acima do saldo: <b>{money.format(excess)}</b></p><label>Tratamento da diferença<select required value={split.treatment||""} style={{width:"100%",minWidth:0}} onChange={e=>onChange(splits.map(s=>s.targetId===split.targetId?{...s,treatment:e.target.value as ExpenseSplit['treatment']}:s))}><option value="">Escolha explicitamente...</option>{!expense?.closed?<option value="UPDATE">Atualizar obrigação desta competência</option>:null}<option value="INTEREST">Registrar juros/encargos</option></select></label>{split.treatment?<small>{split.treatment==="UPDATE"?`Atualiza somente esta obrigação: ${money.format(expense?.expectedAmount||0)} → ${money.format((expense?.expectedAmount||0)+excess)}. Não propaga para próximas competências.`:`Mantém o principal e registra ${money.format(excess)} como juros/encargos vinculados a esta conta e ao PIX.`}</small>:null}{expense?.closed?<small>Competência original fechada: principal preservado; encargo vinculado ao pagamento.</small>:null}</>:null}{expense&&!expense.closed&&excess<0&&excess>=-0.99?<label style={{display:"flex",gap:8,alignItems:"start"}}><input type="checkbox" style={{width:20,flexShrink:0}} checked={split.treatment==="DISCOUNT"} onChange={e=>onChange(splits.map(s=>s.targetId===split.targetId?{...s,treatment:e.target.checked?"DISCOUNT":""}:s))}/><span>Aceitar desconto de {money.format(-excess)} e quitar esta conta. Obrigação: {money.format(expense.expectedAmount)} → {money.format(expense.expectedAmount+excess)}. Ajuste registrado no histórico; próximas competências preservadas.</span></label>:null}<button type="button" className="secondary" onClick={()=>onChange(splits.filter(s=>s.targetId!==split.targetId))}>Remover</button></div>;})}
    <p>PIX: <b>{money.format(amount)}</b> · Saldo das contas selecionadas: <b>{money.format(totals.selectedTotal)}</b><br/>Total conciliado: <b>{money.format(totals.distributed)}</b> · Diferença: <b>{money.format(totals.difference)}</b></p>
    {totals.difference<0?<p role="alert">O total ultrapassa o PIX. Reduza os valores.</p>:null}
    {totals.difference>0?<><label>Destino da diferença<select value={remainder} onChange={e=>onRemainder(e.target.value as RemainderChoice,category,description)}><option value="">Escolha antes de confirmar...</option><option value="TRANSFER">Transferência / repasse, sem nova despesa</option><option value="EXTRA">Gasto extra separado</option></select></label>{remainder==="EXTRA"?<><label>Categoria da diferença<select value={category} onChange={e=>onRemainder(remainder,e.target.value,description)}><option value="">Selecione...</option>{categories.map(c=><option key={c}>{c}</option>)}</select></label><label>Descrição da diferença<input value={description} onChange={e=>onRemainder(remainder,category,e.target.value)}/></label></>:null}</>:null}
    <small>Pagamento parcial mantém o restante da conta em aberto. A data do PIX é preservada. Esta divisão vale somente para esta movimentação.</small>
  </div>;
}
