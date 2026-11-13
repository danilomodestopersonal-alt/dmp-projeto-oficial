import {appointmentId,appointmentView,AppointmentError} from './appointment-edit';
import type {Student} from '@/types/models';
export type AppointmentDeletion={operationId:string;calendarId:'primary';id:string;etag:string;parentEtag:string;scope:'single';confirmed:true};
export type DeletionJournal={command:AppointmentDeletion;calendarIdentity:string;createdAt:string;before:Record<string,any>;attempted?:boolean;done?:boolean;finishedAt?:string};
export function deletionCommand(body:any):AppointmentDeletion{
 if(body?.confirmed!==true||body.calendarId!=='primary'||body.scope!=='single'||!/^[-a-zA-Z0-9]{16,80}$/.test(body.operationId||'')||typeof body.etag!=='string'||!body.etag||body.etag.length>512||typeof body.parentEtag!=='string'||body.parentEtag.length>512)throw new AppointmentError('Confira o compromisso e confirme somente esta ocorrência.',400);
 return {operationId:body.operationId,calendarId:'primary',id:appointmentId(body.id),etag:body.etag,parentEtag:body.parentEtag,scope:'single',confirmed:true};
}
export function assertDeletable(c:AppointmentDeletion,event:Record<string,any>,parent:Record<string,any>|null,students:Student[]){
 if(event.id!==c.id)throw new AppointmentError('Identidade do compromisso divergente.');
 const view=appointmentView(event,parent,students);if(!view.canEdit)throw new AppointmentError(view.reason);
 if(event.etag!==c.etag||(parent?.etag||'')!==c.parentEtag)throw new AppointmentError('O compromisso mudou. Reabra os detalhes antes de excluir.');
}
export type DeleteApi={read:(id:string)=>Promise<Record<string,any>|null>;remove:(id:string,etag:string)=>Promise<unknown>;calendarIdentity:()=>Promise<string>};
export class DeletionReconfirmationError extends AppointmentError{constructor(){super('O compromisso continua presente no Google. Reabra para revisar os dados atuais e confirmar uma nova tentativa.',409);}}
export async function executeAppointmentDeletion(j:DeletionJournal,api:DeleteApi,students:Student[],save:(j:DeletionJournal)=>Promise<void>){
 if(await api.calendarIdentity()!==j.calendarIdentity)throw new AppointmentError('A conta Google mudou. Reabra o compromisso.');
 if(j.done)return;
 const current=await api.read(j.command.id);
 if(!current||current.status==='cancelled'){
  if(!j.attempted)throw new AppointmentError('O compromisso já não está disponível. Atualize a agenda.');
  j.done=true;j.finishedAt=new Date().toISOString();await save(j);return;
 }
 if(j.attempted)throw new DeletionReconfirmationError();
 const parent=current.recurringEventId?await api.read(current.recurringEventId):null;
 assertDeletable(j.command,current,parent,students);
 j.attempted=true;await save(j); // durable intent before a single conditional DELETE
 try{await api.remove(j.command.id,j.command.etag);}catch{/* Reconcile the durable intent below, including a lost response. */}
 // Reconcile even after a lost response, never blindly issue another DELETE.
 if(await api.calendarIdentity()!==j.calendarIdentity)throw new AppointmentError('Não foi possível confirmar a conta Google após a operação.',503);
 const after=await api.read(j.command.id);
 if(after&&after.status!=='cancelled')throw new DeletionReconfirmationError();
 j.done=true;j.finishedAt=new Date().toISOString();await save(j);
}
