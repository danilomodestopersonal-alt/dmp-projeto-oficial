'use strict';
const fs=require('fs'),path=require('path'),cp=require('child_process'),crypto=require('crypto'),assert=require('assert/strict'),ts=require('typescript');
const root=path.resolve(__dirname,'..'),manifest=require('./p15-approved-files.json');
const allowed=new Set([...Object.keys(manifest.files),'tests/p15-approved-files.json',...Object.keys(require('./p16-approved-files.json').files),'tests/p16-approved-files.json']);module.exports={allowed};
if(require.main===module){
const git=a=>cp.execFileSync('git',a,{cwd:root,maxBuffer:32*1024*1024}),norm=b=>b.includes(0)?b:Buffer.from(b.toString().replace(/\r\n/g,'\n')),sha=b=>crypto.createHash('sha256').update(b).digest('hex'),read=f=>{const b=norm(fs.readFileSync(path.join(root,f)));return b.includes(0)?b:Buffer.from(require('./p16-original-files.cjs')(f,b.toString()));},old=f=>norm(git(['show',manifest.base+':'+f]));let preserved=0;
for(const file of git(['ls-tree','-r','--name-only',manifest.base]).toString().trim().split('\n')){if(!allowed.has(file)){assert.deepEqual(read(file),old(file),file);preserved++;}else if(manifest.files[file]?.before)assert.equal(sha(old(file)),manifest.files[file].before,'Base '+file);}
for(const file of [...git(['diff','--name-only',manifest.base]).toString().split('\n'),...git(['ls-files','--others','--exclude-standard']).toString().split('\n')].filter(Boolean))assert(allowed.has(file),'Fora do escopo P15: '+file);
for(const [file,h]of Object.entries(manifest.files))assert.equal(sha(read(file)),h.after,'Fonte não revisada: '+file);
function functions(code){const ast=ts.createSourceFile('app.tsx',code.toString(),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);const result=new Map();function visit(n){if(ts.isFunctionDeclaration(n)&&n.name)result.set(n.name.text,n.getText(ast));ts.forEachChild(n,visit);}visit(ast);return result;}
const app=functions(read('components/DmpApp.tsx')),prior=functions(old('components/DmpApp.tsx'));
for(const n of ['CalendarTodayPanel','AgendaRangeContent','AgendaEventDetails','AgendaWeekView','AgendaMonthView','AgendaYearView'])assert.equal(app.get(n),prior.get(n),'Home/Agenda preservada: '+n);
const mp=functions(read('app/api/mercado-pago/route.ts')),oldMp=functions(old('app/api/mercado-pago/route.ts'));
for(const [name,code]of oldMp)if(!['validateTarget','applyToFinance','persistDecision','POST'].includes(name))assert.equal(mp.get(name),code,'Parser/regra/valor MP: '+name);
assert(!read('lib/widget/agenda-attendance.ts').toString().match(/fetch\(|pool\.|INSERT|UPDATE|registerAbsence/));
const appCss=read('app/globals.css').toString(),oldCss=old('app/globals.css').toString();const outside=s=>s.split('\n').filter(l=>!l.startsWith('.intelligent-history-')).join('\n');assert.equal(outside(appCss),outside(oldCss),'CSS fora do painel inteligente intacto');
for(const f of ['components/HomeStudentActions.tsx','lib/widget/attendance-state.ts','lib/widget/today.ts','lib/widget/home-source.ts','lib/kids/automatic-attendance.ts','lib/kids/automatic-attendance-server.ts','lib/kids/automatic-attendance-worker.ts','app/api/kids/route.ts','app/api/finance/pin/route.ts','package.json','package-lock.json','start-dmp.cjs'])assert.deepEqual(read(f),old(f),f);
console.log('PASS P15 ESCOPO: '+preserved+' arquivos da base intactos; fontes alteradas conferidas por SHA256. Home Personal/Kids, ações e contadores, agenda completa, rotinas Kids, APK, PIN, parser/regras MP e dependências preservados.');
}
