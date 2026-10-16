const assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),crypto=require('crypto'),ts=require('typescript'),b=require('./widgets-agenda-baseline.json'),root=path.resolve(__dirname,'..');
for(const [f,h]of Object.entries(b.unchanged))if(!require('./consolidated-preservation-baseline.json').changed.includes(f))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f)).toString('binary').replace(/\r\n/g,'\n'),'binary').digest('hex'),h,f);
const funcs=s=>new Map(ts.createSourceFile('a.tsx',s.replace(/\r\n/g,'\n'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX).statements.filter(x=>ts.isFunctionDeclaration(x)&&x.name).map(x=>[x.name.text,x.getText()]));const before=funcs(b.original['components/DmpApp.tsx']),after=funcs(fs.readFileSync(path.join(root,'components/DmpApp.tsx'),'utf8'));
for(const [name,body]of before)if(!['AddStudentsToCalendarEventModal','AgendaEventDetails','AgendaWeekView','matchCalendarEvents','organizeQuickTranscript','DmpApp','DesktopAgendaRail'].includes(name))assert.equal(after.get(name),body,name);
console.log('PASS preservação da rodada anterior fora do novo escopo autorizado; validação atual abaixo');

require('./consolidated-preservation.cjs');
