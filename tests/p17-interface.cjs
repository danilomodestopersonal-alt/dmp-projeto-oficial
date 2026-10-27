'use strict';
const assert=require('assert/strict'),ts=require('typescript'),React=require('react'),H=require('./p15-harness.cjs'),{renderToStaticMarkup}=require('react-dom/server');
const source=H.read('components/DmpApp.tsx');
function extract(name){const ast=ts.createSourceFile('app.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);return ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name).getText(ast);}
function fn(name,deps){const m={exports:{}};new Function('require','module','exports',...Object.keys(deps),H.compile(extract(name)+'\nexports.fn='+name))(require,m,m.exports,...Object.values(deps));return m.exports.fn;}
const date='2026-10-27',calls=[],states=[];
const hooks={useState:x=>[typeof x==='function'?x():x,v=>states.push(v)],useEffect:()=>{},useRef:x=>({current:x})};
const localDateKey=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const deps={...hooks,today:()=>date,localDateKey};
function nodes(n,p){if(!n||typeof n!=='object')return [];if(Array.isArray(n))return n.flatMap(x=>nodes(x,p));return [...(p(n)?[n]:[]),...nodes(n.props?.children,p)];}
const Calendar=fn('MiniMonthCalendar',deps),tree=Calendar({onSelect:d=>calls.push(d)});
const today=nodes(tree,n=>n.props?.className==='mini-month-today')[0],agenda=nodes(tree,n=>n.props?.className==='mini-month-agenda')[0];assert.equal(today.props.children,'Hoje');assert.equal(agenda.props.children,'Agenda');today.props.onClick();agenda.props.onClick();assert.deepEqual(calls,[date,date]);assert.equal(nodes(tree,n=>n.props?.className==='mini-month-actions').length,1);
const Rail=fn('DesktopAgendaRail',{...hooks,today:()=>date,localDateKey,calendarEventDate:e=>e.start.slice(0,10),getCalendarEventStudents:()=>[],kidsCalendarRequest:()=>null,formatCalendarTime:()=> '10:00',beginPanelResize(){}});
const rail=Rail({events:[],students:[],onOpenAgenda(){},onOpenStudent(){},onRefresh(){}}),html=renderToStaticMarkup(rail);assert(!html.includes('Abrir agenda'));assert(html.includes('Hoje'));assert(html.includes('+ Encaixe'));assert(html.includes('agenda-rail-scroll'));
const css=H.read('app/globals.css');assert(css.includes('@media(min-width:901px){\n #dmp-home-modern .home-main-content .performance-today-empty'));assert(css.includes('flex:0 0 auto;justify-content:flex-start!important'));assert(source.includes('performanceActivities.length?"":"performance-today-empty"'));
if(process.env.P17_RENDER_FIXTURE){const fs=require('fs');fs.writeFileSync(process.env.P17_RENDER_FIXTURE,`<!doctype html><html><meta charset="UTF-8"><style>${css}</style><body><main style="width:280px;margin:20px">${renderToStaticMarkup(tree)}<div class="today-highlight-grid todoist-home-grid"><button class="today-highlight-card performance-today-card performance-today-empty" style="height:180px"><div><strong>Treino do dia</strong><span class="highlight-lines"><small>Nenhum treino pessoal registrado hoje.</small></span></div></button></div></main></body></html>`);}
console.log('PASS P17 INTERFACE: calendário mantém callbacks e dias; rail mantém lista/encaixe; alinhamento vazio restrito ao desktop.');
