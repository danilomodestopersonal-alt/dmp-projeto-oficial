const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript'),React=require('react');
const root=path.resolve(__dirname,'..'),resolve=Module._resolveFilename,load=Module._load;
let state=[],refs=[],index=0,refIndex=0,effects=[];
Module._resolveFilename=function(r,p,...args){return resolve.call(this,r.startsWith('@/')?path.join(root,r.slice(2)):r,p,...args)};
Module._load=function(r,p,...args){if(r==='react')return {...React,useState(initial){const k=index++;if(!(k in state))state[k]=typeof initial==='function'?initial():initial;return [state[k],v=>state[k]=typeof v==='function'?v(state[k]):v]},useRef(initial){const k=refIndex++;return refs[k]||(refs[k]={current:initial})},useEffect(fn){effects.push(fn)},useMemo:fn=>fn()};if(r.endsWith('.module.css'))return {__esModule:true,default:new Proxy({},{get:(_,k)=>String(k)})};return load.call(this,r,p,...args)};
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(m,f)=>{let code=fs.readFileSync(f,'utf8');if(f.endsWith('KidsPage.tsx'))code+='\nexport {LessonEditor};';m._compile(ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,f)};
let confirms=[];global.window={confirm:msg=>(confirms.push(msg),true),alert:msg=>{throw Error(msg)}};
const Editor=require('../components/kids/KidsPage.tsx').LessonEditor;
const regular={id:'a',name:'Regular',active:true},extra={id:'b',name:'João Reposição',active:true},group={id:'g',name:'Bola Laranja',startTime:'16:00',students:[regular]},lesson={id:'l',classId:'g',date:'2026-10-15',status:'COMPLETED',attendance:{a:'ABSENT'},absenceReplacementRights:{a:true},plannedPlan:'Não perder o rascunho',actualPlan:'Estações',notes:'Notas',objective:'Objetivo',replacementEligible:false,replacementStatus:'NONE',updatedAt:'old'};
let calls=[],release;const props={lesson,group,replacements:[],allStudents:[regular,extra],onClose(){},onSave:async next=>{calls.push(next);await new Promise(r=>release=r)}};
const render=()=>{index=0;refIndex=0;return Editor(props)};
function nodes(n,p){if(!n||typeof n!=='object')return [];if(Array.isArray(n))return n.flatMap(v=>nodes(v,p));return [...(p(n)?[n]:[]),...nodes(n.props?.children,p)]}
const text=n=>!n||typeof n==='boolean'?'':typeof n==='string'||typeof n==='number'?String(n):Array.isArray(n)?n.map(text).join(' '):text(n.props?.children);
const button=(tree,label)=>nodes(tree,n=>n.type==='button'&&text(n)===label)[0];
(async()=>{
 let tree=render();assert(button(tree,'+ Adicionar reposição'),'Chamada regular sem reposição precisa do botão');
 button(tree,'+ Adicionar reposição').props.onClick();tree=render();nodes(tree,n=>n.props?.['aria-label']==='Buscar aluno para reposição')[0].props.onChange({target:{value:'Joao'}});tree=render();
 const add=nodes(tree,n=>n.type==='button'&&/João Reposição\s+· Adicionar/.test(text(n)))[0];assert(add);add.props.onClick();add.props.onClick();tree=render();
 assert(text(tree).includes('Reposição · Presente'));assert(confirms[0].includes('Bola Laranja'));assert(confirms[0].includes('continuará realizada'));
 const save=button(tree,'Salvar aula');save.props.onClick();save.props.onClick();await new Promise(r=>setImmediate(r));assert.equal(calls.length,1);assert.deepEqual(calls[0].replacementStudentIds,['b']);assert.equal(calls[0].attendance.a,'ABSENT');assert.equal(calls[0].absenceReplacementRights.a,true);assert.equal(calls[0].plannedPlan,lesson.plannedPlan);assert.equal(calls[0].status,'COMPLETED');assert(button(render(),'Salvar aula').props.disabled);release();await new Promise(r=>setImmediate(r));
 state=[];refs=[];props.lesson={...lesson,status:'SCHEDULED'};assert(button(render(),'+ Adicionar reposição'));
 state=[];refs=[];props.lesson={...lesson,status:'CANCELLED'};assert(!button(render(),'+ Adicionar reposição'));
 console.log('PASS DMP UI: botão na chamada regular agendada e realizada sem crédito pendente; busca sem acentos, confirmação da ocorrência, rótulo, rascunho/faltas preservados e duplo clique bloqueado. Runtime React controlado.');
})().catch(e=>{console.error(e);process.exitCode=1});
