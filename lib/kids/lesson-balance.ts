import { computeKidsStudentReplacementBalance, kidsBalanceSigned } from './replacement-balance';
import type { KidsData } from '@/types/kids';
export function kidsLessonBalance(data:KidsData,studentId:string,date?:string){
 const official=computeKidsStudentReplacementBalance(data,studentId,date);
 // A apresentação já usada pelo painel é "a repor": direitos menos reposições.
 const value=official.due-official.replaced;
 return {value,label:kidsBalanceSigned(value),tone:value>0?'pending':value<0?'advance':'neutral',description:value>0?`${value} reposição(ões) a realizar`:value<0?`${Math.abs(value)} reposição(ões) antecipada(s)`:'Saldo de reposições equilibrado'};
}
