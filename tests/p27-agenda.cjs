'use strict';
const assert=require('assert/strict'),cp=require('child_process'),H=require('./p15-harness.cjs'),ts=require('typescript');
const load=H.loader(),links=load('lib/widget/links.ts');
const url='/app?widget=agenda&date=2026-11-05&range=preferred';
assert.equal(links.widgetTarget(url.split('?')[1]).range,'preferred');assert.equal(links.widgetReturn(url),url);
for(const bad of [url.replace('agenda','home'),url.replace('preferred','finance'),url.replace('2026-11-05','2026-02-30')])assert.equal(links.widgetTarget(bad.split('?')[1]),null);
assert.equal(links.widgetReturn('https://wrong.test'+url),'/app');assert.equal(links.widgetTarget('widget=agenda&date=2026-11-05&range=week').range,'week');
const current=H.read('components/DmpApp.tsx'),base=cp.execFileSync('git',['show','22ccf87:components/DmpApp.tsx'],{encoding:'utf8',maxBuffer:32e6});
function fn(s,name){const ast=ts.createSourceFile('app.tsx',s,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);return ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name).getText(ast)}
for(const name of ['GoogleEventForm','AgendaWeekView','AgendaMonthView','AgendaYearView','AgendaEventDetails'])assert.equal(fn(current,name),fn(base,name),name+' behavior unchanged');
const effect=current.slice(current.indexOf('  // Only widget URLs enter this bridge.'),current.indexOf('  async function unlockFinance'));
for(const preferred of ['day','week','month','year','list','invalid',null]){let state={};let window={location:{search:url.split('?')[1]},history:{state:{},replaceState(){}}};new Function('useEffect','navigationReady','studentsLoaded','widgetNavigationHandled','widgetTarget','window','localStorage','setWidgetWeek','setCalendarAnchor','setCalendarRange','setView','students','notes',H.compile(effect))((cb)=>cb(),true,true,{current:false},links.widgetTarget,window,{getItem:()=>preferred},v=>state.widgetWeek=v,v=>state.date=v,v=>state.range=v,v=>state.view=v,[],[]);assert.deepEqual(state,{widgetWeek:false,date:'2026-11-05',range:['day','week','month','year','list'].includes(preferred)?preferred:'week',view:'agenda'});}
console.log('PASS P27: full Agenda entry, saved five modes/default, safe return through existing DMP login, legacy routes and existing form/week unchanged; desktop smart clicks covered by P29.');
