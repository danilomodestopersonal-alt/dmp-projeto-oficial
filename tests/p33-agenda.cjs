'use strict';
const A=require('node:assert/strict'),H=require('./p15-harness.cjs'),ts=require('typescript'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const load=H.loader(),home=load('lib/widget/home-source.ts'),maintenance=load('lib/calendar/personal-maintenance.ts');
const students=['Felipe Almeida','Felipe Schulhof','Ana Silva'].map((name,i)=>({id:'synthetic-'+i,name,status:'ACTIVE',sessions:[],workouts:[],assessments:[]}));
const event=(summary,extra={})=>({id:'synthetic-event',summary,start:'2026-11-12T12:00:00-03:00',end:'2026-11-12T13:00:00-03:00',...extra});
const match=(e,s=students)=>home.matchCalendarEvents([e],s)[0];
for(const summary of ['Reuniao Adriano Almeida','Reunião com Felipe Almeida','Consulta Felipe Almeida','Felipe Almeida','Viagem com Ana Silva','Almeida']){
 const raw=event(summary,{matchedStudentId:students[0].id,matchedStudentIds:[students[0].id]}),before=JSON.stringify(raw),m=match(raw);A.deepEqual(m.matchedStudentIds,[],summary);A.equal(m.summary,summary);A.equal(JSON.stringify(raw),before);
 A.deepEqual(match({...raw,recurringEventId:'unlinked-series'}).matchedStudentIds,[],summary+' recurring');
}
A.deepEqual(match(event('Aula · Felipe Almeida'),[...students,{...students[0],id:'homonym'}]).matchedStudentIds,[]);
console.log('PASS P33 surname, full name, stale matches and unlinked recurrence never establish a lesson');
for(const [title,ids]of [['Aula · Felipe Almeida',['synthetic-0']],['Aula · Felipe Almeida · Ana Silva',['synthetic-0','synthetic-2']]])A.deepEqual(match(event(title)).matchedStudentIds,ids);
const history=structuredClone(students);history[0].sessions=[{calendarEvent:{id:'known-series_20261105T150000Z'}}];
const recurring=event('Felipe Almeida · Ana Silva',{id:'known-series_20261112T150000Z',recurringEventId:'known-series_R20261105T150000'});
A.deepEqual(match(recurring,history).matchedStudentIds,['synthetic-0','synthetic-2']);
A.deepEqual(match({...recurring,summary:'Reunião com Felipe Almeida'},history).matchedStudentIds,[]);
const rule={op:'synthetic-edit',at:1,from:recurring.start,ids:['synthetic-0'],add:[],remove:['synthetic-2'],scope:'following',eventId:recurring.id};
A.deepEqual(match({...recurring,calendarRoster:{rules:[rule]}},history).matchedStudentIds,['synthetic-0']);
A.deepEqual(match({...recurring,calendarRoster:{single:{...rule,scope:'single',ids:[]},rules:[]}},history).matchedStudentIds,[]);
A.deepEqual(match(event('Reuniao Adriano Almeida',{allDay:true})).matchedStudentIds,[]);
console.log('PASS P33 legitimate single/shared lessons, exact series history and authoritative roster changes preserved');
const raw={...event('Reuniao Adriano Almeida'),etag:'e1',organizer:{self:true},start:{dateTime:'2026-11-12T12:00:00-03:00'},end:{dateTime:'2026-11-12T13:00:00-03:00'}};
A.throws(()=>maintenance.assertPersonal(raw,undefined,students),/identidade/);
for(const extra of [{organizer:{self:false}},{attendees:[{self:false}]},{locked:true}])A.throws(()=>maintenance.assertPersonal({...raw,...extra,summary:'Aula · Felipe Almeida'},undefined,students));
console.log('PASS P33 ownership, identity and third-party guards remain active; no network or writes');
const source=H.read('components/DmpApp.tsx'),ast=ts.createSourceFile('x.tsx',source,99,true,4),get=name=>ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name).getText(ast);
const names=['AgendaRangeContent','AgendaEventDetails','AgendaWeekView','agendaWeekDays'];
const deps={React,getCalendarEventStudents:home.getCalendarEventStudents,kidsCalendarRequest:home.kidsCalendarRequest,calendarEventDate:home.calendarEventDate,localDateKey:d=>d.toISOString().slice(0,10),formatDate:s=>s,formatRailDate:e=>e.start.slice(0,10),formatCalendarTime:e=>new Date(e.start).toLocaleTimeString('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'}),getStudentWorkoutEntries:()=>[]};
const m={exports:{}};new Function('require','module','exports',...Object.keys(deps),H.compile(names.map(get).join('\n')+'\nexports.View=AgendaRangeContent;'))(require,m,m.exports,...Object.values(deps));
for(const range of ['day','week','list']){
 const events=[match(event('Aula · Ana Silva',{id:'lesson',start:'2026-11-12T11:00:00-03:00',end:'2026-11-12T12:00:00-03:00'})),match(event('Reuniao Adriano Almeida'))];
 const html=renderToStaticMarkup(React.createElement(m.exports.View,{range,anchor:'2026-11-12',events,students}));A.match(html,/Reuniao Adriano Almeida/);A.match(html,/Compromisso · 12:00–13:00/);A.doesNotMatch(html,/Felipe Almeida/);A.match(html,/Ana Silva/);A.ok(html.indexOf('Ana Silva')<html.indexOf('Reuniao Adriano Almeida'));
 const personalOnly=renderToStaticMarkup(React.createElement(m.exports.View,{range,anchor:'2026-11-12',events:[events[1]],students}));A.doesNotMatch(personalOnly,/Editar alunos|Treinos do horário|Presença|Excluir|Registrar/);
 if(range!=='week'){A.match(html,/Editar alunos/);A.match(html,/Presença/);A.match(html,/Excluir/);}
 console.log('PASS P33 actual '+range+': original meeting title, time/duration, no fictitious student controls; lesson controls preserved');
}
const appMatch=get('matchCalendarEvents').replace(/^function/,'export function');A.equal(appMatch,homeSourceFunction('matchCalendarEvents'),'web and server matcher identical');
function homeSourceFunction(name){const s=H.read('lib/widget/home-source.ts'),a=ts.createSourceFile('h.ts',s,99,true,3);return a.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name).getText(a);}
A.match(get('GoogleEventForm'),/setSummary\("Aula · "/);A.match(get('CalendarAgenda'),/if\(!getCalendarEventStudents\(event,students\)\.length\)\{setAppointmentEvent\(event\);return;\}/);
console.log('PASS P33 explicit new-lesson selection and common-appointment details routing');
