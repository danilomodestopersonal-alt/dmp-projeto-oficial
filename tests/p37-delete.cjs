'use strict';
const A=require('node:assert/strict'),H=require('./p15-harness.cjs'),D=H.loader()('lib/calendar/appointment-delete.ts');
const event=()=>({id:'meeting-one',etag:'v1',summary:'Reunião com Pessoa Teste',organizer:{self:true},status:'confirmed',start:{dateTime:'2026-11-13T12:00:00-03:00'},end:{dateTime:'2026-11-13T13:00:00-03:00'}}),students=[{id:'s',name:'Pessoa Teste',status:'ACTIVE',sessions:[]}];
const command=e=>D.deletionCommand({id:e.id,etag:e.etag,parentEtag:'',calendarId:'primary',scope:'single',operationId:'p37-delete-operation-001',confirmed:true});
function fixture(options={}){let current=event(),writes=0,reads=0,saved=[],identity='owned-calendar';const c=command(current),journal={command:c,calendarIdentity:identity,createdAt:new Date().toISOString(),before:structuredClone(current)};
 const api={calendarIdentity:async()=>identity,read:async()=>{reads++;if(options.failRead&&writes)throw Error('Google offline');return structuredClone(current)},remove:async(id,etag)=>{A.equal(id,current.id);A.equal(etag,current.etag);A.ok(saved.some(x=>x.attempted),'intent durable before DELETE');writes++;if(options.conflict){current.etag='v2';throw Error('412');}current=null;if(options.lost)throw TypeError('lost response');}};
 return {journal,api,save:async j=>{saved.push(structuredClone(j))},get writes(){return writes},get current(){return current},set identity(i){identity=i}};
}
(async()=>{
 for(const patch of [{confirmed:false},{scope:'series'},{calendarId:'other'},{etag:''},{operationId:'short'},{id:'dmp-fixed:internal'}])A.throws(()=>D.deletionCommand({...command(event()),...patch}));
 for(const patch of [{organizer:{self:false}},{attendees:[{self:false}]},{locked:true},{status:'cancelled'},{eventType:'outOfOffice'},{summary:'Aula · Pessoa Teste'},{summary:'Tênis Kids Laranja'}])A.throws(()=>D.assertDeletable(command(event()),{...event(),...patch},null,students));
 A.throws(()=>D.assertDeletable(command(event()),event(),null,[{...students[0],sessions:[{calendarEvent:{id:event().id}}]}]));
 A.throws(()=>D.assertDeletable(command(event()),{...event(),etag:'new'},null,students));
 const p={...event(),id:'series',etag:'parent',recurrence:['RRULE:FREQ=WEEKLY']},instance={...event(),recurringEventId:p.id,originalStartTime:event().start};D.assertDeletable({...command(instance),parentEtag:'parent'},instance,p,students);A.throws(()=>D.assertDeletable({...command(instance),parentEtag:'old'},instance,p,students));
 for(const lost of [false,true]){const f=fixture({lost});await D.executeAppointmentDeletion(f.journal,f.api,students,f.save);A.equal(f.journal.done,true);await D.executeAppointmentDeletion(f.journal,f.api,students,f.save);A.equal(f.writes,1);}
 const offline=fixture({failRead:true});await A.rejects(()=>D.executeAppointmentDeletion(offline.journal,offline.api,students,offline.save));A.equal(offline.writes,1);A.equal(offline.journal.done,undefined);offline.api.read=async()=>null;await D.executeAppointmentDeletion(offline.journal,offline.api,students,offline.save);A.equal(offline.writes,1);A.equal(offline.journal.done,true);
 const conflict=fixture({conflict:true});await A.rejects(()=>D.executeAppointmentDeletion(conflict.journal,conflict.api,students,conflict.save),D.DeletionReconfirmationError);await A.rejects(()=>D.executeAppointmentDeletion(conflict.journal,conflict.api,students,conflict.save),D.DeletionReconfirmationError);A.equal(conflict.writes,1);
 const changed=fixture();changed.identity='different-account';await A.rejects(()=>D.executeAppointmentDeletion(changed.journal,changed.api,students,changed.save),/conta Google/);A.equal(changed.writes,0);
 const wrong=fixture();wrong.api.read=async()=>({...event(),id:'wrong'});await A.rejects(()=>D.executeAppointmentDeletion(wrong.journal,wrong.api,students,wrong.save),/Identidade/);A.equal(wrong.writes,0);
 console.log('PASS P37 deletion: exact identity, owner/lesson/recurrence protection, etags, durable intent, one conditional DELETE, response-loss reconciliation and explicit fresh review after conflict.');
})().catch(e=>{console.error(e);process.exitCode=1});
