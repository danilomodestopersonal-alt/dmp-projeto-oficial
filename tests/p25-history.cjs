'use strict';
const assert=require('node:assert/strict'),H=require('./p15-harness.cjs'),React=require('react'),ts=require('typescript'),{renderToStaticMarkup}=require('react-dom/server');
const load=H.loader(),A=load('lib/calendar/attendance-correction.ts'),G=load('lib/calendar/corrected-session-guard.ts'),{isRealizedSession}=load('lib/calendar/session-history.ts');
const today='2026-10-31',absence=H.session(),present={...absence,id:'present',source:'ATTENDANCE'},workout={...absence,id:'workout',date:'2026-10-22',source:'FREE',workoutName:'Treino preservado',completedExercises:[{id:'exercise',name:'Agachamento',sets:'3',reps:'12',load:'10'}]};
for(const s of [absence,{...absence,date:'2020-01-01'},{...absence,date:today},{...present,date:'2026-11-01'},{...present,status:'PENDING'},{...present,status:'CANCELLED'},{...workout,startedAt:'2026-10-23T12:00:00Z'}])assert.equal(isRealizedSession(s,today),false);
for(const s of [present,workout,{...workout,source:'IMPORTED'},{...workout,source:undefined}])assert(isRealizedSession(s,today));
const people=H.students();people[0].sessions.push(workout);people[0].sessions[0].replacementCredit={id:'existing-credit',consumed:false};
const before=structuredClone(people),rev=A.correctionRevision(people[0].sessions[0]),undone=A.undoAbsence(people[0],people[0].sessions[0],rev);
assert.deepEqual(people,before);assert.equal(undone.sessions.length,1);assert.deepEqual(undone.sessions[0],workout);assert.deepEqual(undone.undoneAbsences[0].session,before[0].sessions[0]);assert.equal(undone.sessions.filter(s=>s.source==='ATTENDANCE').length,0);
const next=[undone,people[1]];assert(G.correctedSessionsPreserved(next,JSON.parse(JSON.stringify(next))));assert(!G.correctedSessionsPreserved(next,people));assert(!G.correctedSessionsPreserved(people,next));
const resurrect=structuredClone(next);resurrect[0].sessions.push(absence);assert(!G.correctedSessionsPreserved(next,resurrect));
const corrected=A.correctedAttendance(absence,A.correctionRevision(absence));assert(isRealizedSession(corrected,today));assert.deepEqual(corrected.completedExercises,[]);
// Render actual HistoryPanel for shared desktop/mobile DOM, never rewriting source under test.
const source=H.read('components/DmpApp.tsx'),ast=ts.createSourceFile('app.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const extract=name=>ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name).getText(ast);
const deps={useState:x=>[x,()=>{}],React,today:()=>today,normalizeName:s=>s.toLowerCase(),dateOffset:()=>'',formatDate:s=>s,assessmentSorted:s=>s.assessments,consultationStyles:{trigger:'trigger'},sessionSourceLabel:s=>s.source,exportStudentSessionsCsv(){},RecordsConsultation:()=>null,isRealizedSession};
const m={exports:{}};new Function('require','module','exports',...Object.keys(deps),H.compile(extract('HistoryPanel')+'\nexports.HistoryPanel=HistoryPanel'))(require,m,m.exports,...Object.values(deps));
const student={...people[0],sessions:[absence,{...absence,id:'ancient',date:'2020-01-01'},present,workout,{...present,id:'future',date:'2099-01-01'}]};
const html=renderToStaticMarkup(React.createElement(m.exports.HistoryPanel,{student,onSave(){},onDelete(){},onUseToday(){},onOpenWorkout(){},onCorrected(){}}));
assert.match(html,/<span>Ausências<\/span><strong>1<\/strong>/);assert.doesNotMatch(html,/option value="ABSENCE"|Ausência registrada|2020-01-01|2099-01-01/);assert.match(html,/Treino preservado/);assert.match(html,/Agachamento/);assert.match(html,/Presença registrada sem detalhamento/);
assert.match(extract('CalendarTodayPanel'),/AttendanceCorrection/);assert.match(extract('CalendarTodayPanel'),/AbsenceDateCorrections/);
assert.match(H.read('components/calendar/AttendanceCorrection.tsx'),/Desfazer ausência/);assert.match(H.read('components/calendar/AttendanceCorrection.tsx'),/Corrigir para presente/);assert.match(H.read('components/calendar/AttendanceCorrection.tsx'),/window.confirm/);
console.log('PASS P25 HISTORY: old/new absences excluded; performed preserved; indicators; Home controls; undo archival and stale-tab guard.');
// API transaction tests with synthetic DB and Google; no real writes.
function env(fail=false){let data=structuredClone(people),snapshot,saved=0;const g=H.google(),commands=[];
 async function query(sql,args=[]){commands.push([sql,args]);if(sql==='BEGIN')snapshot=structuredClone(data);if(sql==='ROLLBACK'&&snapshot)data=snapshot;if(sql.includes('pg_try_advisory_lock'))return{rows:[{locked:true}]};if(sql.startsWith('SELECT payload'))return{rows:[{payload:structuredClone(data)}]};if(sql.startsWith('UPDATE')&&args[0]==='students'){if(fail)throw Error('DB failure');data=JSON.parse(args[1]);saved++;}return{rows:[]};}
 const api=H.loader({'@/lib/auth':{isAuthorized:async()=>true},'@/lib/db':{pool:{query,connect:async()=>({query,release(){}})}},'@/lib/widget/devices':{sameOrigin:()=>true},'@/lib/google-calendar':{getGoogleAccessToken:async()=>({accessToken:'test'}),setGoogleCookies(){}},'next/server':{NextResponse:{json:H.json}}},g.fetch)('app/api/students/attendance-correction/route.ts');
 const req=body=>({nextUrl:new URL('https://test/api?studentId=person&sessionId=absence-1'),json:async()=>body});return {api,req,get data(){return data;},get saved(){return saved;},commands};}
(async()=>{for(const action of ['UNDO','PRESENT']){
 const e=env();e.data[0].sessions;const p=await e.api.GET(e.req());assert.equal(p.status,200);assert.equal(e.saved,0);
 // Remove second synthetic session from the same occurrence to satisfy existing duplicate protection.
 // Fixture workout belongs to another occurrence/date.
 const body={...p.body,studentId:'person',sessionId:'absence-1',confirmed:true,action};const res=await e.api.POST(e.req(body));assert.equal(res.status,200,JSON.stringify(res.body));assert.equal(e.saved,1);
 assert(e.commands.some(([s,a])=>s.startsWith('INSERT')&&a[0].startsWith('attendance_backup:')));
 assert.equal((await e.api.POST(e.req(body))).body.already,true);assert.equal(e.saved,1);
 assert.deepEqual(e.data[1],people[1]);assert.deepEqual(e.data[0].workouts,people[0].workouts);
 if(action==='UNDO'){assert.equal(e.data[0].sessions.length,1);assert.equal(e.data[0].undoneAbsences.length,1);}else{assert.equal(e.data[0].sessions.filter(s=>s.id==='absence-1'&&s.source==='ATTENDANCE').length,1);assert.deepEqual(e.data[0].sessions.find(s=>s.id==='absence-1').completedExercises,[]);}
}
 const e=env(true),p=await e.api.GET(e.req());assert.equal((await e.api.POST(e.req({...p.body,studentId:'person',sessionId:'absence-1',confirmed:true,action:'UNDO'}))).status,503);assert.deepEqual(e.data,people);
console.log('PASS P25 API: preview read-only, undo/present, retry, backup, rollback and data preservation.');})().catch(e=>{console.error(e);process.exitCode=1;});
// Home maps each status/correction to its occurrence, including missing Google cards.
const homeDeps={useFixedAppointments:()=>({data:{series:[]},error:''}),fixedOccurrences:()=>[],localDay:()=> '2026-11-11',React,getCalendarEventStudents:(e,s)=>s.filter(p=>(e.matchedStudentIds||[]).includes(p.id)),kidsCalendarRequest:()=>null,formatCalendarTime:e=>e.start,calendarEventStatus:()=>'',getStudentWorkoutEntries:()=>[],LastPresence:()=>null,HomeStudentActions:()=>null,completedWorkoutStatusLabel:()=> 'Presença',AttendanceCorrection:({session})=>React.createElement('button',{'data-session':session.id},'Ausente'),AbsenceDateCorrections:()=>null};
const hm={exports:{}};new Function('require','module','exports',...Object.keys(homeDeps),H.compile(extract('CalendarTodayPanel')+'\nexports.Panel=CalendarTodayPanel'))(require,hm,hm.exports,...Object.values(homeDeps));
const other={...present,id:'second',calendarEvent:{...present.calendarEvent,id:'second-event',start:H.date+'T09:00:00-03:00'}};
const home=renderToStaticMarkup(React.createElement(hm.exports.Panel,{students:[people[0]],events:[],todaySessions:[{student:people[0],session:absence},{student:people[0],session:other}],status:{connected:false,configured:true},sync:{},onCorrected(){}}));
assert.equal((home.match(/data-session="absence-1"/g)||[]).length,1);assert.equal((home.match(/home-completed-workout/g)||[]).length,1);
const dateLoad=H.loader({react:{...React,useState:x=>[x===''?H.date:x,()=>{}],useEffect(){},useRef:x=>({current:x})}});
const DatePanel=dateLoad('components/calendar/AbsenceDateCorrections.tsx').default;
const dated=renderToStaticMarkup(React.createElement(DatePanel,{students:people,onCorrected(){}}));assert.match(dated,/Pessoa Teste/);assert.match(dated,/06:30/);assert.match(dated,/Corrigir ausência/);
console.log('PASS P25 HOME: two occurrences independent; historical date and exact time; shared mobile/desktop components.');
