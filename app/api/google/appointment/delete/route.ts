import {NextRequest,NextResponse} from 'next/server';
import type {PoolClient} from 'pg';
import {isAuthorized} from '@/lib/auth';
import {sameOrigin} from '@/lib/widget/devices';
import {pool} from '@/lib/db';
import {getGoogleAccessToken,setGoogleCookies} from '@/lib/google-calendar';
import {calendarTimeApi} from '@/lib/calendar/time-change-google';
import {AppointmentError} from '@/lib/calendar/appointment-edit';
import {deletionCommand,assertDeletable,executeAppointmentDeletion,DeletionReconfirmationError,type DeletionJournal} from '@/lib/calendar/appointment-delete';
export const runtime='nodejs';
export async function POST(request:NextRequest){
 if(!await isAuthorized(request))return NextResponse.json({message:'Entre novamente no DMP.'},{status:401});
 if(!sameOrigin(request))return NextResponse.json({message:'Origem não autorizada.'},{status:403});
 let client:PoolClient|undefined,locked=false,j:DeletionJournal|undefined;
 try{
  const c=deletionCommand(await request.json()),auth=await getGoogleAccessToken(request);
  if(!auth.accessToken)throw new AppointmentError('Conecte sua agenda Google.',401);
  const calendarIdentity=async()=>{const r=await fetch('https://www.googleapis.com/calendar/v3/calendars/primary',{headers:{authorization:'Bearer '+auth.accessToken},cache:'no-store',signal:AbortSignal.timeout(15000)});if(!r.ok)throw new AppointmentError('Não foi possível conferir o calendário de origem.',503);const d=await r.json();if(typeof d.id!=='string'||!d.id)throw new AppointmentError('Calendário de origem indisponível.',503);return d.id;};
  const api={...calendarTimeApi(auth.accessToken),calendarIdentity};
  client=await pool.connect();locked=(await client.query('SELECT pg_try_advisory_lock(hashtext($1)) AS locked',['dmp_calendar_time_change'])).rows[0]?.locked===true;
  if(!locked)throw new AppointmentError('Outra alteração da agenda está em andamento. Aguarde.');
  const raw=(await client.query('SELECT payload FROM dmp_data WHERE id=$1',['students'])).rows[0]?.payload;
  const students=typeof raw==='string'?JSON.parse(raw):raw;if(!Array.isArray(students))throw new AppointmentError('Cadastro indisponível para conferir os vínculos.',503);
  const key='dmp_appointment_delete:'+c.operationId,stored=(await client.query('SELECT payload FROM dmp_data WHERE id=$1',[key])).rows[0]?.payload;
  j=typeof stored==='string'?JSON.parse(stored):stored;
  const save=async(value:DeletionJournal)=>{await client!.query('INSERT INTO dmp_data(id,payload,updated_at) VALUES($1,$2,clock_timestamp()) ON CONFLICT(id) DO UPDATE SET payload=EXCLUDED.payload,updated_at=clock_timestamp()',[key,JSON.stringify(value)]);};
  if(j){if(JSON.stringify(j.command)!==JSON.stringify(c))throw new AppointmentError('A operação não corresponde à confirmação original.');}
  else{
   const calendar=await calendarIdentity(),event=await api.read(c.id);if(!event)throw new AppointmentError('Compromisso não encontrado. Atualize a agenda.',404);
   const parent=event.recurringEventId?await api.read(event.recurringEventId):null;assertDeletable(c,event,parent,students);
   j={command:c,calendarIdentity:calendar,createdAt:new Date().toISOString(),before:event};await save(j);
  }
  await executeAppointmentDeletion(j,api,students,save);
  const response=NextResponse.json({ok:true,confirmed:true,id:c.id},{headers:{'Cache-Control':'no-store'}});if(auth.refreshed)setGoogleCookies(response,auth.refreshed);return response;
 }catch(e){return NextResponse.json({message:e instanceof Error?e.message:'Não foi possível confirmar a exclusão.',pending:Boolean(j?.attempted&&!j?.done),canReconfirm:e instanceof DeletionReconfirmationError},{status:typeof(e as any)?.status==='number'?(e as any).status:502,headers:{'Cache-Control':'no-store'}});}
 finally{if(client){if(locked)await client.query('SELECT pg_advisory_unlock(hashtext($1))',['dmp_calendar_time_change']).catch(()=>{});client.release();}}
}
