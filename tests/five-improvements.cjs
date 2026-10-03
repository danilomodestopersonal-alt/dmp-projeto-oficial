const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),crypto=require('node:crypto');
const {restoredNavigation,moveDraftExercise,draftExercisesForReuse}=require('../.operational-tests/lib/navigation');
const {kidsStudentHistory}=require('../.operational-tests/lib/kids/student-history');
const app=fs.readFileSync(path.join(__dirname,'../components/DmpApp.tsx'),'utf8');
let count=0;
const test=async(name,fn)=>{await fn();console.log('OK CINCO '+(++count)+' '+name);};
function compile(source,env={},requireTool=require){
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020}}).outputText;
 const module={exports:{}};new Function('module','exports','require',...Object.keys(env),js)(module,module.exports,requireTool,...Object.values(env));return module.exports;
}
const untilKey='dmp_finance_unlocked_until';
function pinHarness(fetchTool){
 const cells={error:'',pin:'',busy:false,show:true,view:'today'},storage=new Map();
 const source=app.slice(app.indexOf('  async function unlockFinance('),app.indexOf('  if(!navigationReady)return',app.indexOf('  async function unlockFinance(')))+'\nexports.unlock=unlockFinance;';
 const attempt={current:0},submitting={current:false};
 const {unlock}=compile(source,{financePin:'',financeSubmitting:submitting,financeAttempt:attempt,setFinanceBusy:v=>cells.busy=v,setFinancePinError:v=>cells.error=v,setFinancePin:v=>cells.pin=v,setShowFinancePin:v=>cells.show=v,setView:v=>cells.view=v,fetch:(url,options)=>options?.method==="POST"?fetchTool(url,options):Promise.resolve({ok:true,json:async()=>({csrfToken:"test-csrf"})}),sessionStorage:{setItem:(k,v)=>storage.set(k,v)},FINANCE_UNLOCK_KEY:untilKey});
 return {unlock,cells,storage,attempt};
}
function screenHarness(){
 let slots=[],cursor=0,props,used,saved,confirmed=true;
 const jsx=(type,props)=>({type,props:props||{}});
 const source=app.slice(app.indexOf('function HistoricalWorkoutScreen('),app.indexOf('\nfunction assessmentMetric'))+'\nexports.Screen=HistoricalWorkoutScreen;';
 const {Screen}=compile(source,{
 useState:init=>{const i=cursor++;if(!(i in slots))slots[i]=typeof init==='function'?init():init;return [slots[i],v=>slots[i]=typeof v==='function'?v(slots[i]):v];},
 historicalSessionProtocol:()=> 'BISET',historicalSessionSequenceSize:()=>2,
 historicalSessionWorkoutExercises:s=>s.completedExercises.map(e=>({...e})),
 moveDraftExercise,draftExercisesForReuse,workoutProtocolLabel:p=>p==='BISET'?'Bi-set':p,WORKOUT_SLOTS:['A','B','C','D'],formatDate:d=>d,
 detectWorkoutProtocol:s=>/tri/i.test(s)?'TRISET':/bi/i.test(s)?'BISET':null,
 Header:()=>null,crypto,confirm:()=>confirmed,alert:()=>{},
 },n=>n==='react/jsx-runtime'?{jsx,jsxs:jsx}:require(n));
 const ex=(id,name,block)=>({id,name,sets:'3',reps:'12',load:'20 kg',block,notes:''});
 const session={id:'original',date:'2026-09-01',workoutName:'Anterior',completedExercises:[ex('a','Supino'),ex('b','Remada'),ex('c','Prancha','Tri-set A'),ex('d','Agachamento','Tri-set A'),ex('e','Abdominal','Tri-set A')]};
 props={student:{name:'Aluno'},session,onBack:()=>{},onUseToday:s=>used=s,onSaveAsWorkout:async(slot,s,p)=>{saved={slot,session:s,protocol:p};return true;}};
 function render(){cursor=0;return Screen(props);}
 function walk(node,out=[]){if(!node)return out;if(Array.isArray(node)){node.forEach(x=>walk(x,out));return out;}if(typeof node==='object'){out.push(node);walk(node.props?.children,out);}return out;}
 const nodes=()=>walk(render());const text=n=>{const c=n.props?.children;return Array.isArray(c)?c.map(x=>typeof x==='string'?x:'').join(''):c;};
 const button=(name)=>nodes().find(n=>n.type==='button'&&text(n)===name);
 const inputs=()=>nodes().filter(n=>n.type==='input');
 return {render,nodes,inputs,button,session,exercises:()=>slots[0],used:()=>used,saved:()=>saved,setConfirm:v=>confirmed=v};
}
module.exports=(async()=>{
 await test('navegação restaura tela aluno e aba sem restaurar edições',()=>{assert.deepEqual(restoredNavigation({dmpNav:true,view:'student',selectedStudentId:'a',tab:'history'}),{view:'student',selectedStudentId:'a',tab:'history'});assert.equal(restoredNavigation({dmpNav:true,view:'workout-editor'}),null);});
 await test('Home explícita prevalece e rotas inválidas têm fallback',()=>{assert.equal(restoredNavigation({dmpNav:true,view:'kids'},true),null);assert.equal(restoredNavigation({dmpNav:true,view:'unknown'}),null);assert.equal(restoredNavigation({dmpNav:true,view:'student'}),null);assert.equal(restoredNavigation(null),null);});
 await test('abas independentes e tab inválida normalizada',()=>{const a={dmpNav:true,view:'kids'},b={dmpNav:true,view:'students',tab:'invalid'};assert.equal(restoredNavigation(a).view,'kids');assert.equal(restoredNavigation(b).view,'students');assert.equal(restoredNavigation(b).tab,'summary');});
 await test('movimento não muta lista original e respeita limites',()=>{const items=['a','b','c'];assert.deepEqual(moveDraftExercise(items,1,-1),['b','a','c']);assert.deepEqual(items,['a','b','c']);assert.equal(moveDraftExercise(items,0,-1),items);assert.equal(moveDraftExercise(items,2,1),items);});
 const data={version:1,semesterStart:'2026-08-01',semesterEnd:'2026-12-31',classes:[{id:'class',name:'Turma',weekday:2,startTime:'10:00',endTime:'11:00',category:'RED',students:[{id:'child',name:'Criança',active:true,startDate:'2026-08-01'}],active:true}],lessons:[],replacements:[],replacementUsages:[]};
 const lesson=(id,date,extra={})=>({id,classId:'class',date,status:'COMPLETED',attendance:{child:'PRESENT'},updatedAt:'2026-10-01',...extra});
 data.lessons=[lesson('a','2026-09-01'),lesson('b','2026-09-08',{attendance:{child:'ABSENT'}}),lesson('c','2026-09-15',{status:'CANCELLED',replacementEligible:true}),lesson('h','2026-09-22',{status:'HOLIDAY'}),lesson('r','2026-09-09',{kind:'REPLACEMENT',replacementStudentIds:['child'],attendance:{child:'ABSENT'}}),lesson('future','2026-11-01',{kind:'REPLACEMENT',status:'SCHEDULED',replacementStudentIds:['child']})];
 for(const indicator of ['present','absent','pending','replaced','cancelled'])await test('filtro '+indicator+' corresponde exatamente ao card sem alterar créditos',()=>{const before=JSON.stringify(data),model=kidsStudentHistory(data,'child',undefined,undefined,new Date(2026,9,2));assert.equal(model.rows.filter(r=>r.indicator===indicator).length,model.metrics[indicator]);assert.equal(JSON.stringify(data),before);if(indicator==='replaced')assert.ok(model.rows.find(r=>r.indicator==='replaced').title.includes('falta'));});
 await test('feriado e reposição futura fora de filtros realizados',()=>{const m=kidsStudentHistory(data,'child',undefined,undefined,new Date(2026,9,2));assert.equal(m.rows.find(r=>r.id==='lesson:h').indicator,undefined);assert.equal(m.rows.find(r=>r.id==='lesson:future').indicator,undefined);});
 await test('período vazio retorna cards e filtros vazios',()=>{const m=kidsStudentHistory(data,'child','2027-01-01','2027-02-01');assert.ok(Object.values(m.metrics).every(x=>x===0));assert.equal(m.rows.length,0);});
 await test('PIN incompleto não submete',async()=>{let calls=0;const h=pinHarness(async()=>{calls++;});await h.unlock(undefined,'123');assert.equal(calls,0);assert.equal(h.cells.view,'today');});
 await test('PIN válido abre e usa prazo devolvido pelo servidor',async()=>{const h=pinHarness(async()=>({ok:true,json:async()=>({until:123456})}));await h.unlock(undefined,'0000');assert.equal(h.cells.view,'finance');assert.equal(h.cells.show,false);assert.equal(h.storage.get(untilKey),'123456');assert.equal(h.cells.busy,false);});
 await test('PIN incorreto limpa campo e não libera',async()=>{const h=pinHarness(async()=>({ok:false,json:async()=>({message:'PIN incorreto.'})}));await h.unlock(undefined,'0000');assert.equal(h.cells.view,'today');assert.equal(h.storage.size,0);assert.equal(h.cells.error,'PIN incorreto.');assert.equal(h.cells.pin,'');});
 await test('digitação e botão simultâneos enviam uma validação',async()=>{let resolve,calls=0;const h=pinHarness(()=>{calls++;return new Promise(r=>resolve=r);});const pending=h.unlock(undefined,'0000');await h.unlock({preventDefault(){}},'0000');await new Promise(r=>setImmediate(r));assert.equal(calls,1);resolve({ok:true,json:async()=>({until:1})});await pending;});
 await test('fechar modal invalida resposta tardia',async()=>{let resolve;const h=pinHarness(()=>new Promise(r=>resolve=r));const pending=h.unlock(undefined,'0000');await new Promise(r=>setImmediate(r));h.attempt.current++;resolve({ok:true,json:async()=>({until:1})});await pending;assert.equal(h.cells.view,'today');assert.equal(h.storage.size,0);});
 await test('falha de rede permite repetir PIN sem liberar',async()=>{const h=pinHarness(async()=>{throw Error('offline');});await h.unlock(undefined,'0000');assert.equal(h.cells.view,'today');assert.equal(h.cells.busy,false);assert.ok(h.cells.error);});
 const h=screenHarness();h.render();const original=JSON.stringify(h.session);
 await test('cópia inicial preserva bi-set e tri-set explícitos',()=>{assert.equal(h.exercises()[0].block,'Bi-set 1');assert.equal(h.exercises()[1].block,'Bi-set 1');assert.equal(h.exercises()[4].block,'Tri-set A');});
 await test('editar nome séries reps carga observação e grupo altera somente a cópia',()=>{h.inputs().find(n=>n.props['aria-label']==='Exercício do histórico').props.onChange({target:{value:'Supino editado'}});h.inputs().find(n=>n.props['aria-label']==='Séries').props.onChange({target:{value:'4'}});h.inputs().find(n=>n.props['aria-label']==='Repetições').props.onChange({target:{value:'F'}});h.inputs().find(n=>n.props['aria-label']==='Carga').props.onChange({target:{value:'30 kg'}});assert.equal(h.exercises()[0].name,'Supino editado');assert.equal(h.exercises()[0].sets,'4');assert.equal(h.exercises()[0].reps,'F');assert.equal(h.exercises()[0].load,'30 kg');assert.equal(JSON.stringify(h.session),original);});
 await test('adicionar exercício individual e ao grupo funciona',()=>{h.button('Adicionar exercício').props.onClick();assert.equal(h.exercises().length,6);assert.equal(h.exercises()[5].block,'Individual');h.button('Adicionar ao grupo').props.onClick();assert.equal(h.exercises().length,7);assert.equal(h.exercises()[1].block,'Bi-set 1');});
 await test('reordenar exercício de bi-set preserva identidade e grupo',()=>{const node=h.nodes().find(n=>n.type==='button'&&n.props['aria-label']==='Mover Remada para cima');node.props.onClick();assert.equal(h.exercises()[1].id,'b');assert.equal(h.exercises()[1].block,'Bi-set 1');});
 await test('cancelar exclusão mantém exercício',()=>{h.setConfirm(false);const before=h.exercises().length;h.button('Excluir').props.onClick();assert.equal(h.exercises().length,before);h.setConfirm(true);});
 await test('excluir todos integrantes e grupos unitários não cria registros',()=>{const first=h.exercises()[0].id;h.button('Excluir').props.onClick();assert.ok(!h.exercises().some(x=>x.id===first));assert.equal(JSON.stringify(h.session),original);});
 await test('nomes vazios bloqueiam salvar e usar hoje',async()=>{h.button('Usar hoje').props.onClick();await h.button('Salvar como Treino A').props.onClick();assert.equal(h.used(),undefined);assert.equal(h.saved(),undefined);});
 await test('Usar hoje recebe somente edição e não modifica histórico',()=>{while(h.exercises().some(e=>!e.name.trim())){const input=h.inputs().find(n=>n.props['aria-label']==='Exercício do histórico'&&!n.props.value);input.props.onChange({target:{value:'Novo exercício'}});}h.button('Usar hoje').props.onClick();assert.equal(h.used().completedExercises.length,h.exercises().length);assert.equal(JSON.stringify(h.session),original);assert.ok(h.used().completedExercises.some(e=>e.block?.startsWith('Individual ')));});
 await test('salvar ficha deliberada envia slot escolhido e cópia independente',async()=>{await h.button('Salvar como Treino C').props.onClick();assert.equal(h.saved().slot,'C');assert.equal(h.saved().protocol,'MIXED');h.used().completedExercises[0].name='mudança posterior na cópia';assert.notEqual(h.exercises()[0].name,'mudança posterior na cópia');assert.equal(JSON.stringify(h.session),original);});
 await test('logo global tem destino Home e Voltar independente',()=>{const header=app.slice(app.indexOf('function Header('),app.indexOf('function looksLikeTrainingSchedule'));assert.match(header,/href="\/app\?home=1"/);assert.match(header,/onClick=\{back\}/);assert.match(app,/onNavigate\("today"\)/);assert.match(fs.readFileSync(path.join(__dirname,'../app/login/page.tsx'),'utf8'),/href="\/app\?home=1"/);});
 // Exact production API, real hash comparison; injected credential digest only in isolated tests.
 let authorized=true,valid=true,payloads=new Map(),txBackup;
 const query=async(sql,args=[])=>{if(sql==='BEGIN'){txBackup=new Map(payloads);return {rows:[]};}if(sql==='ROLLBACK'){payloads=txBackup;return {rows:[]};}if(sql==='COMMIT')return {rows:[]};if(sql.startsWith('INSERT')){if(!payloads.has(args[0]))payloads.set(args[0],JSON.parse(args[1]));return {rows:[]};}if(sql.startsWith('UPDATE')){payloads.set(args[0],JSON.parse(args[1]));return {rows:[]};}return {rows:payloads.has(args[0])?[{payload:payloads.get(args[0])}]:[]};};
 const route=fs.readFileSync(path.join(__dirname,'../app/api/finance/pin/route.ts'),'utf8');
 const pinHash=route.match(/PIN_HASH="([a-f0-9]+)"/)[1];
 const api=compile(route,{},name=>name==='@/lib/auth'?{isAuthorized:async()=>authorized}:name==='@/lib/db'?{pool:{query,connect:async()=>({query,release(){}})}}:name==='next/server'?{NextResponse:{json:(body,options={})=>({body,status:options.status||200,headers:options.headers})}}:name==='node:crypto'?{...crypto,createHash:algo=>{let value;return {update(v){value=v;return this;},digest(format){if(/^\d{4}$/.test(value))return Buffer.from(valid?pinHash:'0'.repeat(64),'hex');return crypto.createHash(algo).update(value).digest(format);}};}}:require(name));
 const request=(pin='0000',token='session-a')=>({cookies:{get:()=>({value:token})},headers:{get:n=>n==='x-dmp-finance-csrf'?crypto.createHash('sha256').update('dmp_finance_csrf_v1:'+token).digest('hex'):null},json:async()=>({pin})});
 await test('servidor bloqueia sessão inválida sem ler dados',async()=>{authorized=false;assert.equal((await api.POST(request())).status,401);assert.equal((await api.GET(request())).status,401);assert.equal(payloads.size,0);authorized=true;});
 await test('servidor rejeita PIN incompleto e formato inválido',async()=>{for(const p of ['1','abc',null,1234])assert.equal((await api.POST(request(p))).status,400);assert.equal(payloads.size,0);});
 await test('servidor confirma digest e libera exatamente dez minutos',async()=>{const now=Date.now(),result=await api.POST(request());assert.equal(result.status,200);assert.ok(result.body.until>=now+600000&&result.body.until<=Date.now()+600000);const state=await api.GET(request());assert.equal(state.body.unlocked,true);assert.equal(state.headers['Cache-Control'],'no-store');});
 await test('servidor respeita expiração e sessão independente',async()=>{assert.equal((await api.GET(request('0000','session-b'))).body.unlocked,false);for(const [k,v]of payloads)payloads.set(k,{...v,until:Date.now()-1});assert.equal((await api.GET(request())).body.unlocked,false);});
 await test('PIN incorreto não libera e cinco tentativas geram pausa temporária',async()=>{valid=false;for(let i=0;i<5;i++)assert.equal((await api.POST(request())).status,403);assert.equal((await api.POST(request())).status,429);assert.equal((await api.GET(request())).body.unlocked,false);});
 await test('depois da pausa nova tentativa válida limpa bloqueio',async()=>{for(const [k,v]of payloads)payloads.set(k,{...v,blockedUntil:Date.now()-1});valid=true;assert.equal((await api.POST(request())).status,200);assert.equal([...payloads.values()][0].attempts,0);});

 const sourceFile=ts.createSourceFile('DmpApp.tsx',app,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 let main;for(const node of sourceFile.statements)if(ts.isFunctionDeclaration(node)&&node.name?.text==='DmpApp')main=node;
 const effects=main.body.statements.filter(n=>ts.isExpressionStatement(n)&&ts.isCallExpression(n.expression)&&n.expression.expression.getText(sourceFile)==='useEffect').map(n=>n.getText(sourceFile));
 const restoreEffect=effects.find(s=>s.includes('const saved=restoredNavigation'));
 const snapshotEffect=effects.find(s=>s.includes('const snapshot={dmpNav:true'));
 function navHarness(initial,search='',fetchTool=async()=>({ok:true,json:async()=>({unlocked:false})})){
   const cells={view:'today',tab:'summary',selectedStudentId:null,navigationReady:false,showFinancePin:false,search:'',studentFilter:'ACTIVE',historySearch:'',historySource:'ALL',historyPeriod:'ALL',calendarRange:'week',calendarAnchor:'2026-10-02'};
   const history={state:initial,replaceState(next){this.state=next;},pushState(next){this.state=next;}};
   const storage=new Map(),env={window:{history,location:{search,href:'/app'}},fetch:fetchTool,restoredNavigation,URLSearchParams,sessionStorage:{setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},FINANCE_UNLOCK_KEY:untilKey};
   for(const key of Object.keys(cells))env['set'+key[0].toUpperCase()+key.slice(1)]=v=>cells[key]=v;
   const runEffect=code=>compile(code,{...env,...cells,useEffect:fn=>fn(),browserHistoryReady:{current:false},browserBackRestoring:{current:false}});
   return {cells,history,storage,restore:()=>runEffect(restoreEffect),persist:()=>runEffect(snapshotEffect)};
 }
 await test('efeito real de refresh conserva aluno, aba e filtros antes de gravar histórico',async()=>{const nav=navHarness({dmpNav:true,view:'student',tab:'history',selectedStudentId:'id',dmpQueries:{historyPeriod:'30',historySearch:'Supino'}});nav.restore();nav.persist();assert.equal(nav.cells.view,'student');assert.equal(nav.history.state.view,'student');assert.equal(nav.history.state.tab,'history');assert.equal(nav.history.state.dmpQueries.historyPeriod,'30');assert.equal(nav.history.state.dmpQueries.historySearch,'Supino');});
 await test('refresh financeiro aguarda servidor sem sobrescrever intenção',async()=>{let resolve;const initial={dmpNav:true,view:'finance',dmpFinanceQuery:{tab:'ds',competence:'2026-09'}};const nav=navHarness(initial,'',()=>new Promise(r=>resolve=r));nav.restore();nav.persist();assert.equal(nav.history.state,initial);assert.equal(nav.cells.navigationReady,false);resolve({ok:true,json:async()=>({unlocked:true,until:Date.now()+600000})});await new Promise(r=>setImmediate(r));nav.persist();assert.equal(nav.cells.view,'finance');assert.equal(nav.history.state.dmpFinanceQuery.tab,'ds');assert.ok(nav.storage.get(untilKey));});
 await test('refresh com prazo expirado pede PIN e preserva intenção após novo refresh',async()=>{const nav=navHarness({dmpNav:true,view:'finance',dmpFinanceQuery:{tab:'personal'}});nav.restore();await new Promise(r=>setImmediate(r));nav.persist();assert.equal(nav.cells.view,'today');assert.equal(nav.cells.showFinancePin,true);assert.equal(nav.history.state.dmpFinancePending,true);const again=navHarness(nav.history.state);again.restore();await new Promise(r=>setImmediate(r));assert.equal(again.cells.showFinancePin,true);});
 await test('logo Home limpa intenção protegida e estado anterior',()=>{const nav=navHarness({dmpNav:true,view:'finance',dmpFinancePending:true},'?home=1',()=>{throw Error('não deveria validar destino Home');});nav.restore();nav.persist();assert.equal(nav.cells.view,'today');assert.equal(nav.cells.showFinancePin,false);assert.equal(nav.history.state.dmpFinancePending,false);});
 await test('refresh não restaura modais transitórios nem cruza abas',()=>{const a=navHarness({dmpNav:true,view:'students',showStudentForm:true}),b=navHarness({dmpNav:true,view:'agenda'});a.restore();b.restore();a.persist();b.persist();assert.equal(a.history.state.view,'students');assert.equal(b.history.state.view,'agenda');assert.ok(!('showStudentForm' in a.cells));});
 await test('persistência financeira não armazena pagamentos PIN nem modal',()=>{const text=fs.readFileSync(path.join(__dirname,'../components/financeiro/FinanceiroPage.tsx'),'utf8');assert.match(text,/dmpFinanceQuery:\{tab,filter:listFilter,competence\}/);assert.match(text,/data\.competences\[saved\.competence\]/);assert.ok(!text.includes('dmpFinanceQuery:{pin'));});
 await test('sequências não contíguas não voltam a se fundir na ficha salva',()=>{const input=[{id:'a',block:'Bi-set A'},{id:'b',block:'Bi-set A'},{id:'c',block:'Individual'},{id:'d',block:'Bi-set A'},{id:'e',block:'Bi-set A'}];const result=draftExercisesForReuse(input);assert.equal(result[0].block,result[1].block);assert.equal(result[3].block,result[4].block);assert.notEqual(result[0].block,result[3].block);assert.equal(input[3].block,'Bi-set A');});
 await test('grupo vazio e unitário normalizados sem exercícios artificiais',()=>{assert.deepEqual(draftExercisesForReuse([]),[]);assert.equal(draftExercisesForReuse([{block:'Tri-set A',id:'a'}])[0].block,'Individual 1');});
 await test('bi-set com três e tri-set com dois recebem identificação correta',()=>{assert.equal(draftExercisesForReuse([{block:'Bi-set A'},{block:'Bi-set A'},{block:'Bi-set A'}])[0].block,'Tri-set A');assert.equal(draftExercisesForReuse([{block:'Tri-set A'},{block:'Tri-set A'}])[0].block,'Bi-set A');});

 await test('cards reais selecionam trocam e removem filtro mantendo totais',()=>{
   const source=fs.readFileSync(path.join(__dirname,'../components/kids/KidsPage.tsx'),'utf8');
   const start=source.indexOf('<div className={styles.studentHistoryMetrics}>'),end=source.indexOf('</div>',start)+6;
   let filter=null;
   const jsx=(type,props)=>({type,props});
   const render=()=>compile('exports.Render=()=>('+source.slice(start,end)+');',{styles:{studentHistoryMetrics:'metrics'},historyFilter:filter,present:9,absent:4,studentHistory:{metrics:{pending:0,replaced:2,cancelled:4}},setHistoryFilter:v=>filter=typeof v==='function'?v(filter):v},n=>n==='react/jsx-runtime'?{jsx,jsxs:jsx}:require(n)).Render().props.children;
   let cards=render();assert.equal(cards.length,5);cards[0].props.onClick();assert.equal(filter,'present');assert.equal(render()[0].props['aria-pressed'],true);
   render()[1].props.onClick();assert.equal(filter,'absent');render()[1].props.onClick();assert.equal(filter,null);
   render()[2].props.onClick();assert.equal(filter,'pending');assert.equal(render()[0].props.children[1].props.children,9);assert.equal(render()[2].props.children[1].props.children,0);
 });
 console.log(count+' testes das cinco melhorias passaram.');
})();
