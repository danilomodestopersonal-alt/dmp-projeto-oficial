'use strict';
const A=require('node:assert/strict'),nativeFs=require('node:fs'),cp=require('node:child_process'),crypto=require('node:crypto'),ts=require('typescript'),m=require('./p32-approved-files.json');
const fs={...nativeFs,readFileSync:require('./p33-historical-read.cjs')};
const git=(...a)=>cp.execFileSync('git',a,{maxBuffer:32e6}),hash=b=>crypto.createHash('sha256').update(b.includes(0)?b:Buffer.from(b.toString().replace(/\r\n/g,'\n'))).digest('hex');
for(const [f,s]of Object.entries(m.files)){A.equal(hash(fs.readFileSync(f)),s.after,f);if(s.before)A.equal(hash(git('show',m.base+':'+f)),s.before,f);}
let count=0;for(const f of git('ls-tree','-r','--name-only',m.base).toString().trim().split('\n')){if(f.startsWith('tests/')||m.files[f])continue;A.equal(hash(fs.readFileSync(f)),hash(git('show',m.base+':'+f)),f);count++;}
for(const f of [...git('diff','--name-only',m.base).toString().trim().split('\n'),...git('ls-files','--others','--exclude-standard').toString().trim().split('\n')].filter(Boolean))A.ok(f.startsWith('tests/')||require('./p36-approved-files.json').files[f]||require('./p35-approved-files.json').files[f]||require('./p34-approved-files.json').files[f]||require('./p33-approved-files.json').files[f]||m.files[f],'Outside P32: '+f);
function functions(s){const ast=ts.createSourceFile('x.tsx',s,99,true,4),out=new Map;function visit(n){if(ts.isFunctionDeclaration(n)&&n.name)out.set(n.name.text,n.getText(ast));ts.forEachChild(n,visit)}visit(ast);return out;}
const original=functions(git('show',m.base+':components/DmpApp.tsx').toString()),now=functions(fs.readFileSync('components/DmpApp.tsx','utf8'));
for(const [name,s]of original)if(!['DmpApp','CalendarAgenda','AgendaRangeContent','AgendaWeekView'].includes(name))A.equal(now.get(name),s,'Preserved function '+name);
A.equal(now.get('DmpApp').replace('<section className={`content student-profile-page ${notebook.notebook}`}>','<section className="content student-profile-page">').replace('                    aria-current={tab === item ? "page" : undefined}\n',''),original.get('DmpApp'),'all student navigation/data/actions untouched');
const agenda=now.get('CalendarAgenda');A.match(agenda,/fixedAgendaProjection\(fixedState.data,anchor,range,!widgetWeek&&!widgetEventId\)/);A.match(agenda,/if\(own\)\{setSelectedFixed\(own\);return;\}/);
const css=fs.readFileSync('components/students/StudentNotebook.module.css','utf8');A.match(css,/repeat\(7,minmax\(0,1fr\)\)/);A.doesNotMatch(css,/display:\s*none|text-overflow:\s*ellipsis|line-clamp/);
A.equal(now.get('StudentProfileIdentity'),original.get('StudentProfileIdentity'));A.equal(now.get('StudentForm'),original.get('StudentForm'));
console.log('PASS P32 SCOPE: '+Object.keys(m.files).length+' reviewed production files; '+count+' others byte-preserved, including all APIs, financial logic, recurrence writes, student lifecycle, Google, Todoist, monthly markers, Home projection, Android and Spotify.');
