'use strict';
const assert=require('assert/strict'),fs=require('fs'),path=require('path'),ts=require('typescript'),H=require('./p12-home-kids-harness.cjs');
function route(file,deps){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(path.join(H.root,file),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText)(id=>deps[id]||H.load(id.replace(/^@\//,'')+'.ts'),m,m.exports);return m.exports;}
async function scenario({conflict=false}={}){
 const f=H.fixture();f.lesson.date='2099-10-21';f.request.date=f.lesson.date;f.lesson.status='SCHEDULED';f.lesson.attendance={};
 let data=structuredClone(f.data),version=new Date('2026-10-22T07:44:07.873Z'),writes=0;
 const query=async(sql,args)=>{if(sql.startsWith('SELECT payload'))return{rows:[{payload:structuredClone(data),updated_at:version}]};if(sql.startsWith('UPDATE')){writes++;data=JSON.parse(args[1]);version=new Date(version.getTime()+1);return{rows:[{updated_at:version}]};}return{rows:[]};};
 const deps={'@/lib/db':{pool:{query,connect:async()=>({query,release(){}})}},'@/lib/auth':{isAuthorized:async()=>true},'next/server':{NextResponse:{json:(body,init)=>({status:init?.status||200,body})}}};
 const get=route('app/api/kids/route.ts',deps),post=route('app/api/kids/home-attendance/route.ts',deps);
 const fresh=await get.GET({});if(conflict)version=new Date(version.getTime()+1);
 const command={request:f.request,lessonId:f.lesson.id,studentId:'kid-ana',target:'ABSENT',operationId:'12345678-1234-1234-1234-123456789abc'};
 const r=await post.POST({headers:new Headers({'x-dmp-expected-updated-at':fresh.body.updatedAt}),json:async()=>command});
 if(conflict){assert.equal(r.status,409);assert.equal(writes,0);}else{assert.equal(r.status,200,'GET e POST da mesma versão Date precisam concordar, inclusive milissegundos');assert.equal(writes,1);assert.equal(data.lessons[0].attendance['kid-ana'],'ABSENT');assert.equal(data.lessons[0].status,'SCHEDULED');assert(!data.lessons[0].attendance['kid-bruno']);assert.equal(data.homeAttendanceAudit.length,1);assert.equal(fresh.body.updatedAt,'2026-10-22T07:44:07.873Z');}
}
(async()=>{await scenario();console.log('PASS versão real pg Date: falta antecipada confirmada sem concluir aula');await scenario({conflict:true});console.log('PASS conflito real de 1 ms: 409 sem escrita');})().catch(e=>{console.error(e.message);process.exitCode=1;});
