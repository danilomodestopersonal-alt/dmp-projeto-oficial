'use strict';
const A=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process'),crypto=require('node:crypto'),ts=require('typescript'),m=require('./p37b-approved-files.json');
const git=(...args)=>cp.execFileSync('git',args,{maxBuffer:32e6}),hash=b=>crypto.createHash('sha256').update(b.includes(0)?b:Buffer.from(b.toString().replace(/\r\n/g,'\n'))).digest('hex');
for(const [file,s] of Object.entries(m.files)){A.equal(hash(fs.readFileSync(file)),s.after,file);A.equal(hash(git('show',m.base+':'+file)),s.before,file);}
let preserved=0;for(const file of git('ls-tree','-r','--name-only',m.base).toString().trim().split('\n')){if(file.startsWith('tests/')||m.files[file])continue;A.equal(hash(fs.readFileSync(file)),hash(git('show',m.base+':'+file)),file);preserved++;}
for(const file of [...git('diff','--name-only',m.base).toString().trim().split('\n'),...git('ls-files','--others','--exclude-standard').toString().trim().split('\n')].filter(Boolean))A.ok(file.startsWith('tests/')||m.files[file],'Outside P37B: '+file);
function stripMatcher(text,file){const ast=ts.createSourceFile(file,text,99,true,file.endsWith('tsx')?4:3),fn=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='matchCalendarEvents');return text.slice(0,fn.getStart(ast))+'MATCHER'+text.slice(fn.end);}
for(const file of ['components/DmpApp.tsx','lib/widget/home-source.ts'])A.equal(stripMatcher(fs.readFileSync(file,'utf8'),file),stripMatcher(git('show',m.base+':'+file).toString(),file),'only identity matcher changes: '+file);
const file='lib/students/lifecycle-calendar.ts',now=fs.readFileSync(file,'utf8'),old=git('show',m.base+':'+file).toString();
function functions(s){const ast=ts.createSourceFile(file,s,99,true,3);return new Map(ast.statements.filter(ts.isFunctionDeclaration).map(n=>[n.name.text,n.getText(ast)]));}
const actual=functions(now);for(const [name,body]of functions(old))if(!['buildLifecyclePlan','assertTargetIdentity'].includes(name))A.equal(actual.get(name),body,'lifecycle preserved: '+name);
A.ok(actual.has('unresolvedTarget'));A.doesNotMatch(actual.get('unresolvedTarget'),/fetch\(|\.patch\(|\.insert\(|\.query\(/);
A.doesNotMatch(actual.get('unresolvedTarget'),/status\s*=|financialActive\s*=/,'new ambiguity guard does not mutate lifecycle or finance');
console.log('PASS P37B scope: 3 production files, '+preserved+' unchanged; all layouts, finance, Google writes, OAuth, Android and Kids preserved.');
