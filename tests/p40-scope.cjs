'use strict';
const A=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process'),crypto=require('node:crypto'),ts=require('typescript'),m=require('./p40-approved-files.json');
const git=(...a)=>cp.execFileSync('git',a,{maxBuffer:32e6}),hash=b=>crypto.createHash('sha256').update(b.includes(0)?b:Buffer.from(b.toString().replace(/\r\n/g,'\n'))).digest('hex');
A.equal(m.base,'702db343be045d71b76bae53dfd87b00f8716939');
A.deepEqual(Object.keys(m.files).sort(),['components/DmpApp.tsx','components/calendar/AgendaAppointmentCard.module.css','components/calendar/AgendaAppointmentCard.tsx']);
for(const [file,s]of Object.entries(m.files)){A.equal(hash(fs.readFileSync(file)),s.after,file);if(s.before)A.equal(hash(git('show',m.base+':'+file)),s.before,file);}
let preserved=0;for(const file of git('ls-tree','-r','--name-only',m.base).toString().trim().split('\n')){if(file.startsWith('tests/')||m.files[file])continue;A.equal(hash(fs.readFileSync(file)),hash(git('show',m.base+':'+file)),file);preserved++;}
for(const file of [...git('diff','--name-only',m.base).toString().trim().split('\n'),...git('ls-files','--others','--exclude-standard').toString().trim().split('\n')].filter(Boolean))A.ok(file.startsWith('tests/')||m.files[file],'Outside P40: '+file);
function strip(s){const ast=ts.createSourceFile('app.tsx',s,99,true,4),nodes=ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&['AgendaRangeContent','AgendaEventDetails','AgendaWeekView'].includes(n.name?.text));for(const n of nodes.reverse())s=s.slice(0,n.getStart(ast))+'REVIEWED_'+n.name.text+s.slice(n.end);return s.replace('import AgendaAppointmentCard from "./calendar/AgendaAppointmentCard";\n','');}
A.equal(strip(fs.readFileSync('components/DmpApp.tsx','utf8')),strip(git('show',m.base+':components/DmpApp.tsx').toString()),'all other functions, routing, monthly markers, Home and data remain exact');
const card=fs.readFileSync('components/calendar/AgendaAppointmentCard.tsx','utf8');A.doesNotMatch(card,/fetch\(|localStorage|sessionStorage|useEffect|saveStudents|onStartStudent|onAddStudent|\.query\(/);
A.ok(!fs.existsSync('lib/mercado-pago/release-reserves.ts'),'suspended P39 file absent');
A.equal(hash(fs.readFileSync('app/api/mercado-pago/route.ts')),hash(git('show',m.base+':app/api/mercado-pago/route.ts')),'financial route identical to live P38');
console.log('PASS P40 scope: 3 presentation files; '+preserved+' production files preserved; P39 excluded; Home, Personal, Kids, monthly markers, finance and integrations unchanged.');
