'use strict';
const A=require('node:assert/strict'),H=require('./p15-harness.cjs'),ts=require('typescript');
const load=H.loader(),home=load('lib/widget/home-source.ts'),M=load('lib/calendar/personal-maintenance.ts'),C=load('lib/students/lifecycle-calendar.ts');
const names=['Felipe Almeida','Felipe Schulhof','Luciana Exemplo','Juliana Colega'];
const students=()=>names.map((name,i)=>({id:'synthetic-'+i,name,status:'ACTIVE',sessions:i===2?[{calendarEvent:{id:'series_20261104T113000Z'}}]:[],workouts:[],assessments:[]}));
const event=(summary,extra={})=>({id:'series_20261118T113000Z',recurringEventId:'series',summary,start:'2026-11-18T08:30:00-03:00',end:'2026-11-18T09:30:00-03:00',...extra});
const rule={op:'synthetic-removal',at:1,from:'2026-11-18T08:30:00-03:00',scope:'following',ids:['synthetic-2','synthetic-3'],add:[],remove:['synthetic-1'],eventId:'series_20261118T113000Z'};
const match=(e,s,maintenance=false)=>home.matchCalendarEvents([e],s,maintenance)[0];
const active=students(),inactive=students();inactive[1].status='ARCHIVED';
const raw=event('Luciana Juliana Felipe Schulhof',{calendarRoster:{rules:[rule]}}),before=JSON.stringify({raw,active,inactive});
for(const maintenance of [false,true]){
 A.deepEqual(match(raw,active,maintenance).matchedStudentIds,['synthetic-2','synthetic-3'],'before inactivation');
 const result=match(raw,inactive,maintenance);
 A.deepEqual(result.matchedStudentIds,['synthetic-2','synthetic-3'],'inactivation must never substitute a namesake');
 A.deepEqual(match(result,inactive,maintenance).matchedStudentIds,['synthetic-2','synthetic-3'],'reloading already projected event');
}
A.equal(JSON.stringify({raw,active,inactive}),before,'no mutation of students, sessions or Google data');
for(const title of ['Aula · Felipe','Aula · Fel','Aula · Felipe Schulhof'])A.deepEqual(match(event(title),inactive).matchedStudentIds,[],title+' cannot become Almeida');
for(const title of ['Aula · Felipe Almeida','Aula · Almeida'])A.deepEqual(match(event(title),inactive).matchedStudentIds,['synthetic-0'],'legitimate Almeida preserved');
const surname=[{...inactive[0],name:'Rafael Teste'},{...inactive[1],name:'João Teste'}];
A.deepEqual(match(event('Aula · Teste'),surname).matchedStudentIds,[],'inactive surname still disambiguates');
const prefix=[{...inactive[0],name:'Gabriel Um'},{...inactive[1],name:'Gabriela Dois'}];
A.deepEqual(match(event('Aula · Gab'),prefix).matchedStudentIds,[],'inactive abbreviated name still disambiguates');
A.deepEqual(match(event('Reunião com Felipe Almeida'),inactive).matchedStudentIds,[],'a name is not lesson evidence');
A.deepEqual(match(event('Aula · Luciana · Juliana'),inactive).matchedStudentIds,['synthetic-2','synthetic-3'],'unambiguous legacy first names preserved');
const single={...rule,scope:'single',ids:['synthetic-0'],remove:[],eventId:raw.id};
A.deepEqual(match({...raw,calendarRoster:{single,rules:[]}},inactive).matchedStudentIds,['synthetic-0'],'explicit selected roster IDs remain authoritative');
const noRoster=event('Luciana Juliana Felipe Schulhof');
const stale={...match(noRoster,active),matchedStudentIds:['synthetic-0','synthetic-2','synthetic-3']};
A.deepEqual(match(stale,inactive).matchedStudentIds,['synthetic-2','synthetic-3'],'stale derived participant IDs do not establish identity');
// Same executable matcher in the Home, full agenda and server/widget source.
function fn(file){const text=H.read(file),ast=ts.createSourceFile(file,text,99,true,file.endsWith('tsx')?4:3);return ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='matchCalendarEvents').getText(ast).replace(/^export /,'');}
A.equal(fn('components/DmpApp.tsx'),fn('lib/widget/home-source.ts'));
console.log('PASS P37B inactive homonym, surname/prefix ambiguity, explicit roster, stale reload, legitimate lessons and web/server parity');
(async()=>{
 const s=students(),parent={id:'series',etag:'p1',status:'confirmed',organizer:{self:true},summary:raw.summary,start:{dateTime:'2026-11-04T08:30:00-03:00'},end:{dateTime:'2026-11-04T09:30:00-03:00'},recurrence:['RRULE:FREQ=WEEKLY']};
 const occurrence={...parent,id:raw.id,recurrence:undefined,recurringEventId:parent.id,start:{dateTime:raw.start},end:{dateTime:raw.end},originalStartTime:{dateTime:raw.start}};
 const api={read:async id=>structuredClone(id===parent.id?parent:occurrence),list:async(p,path)=>structuredClone(path?[occurrence]:[parent]),patch:()=>A.fail('real writes forbidden'),insert:()=>A.fail('real writes forbidden')};
 const plan=await C.buildLifecyclePlan({kind:'pause',studentId:'synthetic-1',from:'2026-11-13',effectiveAt:'2026-11-13T18:22:00Z'},s,['existing-invoice'],api,'2026-11-13T18:22:00Z');
 A.equal(plan.patches.length,1);A.deepEqual(plan.issuedIds,['existing-invoice']);
 const patched={...parent,...plan.patches[0].body};s[1].status='ARCHIVED';
 A.deepEqual(M.mappedPersonal(occurrence,patched,s).matchedStudentIds,['synthetic-2','synthetic-3'],'actual lifecycle-generated removal followed by archived status');
 A.equal(plan.patches[0].body.summary,undefined,'no Google title rewrite');
 A.equal(plan.patches[0].body.recurrence,undefined,'shared series and weeks preserved');
 A.equal(plan.patches[0].body.status,undefined,'shared lesson not cancelled');
 A.ok(!JSON.stringify(plan.patches).includes('synthetic-0'),'no namesake added to inactivation plan');
 // Ambiguity is not a reason to silently omit an affected occurrence from the
 // plan. Full names belonging to another student must not block legitimate work.
 const ambiguousStudents=[{...s[0],status:'ACTIVE'},{...s[1],status:'ARCHIVED'},s[2],s[3]];
 for(const history of [[],[{calendarEvent:{id:'series_20261104T113000Z'}}]]){
  ambiguousStudents[0].sessions=history;
  const p={...parent,summary:'Felipe Luciana'},o={...occurrence,summary:p.summary};
  const uncertain={...api,read:async id=>id===p.id?p:o,list:async(_,path)=>path?[o]:[p]};
  await A.rejects(()=>C.buildLifecyclePlan({kind:'pause',studentId:'synthetic-0',from:'2026-11-13'},ambiguousStudents,[],uncertain,'2026-11-13T18:22:00Z'),/Revise a aula/,'ambiguous short name blocks instead of being skipped');
 }
 const unrelated=await C.buildLifecyclePlan({kind:'pause',studentId:'synthetic-0',from:'2026-11-13'},ambiguousStudents,[],api,'2026-11-13T18:22:00Z');
 A.equal(unrelated.patches.length,0,'Schulhof full name never gives Almeida mutation authority');
 console.log('PASS P37B lifecycle preview/removal + archived state integration; invoices, shared roster and Google recurrence preserved');
})().catch(e=>{console.error(e);process.exitCode=1});
