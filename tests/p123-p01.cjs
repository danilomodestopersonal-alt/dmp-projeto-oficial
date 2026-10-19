const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'components/mercado-pago/MercadoPagoTestPage.tsx'),'utf8');
const tree=ts.createSourceFile('x.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
function fn(name){let found;function visit(n){if(ts.isFunctionDeclaration(n)&&n.name?.text===name)found=n;ts.forEachChild(n,visit);}visit(tree);assert(found,name);return ts.transpileModule(found.getText(tree),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;}
const defaultChoice=new Function('data','currentExpenses',fn('defaultChoice')+';return defaultChoice')({financeContext:{personal:[]}},[]);
let count=0;const test=(name,f)=>{f();console.log('PASS P01 '+(++count)+' '+name);};
const unknown={fingerprint:'a',kind:'OUT',status:'REVIEW',suggestedTarget:'EXTRA',expenseName:'Troca de quarto',description:'PIX antigo',category:'Outros',ruleMode:'SUGGEST'};
test('movimentação desconhecida não herda nome ou sugestão',()=>assert.equal(defaultChoice(unknown).expenseName,''));
test('nova movimentação não compartilha rascunho anterior',()=>{const a=defaultChoice(unknown);a.expenseName='Digitado';assert.equal(defaultChoice({...unknown,fingerprint:'b'}).expenseName,'');});
test('recarga inicia manual vazio',()=>assert.equal(defaultChoice(JSON.parse(JSON.stringify(unknown))).expenseName,''));
test('reconhecida automática conserva descrição e regra',()=>{const c=defaultChoice({...unknown,status:'AUTO_READY',ruleMode:'AUTO'});assert.equal(c.expenseName,'Troca de quarto');assert.equal(c.ruleChoice,'AUTO');});
test('edição histórica conserva descrição existente',()=>assert.equal(defaultChoice({...unknown,status:'PROCESSED'}).expenseName,'Troca de quarto'));
test('trocar destino não reaproveita texto',()=>{let patch;new Function('patchChoice',fn('changeTarget')+';return changeTarget')((move,p)=>patch=p)(unknown,'EXTRA');assert.equal(patch.expenseName,'');assert.equal(patch.target,'EXTRA');});
(async()=>{let error='',requests=0;const run=new Function('choiceFor','financeBusy','setError','fetch',fn('decide')+';return decide')(()=>({...defaultChoice(unknown),expenseName:'  '}),false,x=>error=x,()=>{requests++;});await run(unknown);assert.match(error,/descrição/);assert.equal(requests,0);console.log('PASS P01 '+(++count)+' confirmar vazio não envia lançamento');console.log('P01 TOTAL '+count);})().catch(e=>{console.error(e);process.exitCode=1});
