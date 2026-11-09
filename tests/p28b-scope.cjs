'use strict';
const A=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process'),crypto=require('node:crypto');
const base='e51c8e787c3c55826896ece8387cac82aa7a4f1b',css=['app/globals.css','components/mercado-pago/MercadoPagoTestPage.module.css'],allowed=[...css,'tests/p28-approved-files.json','tests/p28b-scope.cjs','tests/p28b-preview.cjs'];
const git=(...a)=>cp.execFileSync('git',a,{maxBuffer:32e6}),norm=b=>b.toString().replace(/\r\n/g,'\n');
let count=0;
for(const f of git('ls-tree','-r','--name-only',base).toString().trim().split('\n')){
 const before=norm(git('show',base+':'+f)),now=norm(fs.readFileSync(f));
 if(css.includes(f)){A.ok(now.startsWith(before),f+': CSS anterior deve permanecer intacto');}
 else if(f!=='tests/p28-approved-files.json'){A.equal(now,before,f);count++;}
}
const before=JSON.parse(git('show',base+':tests/p28-approved-files.json')),now=JSON.parse(fs.readFileSync('tests/p28-approved-files.json'));
for(const f of css){A.equal(now.files[f].after,crypto.createHash('sha256').update(norm(fs.readFileSync(f))).digest('hex'));now.files[f].after=before.files[f].after;}
A.deepEqual(now,before,'Somente os dois hashes visuais podem mudar no manifesto histórico.');
for(const f of [...git('diff','--name-only',base).toString().trim().split('\n'),...git('ls-files','--others','--exclude-standard').toString().trim().split('\n')].filter(Boolean))A.ok(allowed.includes(f),'Fora do escopo P28B: '+f);
console.log('PASS P28B: somente dois CSS de produção; '+count+' arquivos existentes preservados, incluindo todos os TS/TSX, APIs, cálculos, callbacks e Android.');
