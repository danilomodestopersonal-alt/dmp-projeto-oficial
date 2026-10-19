const fs=require('fs'),cp=require('child_process'),assert=require('assert/strict');const base='20f2a6fdc7cb85c4872ce3d23dcc1060c557c7ac';const app=fs.readFileSync('components/DmpApp.tsx','utf8').replace(/\r\n/g,'\n');
const before="<div data-home-size-key=\"calendar\"><AbsenceSyncPanel {...absenceSync} students={students} events={calendarEvents} onRetry={absenceSync.retry}/><CalendarTodayPanel",after="<div data-home-size-key=\"calendar\"><CalendarTodayPanel";
assert.equal(app.split(after).length,2);assert(!app.includes(before));assert.equal(app.split('<AbsenceSyncPanel ').length,2);
assert.equal(app.replace(after,before),cp.execFileSync('git',['show',base+':components/DmpApp.tsx'],{encoding:'utf8',maxBuffer:20000000}).replace(/\r\n/g,'\n'));
console.log('PASS Home sem painel; Agenda preservada; unica alteracao de producao verificada contra base');
for(const f of cp.execFileSync('git',['ls-tree','-r','--name-only',base],{encoding:'utf8'}).trim().split('\n')){if(f==='components/DmpApp.tsx'||f.startsWith('tests/'))continue;const a=fs.readFileSync(f),b=cp.execFileSync('git',['show',base+':'+f],{maxBuffer:20000000});assert.equal(a.includes(0)?a.toString('hex'):a.toString().replace(/\r\n/g,'\n'),b.includes(0)?b.toString('hex'):b.toString().replace(/\r\n/g,'\n'),f)}
console.log('PASS todos os demais arquivos de producao preservados');
