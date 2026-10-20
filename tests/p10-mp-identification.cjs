'use strict';
const fs=require('fs'),path=require('path'),cp=require('child_process'),ts=require('typescript'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..'),base='feab1f33ae90a9b68f885f852a2518cc562601ca';
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const original=f=>cp.execFileSync('git',['show',base+':'+f],{cwd:root,encoding:'utf8',maxBuffer:32000000});
const compiler=code=>ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
function loader(overrides={}){
  const cache=new Map();
  function load(file,source){
    if(!source&&cache.has(file))return cache.get(file);
    const m={exports:{}};cache.set(file,m.exports);
    const req=id=>{
      if(Object.hasOwn(overrides,id))return overrides[id];
      if(id.endsWith('.module.css'))return new Proxy({},{get:(_,key)=>String(key)});
      if(id.startsWith('@/'))return load(id.slice(2)+'.ts');
      if(id.startsWith('.')){const p=path.join(path.dirname(file),id);return load(fs.existsSync(path.join(root,p+'.ts'))?p+'.ts':p+'.tsx');}
      return require(id);
    };
    new Function('require','module','exports','fetch',compiler(source||read(file)))(req,m,m.exports,()=>{throw Error('NETWORK FORBIDDEN');});
    cache.set(file,m.exports);return m.exports;
  }
  return load;
}
const lib=loader(),{reportOutgoingIdentity:identify,outgoingIdentityHint:hint}=lib('lib/mercado-pago/outgoing-identity.ts');
const {expenseOptionsForPayment}=lib('lib/mercado-pago/expense-options.ts');
function route(source){
  const forbidden=()=>{throw Error('DATABASE FORBIDDEN');};
  return loader({'@/lib/db':{pool:{query:forbidden,connect:forbidden}},'@/lib/auth':{isAuthorized:async()=>false},'next/server':{NextResponse:{}}})('app/api/mercado-pago/route.ts',source+'\nexports.probe={emptyState,unifiedMovements,applyToFinance};').probe;
}
const api=route(read('app/api/mercado-pago/route.ts')),prior=route(original('app/api/mercado-pago/route.ts'));
const out=(overrides={})=>({SOURCE_ID:'synthetic-p10',TRANSACTION_DATE:'2026-10-20T11:37:12-03:00',TRANSACTION_TYPE:'PAYOUTS',SETTLEMENT_NET_AMOUNT:'-56.85',TRANSACTION_AMOUNT:'-56.85',METADATA:'{}',...overrides});
const release=(overrides={})=>({SOURCE_ID:'synthetic-p10',DATE:'2026-10-20T11:37:12-03:00',RECORD_TYPE:'release',DESCRIPTION:'payout',NET_DEBIT_AMOUNT:'56.85',NET_CREDIT_AMOUNT:'0',METADATA:'{}',...overrides});
let count=0;function test(name,fn){fn();console.log('PASS P10 '+(++count)+' '+name);}
test('PIX real anonimizado: colunas vazias e METADATA {} nao inventam nome',()=>{const r=out({SALE_DETAIL:'',STORE_NAME:'',POS_NAME:'',DESCRIPTION:'',PAYMENT_METHOD_TYPE:'',PAYMENT_METHOD:''});assert.equal(identify(r),undefined);assert.match(hint(undefined),/não informado/);});
test('receiver_name recebido aparece com origem explicita',()=>{assert.deepEqual(identify(out({METADATA:'{"receiver_name":"Destinatária Teste"}'})),{label:'Destinatária Teste',kind:'name',source:'METADATA'});});
test('nomes estruturados de recebedor e estabelecimento sao reconhecidos',()=>{for(const metadata of [{receiver:{first_name:'Pessoa',last_name:'Teste'}},{merchant:{name:'Loja Teste'}},{beneficiary_name:'Beneficiário Teste'}])assert.equal(identify(out({METADATA:JSON.stringify(metadata)})).kind,'name');});
test('pagador remetente titular e nomes genericos nao viram destinatario',()=>{for(const metadata of [{payer_name:'Dono Teste'},{sender_name:'Dono Teste'},{account_holder_name:'Dono Teste'},{payer:{name:'Dono Teste',receiver_name:'Dono Teste'}},{receiver_name:'PIX/transferência enviada'},{name:'Dono Teste'}])assert.equal(identify(out({METADATA:JSON.stringify(metadata)})),undefined);});
test('metadados conflitantes malformados ou extensos nao inventam identidade',()=>{for(const raw of ['not-json','null','{"receiver_name":"Pessoa A","beneficiary_name":"Pessoa B"}',' '.repeat(200001)])assert.equal(identify(out({METADATA:raw})),undefined);});
test('debito com estabelecimento e sem estabelecimento',()=>{assert.equal(identify(out({TRANSACTION_TYPE:'SETTLEMENT',PAYMENT_METHOD_TYPE:'debit_card',STORE_NAME:'Loja de Teste'})).label,'Loja de Teste');assert.equal(identify(out({TRANSACTION_TYPE:'SETTLEMENT',PAYMENT_METHOD_TYPE:'debit_card'})),undefined);});
test('SALE_DETAIL real anonimizado preserva descricao sem chama-la nome comprovado',()=>{const result=identify(out({TRANSACTION_TYPE:'SETTLEMENT',PAYMENT_METHOD_TYPE:'available_money',SALE_DETAIL:'Estabelecimento de Teste',METADATA:'[{}]'}));assert.equal(result.label,'Estabelecimento de Teste');assert.equal(result.kind,'description');assert.match(hint(result),/Descrição fornecida/);});
test('relatorio complementar so fornece nome com mesma referencia data direcao e centavos',()=>{const good=release({METADATA:'{"receiver_name":"Pessoa Correta"}'});assert.equal(identify(out(),good).label,'Pessoa Correta');for(const changes of [{SOURCE_ID:'outra'},{DATE:'2026-10-19'},{NET_DEBIT_AMOUNT:'56.86'},{NET_DEBIT_AMOUNT:'0',NET_CREDIT_AMOUNT:'56.85'}])assert.equal(identify(out(),{...good,...changes}),undefined);});
test('numero de conta nunca e apresentado como nome',()=>{assert.equal(identify(out({PAYOUT_BANK_ACCOUNT_NUMBER:'123456789'})),undefined);assert.equal(identify(out({METADATA:'{"receiver_name":"123456789"}'})),undefined);});
test('nome proprio nao e substituido por outro registro',()=>{assert.equal(identify(out({STORE_NAME:'Loja A'}),release({METADATA:'{"receiver_name":"Pessoa B"}'})).label,'Loja A');});

const cases=[out(),out({METADATA:'{"receiver_name":"Pessoa Nova"}'}),out({SOURCE_ID:'',METADATA:'{"receiver_name":"Pessoa sem ID"}'}),out({TRANSACTION_TYPE:'SETTLEMENT',STORE_NAME:'Supermercado Teste'}),out({TRANSACTION_DATE:'2026-09-01',SALE_DETAIL:'Nome Histórico'}),out({SETTLEMENT_NET_AMOUNT:'56.85',TRANSACTION_AMOUNT:'56.85',TRANSACTION_TYPE:'SETTLEMENT',PAYMENT_METHOD_TYPE:'bank_transfer'})];
test('comparacao com LIVE preserva todos os campos financeiros e de automacao',()=>{
  for(const row of cases){
    const state=api.emptyState(),before=JSON.stringify(state);
    state.rules['OUT:generic:pix transferencia enviada']={key:'OUT:generic:pix transferencia enviada',kind:'OUT',label:'PIX/transferência enviada',target:'EXPENSE',targetName:'Mochila',mode:'SUGGEST',approvals:1,createdAt:'2026-10-15',updatedAt:'2026-10-15'};
    const expected=prior.unifiedMovements([row],[],structuredClone(state));
    const actual=api.unifiedMovements([row],[],structuredClone(state));
    assert.deepEqual(actual.map(({outgoingIdentity,...rest})=>rest),expected);
    assert.equal(JSON.stringify(api.emptyState()),before);
  }
});
test('decisoes antigas nomes manuais categorias vinculos aliases e regra AUTO preservados',()=>{
  const rows=[out({STORE_NAME:'Loja Antiga'})],state=api.emptyState();
  const move=prior.unifiedMovements(rows,[],state)[0];
  state.rules['OUT:merchant:loja antiga']={key:'OUT:merchant:loja antiga',label:'Loja Antiga',kind:'OUT',target:'EXTRA',category:'Compras',expenseName:'Descricao autorizada',mode:'AUTO',approvals:2,createdAt:'2026-10-01',updatedAt:'2026-10-01'};
  assert.equal(api.unifiedMovements(rows,[],state)[0].status,'AUTO_READY');
  state.decisions[move.fingerprint]={fingerprint:move.fingerprint,target:'EXTRA',expenseName:'Nome Original',targetName:'Nome Original',category:'Compras',financeEntityId:'pagamento-original',automatic:true,updatedAt:'2026-10-19'};
  const before=structuredClone(state);const result=api.unifiedMovements(rows,[],state).map(({outgoingIdentity,...rest})=>rest);
  assert.deepEqual(result,prior.unifiedMovements(rows,[],before));assert.deepEqual(state,before);
});
test('refresh e linhas repetidas mantem fingerprint deduplicacao e identidade por referencia',()=>{const a=out({METADATA:'{"receiver_name":"Pessoa A"}'}),b=out({SOURCE_ID:'synthetic-other',METADATA:'{"receiver_name":"Pessoa B"}'});const first=api.unifiedMovements([a,b,a],[],api.emptyState());assert.equal(first.length,2);assert.deepEqual(api.unifiedMovements([a,b,a],[],api.emptyState()),first);assert.equal(first.find(m=>m.sourceId==='synthetic-other').outgoingIdentity.label,'Pessoa B');});
test('payout do relatorio complementar exibe nome sem modificar descricao e fingerprint',()=>{const r=release({METADATA:'{"receiver_name":"Pessoa Release"}'});const current=api.unifiedMovements([],[r],api.emptyState());assert.equal(current[0].outgoingIdentity.label,'Pessoa Release');assert.deepEqual(current.map(({outgoingIdentity,...rest})=>rest),prior.unifiedMovements([],[r],prior.emptyState()));});

function suggest(expenses,date,name){const choice=defaultChoice(expenses,{suggestedTarget:'EXPENSE',suggestedTargetName:name,status:'REVIEW',dateKey:date});return expenses.find(e=>e.id===choice.targetId);}
const expense=(id,month,remaining=0)=>({id,name:'Mochila',competence:month,remaining,closed:false});
test('todas as contas Mochila quitadas deixam selecao inicial vazia',()=>{assert.equal(suggest([expense('a','2026-08'),expense('s','2026-09'),expense('o','2026-10')],'2026-10-20','Mochila'),undefined);});
test('uma unica conta elegivel e sugerida; duas competencias exigem escolha',()=>{assert.equal(suggest([expense('a','2026-08'),expense('o','2026-10',140)],'2026-10-20','Mochila').id,'o');assert.equal(suggest([expense('s','2026-09',140),expense('o','2026-10',140)],'2026-10-20','Mochila'),undefined);});
test('filtro preserva contas anteriores fechadas e exclui quitadas futuras e atuais fechadas',()=>{assert.deepEqual(expenseOptionsForPayment([{...expense('old','2026-09',0.01),closed:true},{...expense('closed','2026-10',140),closed:true},expense('future','2026-11',140),expense('paid','2026-10')],'2026-10-20').map(e=>e.id),['old']);});
function defaultChoice(expenses,move){
  const ast=ts.createSourceFile('ui.tsx',read('components/mercado-pago/MercadoPagoTestPage.tsx'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let fn;
  function visit(n){if(ts.isFunctionDeclaration(n)&&n.name?.text==='defaultChoice')fn=n.getText(ast);ts.forEachChild(n,visit);}visit(ast);
  return new Function('currentExpenses','data','expenseOptionsForPayment',compiler(fn+'\nreturn defaultChoice;'))(expenses,null,expenseOptionsForPayment)(move);
}
test('funcao real da UI nao reaproveita descricao antiga na revisao nem seleciona saldo zero',()=>{const move={suggestedTarget:'EXPENSE',suggestedTargetName:'Mochila',status:'REVIEW',description:'PIX/transferência enviada',expenseName:'Nome Antigo',dateKey:'2026-10-20'};const choice=defaultChoice([expense('paid','2026-08')],move);assert.equal(choice.targetId,'');assert.deepEqual(choice.expenseSplits,[]);assert.equal(choice.expenseName,'');const late=defaultChoice([expense('late','2026-09',140)],{...move,ruleMode:'AUTO'});assert.equal(late.ruleChoice,'ONCE');assert.equal(late.targetId,'late');});
test('servidor continua bloqueando baixa de conta quitada',()=>{const data={version:1,competences:{'2026-10':{status:'OPEN'}},expenses:[{id:'paid',name:'Mochila',competence:'2026-10',expectedAmount:140,payments:[{id:'old',amount:140}]}]};const m=api.unifiedMovements([out()],[],api.emptyState())[0];const before=JSON.stringify(data);const result=api.applyToFinance(data,m,'EXPENSE',{targetId:'paid'});assert.equal(result.ok,false);assert.match(result.error,/quitada/);assert.equal(JSON.stringify(data),before);});

function renderMovement(move){
  const data={connected:true,needsSetup:false,configured:{settlement:true,release:true},configurationOptimized:true,pending:false,balance:null,lastSync:null,movements:[move],counts:{},reports:{},financeContext:{competence:'2026-10',categories:['Outros'],personal:[],expenses:[]},learnedRules:[],learnedRuleCount:0};
  let index=0;const hooks={...React,useState:init=>{const n=index++;return [n===0?data:n===3?false:(typeof init==='function'?init():init),()=>{}];},useEffect:()=>{},useMemo:f=>f(),useRef:v=>({current:v})};
  const Component=loader({react:hooks})('components/mercado-pago/MercadoPagoTestPage.tsx').default;
  return renderToStaticMarkup(React.createElement(Component,{}));
}
test('JSX real mostra destinatario fornecido e mantem descricao manual vazia',()=>{const m=api.unifiedMovements([out({METADATA:'{"receiver_name":"Recebedor visível"}'})],[],api.emptyState())[0];const html=renderMovement(m);assert.match(html,/<strong>Recebedor visível<\/strong>/);assert.match(html,/Identificação fornecida pelo Mercado Pago/);assert.match(html,/placeholder="Ex.: Cachorro-quente" value=""/);});
test('JSX real sem nome exibe aviso neutro sem nome aprendido como recebedor',()=>{const state=api.emptyState();state.rules['OUT:generic:pix transferencia enviada']={key:'OUT:generic:pix transferencia enviada',target:'EXTRA',kind:'OUT',label:'PIX/transferência enviada',category:'Outros',expenseName:'Nome de outra compra',mode:'SUGGEST'};const html=renderMovement(api.unifiedMovements([out()],[],state)[0]);assert.match(html,/Destinatário\/estabelecimento não informado/);assert.ok(!html.includes('Nome de outra compra'));assert.match(html,/placeholder="Ex.: Cachorro-quente" value=""/);});
test('JSX real preserva nome de estabelecimento e escape de texto',()=>{const m=api.unifiedMovements([out({STORE_NAME:'Loja <Teste>'})],[],api.emptyState())[0];assert.match(renderMovement(m),/Loja &lt;Teste&gt;/);});
console.log('P10 IDENTIFICACAO: '+count+' grupos passaram, sem rede ou escrita de banco.');
