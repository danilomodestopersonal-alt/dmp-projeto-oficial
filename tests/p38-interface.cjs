'use strict';
const A=require('node:assert/strict'),H=require('./p15-harness.cjs'),ts=require('typescript'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
(async()=>{
 const app=H.read('components/DmpApp.tsx'),start=app.indexOf('<div className="students-directory">'),end=app.indexOf('<div className="student-grid',start),head=app.slice(start,end);A.doesNotMatch(head,/Restaurar importação|resetData/);A.match(head,/\+ Novo aluno/);A.doesNotMatch(app,/function resetData\(/);A.match(H.read('components/backup/BackupCenter.tsx'),/<ImportRecovery/);
 const load=H.loader(),Recovery=load('components/backup/ImportRecovery.tsx').default;const html=renderToStaticMarkup(React.createElement(Recovery));A.match(html,/Recuperação/);A.match(html,/Conferir importação de 2026/);A.doesNotMatch(html,/Criar backup e restaurar importação/,'destructive action not visible before preview');
 const src=H.read('components/performance/PerformancePage.tsx'),ast=ts.createSourceFile('page.tsx',src,99,true,4);let fn;function visit(n){if(ts.isFunctionDeclaration(n)&&n.name?.text==='submitActivity')fn=n;ts.forEachChild(n,visit)}visit(ast);A.ok(fn);
 const existing={id:'ride',source:'STRAVA',externalId:'123',gearId:'b12',gearName:'Bicicleta teste',stravaSportType:'Ride',type:'CYCLING',cyclingKind:'MTB',cyclingKindSource:'GEAR',createdAt:'old',powerAverage:220,powerWeighted:235,powerMax:800,heartRateAverage:140,elapsedMinutes:123,maxSpeedKmh:54,description:'Original'};
 let saved;const data={version:1,activities:[existing],goals:[],assessments:[],records:[],gears:[]},activityForm={id:'ride',date:'2026-11-15',type:'CYCLING',cyclingKind:'OTHER',cyclingMode:'MANUAL',title:'Pedalada',distanceKm:'44',durationMinutes:'90',elevationMeters:'450',calories:'600',notes:'Nota editada'};
 const handler=new Function('data','activityForm','persist','automaticCycling','activityGearId',H.compile('const toNumber=v=>v?Number(v):null;const uid=()=>"new";const stopStrengthVoice=()=>{},setStrengthTranscript=()=>{},setModal=()=>{};'+fn.getText(ast)+';return submitActivity;'))(data,activityForm,async n=>{saved=n;return true},load('lib/performance-cycling.ts').automaticCycling,load('lib/performance-cycling.ts').activityGearId);await handler({preventDefault(){}});
 for(const key of ['gearId','gearName','powerAverage','powerWeighted','powerMax','heartRateAverage','elapsedMinutes','maxSpeedKmh','description','externalId','createdAt'])A.equal(saved.activities[0][key],existing[key],key+' preserved during manual edit');A.equal(saved.activities[0].cyclingKind,'OTHER');A.equal(saved.activities[0].cyclingKindSource,'MANUAL');A.equal(saved.activities[0].distanceKm,44);
 const pool={connect:async()=>({release(){},async query(sql,args=[]){
  if(sql.includes('SELECT payload, updated_at'))return {rows:[{payload:data,updated_at:'2026-11-15T10:00:00Z'}]};
  if(sql.includes('INSERT INTO')){saved=JSON.parse(args[1]);return {rows:[{updated_at:'2026-11-15T11:00:00Z'}]};}
  return {rows:[]};
 }})};
 const route=H.loader({'@/lib/auth':{isAuthorized:async()=>true},'@/lib/db':{pool}})('app/api/performance/route.ts');
 const response=await route.PUT({headers:new Headers({'x-dmp-expected-updated-at':'2026-11-15T10:00:00Z'}),json:async()=>({...data,activities:[{id:'ride',source:'STRAVA',type:'CYCLING',cyclingKind:'SPEED'}]})});A.equal(response.status,200);A.equal(saved.activities[0].cyclingKindSource,'MANUAL');A.equal(saved.activities[0].powerAverage,220);A.equal(saved.activities[0].gearId,'b12');
 console.log('PASS P38 interface: student header/action relocation, closed recovery preview, real activity submit keeps metrics and explicit manual source; server preserves legacy client fields.');
})().catch(e=>{console.error(e);process.exitCode=1});
