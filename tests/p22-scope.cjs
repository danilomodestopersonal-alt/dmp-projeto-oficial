'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process'),crypto=require('node:crypto'),path=require('node:path');
const root=path.resolve(__dirname,'..'),m=require('./p22-approved-files.json'),restore=require('./p22-original-files.cjs');
const norm=s=>s.replace(/\r\n/g,'\n'),sha=s=>crypto.createHash('sha256').update(norm(s)).digest('hex');
for(const [file,spec]of Object.entries(m.files)){
 const s=fs.readFileSync(path.join(root,file),'utf8');assert.equal(sha(s),spec.after);assert.equal(sha(restore(file,s)),spec.before);assert.throws(()=>restore(file,s+'\n// unexpected'),/fonte modificada sem revisao/);
}
const tracked=cp.execFileSync('git',['ls-tree','-r','--name-only',m.base],{cwd:root,encoding:'utf8'}).trim().split('\n');
for(const file of tracked){if(file.startsWith('tests/')||Object.hasOwn(m.files,file))continue;const old=cp.execFileSync('git',['show',m.base+':'+file],{cwd:root,maxBuffer:32e6});const now=fs.readFileSync(path.join(root,file));assert.equal(sha(now.toString('binary')),sha(old.toString('binary')),file+' changed outside balance scope');}
console.log('PASS P22 ESCOPO: two exact production changes; all other production files including P21 and Android preserved; historical adapter rejects unreviewed source.');
