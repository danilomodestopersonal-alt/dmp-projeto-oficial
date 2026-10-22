'use strict';
const fs=require('fs'),path=require('path'),cp=require('child_process'),assert=require('assert/strict'),crypto=require('crypto'),ts=require('typescript');
const root=path.resolve(__dirname,'..'),base="b5fc6898fa7a5e6f0d68f51e453838c3e7638bfd";
const production=["app/api/kids/route.ts", "app/api/kids/automatic-attendance/route.ts", "components/DmpApp.tsx", "components/calendar/CalendarRosterEditor.tsx", "lib/kids/seed.ts", "lib/kids/automatic-attendance.ts", "lib/kids/automatic-attendance-server.ts", "lib/kids/automatic-attendance-worker.ts", "types/kids.ts", "package.json", "start-dmp.cjs", "instrumentation.ts"],support=["tests/p14-final-version.cjs", "tests/p14-final-automatic.cjs", "tests/p14-final-worker.cjs", "tests/p14-final-startup.cjs", "tests/p14-final-preservation.cjs", "tests/p14-final-original.cjs", "tests/p14-final-edits.json", "tests/p14-final-hashes.json", "tests/p14-preservation.cjs", "tests/p14-original-files.cjs"];
const allowed=new Set([...production,...support]);module.exports={production,support,allowed};
if(require.main===module){
const git=a=>cp.execFileSync('git',a,{cwd:root,maxBuffer:32*1024*1024}),norm=b=>b.includes(0)?b:Buffer.from(b.toString().replace(/\r\n/g,'\n')),read=f=>fs.readFileSync(path.join(root,f),'utf8').replace(/\r\n/g,'\n');let preserved=0;
for(const file of git(['ls-tree','-r','--name-only',base]).toString().trim().split('\n'))if(!allowed.has(file)){assert.deepEqual(norm(fs.readFileSync(path.join(root,file))),norm(git(['show',base+':'+file])),file);preserved++;}
for(const file of [...git(['diff','--name-only',base]).toString().split('\n'),...git(['ls-files','--others','--exclude-standard']).toString().split('\n')].filter(Boolean))assert(allowed.has(file),'Fora do escopo final: '+file);
for(const [file,hash]of Object.entries(require('./p14-final-hashes.json')))assert.equal(crypto.createHash('sha256').update(read(file)).digest('hex'),hash,file);
for(const file of Object.keys(require('./p14-final-edits.json')))assert.equal(require('./p14-final-original.cjs')(file,read(file)),norm(git(['show',base+':'+file])).toString());
const app=read('components/DmpApp.tsx'),old=norm(git(['show',base+':components/DmpApp.tsx'])).toString();
function fn(source,name){const ast=ts.createSourceFile('app.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);return ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name).getText(ast);}
assert.equal(fn(app,'CalendarTodayPanel'),fn(old,'CalendarTodayPanel'),'Home Personal/Kids congelada');
assert.doesNotMatch(fn(app,'AgendaEventDetails'),/Alterar horário|onChangeTime/);assert.doesNotMatch(fn(app,'AgendaWeekView'),/Alterar horário|onChangeTime/);assert.doesNotMatch(fn(app,'AgendaMonthView'),/Alterar horário|onChangeTime/);
assert.match(read('components/calendar/CalendarRosterEditor.tsx'),/onChangeTime\?<div/);
assert.match(read('lib/kids/automatic-attendance-server.ts'),/FOR UPDATE/);assert.match(read('lib/kids/automatic-attendance-server.ts'),/pg_try_advisory_xact_lock/);
assert.match(read('instrumentation.ts'),/DMP_KIDS_SCHEDULER==='1'/);assert.doesNotMatch(read('lib/kids/automatic-attendance.ts'),/fetch\(|normalizeKidsData\(/);
assert.doesNotMatch(read('lib/kids/seed.ts'),/const passed=|status:passed/);
console.log('PASS P14 FINAL ESCOPO: '+production.length+' arquivos de produção, '+preserved+' arquivos da base intactos. Personal, Home/layout aprovados, widgets/APK, recorrência Google, DS e Financeiro preservados.');
}
