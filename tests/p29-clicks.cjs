'use strict';
const A=require('node:assert/strict'),ts=require('typescript'),H=require('./p15-harness.cjs');
const source=H.read('components/DmpApp.tsx'),ast=ts.createSourceFile('x.tsx',source,99,true,4),fn=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='DesktopAgendaRail').getText(ast);
let opened=[],lessons=[],adds=0;
const React={useState:()=>[null,v=>{if(v?.id)lessons.push(v.id);else adds++;}]};
const load=H.loader({react:React});
const rail=load('components/P29Synthetic.tsx',`import {useState} from 'react';const today=()=>"2099-01-01",localDateKey=(d:any)=>d.toISOString().slice(0,10),calendarEventDate=(e:any)=>e.start.slice(0,10),kidsCalendarRequest=()=>null,formatCalendarTime=()=>"08:00",getCalendarEventStudents=(e:any,s:any)=>s,beginPanelResize=()=>{},AddStudentsToCalendarEventModal=()=>null,GoogleEventForm=()=>null;export ${fn}`).DesktopAgendaRail;
const tree=rail({events:[{id:'lesson',start:'2099-01-01T08:00:00-03:00',end:'2099-01-01T09:00:00-03:00'}],students:[{id:'a',name:'Alfa Teste'},{id:'b',name:'Beta Colega'}],onOpenAgenda:()=>opened.push('agenda'),onOpenStudent:id=>opened.push(id),onRefresh:()=>{}});
function all(t){if(Array.isArray(t))return t.flatMap(all);if(!t||typeof t!=='object')return [];return [t,...all(t.props?.children)];}
const nodes=all(tree),article=nodes.find(n=>n.type==='article'),names=nodes.filter(n=>n.type==='button'&&['Alfa Teste','Beta Colega'].includes(n.props.children));
for(const b of names){let stopped=false;b.props.onClick({stopPropagation:()=>{stopped=true}});if(!stopped)article.props.onClick();}
A.deepEqual(opened,['a','b']);A.equal(lessons.length,0);A.ok(names.every(n=>n.type==='button'),'native keyboard support');
const plus=nodes.find(n=>n.props?.['aria-label']==='Adicionar aluno');let stopped=false;plus.props.onClick({stopPropagation:()=>{stopped=true}});if(!stopped)article.props.onClick();A.deepEqual(lessons,['lesson']);article.props.onClick();A.deepEqual(lessons,['lesson','lesson']);
const time=nodes.find(n=>n.type==='button'&&all(n).some(x=>x.type==='small'));stopped=false;time.props.onClick({stopPropagation:()=>{stopped=true}});if(!stopped)article.props.onClick();A.equal(lessons.length,3);
const link=H.loader()('components/home/SpotifyPanelLink.tsx').default();A.equal(link.type,'a');A.equal(link.props.href,'https://open.spotify.com/');A.equal(link.props.target,'_blank');A.equal(link.props.rel,'noopener noreferrer');A.equal(link.props.onClick,undefined);
console.log('PASS P29 CLICKS: one action per name/time/blank/+ click; individual IDs and native keyboard buttons; Spotify is navigation only in a new context.');
