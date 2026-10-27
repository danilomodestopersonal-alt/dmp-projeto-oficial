'use strict';
const assert=require('assert/strict'),cp=require('child_process'),crypto=require('crypto'),ts=require('typescript'),H=require('./p15-harness.cjs'),m=require('./p17-approved-files.json');
const sha=s=>crypto.createHash('sha256').update(s.replace(/\r\n/g,'\n')).digest('hex');
const before=f=>cp.execFileSync('git',['show',m.base+':'+f],{cwd:H.root,encoding:'utf8',maxBuffer:32*1024*1024}).replace(/\r\n/g,'\n');
for(const [f,spec]of Object.entries(m.files)){assert.equal(sha(H.read(f)),spec.after,'Current approved hash: '+f);assert.equal(sha(before(f)),spec.before);}
const allowedTests=['tests/p15-interface.cjs','tests/p16-original-files.cjs','tests/widget-v2-legacy-read.cjs'];
for(const f of cp.execFileSync('git',['diff','--name-only',m.base],{cwd:H.root,encoding:'utf8'}).trim().split('\n').filter(Boolean))assert(f in m.files||allowedTests.includes(f),'Unexpected change: '+f);
function functions(s){const out={},ast=ts.createSourceFile('app.tsx',s,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);for(const n of ast.statements)if(ts.isFunctionDeclaration(n)&&n.name)out[n.name.text]=n.getText(ast);return out;}
const old=functions(before('components/DmpApp.tsx')),now=functions(H.read('components/DmpApp.tsx'));
for(const name of Object.keys(old))if(!['Sidebar','MiniMonthCalendar','DesktopAgendaRail','TodayHighlights'].includes(name))assert.equal(now[name],old[name],name);
assert.equal(now.DesktopAgendaRail,old.DesktopAgendaRail.replace('      <button type="button" className="text-button" onClick={()=>onOpenAgenda(todayKey)}>Abrir agenda</button>\n',''));
assert.equal(now.TodayHighlights.replace('className={`today-highlight-card performance-today-card ${performanceActivities.length?"":"performance-today-empty"}`}','className="today-highlight-card performance-today-card"'),old.TodayHighlights);
assert(H.read('app/globals.css').startsWith(before('app/globals.css')));
console.log('PASS P17 ESCOPO: hashes, funções fora do escopo, rail e treino preservados; financeiro, API e regras aprendidas intactos.');
