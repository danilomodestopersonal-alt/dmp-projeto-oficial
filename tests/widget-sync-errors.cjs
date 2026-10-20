'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),{NextRequest}=require('next/server');
const root=path.resolve(__dirname,'..');let failure;
const m={exports:{}},code=ts.transpileModule(fs.readFileSync(path.join(root,'app/api/widget/today/route.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
new Function('require','module','exports',code)(name=>{
 if(name==='@/lib/widget/devices')return{authorize:async()=>({google_cipher:'fixture-cipher'})};
 if(name==='@/lib/widget/load-v2')return{loadWidgetV2:async()=>{throw failure;}};
 if(name.startsWith('@/'))return{};
 return require(name);
},m,m.exports);
(async()=>{
 for(const [error,reason]of [
  [new Error('Falha ao renovar Google (400)'),'google_token_rejected'],
  [new Error('Falha ao renovar Google (503)'),'google_refresh_failed'],
  [new Error('Agenda indisponível'),'google_calendar_failed'],
  [new Error('Série indisponível'),'google_series_failed'],
  [new Error('Participantes da agenda inválidos'),'google_roster_invalid'],
  [new Error('Agenda incompleta'),'google_payload_invalid'],
  [new Error('Dados indisponíveis'),'data_unavailable'],
  [Object.assign(new Error('fixture-secret'),{code:'42P01'}),'database_schema'],
  [Object.assign(new Error('fixture-secret'),{code:'08006'}),'database_unavailable'],
  [Object.assign(new Error('fixture-secret'),{name:'TimeoutError'}),'upstream_timeout'],
  [new Error('fixture-secret student-name'),'unclassified']
 ]){
  failure=error;const r=await m.exports.GET(new NextRequest('https://dmp.test/api/widget/today?v=3'));
  const body=await r.json();assert.equal(r.status,503);assert.equal(body.stage,'load_v3');assert.equal(body.reason,reason);assert.equal(body.error,'Resumo temporariamente indisponível');
  assert.doesNotMatch(JSON.stringify(body),/fixture-|student-name|cipher|access_token|refresh_token/);
  assert.deepEqual(Object.keys(body).sort(),['error','reason','stage']);
 }
 console.log('PASS: 11 falhas classificadas sem dados pessoais, sem sucesso parcial e preservando HTTP 503.');
})().catch(e=>{console.error(e);process.exitCode=1;});
