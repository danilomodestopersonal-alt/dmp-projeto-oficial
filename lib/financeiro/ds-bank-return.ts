import type {FinanceData,DsBankLink,FinanceOperationAudit} from '@/types/financeiro';
import {financeSummary} from './calculos';
export class DsReturnError extends Error {}
export type DsMovement={outgoingIdentity?:{label:string};fingerprint:string;fingerprintAliases:string[];amount:number;dateKey:string;description:string;kind:string;technical:boolean;historical:boolean};
const cents=(n:number)=>Math.round(n*100);
export function dsReturnPreview(data:FinanceData,move:DsMovement,competence:string,existingId='') {
  if(move.kind!=='OUT'||move.technical||move.historical||!move.fingerprint||!Number.isFinite(move.amount)||move.amount<=0||cents(move.amount)/100!==move.amount||!/^\d{4}-\d{2}-\d{2}$/.test(move.dateKey))throw new DsReturnError('Selecione um PIX de saída válido.');
  if(!['OPEN','REOPENED'].includes(data.competences[competence]?.status))throw new DsReturnError('Competência fechada ou inexistente. Use a reabertura explícita e auditada antes de registrar.');
  if(Object.entries(data.dsReturns||{}).some(([c,rows])=>c!==competence&&rows.some(r=>cents(r.amount)===cents(move.amount)&&r.date===move.dateKey)))throw new DsReturnError('Existe devolução de mesmo valor e data em outra competência. Confira o registro existente antes de criar ou vincular.');
  const same=(data.dsReturns?.[competence]||[]).filter(r=>cents(r.amount)===cents(move.amount)&&r.date===move.dateKey);
  const equivalents=same.filter(r=>!data.dsBankLinks?.some(l=>l.active&&l.returnId===r.id&&l.competence===competence));
  const existing=existingId?equivalents.find(r=>r.id===existingId):undefined;
  if(existingId&&!existing)throw new DsReturnError('A devolução manual escolhida mudou ou já foi vinculada.');
  const before=-financeSummary(data,competence).dsBalance;
  if(!existing&&same.length) return {before,after:before,amount:move.amount,date:move.dateKey,competence,equivalents,blocked:'Já existe devolução de mesmo valor e data. Vincule o registro existente ou revise-o antes de criar outra.'};
  return {before,after:existing?before:(cents(before)-cents(move.amount))/100,amount:move.amount,date:move.dateKey,competence,equivalents,blocked:''};
}
export function applyDsBankReturn(data:FinanceData,move:DsMovement|undefined,input:any,operator:string,now:string):FinanceData {
  if(!input||input.confirmed!==true||typeof input.operationId!=='string'||!/^[\w-]{16,80}$/.test(input.operationId)||!operator)throw new DsReturnError('Confirmação inválida.');
  if(typeof input.reason!=='string'||input.reason.trim().length<5||input.reason.length>500)throw new DsReturnError('Informe um motivo com 5 a 500 caracteres.');
  const request=JSON.stringify({...input,movementFingerprint:move?.fingerprint}),retry=data.dsBankAudit?.find(a=>a.operationId===input.operationId);
  if(retry){if(retry.request!==request)throw new DsReturnError('Operação já utilizada.');return data;}
  let next:FinanceData,link:DsBankLink,before:unknown=null;
  if(input.action==='UNDO') {
    const old=data.dsBankLinks?.find(l=>l.id===input.linkId&&l.active);if(!old)throw new DsReturnError('Vínculo já desfeito ou inexistente.');
    if(!['OPEN','REOPENED'].includes(data.competences[old.competence]?.status))throw new DsReturnError('Reabra explicitamente o mês para desfazer.');
    const payment=data.dsReturns?.[old.competence]?.find(p=>p.id===old.returnId);
    if(!payment||cents(payment.amount)!==cents(old.amount)||payment.date!==old.date)throw new DsReturnError('Devolução alterada. Solicite revisão.');
    // A later manual carryover depends on this settlement; do not invalidate it silently.
    if(data.priorPlanning?.some(p=>p.active&&p.originCompetence===old.competence&&p.kind.startsWith('DS_')))throw new DsReturnError('Há pendência DS manual vinculada a este acerto. Revise ou desfaça essa inclusão primeiro.');
    before=old;link={...old,active:false};
    next={...data,dsBankLinks:data.dsBankLinks!.map(l=>l.id===old.id?link:l)};
    if(old.createdReturn)next={...next,dsReturns:{...data.dsReturns,[old.competence]:data.dsReturns![old.competence].filter(p=>p.id!==old.returnId)}};
  } else {
    if(input.action!=='APPLY'||!move)throw new DsReturnError('Ação inválida.');
    if(data.dsBankLinks?.some(l=>l.active&&l.aliases.some(f=>move.fingerprintAliases.includes(f))))throw new DsReturnError('PIX já vinculado. Atualize para conferir.');
    const preview=dsReturnPreview(data,move,String(input.competence||''),String(input.existingId||''));
    if(preview.blocked)throw new DsReturnError(preview.blocked);
    if(cents(Number(input.expectedDebt))!==cents(preview.before)||cents(Number(input.confirmedAmount))!==cents(move.amount))throw new DsReturnError('Valor ou dívida mudou. Confira novamente antes de confirmar.');
    const returnId=input.existingId||'dsreturn-'+input.operationId;
    link={id:'dslink-'+input.operationId,fingerprint:move.fingerprint,aliases:move.fingerprintAliases,competence:input.competence,returnId,amount:move.amount,date:move.dateKey,identity:move.outgoingIdentity?.label||move.description,createdReturn:!input.existingId,active:true};
    next={...data,dsBankLinks:[...(data.dsBankLinks||[]),link]};
    if(!input.existingId)next={...next,dsReturns:{...data.dsReturns,[link.competence]:[...(data.dsReturns?.[link.competence]||[]),{id:returnId,date:link.date,amount:link.amount,note:'Mercado Pago · '+input.reason.trim()}]}};
  }
  const audit:FinanceOperationAudit={operationId:input.operationId,request,occurredAt:now,operator,competence:link.competence,entityId:link.id,action:input.action,reason:input.reason.trim(),before,after:link};
  return {...next,dsBankAudit:[...(data.dsBankAudit||[]),audit],history:[...(data.history||[]),{id:'history-'+input.operationId,occurredAt:now,competence:link.competence,kind:input.action==='UNDO'?'DS_RETURN_DELETED':'DS_RETURN_ADDED',entityId:link.returnId,amount:link.amount,description:`Devolução DS · ${input.action==='UNDO'?'vínculo desfeito':link.createdReturn?'registrada e vinculada':'registro manual vinculado'} · PIX ${link.fingerprint} · ${input.reason.trim()}`} ]};
}
// Generic saves cannot remove server audit, unlink a PIX or mutate its payment.
export function settlementLinksPreserved(before:FinanceData,after:FinanceData) {
  for(const key of ['dsBankLinks','dsBankAudit','priorPlanning','priorPlanningAudit'] as const) if(JSON.stringify(before[key]||[])!==JSON.stringify(after[key]||[]))return false;
  for(const link of before.dsBankLinks||[])if(link.active&&JSON.stringify(before.dsReturns?.[link.competence]?.find(p=>p.id===link.returnId))!==JSON.stringify(after.dsReturns?.[link.competence]?.find(p=>p.id===link.returnId)))return false;
  for(const row of before.priorPlanning||[])if(row.active) {
    if(row.kind.startsWith('DS_')&&(before.dsOpeningBalances?.[row.competence]||0)!==(after.dsOpeningBalances?.[row.competence]||0))return false;
    if(row.kind==='PERSONAL'&&!after.personalInvoices.some(p=>p.id===row.sourceId&&p.competence===row.originCompetence&&!p.excludedFromTotals))return false;
    if(row.kind==='EXPENSE'&&!after.expenses.some(p=>p.id===row.sourceId&&p.competence===row.originCompetence))return false;
  }
  const auditIds=new Set([...(before.dsBankAudit||[]),...(before.priorPlanningAudit||[])].map(a=>'history-'+a.operationId));
  return (before.history||[]).filter(h=>auditIds.has(h.id)).every(h=>JSON.stringify(h)===JSON.stringify(after.history?.find(a=>a.id===h.id)));
}
