import {NextRequest,NextResponse} from 'next/server';
import {isAuthorized} from '@/lib/auth';
import {getGoogleAccessToken,googleConfigured,setGoogleCookies} from '@/lib/google-calendar';
import {sameOrigin} from '@/lib/widget/devices';
import {pool} from '@/lib/db';
import {calendarTimeApi} from '@/lib/calendar/time-change-google';
import {appointmentId,appointmentCommand,appointmentView,saveAppointment,AppointmentError} from '@/lib/calendar/appointment-edit';
import type {Student} from '@/types/models';

async function handle(request:NextRequest,write:boolean){
 if(!await isAuthorized(request))return NextResponse.json({message:'Entre novamente no DMP.'},{status:401});
 if(write&&!sameOrigin(request))return NextResponse.json({message:'Origem não autorizada.'},{status:403});
 if(!googleConfigured())return NextResponse.json({message:'Google não configurado.'},{status:503});
 try{
  const c=write?appointmentCommand(await request.json()):null,id=c?.id||appointmentId(request.nextUrl.searchParams.get('id'));
  const auth=await getGoogleAccessToken(request);if(!auth.accessToken)return NextResponse.json({message:'Conecte sua agenda Google.'},{status:401});
  const api=calendarTimeApi(auth.accessToken),read=async(id:string)=>{const e=await api.read(id);if(!e)throw new AppointmentError('Compromisso não encontrado. Atualize a agenda.',404);return e;};
  const event=await read(id),parent=event.recurringEventId?await read(event.recurringEventId):null;
  const result=await pool.query('SELECT payload FROM dmp_data WHERE id = $1',['students']);
  const raw=result.rows[0]?.payload,students:Student[]=typeof raw==='string'?JSON.parse(raw):raw;
  if(!Array.isArray(students))throw new AppointmentError('Não foi possível conferir os vínculos da agenda. Tente novamente.',503);
  const patch=async(id:string,body:unknown,etag:string)=>{
   const r=await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events/'+encodeURIComponent(id)+'?sendUpdates=none&conferenceDataVersion=1&supportsAttachments=true',{method:'PATCH',headers:{authorization:'Bearer '+auth.accessToken,'Content-Type':'application/json','If-Match':etag},body:JSON.stringify(body),cache:'no-store',signal:AbortSignal.timeout(15000)});
   if(r.status===412)throw new AppointmentError('O compromisso mudou durante a gravação. Recarregue antes de salvar.');
   if(!r.ok)throw new AppointmentError('O Google não confirmou a alteração. Confira antes de tentar novamente.',502);
  };
  const current=c?await saveAppointment(c,event,parent,students,patch,read):event;
  const response=NextResponse.json({...appointmentView(current,parent,students),...(c?{confirmed:true}:{})},{headers:{'Cache-Control':'no-store'}});
  if(auth.refreshed)setGoogleCookies(response,auth.refreshed);return response;
 }catch(error){return NextResponse.json({message:error instanceof Error?error.message:'Não foi possível conferir o compromisso.'},{status:typeof (error as any)?.status==='number'?(error as any).status:502,headers:{'Cache-Control':'no-store'}});}
}
export const GET=(request:NextRequest)=>handle(request,false);
export const PATCH=(request:NextRequest)=>handle(request,true);
