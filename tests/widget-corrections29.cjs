const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const root=path.resolve(__dirname,'..');
function load(file){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText)(id=>id.startsWith('@/')?load(id.slice(2)+'.ts'):id.startsWith('.')?load(path.posix.join(path.posix.dirname(file),id)+'.ts'):require(id),m,m.exports);return m.exports;}
const {widgetAgenda,widgetV2}=load('lib/widget/v2.ts');
const date='2026-10-15',e={id:'occ',summary:'Rafael Carminatti / Rogério Novelli',start:date+'T05:30:00-03:00',end:date+'T06:30:00-03:00'};
const p=(id,name,records=[])=>({id,name,status:'ACTIVE',sessions:records,workouts:[],assessments:[]});
const record=(source='ABSENCE',overrides={})=>({id:'saved',date,source,calendarEvent:e,...overrides});let count=0;
function test(name,fn){fn();console.log('OK CORRECOES29 '+(++count)+' '+name);}
test('ausência retira aluno da Agenda conforme fluxo oficial',()=>{const students=[p('r','Rafael Carminatti',[record()]),p('n','Rogério Novelli')],before=JSON.stringify(students),a=widgetAgenda(students,[{...e,summary:'Rogério Novelli'}],null,date);assert.deepEqual(a[0].studentIds,['n']);assert.equal(a[0].studentStates[0].state,'pending');assert.equal(JSON.stringify(students),before);});
test('aula removida do Google não é recriada a partir do histórico',()=>assert.deepEqual(widgetAgenda([p('r','Rafael Carminatti',[record()])],[],null,date),[]));
test('contadores conservam ausência salva e colega pendente',()=>{const a=widgetV2([p('r','Rafael Carminatti',[record()]),p('n','Rogério Novelli')],[{...e,summary:'Rogério Novelli'}],null,[],[],new Date(date+'T07:00:00-03:00'));assert.deepEqual([a.programmed,a.attended,a.absent,a.remaining],[2,0,1,1]);});
test('estado por ocorrência diferencia presença, ausência e conflito',()=>{for(const [records,state] of [[[record('ATTENDANCE')],'present'],[[record('ABSENCE')],'absent'],[[record('ATTENDANCE'),record('ABSENCE')],'unknown']])assert.equal(widgetAgenda([p('r','Rafael Carminatti',records)],[{...e,summary:'Rafael Carminatti'}],null,date)[0].studentStates[0].state,state);});
console.log('CORRECOES29: '+count+' testes passaram.');
