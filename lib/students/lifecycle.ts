import type {Student} from '@/types/models';
import type {FinanceData,PersonalInvoice} from '@/types/financeiro';

export type PausePeriod={id:string;from:string;effectiveAt?:string;expectedReturn?:string;resumedOn?:string;billingFrom?:string;issuedIds:string[]};
export type StudentLifecycle={revision:string;periods:PausePeriod[];billingStart?:string;issuedIds?:string[];pending?:{operationId:string;kind:'pause'|'resume';digest:string}};
export const saoPauloDate=(date=new Date())=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(date);
export function validDate(value:unknown):value is string {return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;}
export function currentPause(student:Student){return student.lifecycle?.periods.find(p=>!p.resumedOn);}
export function pauseLabel(student:Student,date=saoPauloDate()){
 const p=currentPause(student);
 if(student.lifecycle?.pending)return student.lifecycle.pending.kind==='pause'?'Inativo · agenda pendente':'Inativo · reativação pendente';
 if(!p)return '';
 return 'Inativo · retirada das aulas a partir de '+p.from.split('-').reverse().join('/');
}
export function billingAllowed(student:Student,competence:string){
 if(student.lifecycle&&student.status!=='ACTIVE')return false;
 if(student.lifecycle?.billingStart&&competence<student.lifecycle.billingStart)return false;
 return !(student.lifecycle?.periods||[]).some(p=>competence>=p.from.slice(0,7)&&(!p.resumedOn||competence<(p.billingFrom||p.resumedOn.slice(0,7))));
}
export const invoiceFrozen=(student:Student,invoice:PersonalInvoice)=>Boolean(student.lifecycle?.issuedIds?.includes(invoice.id)||student.lifecycle?.periods.some(p=>p.issuedIds.includes(invoice.id)));
export function lifecyclePreserved(before:Student[],after:Student[]){
 const stable=(s:Student)=>JSON.stringify(s.lifecycle??null);
 return before.every(s=>{const next=after.find(n=>n.id===s.id);if(next&&s.status!==next.status)return false;return s.lifecycle?Boolean(next&&stable(s)===stable(next)&&s.status===next.status&&(!s.lifecycle.pending||['financialActive','monthlyAmount','financeDueDay','trainingSchedule'].every(k=>s[k as keyof Student]===next[k as keyof Student]))):!next||stable(next)==='null';})&&after.every(s=>before.some(n=>n.id===s.id)||!s.lifecycle);
}
// A stale browser may not create an automatic obligation for a suspended month.
export function pausedBillingPreserved(before:FinanceData,after:FinanceData,students:Student[]){
 const existing=new Set((before?.personalInvoices||[]).map(i=>i.id));
 return (after.personalInvoices||[]).every(i=>existing.has(i.id)||!i.studentId||!students.some(s=>s.id===i.studentId&&!billingAllowed(s,i.competence)));
}
export function filterPausedGeneration(before:FinanceData,after:FinanceData,students:Student[]){
 const existing=new Set(before.personalInvoices.map(i=>i.id));
 const personalInvoices=after.personalInvoices.filter(i=>existing.has(i.id)||!i.studentId||!students.some(s=>s.id===i.studentId&&!billingAllowed(s,i.competence)));
 return personalInvoices.length===after.personalInvoices.length?after:{...after,personalInvoices};
}
