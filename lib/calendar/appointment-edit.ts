import {createHash} from 'node:crypto';
import type {CalendarEvent,Student} from '@/types/models';
import {calendarRoster} from './roster';
import {matchCalendarEvents,kidsCalendarRequest} from '@/lib/widget/home-source';

type GoogleEvent=Record<string,any>;
export class AppointmentError extends Error{constructor(message:string,public status=409){super(message);}}
export const APPOINTMENT_MARKER='dmpAppointmentEditV1';
const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
export function appointmentId(v:unknown):string{
 if(typeof v!=='string'||!/^[-a-zA-Z0-9_]{1,1024}$/.test(v))throw new AppointmentError('Compromisso inválido. Reabra a agenda.',400);
 return v;
}
export function appointmentView(e:GoogleEvent,parent:GoogleEvent|null,students:Student[]){
 const event:CalendarEvent={id:e.id,etag:e.etag,summary:e.summary||'Sem título',description:e.description||'',location:e.location||'',start:e.start?.dateTime||e.start?.date||'',end:e.end?.dateTime||e.end?.date||'',allDay:Boolean(e.start?.date),htmlLink:e.htmlLink||'',recurringEventId:e.recurringEventId||'',originalStartTime:e.originalStartTime?.dateTime||e.originalStartTime?.date||''};
 let reason='';
 if(e.status==='cancelled'||!e.etag||!event.start||!event.end)reason='Este compromisso não está mais disponível para edição.';
 else if(e.locked||e.organizer?.self!==true||parent&&(parent.locked||parent.organizer?.self!==true))reason='A edição deste compromisso deve ser feita no Google Calendar.';
 else if(e.eventType&&e.eventType!=='default'||(e.attendees||[]).some((a:any)=>!a.self)||(parent?.attendees||[]).some((a:any)=>!a.self))reason='Este evento tem convidados ou configurações especiais. Edite pelo Google Calendar.';
 else if(e.recurrence?.length&&!e.recurringEventId||e.recurringEventId&&(!parent||!parent.etag||parent.id!==e.recurringEventId||!e.originalStartTime||parent.status==='cancelled'))reason='Abra uma ocorrência válida da série para editar somente aquele dia.';
 else {
  const metadata=[e,parent].filter(Boolean).map(x=>x!.extendedProperties?.private||{});
  const mapped={...event,calendarRoster:calendarRoster(e.extendedProperties?.private,parent?.extendedProperties?.private)};
  const knownStudents=students.map(s=>({...s,status:'ACTIVE' as const}));
  const linked=matchCalendarEvents([mapped],knownStudents)[0].matchedStudentIds||[];
  const parentLinked=parent?matchCalendarEvents([{...event,id:parent.id,summary:parent.summary||'',recurringEventId:undefined,recurrence:parent.recurrence}],knownStudents)[0].matchedStudentIds||[]:[];
  const recorded=students.some(s=>s.sessions?.some(session=>session.calendarEvent?.id===e.id));
  if(recorded||linked.length||parentLinked.length||kidsCalendarRequest(event)||parent&&kidsCalendarRequest({...event,summary:parent.summary||''})||metadata.some(p=>Object.keys(p).some(k=>/^(dmpRoster|dmpKids|dmpPersonal|dmpTimeOperation|dmpAbsence|dmpAttendance)/.test(k))))reason='Este item tem vínculo com uma aula. Use os detalhes da aula para preservar seus registros.';
 }
 return {event,canEdit:!reason,reason,parentEtag:parent?.etag||''};
}
function date(v:unknown,allDay:boolean):string{
 if(typeof v!=='string')throw new AppointmentError('Confira as datas e os horários.',400);
 const pattern=allDay?/^\d{4}-\d{2}-\d{2}$/:/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:00-03:00$/;
 const d=v.slice(0,10),time=Date.parse(d+'T12:00:00Z');
 if(!pattern.test(v)||!Number.isFinite(time)||new Date(time).toISOString().slice(0,10)!==d||!Number.isFinite(Date.parse(v)))throw new AppointmentError('Confira as datas e os horários.',400);
 return v;
}
export function appointmentCommand(p:any){
 const id=appointmentId(p?.id);
 if(typeof p.etag!=='string'||!p.etag||p.etag.length>512||typeof p.parentEtag!=='string'||p.parentEtag.length>512||typeof p.operationId!=='string'||!/^[-a-zA-Z0-9]{16,80}$/.test(p.operationId)||typeof p.allDay!=='boolean')throw new AppointmentError('Reabra o compromisso antes de salvar.',400);
 for(const [key,max] of [['summary',300],['location',1000],['description',8000]] as const)if(typeof p[key]!=='string'||p[key].length>max)throw new AppointmentError('Confira o título, local e observações.',400);
 if(!p.summary.trim())throw new AppointmentError('Informe o título do compromisso.',400);
 const start=date(p.start,p.allDay),end=date(p.end,p.allDay);
 if(Date.parse(end)<=Date.parse(start))throw new AppointmentError('O término deve ser posterior ao início.',400);
 return {id,etag:p.etag,parentEtag:p.parentEtag,operationId:p.operationId,allDay:p.allDay,summary:p.summary.trim(),location:p.location,description:p.description,start,end};
}
export type AppointmentCommand=ReturnType<typeof appointmentCommand>;
export function appointmentPatch(c:AppointmentCommand,e:GoogleEvent){
 const fields={summary:c.summary,description:c.description,location:c.location,start:c.allDay?{date:c.start}:{dateTime:c.start,timeZone:'America/Sao_Paulo'},end:c.allDay?{date:c.end}:{dateTime:c.end,timeZone:'America/Sao_Paulo'}};
 const marker=JSON.stringify({op:c.operationId,digest:hash({id:c.id,...fields})});
 const privateFields={...e.extendedProperties?.private,[APPOINTMENT_MARKER]:marker};
 if(Object.keys(privateFields).length>280||Buffer.byteLength(JSON.stringify(privateFields))>29000)throw new AppointmentError('Limite de metadados atingido. Edite este compromisso no Google Calendar.',400);
 return {...fields,extendedProperties:{...e.extendedProperties,private:privateFields}};
}
export function appointmentConfirmed(e:GoogleEvent,b:ReturnType<typeof appointmentPatch>){
 return e.extendedProperties?.private?.[APPOINTMENT_MARKER]===b.extendedProperties.private[APPOINTMENT_MARKER]&&['summary','description','location'].every(k=>(e[k]||'')===(b as any)[k])&&['start','end'].every(k=>{const a=e[k],v=(b as any)[k];return v.date?a?.date===v.date:Date.parse(a?.dateTime)===Date.parse(v.dateTime);});
}
export async function saveAppointment(c:AppointmentCommand,e:GoogleEvent,parent:GoogleEvent|null,students:Student[],patch:(id:string,b:any,etag:string)=>Promise<void>,read:(id:string)=>Promise<GoogleEvent>){
 const view=appointmentView(e,parent,students);if(!view.canEdit)throw new AppointmentError(view.reason);
 if(Boolean(e.start?.date)!==c.allDay)throw new AppointmentError('O tipo do compromisso mudou. Reabra a agenda.');
 const body=appointmentPatch(c,e);
 if(appointmentConfirmed(e,body))return e;
 if(e.etag!==c.etag||(parent?.etag||'')!==c.parentEtag)throw new AppointmentError('O compromisso mudou em outra tela. Recarregue antes de salvar.');
 const projected=appointmentView({...e,...body},parent,students);if(!projected.canEdit)throw new AppointmentError(projected.reason);
 try{await patch(c.id,body,e.etag);}catch(error){const check=await read(c.id);if(appointmentConfirmed(check,body))return check;throw error;}
 const saved=await read(c.id);if(!appointmentConfirmed(saved,body))throw new AppointmentError('A resposta ainda não confirmou a alteração. Use Conferir e concluir.',503);
 return saved;
}
