'use strict';
const A=require('node:assert/strict'),nativeFs=require('node:fs'),cp=require('node:child_process'),crypto=require('node:crypto'),ts=require('typescript'),m=require('./p34-approved-files.json');
const fs={...nativeFs,readFileSync:require('./p35-historical-read.cjs')};
const git=(...a)=>cp.execFileSync('git',a,{maxBuffer:32e6}),hash=b=>crypto.createHash('sha256').update(b.includes(0)?b:Buffer.from(b.toString().replace(/\r\n/g,'\n'))).digest('hex');
for(const [f,s]of Object.entries(m.files)){A.equal(hash(fs.readFileSync(f)),s.after,f);if(s.before)A.equal(hash(git('show',m.base+':'+f)),s.before,f);}
let n=0;for(const f of git('ls-tree','-r','--name-only',m.base).toString().trim().split('\n')){if(f.startsWith('tests/')||m.files[f])continue;A.equal(hash(fs.readFileSync(f)),hash(git('show',m.base+':'+f)),f);n++;}
for(const f of [...git('diff','--name-only',m.base).toString().trim().split('\n'),...git('ls-files','--others','--exclude-standard').toString().trim().split('\n')].filter(Boolean))A.ok(f.startsWith('tests/')||require('./p36-approved-files.json').files[f]||require('./p35-approved-files.json').files[f]||m.files[f],'Outside P34: '+f);
const before=git('show',m.base+':components/DmpApp.tsx').toString(),now=fs.readFileSync('components/DmpApp.tsx','utf8');
function strip(s){const ast=ts.createSourceFile('x.tsx',s,99,true,4),node=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='DesktopAgendaRail');return s.slice(0,node.getStart(ast))+'FUNCTION_REVIEWED'+s.slice(node.end);}
A.equal(strip(now).replace('import agendaRail from "./home/DesktopAgendaRail.module.css";\n',''),strip(before),'Only desktop rail and its CSS import may change');
A.doesNotMatch(now.slice(now.indexOf('function DesktopAgendaRail('),now.indexOf('function beginPanelResize')),/fetch\(|\.post\(|localStorage|saveStudents|onAbsence/);
console.log('PASS P34 scope: 2 production files; '+n+' unchanged, including monthly dots, agenda/full/Home, student notebook, Google identity, all APIs, financial data, Kids, Spotify, OAuth and Android.');
