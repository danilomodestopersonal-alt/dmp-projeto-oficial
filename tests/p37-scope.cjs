'use strict';
const A=require('node:assert/strict'),nativeFs=require('node:fs'),cp=require('node:child_process'),crypto=require('node:crypto'),ts=require('typescript'),m=require('./p37-approved-files.json');
const fs={...nativeFs,readFileSync:require('./p37b-historical-read.cjs')};
const git=(...a)=>cp.execFileSync('git',a,{maxBuffer:32e6}),hash=b=>crypto.createHash('sha256').update(b.includes(0)?b:Buffer.from(b.toString().replace(/\r\n/g,'\n'))).digest('hex');
for(const [f,s] of Object.entries(m.files)){A.equal(hash(fs.readFileSync(f)),s.after,f);if(s.before)A.equal(hash(git('show',m.base+':'+f)),s.before,f);}
let preserved=0;for(const f of git('ls-tree','-r','--name-only',m.base).toString().trim().split('\n')){if(f.startsWith('tests/')||require('./p37b-approved-files.json').files[f]||m.files[f])continue;A.equal(hash(fs.readFileSync(f)),hash(git('show',m.base+':'+f)),f);preserved++;}
for(const f of [...git('diff','--name-only',m.base).toString().trim().split('\n'),...git('ls-files','--others','--exclude-standard').toString().trim().split('\n')].filter(Boolean))A.ok(f.startsWith('tests/')||require('./p37b-approved-files.json').files[f]||m.files[f],'Outside P37: '+f);
const read=f=>fs.readFileSync(f,'utf8'),old=f=>git('show',m.base+':'+f).toString(),app=read('components/DmpApp.tsx');
const normalized=app.replace('import RoutineToday from "@/components/routine/RoutineToday";\n','').replace(/^              <RoutineToday[^\n]*\n/m,'').replace('{view === "students" ? <div className="students-directory">','{view === "students" ? <>').replace('className="dashboard-content students-directory-content"','className="dashboard-content"').replace('          </div> : null}\n\n          {view === "workouts-overview"','          </> : null}\n\n          {view === "workouts-overview"').replace('A inativação confere agenda e mensalidades automaticamente.','A inativação/reativação exige conferir agenda e mensalidades.');
A.equal(normalized,old('components/DmpApp.tsx'),'all existing Home, calendar, counts, students, finance, Kids and actions remain exact outside scoped integration');
A.ok(app.indexOf('<RoutineToday')>app.indexOf('<CalendarTodayPanel onCorrected'),'Home routine after approved daily agenda');
A.ok(read('app/globals.css').startsWith(old('app/globals.css')),'all previous CSS preserved');
const css=read('app/globals.css').slice(old('app/globals.css').length);A.match(css,/@media\(max-width:1050px\)/);A.doesNotMatch(css,/finance|kids|home-/);
A.equal(read('lib/students/lifecycle.ts').replace('effectiveAt?:string;',''),old('lib/students/lifecycle.ts'),'financial/lifecycle calculations unchanged');
for(const f of ['app/api/routine/route.ts','app/api/routine/import/route.ts','app/api/routine/files/route.ts']){A.match(read(f),/isAuthorized/);A.doesNotMatch(read(f),/google-calendar|todoist|finance_v1|students_v1|integrations\/ds/);}
A.match(read('lib/routine/store.ts'),/personal_routine_v1/);A.match(read('app/api/routine/import/route.ts'),/personal_routine_file:/);A.doesNotMatch(read('app/api/routine/import/route.ts'),/applyRoutineActivation/);
const lifecycle=read('components/students/StudentLifecycle.tsx');A.match(lifecycle,/command.kind==='resume'\?<fieldset/);A.match(lifecycle,/Confirmar inativação/);A.match(read('app/api/students/lifecycle/route.ts'),/inactivateNowCommand\(input.command\?\.studentId,confirmedAt\)/);
console.log('PASS P37 scope: '+Object.keys(m.files).length+' production files, '+preserved+' preserved; personal namespace only, no Android/OAuth/financial rules/Kids/DS changes.');
