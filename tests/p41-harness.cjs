'use strict';
const {loader,json}=require('./p15-harness.cjs');
const load=loader(),{cancellationRevision,changeInvoiceCancellation}=load('lib/financeiro/invoice-cancellation.ts');
const seed=load('lib/financeiro/agosto2026.ts').financeSeedAugust2026;
const clone=x=>structuredClone(x);
function fixture(){return {...clone(seed),currentCompetence:'2026-11',competences:{'2026-10':{status:'OPEN'},'2026-11':{status:'OPEN'}},personalInvoices:[{id:'p41-nov',studentId:'p41-student',studentName:'Aluno sintético',competence:'2026-11',dueDay:10,expectedAmount:600,payments:[],profileManaged:true,autoRenew:true,excludedFromTotals:false},{id:'p41-oct',studentId:'p41-student',studentName:'Aluno sintético',competence:'2026-10',dueDay:10,expectedAmount:600,payments:[],profileManaged:true,autoRenew:true,excludedFromTotals:false},{id:'p41-other',studentId:'p41-other-student',studentName:'Outra pessoa',competence:'2026-11',dueDay:25,expectedAmount:400,payments:[],profileManaged:true,autoRenew:true,excludedFromTotals:false}],history:[],carriedPendencies:[],invoiceCancellationAudit:[]};}
const students=[{id:'p41-student',name:'Aluno sintético',status:'ACTIVE',financialActive:true,monthlyAmount:600,financeDueDay:10,sessions:[{id:'past',date:'2026-11-01'},{id:'future',date:'2026-11-25'}],workouts:[{id:'workout'}],assessments:[{id:'assessment'}]},{id:'p41-other-student',name:'Outra pessoa',status:'ACTIVE',financialActive:true,monthlyAmount:400,financeDueDay:25,sessions:[]}];
let counter=0;const command=(d,id='p41-nov',action='CANCEL')=>({invoiceId:id,action,reason:'Cancelamento mensal solicitado',operationId:'p41-operation-'+String(++counter).padStart(8,'0'),expectedInvoice:cancellationRevision(d.personalInvoices.find(x=>x.id===id)),confirmed:true});
function database(initial=fixture()){
 const db={data:clone(initial),revision:'2026-11-16T12:00:00.000Z',students:clone(students),mp:{decisions:[]},writes:0,backups:[],calls:[],authorized:true,failConnect:false,failWrite:false};
 let queue=Promise.resolve();
 const pool={async connect(){if(db.failConnect)throw Error('synthetic offline');let releaseLock,snapshot;
 return {async query(sql,args=[]){db.calls.push({sql,id:args[0]});
  if(sql==='BEGIN'){const prev=queue;queue=new Promise(r=>releaseLock=r);await prev;snapshot={data:clone(db.data),revision:db.revision,backups:clone(db.backups)};return {rows:[]};}
  if(sql==='ROLLBACK'){if(snapshot){db.data=snapshot.data;db.revision=snapshot.revision;db.backups=snapshot.backups;snapshot=null;}return {rows:[]};}
  if(sql==='COMMIT'){snapshot=null;return {rows:[]};}
  if(sql.startsWith('SELECT')){const id=args[0];return {rows:id==='finance_v1'?[{payload:clone(db.data),updated_at:db.revision}]:id==='students'?[{payload:clone(db.students)}]:id==='access_v1'?[{email:'operator@synthetic.invalid'}]:id==='mercado_pago_reconciliation_v1'?[{payload:clone(db.mp)}]:[]};}
  if(sql.startsWith('INSERT')){db.backups.push({id:args[0],data:JSON.parse(args[1])});return {rows:[]};}
  if(sql.startsWith('UPDATE')){if(db.failWrite)throw Error('synthetic write failure');if(args[0]!=='finance_v1')throw Error('unexpected write');db.data=JSON.parse(args[1]);db.writes++;db.revision=new Date(Date.parse(db.revision)+1000).toISOString();return {rows:[{updated_at:db.revision}]};}
  throw Error('Unexpected SQL '+sql);
 },release(){releaseLock?.();}};}};
 const route=loader({'@/lib/auth':{isAuthorized:async()=>db.authorized},'@/lib/db':{pool},'next/server':{NextResponse:{json}}})('app/api/finance/invoice-cancellation/route.ts');
 db.post=(body,headers={})=>route.POST({headers:new Headers({'content-type':'application/json','x-dmp-action':'invoice-cancellation','sec-fetch-site':'same-origin','x-dmp-expected-updated-at':db.revision,...headers}),json:async()=>body});
 return db;
}
module.exports={fixture,students,command,database,clone,load,changeInvoiceCancellation};
