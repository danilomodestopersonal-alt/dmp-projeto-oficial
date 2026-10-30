'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const m=require('./p21-approved-files.json'),adapt=require('./p21-original-files.cjs');const root=path.resolve(__dirname,'..');
assert.deepEqual(Object.keys(m.files).sort(),['components/financeiro/FinanceiroPage.module.css','components/financeiro/FinanceiroPage.tsx','lib/financeiro/future-preview.ts']);
for(const [file,spec]of Object.entries(m.files)){
 const actual=fs.readFileSync(path.join(root,file),'utf8');assert.equal(crypto.createHash('sha256').update(actual.replace(/\r\n/g,'\n')).digest('hex'),spec.after);
 const historical=adapt(file,actual);if(spec.before!==null)assert.equal(historical,cp.execFileSync('git',['show',m.base+':'+file],{cwd:root,encoding:'utf8',maxBuffer:8e6}));else assert.equal(historical,actual);
 assert.throws(()=>adapt(file,actual+'\n/* unexpected edit */'),/fonte modificada sem revisao/);
}
console.log('PASS P21 ESCOPO: tres fontes exatas; historico conferido e alteracao nao revisada rejeitada.');
