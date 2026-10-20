'use strict';
const fs=require('fs'),path=require('path'),cp=require('child_process'),crypto=require('crypto'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..'),base='8aa684e73d5aadff47c1a5b9975b4aef03be962e';
const expected={
  "app/api/google/absence/route.ts": "43e5ec31932505954a29163be4c92306e52e5418eecbf6b691e29319ea3be6d5",
  "components/calendar/AbsenceSyncPanel.tsx": "e94afb8528400b30eed4e2ba263bdb9d182f9019633cf0800206445257ca58b4",
  "components/calendar/useAbsenceRemoval.ts": "1ddaddd8b34911fa6e4ae98475df87294e268e5802e5f245db608c8327ca715b",
  "lib/calendar/absence-pending.ts": "0dc30cb0628631205e2f471996b567bc002c24cf1c7503cf7e88d907e50a91f4",
  "lib/calendar/absence-removal.ts": "73923bc07f2432db33aec5f76683fd3b2ddf1d8b2594f3fa914018f0c3914b75",
  "lib/widget/google-source.ts": "153b58e75853fc3fed8e081f44dbe37f298eb9948649886f8af55e96e9c2f59b"
};
const normalized=b=>b.includes(0)?b:Buffer.from(b.toString('utf8').replace(/\r\n/g,'\n'));
const hash=b=>crypto.createHash('sha256').update(normalized(b)).digest('hex');
const names=cp.execFileSync('git',['ls-tree','-r','--name-only',base],{cwd:root,encoding:'utf8'}).trim().split('\n');
let preserved=0;
for(const f of names){if(f.startsWith('tests/'))continue;const actual=fs.readFileSync(path.join(root,f));if(expected[f])assert.equal(hash(actual),expected[f],f);else{const original=cp.execFileSync('git',['show',base+':'+f],{cwd:root,maxBuffer:32000000});assert.deepEqual(normalized(actual),normalized(original),f);preserved++;}}
const changed=cp.execFileSync('git',['diff','--name-only',base],{cwd:root,encoding:'utf8'}).trim().split('\n').filter(f=>f&&!f.startsWith('tests/'));
assert.deepEqual(changed.sort(),Object.keys(expected).sort());
console.log('PASS P04 ESCOPO: 6 arquivos de producao autorizados; '+preserved+' arquivos de producao preservados integralmente, incluindo Home, autenticacao, APK, Kids e Financeiro.');
