'use strict';
const assert=require('assert/strict'),H=require('./p15-harness.cjs');
const load=H.loader(),M=load('lib/calendar/personal-maintenance.ts'),hol=load('lib/calendar/personal-holidays.ts');
const now='2026-10-26T12:00:00Z';
const students=()=>['Ana Silva','Beto Souza','Clara Oliveira'].map((name,i)=>({id:'s'+i,name,status:'ACTIVE',sessions:[],workouts:[],assessments:[]}));
const time=d=>d+'T10:00:00-03:00',end=d=>d+'T11:00:00-03:00';
const parent=()=>({id:'series',etag:'p1',status:'confirmed',summary:'Ana Silva · Beto Souza',organizer:{self:true},start:{dateTime:time('2026-10-19'),timeZone:'America/Sao_Paulo'},end:{dateTime:end('2026-10-19'),timeZone:'America/Sao_Paulo'},recurrence:['RRULE:FREQ=WEEKLY;WKST=TU'],description:'Não perder',location:'Academia',extendedProperties:{private:{unrelated:'preserve'}}});
const event=(d='2026-11-02')=>({...parent(),id:'instance-'+d,etag:'e'+d,recurrence:undefined,recurringEventId:'series',originalStartTime:{dateTime:time(d)},start:{dateTime:time(d)},end:{dateTime:end(d)},extendedProperties:undefined});
const edit=(ids,from=time('2026-11-02'),scope='following',extra={})=>({op:'old-operation',at:10,from,ids,add:[],remove:['s0','s1'],scope,eventId:'instance-2026-11-02',...extra});
function mergePatch(a,b){const out=structuredClone(a||{});for(const [k,v]of Object.entries(b)){if(v===null)delete out[k];else out[k]=v&&typeof v==='object'&&!Array.isArray(v)?mergePatch(out[k],v):structuredClone(v);}return out;}
function apiFixture(p=parent(),events=[event()],exceptions=[]){
 const map=new Map([p,...events,...exceptions].map(e=>[e.id,structuredClone(e)])),writes=[];let n=0;
 const api={read:async id=>structuredClone(map.get(id)||null),list:async params=>structuredClone(params.singleEvents==='false'?[map.get(p.id),...exceptions.map(e=>map.get(e.id))]:events.map(e=>map.get(e.id)).filter(e=>e.status!=='cancelled')),patch:async(id,body,etag)=>{const e=map.get(id);assert.equal(etag,e.etag);writes.push({id,body:structuredClone(body),etag});const next={...mergePatch(e,body),etag:'updated-'+(++n)};map.set(id,next);return structuredClone(next);}};
 return {map,writes,api};
}
const cmd=(kind='roster',scope='single')=>({kind,scope,id:event().id,etag:event().etag,expected:kind==='repair'?[]:['s0','s1']});
const build=(c,x,s=students())=>M.buildMaintenancePlan(c,s,x.api,hol.defaultHolidayConfig,now);
const journal=p=>({operationId:'operation-12345678',digest:M.maintenanceHash(p),createdAt:now,plan:p,completed:{}});
let n=0;async function test(name,fn){await fn();console.log('PASS P16 '+(++n)+' '+name);}
function dates(rec){const f=Object.fromEntries(rec[0].slice(6).split(';').map(s=>s.split('='))),ex=rec.filter(x=>x.startsWith('EXDATE:')).flatMap(x=>x.slice(7).split(','));return ['2026-10-19','2026-10-26','2026-11-02','2026-11-09','2026-11-16','2026-11-23'].filter((d,i)=>{const stamp=d.replaceAll('-','')+'T130000Z';return (!f.UNTIL||stamp<=f.UNTIL)&&(!f.COUNT||i<+f.COUNT)&&!ex.includes(stamp);});}
(async()=>{
 const p=parent();p.extendedProperties.private.dmpRosterRuleEmpty=JSON.stringify(edit([]));
 const a=event(),b=event('2026-11-09'),unselected=event('2026-11-16');
 const fixture=()=>apiFixture(structuredClone(p),[structuredClone(a),structuredClone(b),structuredClone(unselected)]);
 const command=M.normalizedCommand({kind:'repair-batch',selection:[{id:b.id,etag:b.etag},{id:a.id,etag:a.etag}]});
 await test('seleção explícita, prévia somente leitura, datas e contagem',async()=>{const x=fixture(),plan=await build(command,x);assert.equal(x.writes.length,0);assert.equal(plan.steps.length,2);assert(plan.description.includes('2'));assert(plan.steps.every(s=>s.body.status==='cancelled'&&!s.body.recurrence));assert.deepEqual(plan.steps.map(s=>s.before.id),[a.id,b.id]);});
 await test('mudança de ETag, alunos, propriedade, histórico e compromisso bloqueiam lote inteiro',async()=>{for(const mode of ['etag','students','owner','history','appointment']){const x=fixture(),s=students(),target=x.map.get(b.id);if(mode==='etag')target.etag='changed';if(mode==='students')target.extendedProperties={private:{dmpRosterV1:JSON.stringify(edit(['s2'],time('2026-11-09'),'single',{eventId:b.id,remove:[]}))}};if(mode==='owner')target.organizer={self:false};if(mode==='history')s[0].sessions=[{calendarEvent:{id:b.id}}];if(mode==='appointment')target.summary='Consulta médica';await assert.rejects(()=>build(command,x,s));assert.equal(x.writes.length,0);}});
 await test('falha parcial, retomada idempotente e restauração dos mesmos IDs',async()=>{const x=fixture(),j=journal(await build(command,x)),patch=x.api.patch;let blocked=true;x.api.patch=async(...args)=>{if(blocked&&args[0]===b.id)throw Error('network');return patch(...args);};await assert.rejects(()=>M.executeMaintenance(j,x.api,async()=>{}));assert.equal(Object.keys(j.completed).length,1);blocked=false;await M.executeMaintenance(j,x.api,async()=>{});await M.executeMaintenance(j,x.api,async()=>{});assert.equal(x.writes.length,2);assert.deepEqual(x.map.get(unselected.id),unselected);assert.deepEqual(x.map.get('series'),p);await M.restoreMaintenance(j,x.api,async()=>{});await M.restoreMaintenance(j,x.api,async()=>{});assert.equal(x.writes.length,4);assert.equal(x.map.get(a.id).status,'confirmed');assert.equal(x.map.get(b.id).status,'confirmed');});
 await test('seleção inválida nunca é aceita; ordem não muda identidade',()=>{for(const selection of [[],[{id:a.id,etag:a.etag},{id:a.id,etag:a.etag}],[{id:a.id}],Array.from({length:81},(_,i)=>({id:String(i),etag:'e'}))])assert.throws(()=>M.normalizedCommand({kind:'repair-batch',selection}));assert.deepEqual(M.normalizedCommand({...command,selection:[...command.selection].reverse()}),command);});
 console.log('PASS P17 LOTE: '+n+' grupos, API simulada, nenhum evento real alterado.');
})().catch(e=>{console.error(e);process.exitCode=1;});
