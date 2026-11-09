'use strict';
const A=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process'),crypto=require('node:crypto'),m=require('./p28-approved-files.json');
const hash=b=>crypto.createHash('sha256').update(b.includes(0)?b:Buffer.from(b.toString().replace(/\r\n/g,'\n'))).digest('hex');
for(const [f,s]of Object.entries(m.files)){A.equal(hash(fs.readFileSync(f)),s.after,f);if(s.before)A.equal(hash(cp.execFileSync('git',['show',m.base+':'+f],{maxBuffer:32e6})),s.before,f)}
let preserved=0;for(const f of cp.execFileSync('git',['ls-tree','-r','--name-only',m.base],{encoding:'utf8'}).trim().split('\n')){if(f.startsWith('tests/')||m.files[f])continue;A.equal(hash(fs.readFileSync(f)),hash(cp.execFileSync('git',['show',m.base+':'+f],{maxBuffer:32e6})),f);preserved++;}
for(const f of [...cp.execFileSync('git',['diff','--name-only',m.base],{encoding:'utf8'}).trim().split('\n'),...cp.execFileSync('git',['ls-files','--others','--exclude-standard'],{encoding:'utf8'}).trim().split('\n')].filter(Boolean))A.ok(f.startsWith('tests/')||m.files[f],'Fora do escopo: '+f);
console.log('PASS P28 ESCOPO: '+Object.keys(m.files).length+' arquivos de produção autorizados; '+preserved+' arquivos preservados por hash, incluindo APIs financeiras, regras AUTO/SUGGEST, DS, PIN, Kids, OAuth e Android.');
