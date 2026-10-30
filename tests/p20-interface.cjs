'use strict';
const assert=require('node:assert/strict');
const {loader,json}=require('./p15-harness.cjs');
const slots=[],refs=[];let slot=0,ref=0,captured=[],saved=0,saving=[];
const react={useState(initial){const index=slot++;if(!(index in slots))slots[index]=initial;return [slots[index],value=>{slots[index]=typeof value==='function'?value(slots[index]):value;}];},useRef(initial){const index=ref++;return refs[index]??=( {current:initial});}};
const load=loader({'react':react},async(url,request)=>{captured.push({url,...request});return Response.json({ok:true});});
const Component=load('components/financeiro/InvoiceCancellation.tsx').InvoiceCancellation;
const row={id:'invoice',studentId:'s',studentName:'Aluno teste',competence:'2026-10',dueDay:30,expectedAmount:325,payments:[],autoRenew:false};
const data={currentCompetence:'2026-10',competences:{'2026-10':{status:'OPEN'}},personalInvoices:[row]};
const props={data,disabled:false,onSaving:value=>saving.push(value),onSaved:async()=>{saved++;}};
function render(){slot=0;ref=0;return Component(props);}
function nodes(tree,pred){if(!tree||typeof tree!=='object')return [];if(Array.isArray(tree))return tree.flatMap(n=>nodes(n,pred));return [...(pred(tree)?[tree]:[]),...nodes(tree.props?.children,pred)];}
const find=(tree,type)=>nodes(tree,n=>n.type===type)[0];
global.sessionStorage={getItem:()=> '2026-10-30T12:00:00.000Z'};
(async()=>{
 let tree=render();assert.equal(find(tree,'button'),undefined);
 find(tree,'select').props.onChange({target:{value:'invoice'}});tree=render();assert(find(tree,'button').props.disabled);
 find(tree,'textarea').props.onChange({target:{value:'Motivo documentado'}});tree=render();assert(find(tree,'button').props.disabled);
 find(tree,'input').props.onChange({target:{checked:true}});tree=render();assert(!find(tree,'button').props.disabled);
 // A refreshed invoice cannot silently reuse an earlier confirmation.
 row.expectedAmount=350;tree=render();assert(find(tree,'button').props.disabled);find(tree,'button').props.onClick();await new Promise(r=>setImmediate(r));assert.equal(captured.length,0);
 row.expectedAmount=325;tree=render();find(tree,'button').props.onClick();find(tree,'button').props.onClick();await new Promise(r=>setImmediate(r));assert.equal(captured.length,1);assert.equal(saved,1);assert.deepEqual(saving,[true,false]);const body=JSON.parse(captured[0].body);assert.equal(body.invoiceId,'invoice');assert.equal(body.confirmed,true);assert.equal(body.action,'CANCEL');assert.equal(body.reason,'Motivo documentado');assert.match(body.expectedInvoice,/325/);
 tree=render();assert.equal(find(tree,'select').props.value,'');
 const cancelled={...row,excludedFromTotals:true,cancellation:{active:true,previousAutoRenew:false}};props.data={...data,personalInvoices:[cancelled],invoiceCancellationAudit:[{invoiceId:row.id,operationId:'a',competence:'2026-10',action:'CANCEL',reason:'Motivo documentado',operator:'conta@example.invalid',occurredAt:'2026-10-30T12:00:00Z'}]};
 tree=render();assert(JSON.stringify(tree).includes('conta@example.invalid'));assert(JSON.stringify(tree).includes('Motivo documentado'));find(tree,'select').props.onChange({target:{value:'invoice'}});tree=render();assert.equal(find(tree,'button').props.children,'Restaurar cobrança');assert(find(tree,'button').props.disabled);
 props.disabled=true;tree=render();assert(find(tree,'fieldset').props.disabled);
 console.log('PASS P20 INTERFACE: motivo, confirmacao, revisao capturada, duplo clique, historico e restauracao');
 // Full-document endpoint must retain server-owned cancellation audit and records.
 let stored={...props.data,version:1,otherReceipts:[]},written=0;
 const api=loader({'@/lib/auth':{isAuthorized:async()=>true},'next/server':{NextResponse:{json}},'@/lib/db':{pool:{connect:async()=>({query:async(sql,args)=>{if(sql.startsWith('SELECT'))return {rows:[{payload:stored,updated_at:'2026-10-30T12:00:00Z'}]};if(sql.includes('INSERT INTO dmp_data')){written++;return {rows:[{updated_at:'2026-10-30T12:01:00Z'}]};}return {rows:[]};},release(){}})}}})('app/api/finance/route.ts');
 const erased={...stored,invoiceCancellationAudit:[],personalInvoices:[row]};const request=value=>({json:async()=>value,headers:new Headers({'x-dmp-expected-updated-at':'2026-10-30T12:00:00.000Z'})});
 assert.equal((await api.PUT(request(erased))).status,409);assert.equal(written,0);assert.equal((await api.PUT(request(stored))).status,200);assert.equal(written,1);
 console.log('PASS P20 API PUT: gravação comum protege cancelamentos e aceita dados preservados');
})().catch(error=>{console.error(error);process.exitCode=1;});
