process.env.TZ='America/Sao_Paulo';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
const root=path.resolve(__dirname,'..'),resolve=Module._resolveFilename,load=Module._load;
Module._resolveFilename=function(r,p,...a){return resolve.call(this,r.startsWith('@/')?path.join(root,r.slice(2)):r,p,...a)};
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,f);
const rules=require('../lib/kids/chamada-replacement.ts'),balance=require('../lib/kids/replacement-balance.ts');
const student=(id,name)=>({id,name,active:true,startDate:'2026-08-01'});
const base=()=>({version:1,semesterStart:'2026-08-01',semesterEnd:'2026-12-31',classes:[{id:'g',name:'Bola Laranja',weekday:4,startTime:'16:00',endTime:'17:00',category:'ORANGE',teacher:'Danilo',active:true,updatedAt:'old',students:[student('a','Aluno regular')]},{id:'h',name:'Outra turma',weekday:2,startTime:'16:00',endTime:'17:00',category:'ORANGE',teacher:'Danilo',active:true,updatedAt:'old',students:[student('b','Aluno reposição'),student('c','Outra criança')]}],lessons:[{id:'l',classId:'g',date:'2026-10-15',status:'COMPLETED',kind:'REGULAR',attendance:{a:'ABSENT'},absenceReplacementRights:{a:true},objective:'Objetivo salvo',plannedPlan:'Planejamento',actualPlan:'Executado',notes:'Notas',replacementEligible:false,replacementStatus:'NONE',updatedAt:'old'},{id:'future',classId:'g',date:'2026-10-22',status:'SCHEDULED',attendance:{},absenceReplacementRights:{},objective:'',plannedPlan:'',actualPlan:'',notes:'',replacementEligible:false,replacementStatus:'NONE',updatedAt:'old'}],replacements:[],replacementUsages:[],updatedAt:'old'});
let count=0;async function test(name,fn){await fn();console.log('PASS DMP CHAMADA '+(++count)+' '+name)}
let db,version,authorized=true,pending,unlock;
const pool={connect:async()=>({query:async(sql,args)=>{
 if(sql==='BEGIN'){while(pending)await pending;pending=new Promise(r=>unlock=r);return {rows:[]};}
 if(sql==='COMMIT'||sql==='ROLLBACK'){if(unlock){const u=unlock;unlock=null;pending=null;u();}return {rows:[]};}
 if(sql.includes('SELECT payload'))return {rows:[{payload:structuredClone(db),updated_at:version}]};
 if(sql.includes('INSERT INTO dmp_data')){db=JSON.parse(args[1]);version=new Date(Date.parse(version)+1000).toISOString();return {rows:[{updated_at:version}]};}
 throw Error('Unexpected SQL '+sql);
 },release(){}})};
Module._load=function(r,p,...args){if(r==='@/lib/db')return {pool};if(r==='@/lib/auth')return {isAuthorized:async()=>authorized};if(r==='next/server')return {NextResponse:{json:(v,o={})=>({status:o.status||200,json:async()=>v})}};return load.call(this,r,p,...args)};
pool.query=async()=>({rows:[{payload:structuredClone(db),updated_at:version}]});
const api=require('../app/api/kids/route.ts');
const request=(body,expected)=>({json:async()=>structuredClone(body),headers:{get:()=>expected}});
const reset=()=>{db=base();version='2026-10-15T18:00:00.000Z';authorized=true;};

(async()=>{
 await test('turma: API aplica vigência futura sem alterar chamada salva',async()=>{reset();const original=structuredClone(db),next=structuredClone(db);const change={group:{...db.classes[0],name:'Turma futura',weekday:5,startTime:'15:00',endTime:'16:00',students:[...db.classes[0].students,db.classes[1].students[0]],updatedAt:'2026-10-15T20:00:00.000Z'},effectiveFrom:'2026-10-16'};const response=await api.PUT(request({...next,_classChange:change},version));assert.equal(response.status,200);assert(!('_classChange' in db));assert.equal(db.classes[0].history.length,2);assert.deepEqual(db.lessons.find(l=>l.id==='l'),original.lessons[0]);assert.equal(db.classes[0].history[0].value.students.length,1);assert.equal(db.classes[0].history[1].value.students.length,2);});
 await test('salvar turma e aula juntos persiste rascunho na mesma transação',async()=>{reset();const next=structuredClone(db);next.lessons[0].notes='Rascunho da aula';const change={group:{...db.classes[0],name:'Novo nome',updatedAt:'new'},effectiveFrom:'2026-10-16'};const response=await api.PUT(request({...next,_classChange:change},version));assert.equal(response.status,200);assert.equal(db.lessons.find(l=>l.id==='l').notes,'Rascunho da aula');assert.equal(db.classes[0].history[1].value.name,'Novo nome');const {kidsClassChangeConfirmed}=require('../lib/kids/class-history.ts');assert(kidsClassChangeConfirmed(db,change));assert(!kidsClassChangeConfirmed(db,{...change,group:{...change.group,name:'Outro nome'}}));});
 await test('sessão inválida e versão antiga não alteram turma nem chamada',async()=>{reset();const old=structuredClone(db);const change={group:{...db.classes[0],name:'Não gravar'},effectiveFrom:'2026-10-16'};authorized=false;assert.equal((await api.PUT(request({...db,_classChange:change},version))).status,401);authorized=true;assert.equal((await api.PUT(request({...db,_classChange:change},'2026-01-01T00:00:00.000Z'))).status,409);assert.deepEqual(db,old);});
 console.log('KIDS API TURMA: '+count+' cenários aprovados.');
})().catch(e=>{process.stderr.write(String(e.stack||e)+'\n');process.exitCode=1});
