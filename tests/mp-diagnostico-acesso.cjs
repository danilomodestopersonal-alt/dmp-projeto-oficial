const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),crypto=require('node:crypto');
const source=fs.readFileSync('app/api/mercado-pago/diagnostico-temporario/route.ts','utf8');let queries=[],collections=0,valid=true,fail=false;
class Response{constructor(body,options={}){this.body=body;this.status=options.status||200;this.headers=options.headers||{};}static json(data,options){return new Response(data,options);}}
const exported={};

vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports:exported,require:name=>{if(name==='node:crypto')return crypto;if(name==='next/server')return {NextResponse:Response};if(name==='@/lib/db')return {pool:{query:async(sql,args)=>{queries.push({sql,args});if(fail)throw Error('segredo que não pode sair');return {rows:valid?[{ok:1}]:[]};}}};if(name.includes('diagnostico-temporario.cjs'))return {collect:async()=>{collections++;return {reports:[{status:'AMOSTRA_COLETADA'}]};}};throw Error(name);},process:{env:{MERCADO_PAGO_ACCESS_TOKEN:'simulado'}}});
let count=0;async function test(name,fn){await fn();console.log('OK '+(++count)+' '+name);}
function request(token='session',site='same-origin',download=false){return {headers:{get:()=>site},cookies:{get:()=>token?{value:token}:undefined},nextUrl:{searchParams:new URLSearchParams(download?'download=1':'')}};}
(async()=>{
await test('sem sessão retorna 401 sem banco nem MP',async()=>{queries=[];assert.equal((await exported.GET(request(null))).status,401);assert.equal(queries.length,0);assert.equal(collections,0);});
await test('origem externa rejeitada antes de consultas',async()=>{assert.equal((await exported.GET(request('session','cross-site'))).status,403);assert.equal(queries.length,0);});
await test('sessão expirada rejeitada sem Mercado Pago',async()=>{valid=false;assert.equal((await exported.GET(request())).status,401);assert.equal(collections,0);valid=true;});
await test('página autenticada retorna botão e não consulta MP',async()=>{const r=await exported.GET(request());assert.equal(r.status,200);assert.match(r.body,/Baixar amostra/);assert.match(r.body,/a.download='DMP_AMOSTRA_MP.json'/);assert.equal(collections,0);assert.equal(r.headers['Cache-Control'],'no-store, private');const script=r.body.split('<script>')[1].split('</script>')[0];assert.ok(r.headers['Content-Security-Policy'].includes(crypto.createHash('sha256').update(script).digest('base64')));});
await test('acesso direto por endereço permitido',async()=>assert.equal((await exported.GET(request('session','none'))).status,200));
await test('download protegido chama coletor uma vez e envia anexo',async()=>{const r=await exported.GET(request('session','same-origin',true));assert.equal(r.status,200);assert.equal(collections,1);assert.equal(JSON.parse(r.body).reports[0].status,'AMOSTRA_COLETADA');assert.match(r.headers['Content-Disposition'],/DMP_AMOSTRA_MP.json/);});
await test('todas as consultas do diagnóstico são SELECT de sessão',()=>{assert.ok(queries.length);for(const q of queries){assert.match(q.sql,/^SELECT 1 FROM dmp_sessions/);assert.equal(q.args[0],crypto.createHash('sha256').update('session').digest('hex'));}});
await test('falha de banco não revela mensagem ou segredo',async()=>{fail=true;const r=await exported.GET(request());assert.equal(r.status,500);assert.ok(!JSON.stringify(r.body).includes('segredo'));fail=false;});
await test('sem POST nem import financeiro/PIN/sync',()=>{assert.equal(exported.POST,undefined);assert.ok(!/isAuthorized|ensureSessionTable|console\.|finance_v1|INSERT|UPDATE|DELETE|POST/.test(source));});
await test('todos os arquivos existentes permanecem idênticos ao HEAD',()=>{require('node:child_process').execFileSync('git',['diff','--exit-code','HEAD','--'],{stdio:'pipe'});});
console.log('APROVADO '+count+' testes de acesso/escopo');
})().catch(e=>{console.error(e);process.exitCode=1;});
