'use strict';
const A=require('node:assert/strict'),H=require('./p15-harness.cjs'),F=require('./p36-fixture.cjs');
let authorized=true,origin=true,data=F.fixture(),version='2026-11-12T09:00:00.000Z',writes=0,connections=0,releases=0,queries=[];
let queue=Promise.resolve();
const pool={connect:async()=>{connections++;let unlock,snapshot;return {query:async(sql,args)=>{
 queries.push(sql);if(sql==='BEGIN'){const prior=queue;queue=new Promise(resolve=>unlock=resolve);await prior;snapshot={data:structuredClone(data),version};return {rows:[]};}
 if(sql==='ROLLBACK'){if(snapshot){data=snapshot.data;version=snapshot.version;snapshot=null;}unlock?.();return {rows:[]};}
 if(sql==='COMMIT'){snapshot=null;unlock?.();return {rows:[]};}
 if(sql.startsWith('SELECT')){A.deepEqual(args,['kids_v1']);A.match(sql,/FOR UPDATE$/);return {rows:[{payload:structuredClone(data),updated_at:version}]};}
 if(sql.startsWith('UPDATE')||sql.trim().startsWith('INSERT')){A.equal(args[0],'kids_v1');data=JSON.parse(args[1]);writes++;version=new Date(Date.parse(version)+1000).toISOString();return {rows:[{updated_at:version}]};}
 throw Error('Unexpected query '+sql);
 },release(){releases++;unlock?.();}};}};
const api=H.loader({'@/lib/auth':{isAuthorized:async()=>authorized},'@/lib/widget/devices':{sameOrigin:()=>origin},'@/lib/db':{pool},'next/server':{NextResponse:{json:H.json}}})('app/api/kids/external-replacements/route.ts');
const request=(phase,command=F.command(),extra={})=>({headers:new Headers(extra.updatedAt?{'x-dmp-expected-updated-at':extra.updatedAt}:{}),json:async()=>({phase,command,digest:extra.digest})});
(async()=>{
 authorized=false;A.equal((await api.POST(request('preview'))).status,401);A.equal(connections,0);authorized=true;origin=false;A.equal((await api.POST(request('commit'))).status,403);A.equal(connections,0);origin=true;
 const original=structuredClone(data);let result=await api.POST(request('preview'));A.equal(result.status,200);A.equal(writes,0);A.deepEqual(data,original);A.equal(result.headers.get('cache-control'),'no-store');const preview=result.body.preview;
 result=await api.POST(request('commit',F.command(),{...preview,digest:'invalid'}));A.equal(result.status,409);A.equal(writes,0);
 result=await api.POST(request('commit',F.command(),{...preview,updatedAt:'old'}));A.equal(result.status,409);A.equal(writes,0);
 const otherCmd=F.command({operationId:'concurrent-different-001',time:'16:00'}),other=(await api.POST(request('preview',otherCmd))).body.preview;
 const results=await Promise.all([api.POST(request('commit',F.command(),preview)),api.POST(request('commit',otherCmd,other))]);A.deepEqual(results.map(r=>r.status),[200,409]);A.equal(writes,1);A.deepEqual(data.classes,original.classes);A.deepEqual(data.lessons,original.lessons);A.deepEqual(data.replacements,original.replacements);
 // Lost response / page reload: same operation + old version must not consume again.
 result=await api.POST(request('commit',F.command(),preview));A.equal(result.status,200);A.equal(result.body.replayed,true);A.equal(writes,1);
 result=await api.POST(request('preview',F.command()));A.equal(result.body.confirmed,true);A.equal(writes,1);
 result=await api.POST(request('preview',F.command({operationId:'duplicate-new-id-001'})));A.equal(result.status,409);A.equal(result.body.code,'DUPLICATE');A.equal(writes,1);
 const fix={action:'update',operationId:'correction-api-001',recordId:F.command().operationId,revision:1,date:'2026-11-10',time:'15:00',teacher:'Professor corrigido',category:'GREEN',notes:'Correção sintética'};
 let p=(await api.POST(request('preview',fix))).body.preview;A.equal(writes,1);result=await api.POST(request('commit',fix,p));A.equal(result.status,200);A.equal(writes,2);A.equal(data.replacementUsages.length,1);A.equal(data.externalReplacements[0].date,'2026-11-10');
 const undo={action:'void',operationId:'undo-api-operation-001',recordId:F.command().operationId,revision:2};p=(await api.POST(request('preview',undo))).body.preview;A.equal(p.after.replaced,0);result=await api.POST(request('commit',undo,p));A.equal(result.status,200);A.equal(data.replacementUsages.length,0);A.equal(data.externalReplacementAudit.length,3);
 result=await api.POST(request('commit',undo,p));A.equal(result.body.replayed,true);A.equal(writes,3);
 const fresh=F.command({operationId:'general-put-protection-01'});p=(await api.POST(request('preview',fresh))).body.preview;A.equal((await api.POST(request('commit',fresh,p))).status,200);
 const saved=structuredClone(data),general=H.loader({'@/lib/auth':{isAuthorized:async()=>true},'@/lib/db':{pool},'next/server':{NextResponse:{json:H.json}}})('app/api/kids/route.ts');
 let forged=structuredClone(data);forged.externalReplacements=[];forged.externalReplacementAudit=[];forged.replacementUsages=[];
 const put=body=>general.PUT({headers:new Headers({'x-dmp-expected-updated-at':version}),json:async()=>structuredClone(body)});
 result=await put(forged);A.equal(result.status,200);A.deepEqual(data.externalReplacements,saved.externalReplacements);A.deepEqual(data.externalReplacementAudit,saved.externalReplacementAudit);A.deepEqual(data.replacementUsages,saved.replacementUsages);
 forged=structuredClone(data);forged.lessons.push(F.lesson({date:'2026-11-11',status:'COMPLETED',replacementStudentIds:['kid-aluna-teste'],replacementStartTime:'14:30'}));const count=writes;result=await put(forged);A.equal(result.status,409);A.equal(result.body.code,'DUPLICATE');A.equal(writes,count);A.equal(data.lessons.length,0);
 A.equal(connections,releases);A.ok(queries.every(s=>!/(finance|students|google|ds_)/i.test(s)));
 console.log('PASS P36 API: auth/origin, read-only preview, mandatory matching preview/version, row locking, concurrent conflicts, commit/replay/reload, correction/undo and only kids_v1 writes.');
})().catch(e=>{console.error(e);process.exitCode=1;});
