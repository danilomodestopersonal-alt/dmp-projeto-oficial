'use strict';
const A=require('node:assert/strict'),H=require('./p15-harness.cjs');
const S=[{id:'felipe',name:'Felipe Almeida',status:'ACTIVE',sessions:[],workouts:[],assessments:[]}];
const base=()=>({id:'meeting-id',etag:'v1',summary:'Reuniao Adriano Almeida',organizer:{self:true},status:'confirmed',start:{dateTime:'2026-11-12T12:00:00-03:00'},end:{dateTime:'2026-11-12T13:00:00-03:00'},location:'Sala 1',description:'Observação original',extendedProperties:{private:{keep:'value'},shared:{origin:'keep'}},reminders:{useDefault:true},colorId:'7'});
const M=H.loader()('lib/calendar/appointment-edit.ts');
const command=(e=base())=>M.appointmentCommand({id:e.id,etag:e.etag,parentEtag:'',operationId:'p35-synthetic-operation-01',allDay:false,summary:e.summary,location:'Sala 2',description:'Nova observação',start:'2026-11-12T14:15:00-03:00',end:'2026-11-12T14:45:00-03:00'});
(async()=>{
 let e=base(),writes=0;const patch=async(id,b,etag)=>{A.equal(id,e.id);A.equal(etag,e.etag);A.deepEqual(Object.keys(b).sort(),['summary','location','description','start','end','extendedProperties'].sort());e={...e,...b,etag:'v2'};writes++;};
 A.equal(M.appointmentView(e,null,S).canEdit,true);const c=command();await M.saveAppointment(c,e,null,S,patch,async()=>e);A.equal(writes,1);A.equal(e.location,'Sala 2');A.equal(e.extendedProperties.private.keep,'value');A.equal(e.extendedProperties.shared.origin,'keep');A.equal(e.colorId,'7');A.equal(e.reminders.useDefault,true);
 await M.saveAppointment(c,e,null,S,patch,async()=>e);A.equal(writes,1,'idempotent replay after response loss');
 await A.rejects(()=>M.saveAppointment({...c,summary:'Outra edição'},e,null,S,patch,async()=>e),/mudou/);A.equal(writes,1);
 e=base();await M.saveAppointment(c,e,null,S,async(...args)=>{await patch(...args);throw TypeError('lost response');},async()=>e);A.equal(writes,2,'lost write response recovered by read');
 e=base();await A.rejects(()=>M.saveAppointment(c,e,null,S,async()=>{throw new M.AppointmentError('Conflito etag');},async()=>({...e,etag:'other'})),/Conflito/);
 for(const change of [{organizer:{self:false}},{locked:true},{attendees:[{email:'synthetic@example.invalid',self:false}]},{eventType:'outOfOffice'},{status:'cancelled'},{summary:'Aula · Felipe Almeida'},{summary:'Tênis Kids · Bola vermelha'},{extendedProperties:{private:{dmpRosterV1:JSON.stringify({op:'12345678',at:1,from:'2026-11-12T12:00:00-03:00',ids:['felipe'],add:[],remove:[],scope:'single',eventId:'meeting-id'})}}}]){const blocked={...base(),...change};A.equal(M.appointmentView(blocked,null,S).canEdit,false,JSON.stringify(change));await A.rejects(()=>M.saveAppointment(command(blocked),blocked,null,S,async()=>A.fail('blocked write'),async()=>blocked));}
 A.equal(M.appointmentView({...base(),summary:'Aula · Felipe Almeida'},null,[{...S[0],status:'ARCHIVED'}]).canEdit,false,'inactive student lesson is still protected');
 A.equal(M.appointmentView({...base(),summary:'Reunião com Felipe Almeida'},null,S).canEdit,true,'full name in meeting remains appointment');
 e=base();await A.rejects(()=>M.saveAppointment({...c,summary:'Aula · Felipe Almeida'},e,null,S,async()=>A.fail('converted lesson'),async()=>e));
 const parent={...base(),id:'series-id',etag:'parent-v1',recurrence:['RRULE:FREQ=WEEKLY']},instance={...base(),id:'instance-id',recurringEventId:parent.id,originalStartTime:base().start};let current=instance;const copy=JSON.stringify(parent),r={...command(instance),parentEtag:parent.etag};
 await M.saveAppointment(r,current,parent,S,async(id,b)=>{A.equal(id,instance.id);A.ok(!('recurrence' in b));current={...current,...b,etag:'instance-v2'};},async()=>current);A.equal(JSON.stringify(parent),copy,'parent and future instances untouched');
 await A.rejects(()=>M.saveAppointment({...r,operationId:'p35-new-operation-02'},instance,{...parent,etag:'parent-v2'},S,async()=>A.fail('parent conflict'),async()=>instance),/mudou/);
 A.equal(M.appointmentView(instance,{...parent,etag:''},S).canEdit,false,'missing parent version blocks edit');
 A.equal(M.appointmentView(base(),null,[{...S[0],sessions:[{calendarEvent:{id:base().id}}]}]).canEdit,false,'recorded attendance link blocks even if title changed');
 const all={...base(),start:{date:'2026-11-12'},end:{date:'2026-11-14'}};let allSaved=all;const ac=M.appointmentCommand({...command(),allDay:true,start:'2026-11-15',end:'2026-11-18'});await M.saveAppointment(ac,all,null,S,async(id,b)=>{allSaved={...all,...b,etag:'all-v2'};},async()=>allSaved);A.equal(allSaved.start.date,'2026-11-15');A.equal(allSaved.end.date,'2026-11-18');
 for(const invalid of [{summary:''},{start:'2026-02-30T12:00:00-03:00'},{end:c.start},{start:'2026-11-12T24:00:00-03:00'},{location:'x'.repeat(1001)},{description:'x'.repeat(8001)},{id:'dmp-fixed:internal'},{operationId:'short'}])A.throws(()=>M.appointmentCommand({...c,...invalid}));
 console.log('PASS P35 model: personal appointment, exact fields, metadata, no lesson conversion, ownership/guests, recurrence single occurrence, etags, idempotency/lost response, all-day exclusive end and strict validation.');
})().catch(e=>{console.error(e);process.exitCode=1;});
