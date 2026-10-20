'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const {NextRequest,NextResponse}=require('next/server');
const root=path.resolve(__dirname,'..'),base='https://dmp.test',id='11111111-1111-4111-8111-111111111111';
let state;
const reset=()=>state={approved:false,expired:false,attempts:0,writes:0,authChecks:0};
function compile(file,imports){const m={exports:{}},code=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('require','module','exports',code)(name=>Object.prototype.hasOwnProperty.call(imports,name)?imports[name]:require(name),m,m.exports);return m.exports;}
const pool={async query(sql,values){
 if(state.fail)throw Error('PRIVATE_DATABASE_CREDENTIAL');
 if(sql.startsWith('UPDATE dmp_widget_pairs')){assert.equal(values[0],id);assert.equal(values[1],'TEST_ENCRYPTED_GOOGLE');state.attempts++;if(state.expired||state.approved)return{rows:[]};state.approved=true;state.writes++;return{rows:[{id}]};}
 if(sql.startsWith('SELECT name,expires_at,approved_at'))return{rows:state.expired?[]:[{name:'Test Samsung',approved_at:state.approved?'2026-10-20T18:25:00Z':null}]};
 throw Error('Unexpected SQL');
}};
const {sameOrigin}=compile('lib/widget/devices.ts',{'@/lib/db':{pool}});
const pair=compile('app/api/widget/pair/route.ts',{
 '@/lib/auth':{isAuthorized:async r=>{state.authChecks++;return r.cookies.get('dmp_session')?.value==='TEST_SESSION';}},
 '@/lib/db':{pool},
 '@/lib/widget/devices':{setup:async()=>{},sameOrigin,origin:()=>base,encryptGoogle:refresh=>{assert.equal(refresh,'PRIVATE_GOOGLE_REFRESH');return'TEST_ENCRYPTED_GOOGLE';},createPair:()=>{throw Error('Must not create pairs');},claimPair:()=>{throw Error('Must not claim pairs');}}
});
const route=compile('app/api/widget/connect/route.ts',{'../pair/route':pair});
function request(options={}){
 const headers={'content-type':'application/x-www-form-urlencoded','origin':base,'cookie':'dmp_session=TEST_SESSION; dmp_google_refresh=PRIVATE_GOOGLE_REFRESH',...options.headers};
 for(const key of Object.keys(headers))if(headers[key]===null)delete headers[key];
 return new NextRequest(base+'/api/widget/connect',{method:'POST',headers,body:options.body??'id='+id});
}
async function response(options={}){const r=await route.POST(request(options)),html=await r.text();assert.equal(r.headers.get('content-type'),'text/html; charset=utf-8');assert.match(r.headers.get('cache-control'),/no-store/);assert.equal(r.headers.get('referrer-policy'),'same-origin','O documento deve conservar Origin no POST nativo de nova tentativa');assert.equal(r.headers.get('x-frame-options'),'DENY');assert.match(r.headers.get('content-security-policy'),/form-action 'self'/);assert.doesNotMatch(html,/<script|PRIVATE_|TEST_ENCRYPTED_GOOGLE/);return{status:r.status,html};}
let count=0;async function test(name,fn){reset();await fn();console.log('PASS NATIVE APPROVAL '+(++count)+': '+name);}
(async()=>{
 await test('formulário conserva sessão, origem, ID e usa a API original',async()=>{const r=await response();assert.equal(r.status,200);assert.match(r.html,/Celular autorizado/);assert.match(r.html,/CONCLUIR CONEXÃO/);assert.equal(state.writes,1);assert.ok(state.authChecks>0);assert.doesNotMatch(r.html,/<form/);});
 await test('envio repetido não duplica autorização nem desfaz sucesso',async()=>{await response();const r=await response();assert.equal(r.status,200);assert.match(r.html,/já está autorizado/);assert.equal(state.writes,1);});
 await test('sem sessão: resposta 403 explícita e nenhuma escrita',async()=>{const r=await response({headers:{cookie:'dmp_google_refresh=PRIVATE_GOOGLE_REFRESH'}});assert.equal(r.status,403);assert.match(r.html,/HTTP 403/);assert.equal(state.attempts,0);});
 await test('origem externa não autoriza',async()=>{const r=await response({headers:{origin:'https://untrusted.test'}});assert.equal(r.status,403);assert.equal(state.attempts,0);});
 await test('sem origem não autoriza',async()=>{const r=await response({headers:{origin:null}});assert.equal(r.status,403);assert.equal(state.attempts,0);});
 await test('Origin null continua recusado pela proteção original',async()=>{const r=await response({headers:{origin:'null'}});assert.equal(r.status,403);assert.equal(state.attempts,0);});
 await test('sem cookie Google: mostra renovação e conserva pedido para tentar novamente',async()=>{const r=await response({headers:{cookie:'dmp_session=TEST_SESSION'}});assert.equal(r.status,409);assert.match(r.html,/Renovar autorização Google/);assert.match(r.html,/<form method="post" action="\/api\/widget\/connect">/);assert.ok(r.html.includes('value="'+id+'"'));assert.equal(state.attempts,0);});
 await test('após 409, cookie Google renovado permite nova tentativa no mesmo pedido',async()=>{
  const first=await response({headers:{cookie:'dmp_session=TEST_SESSION'}});assert.equal(first.status,409);
  const retry=await response();assert.equal(retry.status,200);assert.match(retry.html,/Celular autorizado/);assert.equal(state.writes,1);
 });
 await test('pedido expirado: não aprova e orienta conexão nova',async()=>{state.expired=true;const r=await response();assert.equal(r.status,409);assert.match(r.html,/CONECTAR DMP/);assert.equal(state.writes,0);});
 await test('pedido aprovado mas expirado não finge que ainda pode ser concluído',async()=>{state.expired=true;state.approved=true;const r=await response();assert.equal(r.status,409);assert.doesNotMatch(r.html,/Celular autorizado/);assert.equal(state.writes,0);});
 await test('falha do banco fica visível sem expor exceção',async()=>{state.fail=true;const r=await response();assert.equal(r.status,503);assert.match(r.html,/HTTP 503/);assert.equal(state.writes,0);});
 for(const [name,options]of[
  ['ID inválido',{body:'id=%3Cscript%3Ealert(1)%3C%2Fscript%3E'}],
  ['ID duplicado',{body:'id='+id+'&id='+id}],
  ['ação extra não pode virar claim ou create',{body:'id='+id+'&action=claim'}],
  ['corpo grande',{body:'id='+id+'&x='+('a'.repeat(300))}],
  ['JSON não é tratado como formulário',{headers:{'content-type':'application/json'},body:JSON.stringify({id})}],
  ['sem tipo de conteúdo',{headers:{'content-type':null}}]
 ])await test(name,async()=>{const r=await response(options);assert.equal(r.status,400);assert.equal(state.attempts,0);assert.equal(state.authChecks,0);assert.doesNotMatch(r.html,/alert\(1\)/);});
 await test('resposta inesperada nunca vira aprovação nem expõe conteúdo arbitrário',async()=>{
  for(const [body,status]of[[{ok:false},200],[{error:'PRIVATE_TOKEN <script>bad()</script>'},500]]){
   const alternate=compile('app/api/widget/connect/route.ts',{'../pair/route':{POST:async()=>NextResponse.json(body,{status})}});
   const r=await alternate.POST(request()),html=await r.text();assert.equal(r.status,503);assert.doesNotMatch(html,/PRIVATE_|<script|Celular autorizado/);
  }
 });
 console.log('NATIVE APPROVAL: '+count+' casos passaram.');
})().catch(e=>{console.error(e);process.exitCode=1;});
