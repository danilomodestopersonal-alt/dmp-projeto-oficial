export function expenseOptionsForPayment<T extends {id:string;name:string;competence:string;remaining:number;closed:boolean}>(expenses:T[],date:string):T[]{
  const month=date.slice(0,7);
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))return [];
  return expenses.filter(item=>item.competence<=month&&item.remaining>0.005&&(!item.closed||item.competence<month))
    .sort((a,b)=>b.competence.localeCompare(a.competence)||a.name.localeCompare(b.name,"pt-BR")||a.id.localeCompare(b.id));
}
// A past obligation can be settled in a later open cash month without reopening its plan.
export function expensePaymentAllowed(sourceMonth:string,paymentMonth:string,sourceStatus:string|undefined,paymentStatus:string|undefined){
  return Boolean(sourceStatus&&paymentStatus&&paymentStatus!=="CLOSED"&&sourceMonth<=paymentMonth&&(sourceStatus!=="CLOSED"||sourceMonth<paymentMonth));
}
