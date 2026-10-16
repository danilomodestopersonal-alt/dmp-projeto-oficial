const fs=require('fs'),path=require('path'),assert=require('assert/strict'),ts=require('typescript');
const oldTs=require.extensions['.ts'],oldCss=require.extensions['.css'];
try{
 require.extensions['.css']=(m,f)=>{const text=fs.readFileSync(f,'utf8');m.exports=Object.fromEntries([...text.matchAll(/\.([A-Za-z][\w-]*)/g)].map(x=>[x[1],path.basename(f).replace(/\W/g,'_')+'_'+x[1]]))};
 require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
 const dir=path.join(__dirname,'../components/visual-modules');const {MODULE_VISUAL_DEFAULTS:d,moduleFor,visualEnabled}=require(dir+'/defaults.ts');
 const samples={finance:'financeiro',students:'alunos','workouts-overview':'treinos',agenda:'agenda','assessments-overview':'avaliacoes',performance:'performance',kids:'kids',reports:'relatorios',data:'dados',settings:'dados'};
 for(const [view,module]of Object.entries(samples))assert.equal(moduleFor(view,'summary'),module);
 assert.equal(moduleFor('today','summary'),null);assert.equal(moduleFor('weather','summary'),null);
 assert.equal(moduleFor('student','workouts'),'treinos');assert.equal(moduleFor('student','assessments'),'avaliacoes');assert.equal(moduleFor('student','finance'),'financeiro');
 for(const mod of Object.keys(d)){
  assert.equal(visualEnabled(mod,'anterior',null),false);assert.equal(visualEnabled(mod,'anterior','novo'),d[mod]);assert.equal(visualEnabled(mod,'novo','anterior'),false);
  const before=d[mod];d[mod]=false;assert.equal(visualEnabled(mod,'novo','novo'),false);d[mod]=before;
  const css=require(dir+'/common.ts').commonCss(mod)+require(dir+'/'+mod+'.ts')[mod+'Css'];
  assert(!css.includes('undefined'));assert(css.includes('[data-dmp-module="'+mod+'"]'));assert(!css.includes('display:none'),'Nao ocultar recursos');
  console.log('PASS',mod,'mapeamento, estilos existentes, escopo e reversao independente');
 }
 assert(require(dir+'/mercado-pago.ts').mercadoPagoCss.includes('financeiro'));
 console.log('PASS Home excluida; seletores das folhas existentes resolvidos; regras de negocio sem substituicao');
}finally{if(oldTs)require.extensions['.ts']=oldTs;else delete require.extensions['.ts'];if(oldCss)require.extensions['.css']=oldCss;else delete require.extensions['.css']}
