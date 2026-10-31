const assert=require('node:assert/strict'),H=require('./p15-harness.cjs');
(async()=>{
 const people=H.students(),g=H.google(),L=H.loader({},g.fetch),R=L('lib/calendar/absence-removal.ts');
 const op={key:R.absenceKey('person',H.event.id),studentId:'person',event:{...H.snapshot(),etag:H.event.etag},state:'pending',message:'',updatedAt:''};
 await R.removeAbsentParticipant(op,people,'synthetic',g.fetch);
 let state={students:structuredClone(people),dmp_absence_google_v1:{[op.key]:{...op,state:'confirmed'}}},snapshot;
 async function query(sql,args=[]){
  if(sql==='BEGIN')snapshot=structuredClone(state);if(sql==='ROLLBACK')state=snapshot;
  if(sql.includes('pg_try_advisory_lock'))return{rows:[{locked:true}]};
  if(sql.startsWith('SELECT payload'))return{rows:state[args[0]]?[{payload:structuredClone(state[args[0]])}]:[]};
  if(sql.startsWith('INSERT')&&!state[args[0]])state[args[0]]=JSON.parse(args[1]);
  if(sql.startsWith('UPDATE')){if(sql.includes('jsonb_set'))state[args[0]][args[1]]={...state[args[0]][args[1]],...JSON.parse(args[2])};else state[args[0]]=JSON.parse(args[1]);}
  return{rows:[]};
 }
 const load=H.loader({'@/lib/auth':{isAuthorized:async()=>true},'@/lib/db':{pool:{query,connect:async()=>({query,release(){}})}},'@/lib/widget/devices':{sameOrigin:()=>true},'@/lib/google-calendar':{googleConfigured:()=>true,getGoogleAccessToken:async()=>({accessToken:'synthetic'}),setGoogleCookies(){}},'next/server':{NextResponse:{json:H.json}}},g.fetch);
 const api=load('app/api/students/attendance-correction/route.ts'),req=body=>({nextUrl:new URL('https://test/api?studentId=person&sessionId=absence-1'),json:async()=>body});
 const p=await api.GET(req());assert.equal(p.status,200);
 const undone=await api.POST(req({...p.body,studentId:'person',sessionId:'absence-1',confirmed:true,action:'UNDO'}));assert.equal(undone.status,200,JSON.stringify(undone.body));assert.equal(state.students[0].sessions.length,0);assert.equal(state.students[0].undoneAbsences.length,1);
 const register=load('app/api/google/absence/route.ts');
 const again=await register.POST(req({action:'register',studentId:'person',event:{...H.snapshot(),etag:g.event.etag}}));assert.equal(again.status,200,JSON.stringify(again.body));assert(again.body.saved);assert.equal(again.body.operation.state,'confirmed');
 assert.equal(state.students[0].sessions.length,1);assert.equal(state.students[0].sessions[0].source,'ABSENCE');assert.notEqual(state.students[0].sessions[0].id,'absence-1');assert.equal(state.students[0].undoneAbsences[0].session.id,'absence-1');
 assert(!JSON.parse(g.event.extendedProperties.private.dmpRosterV1).ids.includes('person'));
 console.log('PASS P25 repeat: undo restores exact occurrence; new absence removes again; old audit preserved, no duplicate presence.');
})().catch(e=>{console.error(e);process.exitCode=1});
