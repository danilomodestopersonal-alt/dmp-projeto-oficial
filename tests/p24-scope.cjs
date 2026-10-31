'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict'),crypto=require('node:crypto'),ts=require('typescript');
const root=path.resolve(__dirname,'..'),manifest=require('./p24-approved-files.json');
const hash=b=>crypto.createHash('sha256').update(b.includes(0)?b:Buffer.from(b.toString().replace(/\r\n/g,'\n'))).digest('hex');
const old=f=>cp.execFileSync('git',['show',manifest.base+':'+f],{cwd:root,maxBuffer:32e6});
for(const [f,spec]of Object.entries(manifest.files)){const now=fs.readFileSync(path.join(root,f));assert.equal(hash(now),spec.after,f);if(spec.before){assert.equal(hash(old(f)),spec.before);assert.equal(hash(Buffer.from(require('./p24-original-files.cjs')(f,now.toString()))),spec.before);assert.throws(()=>require('./p24-original-files.cjs')(f,now.toString()+'\n// altered'),/sem revisao/);}}
const tracked=cp.execFileSync('git',['ls-tree','-r','--name-only',manifest.base],{cwd:root,encoding:'utf8'}).trim().split('\n');
for(const f of tracked){if(f.startsWith('tests/')||manifest.files[f])continue;assert.equal(hash(fs.readFileSync(path.join(root,f))),hash(old(f)),f+' outside scope');}
const file='app/api/mercado-pago/route.ts';
const functions=s=>new Map(ts.createSourceFile('route.ts',s.replace(/\r\n/g,'\n'),ts.ScriptTarget.Latest,true).statements.filter(ts.isFunctionDeclaration).filter(f=>f.name).map(f=>[f.name.text,f.getText()]));
const previous=functions(old(file).toString()),current=functions(fs.readFileSync(path.join(root,file),'utf8'));
for(const [name,body]of previous)if(!['POST','persistDecision','autoTargetOptions','errorResponse'].includes(name))assert.equal(current.get(name),body,'MP function changed: '+name);
// P21 mobile DS layout remains byte-identical except the added return audit/actions.
assert.equal(hash(fs.readFileSync(path.join(root,'components/financeiro/FinanceiroPage.module.css'))),hash(old('components/financeiro/FinanceiroPage.module.css')));
assert.equal(hash(fs.readFileSync(path.join(root,'components/financeiro/FinanceSummaryView.tsx'))),hash(old('components/financeiro/FinanceSummaryView.tsx')),'P22 bank balance and consolidated display preserved');
console.log('PASS P24 SCOPE: approved files only; MP report selection/parsing/balance, existing classifications, learned rules, Android, Google, DS mobile CSS and other production files preserved.');
