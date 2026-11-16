'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),H=require('./p15-harness.cjs'),F=require('./p41-harness.cjs');
const out=path.resolve(process.argv[2]),base='68f8ba6f327f7a061eeda6ae82758af8968d7396';fs.mkdirSync(out,{recursive:true});
const original=file=>cp.execFileSync('git',['show',base+':'+file],{encoding:'utf8',maxBuffer:32e6});
function absoluteImports(s,file){return s.replace(/from (["'])(\.{1,2}\/[^"']+)\1/g,(_,q,rel)=>'from '+JSON.stringify(path.resolve(H.root,path.dirname(file),rel)));}
for(const file of ['components/financeiro/InvoiceCancellation.tsx','components/financeiro/FinanceiroPage.tsx']){let s=absoluteImports(original(file),file);if(file.endsWith('FinanceiroPage.tsx'))s=s.replace(JSON.stringify(path.join(H.root,'components/financeiro/InvoiceCancellation')),JSON.stringify(path.join(out,'before-InvoiceCancellation.tsx')));fs.writeFileSync(path.join(out,'before-'+path.basename(file)),s);}
const fixture=F.fixture();fixture.dsKids=[];fixture.dsReceipts={};fixture.dsReturns={};fixture.dsOpeningBalances={'2026-10':0,'2026-11':0};fixture.expenses=[];fixture.extraExpenses=[];fixture.otherReceipts=[];fixture.rankingByCompetence={};fixture.eventsByCompetence={};fixture.personalInvoices.push({id:'p41-paid',studentName:'Mensalidade paga',competence:'2026-11',dueDay:10,expectedAmount:250,payments:[{id:'paid',date:'2026-11-10',amount:250}]});
const entries={};for(const before of [true,false]){const mode=before?'before':'after',component=before?path.join(out,'before-FinanceiroPage.tsx'):path.join(H.root,'components/financeiro/FinanceiroPage.tsx');
const entry=`const React=require('react'),{createRoot}=require('react-dom/client'),Page=require(${JSON.stringify(component)}).default;
const {changeInvoiceCancellation,cancellationsPreserved}=require(${JSON.stringify(path.join(H.root,'lib/financeiro/invoice-cancellation.ts'))});
const initial=${JSON.stringify(fixture)},students=${JSON.stringify(F.students)},key='p41-synthetic-${mode}';
if(new URLSearchParams(location.search).has('reset'))localStorage.removeItem(key);
let state=JSON.parse(localStorage.getItem(key)||'null')||initial,revision='2026-11-16T12:00:00.000Z',calls=0,writes=0;
const persist=()=>localStorage.setItem(key,JSON.stringify(state));
history.replaceState({dmpFinanceQuery:{tab:'personal',filter:'ALL',competence:'2026-11'}},'',location.href);
window.fetch=async(input,options={})=>{const url=new URL(String(input),location.origin),method=options.method||'GET',body=options.body?JSON.parse(options.body):null;
 if(url.origin!==location.origin)throw Error('Synthetic preview blocks external requests');
 if(url.pathname==='/api/finance/invoice-cancellation'){
  calls++;document.getElementById('fixture-calls').textContent=String(calls);
  if(document.getElementById('fixture-mode').value==='offline'){document.getElementById('fixture-mode').value='ok';throw Error('synthetic offline');}
  if(document.getElementById('fixture-mode').value==='api-error'){document.getElementById('fixture-mode').value='ok';return Response.json({error:'Não foi possível concluir. Tente novamente.'},{status:500});}
  await new Promise(r=>setTimeout(r,250));
  try{const next=changeInvoiceCancellation(state,body,'operador@sintetico.invalid',new Date().toISOString());if(next!==state){state=next;revision=new Date(Date.parse(revision)+1000).toISOString();writes++;persist();}document.getElementById('fixture-writes').textContent=String(writes);if(document.getElementById('fixture-mode').value==='lost'){document.getElementById('fixture-mode').value='ok';throw Error('lost response');}return Response.json({ok:true,data:state,updatedAt:revision});}catch(e){if(e.message==='lost response')throw e;return Response.json({error:e.message},{status:409});}
 }
 if(url.pathname==='/api/finance'){if(method==='PUT'){if(!cancellationsPreserved(state,body))return Response.json({error:'Conflito protegido'},{status:409});state=body;revision=new Date(Date.parse(revision)+1000).toISOString();persist();}return Response.json({ok:true,data:state,updatedAt:revision});}
 if(url.pathname==='/api/finance/pix-payer')return Response.json({records:[]});
 if(url.pathname==='/api/finance/pin')return Response.json({trusted:false});
 if(url.pathname==='/api/kids')return Response.json({data:null});
 if(url.pathname==='/api/mercado-pago')return Response.json({ok:true,balance:null});
 if(url.pathname==='/api/backup')return Response.json({ok:true});
 if(url.pathname==='/api/data'&&method==='PUT')return Response.json({ok:true});
 throw Error('UNEXPECTED synthetic request '+method+' '+url.pathname);
};
createRoot(document.getElementById('root')).render(<main className="app-page"><Page students={students}/></main>);`;
const file=path.join(out,mode+'.tsx');fs.writeFileSync(file,entry);entries[mode]=file;
const css=H.read('app/globals.css')+'\n'+['components/financeiro/FinanceiroPage.module.css',...(!before?['components/financeiro/InvoiceCancellation.module.css']:[])].map(f=>H.read(f).replace(/\.([A-Za-z][\w-]*)/g,(_,k)=>'.'+path.basename(f).split('.')[0]+'_'+k)).join('\n')+'\n.app-page{max-width:1200px;margin:auto;padding:20px}.fixture-toolbar{padding:10px;background:#eef2e8;font:12px system-ui;display:flex;gap:12px;flex-wrap:wrap}.fixture-toolbar select{max-width:150px}';
fs.writeFileSync(path.join(out,mode+'.html'),'<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>P41 '+mode+'</title><style>'+css+'</style><header class="fixture-toolbar">'+(before?'P40 · Antes':'P41 · Depois')+' · DADOS SINTÉTICOS <label>Simulação <select id="fixture-mode"><option value="ok">Normal</option><option value="offline">Sem conexão</option><option value="lost">Resposta perdida</option><option value="api-error">Erro API</option></select></label>Solicitações: <span id="fixture-calls">0</span> Cancelamentos gravados: <span id="fixture-writes">0</span></header><div id="root"></div><script src="/'+mode+'.js"></script></html>');
}
fs.writeFileSync(path.join(out,'index.html'),'<a href="/before.html?reset=1">Antes</a> <a href="/after.html?reset=1">Depois</a>');
fs.writeFileSync(path.join(out,'ts-loader.cjs'),`module.exports=function(s){return require(${JSON.stringify(require.resolve('typescript'))}).transpileModule(s,{compilerOptions:{target:9,module:1,jsx:4,esModuleInterop:true}}).outputText}`);
fs.writeFileSync(path.join(out,'css-loader.cjs'),`module.exports=function(s){const prefix=require('path').basename(this.resourcePath).split('.')[0]+'_';return 'module.exports='+JSON.stringify(Object.fromEntries([...s.matchAll(/\\.([A-Za-z][\\w-]*)/g)].map(m=>[m[1],prefix+m[1]])));}`);
const W=require('next/dist/compiled/webpack/webpack');W.init();W.webpack({mode:'development',devtool:false,entry:entries,output:{path:out,filename:'[name].js'},resolve:{extensions:['.js','.ts','.tsx'],alias:{'@':H.root},modules:[path.join(H.root,'node_modules')]},module:{rules:[{test:/\.tsx?$/,exclude:/node_modules/,use:path.join(out,'ts-loader.cjs')},{test:/\.module\.css$/,use:path.join(out,'css-loader.cjs')}]}},(e,s)=>{if(e||s.hasErrors()){console.error(e||s.toString());process.exitCode=1;}else console.log('PASS real FinanceiroPage synthetic preview');});
