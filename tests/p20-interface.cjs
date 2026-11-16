// Cancellation dialog behaviors are covered against the real API in p41-interface.cjs.
'use strict';
const assert=require('node:assert/strict'),{loader,json}=require('./p15-harness.cjs');
const {fixture,command,load}=require('./p41-harness.cjs');
const data=fixture(),row=data.personalInvoices[0];
const cancelled=load('lib/financeiro/invoice-cancellation.ts').changeInvoiceCancellation(data,command(data),'operator@test.invalid','2026-11-16T12:00:00Z');
(async()=>{
 // Full-document endpoint must retain server-owned cancellation audit and records.
 let stored={...cancelled,version:1,otherReceipts:[]},written=0;
 const api=loader({'@/lib/auth':{isAuthorized:async()=>true},'next/server':{NextResponse:{json}},'@/lib/db':{pool:{connect:async()=>({query:async(sql,args)=>{if(sql.startsWith('SELECT'))return {rows:[{payload:stored,updated_at:'2026-10-30T12:00:00Z'}]};if(sql.includes('INSERT INTO dmp_data')){written++;return {rows:[{updated_at:'2026-10-30T12:01:00Z'}]};}return {rows:[]};},release(){}})}}})('app/api/finance/route.ts');
 const erased={...stored,invoiceCancellationAudit:[],personalInvoices:[row]};const request=value=>({json:async()=>value,headers:new Headers({'x-dmp-expected-updated-at':'2026-10-30T12:00:00.000Z'})});
 assert.equal((await api.PUT(request(erased))).status,409);assert.equal(written,0);assert.equal((await api.PUT(request(stored))).status,200);assert.equal(written,1);
 console.log('PASS P20 API PUT: gravação comum protege cancelamentos e aceita dados preservados');
})().catch(error=>{console.error(error);process.exitCode=1;});
