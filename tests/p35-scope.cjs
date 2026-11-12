'use strict';
const A=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process'),crypto=require('node:crypto'),m=require('./p35-approved-files.json');
const git=(...a)=>cp.execFileSync('git',a,{maxBuffer:32e6}),hash=b=>crypto.createHash('sha256').update(b.includes(0)?b:Buffer.from(b.toString().replace(/\r\n/g,'\n'))).digest('hex');
for(const [f,s]of Object.entries(m.files)){A.equal(hash(fs.readFileSync(f)),s.after,f);if(s.before)A.equal(hash(git('show',m.base+':'+f)),s.before,f);}
let n=0;for(const f of git('ls-tree','-r','--name-only',m.base).toString().trim().split('\n')){if(f.startsWith('tests/')||m.files[f])continue;A.equal(hash(fs.readFileSync(f)),hash(git('show',m.base+':'+f)),f);n++;}
for(const f of [...git('diff','--name-only',m.base).toString().trim().split('\n'),...git('ls-files','--others','--exclude-standard').toString().trim().split('\n')].filter(Boolean))A.ok(f.startsWith('tests/')||m.files[f],'Outside P35: '+f);
const before=git('show',m.base+':components/DmpApp.tsx').toString(),now=fs.readFileSync('components/DmpApp.tsx','utf8');A.equal(now.replace(/(<CalendarAppointmentDetails[^\n]*?) onSaved=\{onRefresh\}/g,'$1'),before,'Only refresh prop on the two existing appointment entry points changes');
const route=fs.readFileSync('app/api/google/appointment/route.ts','utf8');A.match(route,/isAuthorized/);A.match(route,/sameOrigin/);A.match(route,/'If-Match':etag/);A.doesNotMatch(route,/method:'DELETE'|method:'POST'|INSERT INTO|UPDATE dmp_data|DELETE FROM|finance_v1|todoist|students\/lifecycle/);
console.log('PASS P35 scope: 5 production files; '+n+' preserved, including all prior mutation flows, monthly calendar, student notebook, fixed appointments, lessons/Kids, financial, OAuth, Android and general Home layout.');
