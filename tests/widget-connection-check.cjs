'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),{NextRequest}=require('next/server');
const root=path.resolve(__dirname,'..'),deviceId='11111111-1111-4111-8111-111111111111';
const originalFetch=global.fetch,previous={GOOGLE_CLIENT_ID:process.env.GOOGLE_CLIENT_ID,GOOGLE_CLIENT_SECRET:process.env.GOOGLE_CLIENT_SECRET,RENDER_GIT_COMMIT:process.env.RENDER_GIT_COMMIT};
process.env.GOOGLE_CLIENT_ID='fixture-client';process.env.GOOGLE_CLIENT_SECRET='fixture-secret';process.env.RENDER_GIT_COMMIT='a'.repeat(40);
let rows=[{google_cipher:'fixture-cipher'}],decryptFailure=false,queries=[],calls=[],responses=[],authorized=true;
const response=(data,status=200)=>({ok:status>=200&&status<300,status,json:async()=>{if(data===undefined)throw Error('fixture-secret');return data;}});
global.fetch=async(url,options)=>{calls.push({url,options});assert.equal(options.redirect,'error');assert.ok(options.signal);const r=responses.shift();if(r instanceof Error)throw r;if(!r)throw Error('Unexpected request');return r;};
const m={exports:{}},code=ts.transpileModule(fs.readFileSync(path.join(root,'app/api/widget/connection-check/route.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
new Function('require','module','exports',code)(name=>{
 if(name==='@/lib/auth')return{isAuthorized:async()=>authorized};
 if(name==='@/lib/db')return{pool:{query:async(sql,args)=>{assert.match(sql,/^SELECT google_cipher FROM dmp_widget_devices/);assert.match(sql,/revoked_at IS NULL AND expires_at>NOW\(\)/);assert.equal(args[0],deviceId);queries.push(sql);return{rows};}}};
 if(name==='@/lib/widget/devices')return{sameOrigin:r=>r.headers.get('origin')==='https://dmp.test',decryptGoogle:cipher=>{assert.equal(cipher,'fixture-cipher');if(decryptFailure)throw Error('fixture-secret');return'fixture-refresh';}};
 return require(name);
},m,m.exports);
async function run({origin='https://dmp.test',body=JSON.stringify({deviceId}),expectedStatus,expectedCode}={}){
 queries=[];calls=[];
 const r=await m.exports.POST(new NextRequest('https://dmp.test/api/widget/connection-check',{method:'POST',headers:{origin,'content-type':'application/json'},body}));
 const b=await r.json();assert.equal(r.status,expectedStatus);if(expectedCode)assert.equal(b.code,expectedCode);
 assert.equal(r.headers.get('cache-control'),'no-store, private');assert.doesNotMatch(JSON.stringify(b),/fixture-|student-name|event-description|google_cipher|refresh_token|access_token/);
 return b;
}
let n=0;async function test(name,fn){await fn();console.log('PASS CHECK '+(++n)+': '+name);}
(async()=>{try{
 await test('sessão e origem exigidas antes de banco ou Google',async()=>{authorized=false;await run({expectedStatus:403,expectedCode:'ACCESS_DENIED'});assert.equal(queries.length+calls.length,0);authorized=true;await run({origin:'https://outside.test',expectedStatus:403});assert.equal(queries.length+calls.length,0);});
 await test('entradas inválidas não consultam credenciais',async()=>{for(const body of ['{','null','{}',JSON.stringify({deviceId:'x'.repeat(36)}),'x'.repeat(257)]){await run({body,expectedStatus:400});assert.equal(queries.length+calls.length,0);}});
 await test('vínculo revogado ou ausente não chama Google',async()=>{rows=[];await run({expectedStatus:409,expectedCode:'DEVICE_NOT_ACTIVE'});assert.equal(calls.length,0);rows=[{google_cipher:'fixture-cipher'}];});
 await test('configuração ausente e chave incompatível são distintas',async()=>{delete process.env.GOOGLE_CLIENT_ID;await run({expectedStatus:503,expectedCode:'GOOGLE_CONFIGURATION_MISSING'});assert.equal(calls.length,0);process.env.GOOGLE_CLIENT_ID='fixture-client';decryptFailure=true;await run({expectedStatus:503,expectedCode:'GOOGLE_CREDENTIAL_UNREADABLE'});assert.equal(calls.length,0);decryptFailure=false;});
 await test('invalid_grant real é classificado sem vazar corpo Google',async()=>{responses=[response({error:'invalid_grant',error_description:'fixture-secret fixture-refresh'},400)];const b=await run({expectedStatus:502,expectedCode:'GOOGLE_REAUTH_REQUIRED'});assert.equal(b.googleError,'invalid_grant');assert.equal(b.upstreamStatus,400);assert.equal(calls.length,1);assert.equal(calls[0].url,'https://oauth2.googleapis.com/token');assert.equal(calls[0].options.body.get('refresh_token'),'fixture-refresh');assert.equal(calls[0].options.body.get('client_secret'),'fixture-secret');});
 await test('erro do cliente OAuth não é confundido com token expirado',async()=>{responses=[response({error:'invalid_client'},401)];const b=await run({expectedStatus:502,expectedCode:'GOOGLE_TOKEN_REJECTED'});assert.equal(b.googleError,'invalid_client');});
 await test('erros desconhecidos Google não são devolvidos em texto',async()=>{responses=[response({error:'fixture-secret'},400)];const b=await run({expectedStatus:502,expectedCode:'GOOGLE_TOKEN_REJECTED'});assert.equal(b.googleError,'unclassified');});
 await test('resposta sem token não se transforma em sucesso',async()=>{responses=[response({})];await run({expectedStatus:502,expectedCode:'GOOGLE_RESPONSE_INVALID'});assert.equal(calls.length,1);});
 await test('recusa da agenda fica distinta da renovação OAuth',async()=>{responses=[response({access_token:'fixture-access'}),response({},403)];const b=await run({expectedStatus:502,expectedCode:'GOOGLE_CALENDAR_REJECTED'});assert.equal(b.upstreamStatus,403);assert.equal(calls[1].options.headers.Authorization,'Bearer fixture-access');assert.equal(new URL(calls[1].url).host,'www.googleapis.com');});
 await test('agenda inválida não é sucesso vazio',async()=>{responses=[response({access_token:'fixture-access'}),response({})];await run({expectedStatus:502,expectedCode:'GOOGLE_CALENDAR_INVALID'});});
 await test('agenda realmente vazia prova acesso, sem afirmar sincronização',async()=>{responses=[response({access_token:'fixture-access'}),response({items:[]})];const b=await run({expectedStatus:200,expectedCode:'GOOGLE_ACCESS_OK'});assert.match(b.message,/sincronização completa ainda/);assert.equal(b.liveCommit,'a'.repeat(40));assert.equal(calls.length,2);});
 await test('conteúdo pessoal da agenda nunca sai na resposta',async()=>{responses=[response({access_token:'fixture-access'}),response({items:[{summary:'student-name',description:'event-description'}]})];await run({expectedStatus:200,expectedCode:'GOOGLE_ACCESS_OK'});});
 await test('falha de rede é explícita e não expõe exceção',async()=>{responses=[new Error('fixture-refresh')];const b=await run({expectedStatus:503,expectedCode:'GOOGLE_CONNECTION_FAILED'});assert.equal(b.stage,'google_refresh');});
}finally{global.fetch=originalFetch;for(const [k,v]of Object.entries(previous)){if(v===undefined)delete process.env[k];else process.env[k]=v;}}})().catch(e=>{console.error(e);process.exitCode=1;});
