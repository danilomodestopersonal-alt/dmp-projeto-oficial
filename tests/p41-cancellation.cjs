'use strict';
const A=require('node:assert/strict'),H=require('./p41-harness.cjs');
const {financeSummary,invoiceStatus}=H.load('lib/financeiro/calculos.ts');
const {reconcilePersonalFinance}=H.load('lib/financeiro/personal-sync.ts');
(async()=>{
 let db=H.database(),before=H.clone(db.data),people=H.clone(db.students),mp=H.clone(db.mp),cmd=H.command(db.data),r=await db.post(cmd);
 A.equal(r.status,200);A.deepEqual(r.body.data,db.data);A.equal(r.body.updatedAt,db.revision);A.equal(db.backups.length,1);A.deepEqual(db.backups[0].data,before);
 const a=financeSummary(before),b=financeSummary(r.body.data);A.equal(a.personalExpected-b.personalExpected,600);A.equal(a.personalOpen-b.personalOpen,600);A.equal(a.personalReceived,b.personalReceived);A.equal(a.realizedRevenue,b.realizedRevenue);
 A.deepEqual(db.data.personalInvoices.slice(1),before.personalInvoices.slice(1));A.deepEqual(db.students,people);A.deepEqual(db.mp,mp);A.ok(db.calls.filter(x=>x.sql.startsWith('UPDATE')).every(x=>x.id==='finance_v1'));for(const k of Object.keys(before))if(!['personalInvoices','invoiceCancellationAudit'].includes(k))A.deepEqual(db.data[k],before[k],k);
 const persisted=JSON.parse(JSON.stringify(db.data));A.equal(persisted.invoiceCancellationAudit[0].reason,cmd.reason);A.equal(persisted.invoiceCancellationAudit[0].operator,'operator@synthetic.invalid');A.ok(Number.isFinite(Date.parse(persisted.invoiceCancellationAudit[0].occurredAt)));A.ok(persisted.personalInvoices[0].cancellation.active);
 const reloaded=reconcilePersonalFinance(persisted,db.students,'2026-11').data;A.equal(reloaded.personalInvoices.filter(x=>x.id==='p41-nov').length,1);A.ok(reloaded.personalInvoices[0].excludedFromTotals);
 console.log('PASS P41 persistência, resposta confirmada, totais, histórico, aluno/aulas/treinos e outras competências intactos');
 r=await db.post(cmd,{'x-dmp-expected-updated-at':'old'});A.equal(r.status,200);A.equal(r.body.repeated,true);A.deepEqual(r.body.data,db.data);A.equal(r.body.updatedAt,db.revision);A.equal(db.writes,1);A.equal((await db.post(H.command(db.data))).status,409);A.equal(db.writes,1);
 const restore=await db.post(H.command(db.data,'p41-nov','RESTORE'));A.equal(restore.status,200);A.equal(financeSummary(restore.body.data).personalExpected,a.personalExpected);A.equal(db.data.invoiceCancellationAudit.length,2);A.equal(db.data.personalInvoices[0].autoRenew,true);
 console.log('PASS P41 retry idempotente e restauração com histórico preservado');
 for(const payments of [[{id:'payment',date:'2026-11-10',amount:600}],[{id:'partial',date:'2026-11-10',amount:100}]]){db=H.database();db.data.personalInvoices[0].payments=payments;A.equal((await db.post(H.command(db.data))).status,409);A.equal(db.writes,0);}
 db=H.database();A.equal(invoiceStatus(db.data.personalInvoices[0],new Date('2026-11-16T12:00:00Z')),'OVERDUE');A.equal((await db.post(H.command(db.data))).status,200);
 for(const patch of [{reason:''},{reason:'abc'},{confirmed:false},{expectedInvoice:'stale'},{invoiceId:'missing'}]){db=H.database();A.equal((await db.post({...H.command(db.data),...patch})).status,409);A.equal(db.writes,0);}
 db=H.database();db.data.competences['2026-11'].status='CLOSED';A.equal((await db.post(H.command(db.data))).status,409);
 db=H.database();A.equal((await db.post(H.command(db.data,'p41-oct'))).status,200);A.equal(db.data.personalInvoices[0].cancellation,undefined);A.ok(db.data.personalInvoices[1].cancellation.active);
 console.log('PASS P41 em aberto/vencida permitidas, paga/parcial/motivo inválido/fechada bloqueadas, competência exata');
 db=H.database();cmd=H.command(db.data);const requests=[db.post(cmd),db.post(cmd)];const rs=await Promise.all(requests);A.ok(rs.every(x=>x.status===200));A.equal(db.writes,1);A.equal(db.backups.length,1);A.equal(db.data.invoiceCancellationAudit.length,1);
 db=H.database();const c1=H.command(db.data),c2=H.command(db.data);const rc=await Promise.all([db.post(c1),db.post(c2)]);A.deepEqual(rc.map(x=>x.status),[200,409]);A.equal(db.writes,1);
 console.log('PASS P41 duas confirmações concorrentes não duplicam escrita, backup ou auditoria');
 db=H.database();db.authorized=false;A.equal((await db.post(H.command(db.data))).status,401);A.equal(db.calls.length,0);db.authorized=true;A.equal((await db.post(H.command(db.data),{'sec-fetch-site':'cross-site'})).status,403);A.equal(db.writes,0);
 db=H.database();db.mp={decisions:[{invoiceId:'p41-nov'}]};A.equal((await db.post(H.command(db.data))).status,409);A.equal(db.writes,0);A.deepEqual(db.mp,{decisions:[{invoiceId:'p41-nov'}]});
 db=H.database();db.failConnect=true;A.equal((await db.post(H.command(db.data))).status,500);A.equal(db.writes,0);
 db=H.database();before=H.clone(db.data);db.failWrite=true;A.equal((await db.post(H.command(db.data))).status,500);A.deepEqual(db.data,before);A.equal(db.backups.length,0);
 console.log('PASS P41 sessão, origem, vínculo MP, conexão indisponível e rollback sem alteração parcial');
})().catch(e=>{console.error(e);process.exitCode=1});
