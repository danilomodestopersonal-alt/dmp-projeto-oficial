import type {FinanceData,PriorPlanning,FinanceOperationAudit} from '@/types/financeiro';
import {originalDsBalance} from './ds-settlement';
const cents=(n:number)=>Math.round(n*100);
const open=(d:FinanceData,c:string)=>['OPEN','REOPENED'].includes(d.competences[c]?.status);
export class PlanningError extends Error {}
export function outstanding(expected:number,payments:{amount:number}[]) {return Math.max(0,cents(expected)-payments.reduce((n,p)=>n+cents(p.amount),0))/100;}
export function planningAvailable(data:FinanceData,item:PriorPlanning):number {
  if(item.kind==='PERSONAL') {const row=data.personalInvoices.find(r=>r.id===item.sourceId&&r.competence===item.originCompetence&&!r.excludedFromTotals);return row?outstanding(row.expectedAmount,row.payments):0;}
  if(item.kind==='EXPENSE') {const row=data.expenses.find(r=>r.id===item.sourceId&&r.competence===item.originCompetence);return row?outstanding(row.expectedAmount,row.payments):0;}
  if(item.kind==='DS_CREDIT'||item.kind==='DS_DEBT') return Math.max(0,originalDsBalance(data,item.originCompetence)*(item.kind==='DS_DEBT'?-1:1));
  return item.amount;
}
export function planningAmount(data:FinanceData,item:PriorPlanning) {return item.active?Math.min(item.amount,planningAvailable(data,item)):0;}
export function planningTotals(data:FinanceData,competence:string) {
  const rows=(data.priorPlanning||[]).filter(r=>r.active&&r.competence===competence);
  const total=(k:string[])=>rows.filter(r=>k.includes(r.kind)).reduce((n,r)=>n+cents(planningAmount(data,r)),0)/100;
  return {rows,ds:total(['DS_CREDIT'])-total(['DS_DEBT']),receivable:total(['PERSONAL','OTHER_CREDIT']),payable:total(['EXPENSE','OTHER_DEBT'])};
}
export function changePlanning(data:FinanceData,input:any,operator:string,now:string):FinanceData {
  if(!input||typeof input.operationId!=='string'||!/^[\w-]{16,80}$/.test(input.operationId)||input.confirmed!==true)throw new PlanningError('Confirmação inválida.');
  const request=JSON.stringify(input),prior=data.priorPlanningAudit?.find(a=>a.operationId===input.operationId);
  if(prior){if(prior.request!==request)throw new PlanningError('Operação já utilizada.');return data;}
  if(!operator||typeof input.reason!=='string'||input.reason.trim().length<5||input.reason.length>500)throw new PlanningError('Informe o motivo, com 5 a 500 caracteres.');
  const before=data.priorPlanning?.find(r=>r.id===input.id);
  if(!['ADD','EDIT','REVERSE'].includes(input.action)||input.action!=='ADD'&&(!before||!before.active))throw new PlanningError('Pendência não encontrada ou já desfeita.');
  const c=input.action==='ADD'?String(input.competence||''):before!.competence;
  if(c<'2026-11'||!open(data,c))throw new PlanningError('Abra ou reabra explicitamente a competência de destino antes de alterar.');
  let after:PriorPlanning;
  if(input.action==='REVERSE') after={...before!,active:false};
  else {
    after={id:before?.id||'prior-'+input.operationId,competence:c,originCompetence:String(input.originCompetence||''),kind:input.kind,sourceId:String(input.sourceId||''),amount:Number(input.amount),reason:input.reason.trim(),active:true};
    if(!data.competences[after.originCompetence]||after.originCompetence>=c||!['DS_CREDIT','DS_DEBT','PERSONAL','EXPENSE','OTHER_CREDIT','OTHER_DEBT'].includes(after.kind)||!Number.isFinite(after.amount)||after.amount<=0||after.amount!==cents(after.amount)/100)throw new PlanningError('Confira origem, destino, natureza e valor.');
    if(after.kind.startsWith('DS_')) {
      after.sourceId='DS:'+after.originCompetence;
      if(data.dsOpeningBalances?.[c])throw new PlanningError('O destino já tem saldo anterior DS informado. Revise esse valor antes de incluir outra pendência DS, para não duplicar.');
    }
    if(after.kind.startsWith('OTHER_')&&!after.sourceId.trim())throw new PlanningError('Identifique a obrigação de origem.');
    if(after.amount>planningAvailable(data,after))throw new PlanningError('Valor acima do saldo pendente da origem.');
    // A single obligation cannot be carried repeatedly into different months.
    if((data.priorPlanning||[]).some(r=>r.active&&r.id!==after.id&&r.originCompetence===after.originCompetence&&r.sourceId===after.sourceId))throw new PlanningError('Esta obrigação já possui inclusão manual ativa. Edite ou desfaça a anterior.');
  }
  const audit:FinanceOperationAudit={operationId:input.operationId,request,occurredAt:now,operator,competence:c,entityId:after.id,action:input.action,reason:input.reason.trim(),before:before||null,after};
  return {...data,priorPlanning:[...(data.priorPlanning||[]).filter(r=>r.id!==after.id),after],priorPlanningAudit:[...(data.priorPlanningAudit||[]),audit],history:[...(data.history||[]),{id:'history-'+input.operationId,occurredAt:now,competence:c,kind:input.action==='REVERSE'?'CARRYOVER_DELETED':input.action==='EDIT'?'CARRYOVER_UPDATED':'CARRYOVER_CREATED',entityId:after.id,amount:after.amount,description:`Pendência anterior manual · ${input.action} · origem ${after.originCompetence} · ${after.kind} · ${input.reason.trim()}`} ]};
}
