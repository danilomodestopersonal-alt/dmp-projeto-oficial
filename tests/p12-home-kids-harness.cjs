const fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),React=require('react'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..');
function load(file,cache=new Map()){
 if(cache.has(file))return cache.get(file);const m={exports:{}};
 const code=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 new Function('require','module','exports',code)(id=>{
  if(id==='react')return {...React,useRef:value=>({current:value}),useState:value=>[value,()=>{}]};
  if(id.endsWith('.css'))return {default:new Proxy({},{get:(_,k)=>'p12_'+String(k)})};
  if(id.startsWith('@/')||id.startsWith('.')){const f=id.startsWith('@/')?id.slice(2):path.posix.join(path.posix.dirname(file),id);return load(fs.existsSync(path.join(root,f+'.tsx'))?f+'.tsx':f+'.ts',cache);}
  return require(id);
 },m,m.exports);cache.set(file,m.exports);return m.exports;
}
const moduleSource=fs.readFileSync(path.join(root,'components/DmpApp.tsx'),'utf8');
const baseSource=cp.execFileSync('git',['show','c7433782b323d91cefaefb032fd3f3584efbf85c:components/DmpApp.tsx'],{cwd:root,encoding:'utf8',maxBuffer:8*1024*1024});
function panel(source){
 const ast=ts.createSourceFile('app.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const fn=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='CalendarTodayPanel').getText(ast);
 const deps={...load('lib/widget/home-source.ts'),kidsCalendarRequest:e=>e.kidsLesson||load('lib/widget/home-source.ts').kidsCalendarRequest(e),HomeKidsLessonCard:load('components/home/HomeKidsLessonCard.tsx').default,HomeStudentActions:load('components/HomeStudentActions.tsx').default,LastPresence:()=>React.createElement('span',null,'Última presença'),formatCalendarTime:e=>e.start.slice(11,16),formatSyncTime:()=> '10:00',formatDate:x=>x,calendarEventStatus:()=> 'Agendado',getStudentWorkoutEntries:s=>s.workouts||[],completedWorkoutStatusLabel:()=> 'Treino realizado'};
 const code=ts.transpileModule(fn+'\nexport default CalendarTodayPanel;',{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const m={exports:{}};new Function('require','module','exports',...Object.keys(deps),code)(require,m,m.exports,...Object.values(deps));return m.exports.default;
}
const date='2026-10-21',time='16:00';
function fixture(){
 const students=[{id:'kid-ana',name:'Ana Silva',active:true},{id:'kid-bruno',name:'Bruno Oliveira',active:true},{id:'kid-carolina',name:'Carolina Martins',active:true}];
 const group={id:'class-orange',name:'Turma laranja de quarta',category:'ORANGE',weekday:3,startTime:time,endTime:'17:00',teacher:'Danilo Modesto',students,active:true,updatedAt:date};
 const lesson={id:'lesson-orange',classId:group.id,date,status:'COMPLETED',attendance:{'kid-ana':'PRESENT','kid-bruno':'ABSENT'},objective:'',plannedPlan:'',actualPlan:'',notes:'',replacementEligible:false,replacementStatus:'NONE',updatedAt:date};
 const data={version:1,classes:[group],lessons:[lesson],semesterStart:'2026-08-03',semesterEnd:'2026-12-19',updatedAt:date};
 const event={id:'google-orange',summary:'Bola Laranja',start:date+'T16:00:00-03:00',end:date+'T17:00:00-03:00'};
 return {data,group,lesson,event,request:{date,time,category:'ORANGE'}};
}
const personal=()=>({id:'personal',summary:'Aluna Personal',start:date+'T10:00:00-03:00',end:date+'T11:00:00-03:00',matchedStudentIds:['p1']});
function panelProps(){const f=fixture();return{kidsData:f.data,onKidsData(){},status:{configured:true,connected:true},events:[personal(),f.event],loading:false,sync:{dailyAt:'x',weeklyAt:'',weeklyCount:0},students:[{id:'p1',name:'Aluna Personal',status:'ACTIVE',workouts:[],assessments:[],sessions:[],phone:'19999990000'}],todaySessions:[],onOpenAgenda(){},onOpenStudent(){},onStartStudent(){},onAbsence(){},onOpenKids(){}};}
function expand(node){if(node==null||typeof node==='boolean')return null;if(Array.isArray(node))return node.map(expand);if(typeof node!=='object')return node;if(typeof node.type==='function')return expand(node.type(node.props));if(node.type===React.Fragment)return expand(node.props.children);return{type:node.type,props:{...node.props,children:expand(node.props.children)}};}
function nodes(tree,predicate){const result=[];function visit(n){if(Array.isArray(n))return n.forEach(visit);if(n&&typeof n==='object'){if(predicate(n))result.push(n);visit(n.props?.children);}}visit(tree);return result;}
module.exports={root,load,React,moduleSource,baseSource,panel,fixture,personal,panelProps,expand,nodes};
