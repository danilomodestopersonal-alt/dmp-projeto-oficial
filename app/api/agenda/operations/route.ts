import {NextRequest,NextResponse} from 'next/server';
import type {PoolClient} from 'pg';
import type {KidsData} from '@/types/kids';
import {isAuthorized} from '@/lib/auth';
import {sameOrigin} from '@/lib/widget/devices';
import {pool} from '@/lib/db';
import {getGoogleAccessToken,setGoogleCookies} from '@/lib/google-calendar';
import {personalCalendarApi,maintenanceHash,MaintenanceError} from '@/lib/calendar/personal-maintenance';
import {agendaCommand,personalDay,buildAgendaPlan,previewAgenda,publicAgenda,executeAgenda,assertPersonalUnperformed,kidsBinding,type AgendaJournal} from '@/lib/calendar/agenda-operations';
export const runtime='nodejs';
const prefix='dmp_agenda_ops:',decode=(v:any)=>typeof v==='string'?JSON.parse(v):v;
const failure=(e:unknown)=>NextResponse.json({ok:false,message:e instanceof Error?e.message:'Operação não confirmada. Retome a mesma operação.'},{status:e instanceof MaintenanceError?e.status:502});
async function read(db:{query:PoolClient['query']},lock=false){
 const r=await db.query('SELECT id,payload FROM dmp_data WHERE id=ANY($1::text[])'+(lock?' FOR SHARE':''),[['students','kids_v1']]);
 const students=decode(r.rows.find(x=>x.id==='students')?.payload),kids=decode(r.rows.find(x=>x.id==='kids_v1')?.payload) as KidsData|null;
 if(!Array.isArray(students))throw new MaintenanceError('Cadastro Personal indisponível.',503);return {students,kids};
}
async function recent(db:{query:PoolClient['query']}){return (await db.query("SELECT payload FROM dmp_data WHERE id LIKE 'dmp_agenda_ops:%' ORDER BY updated_at DESC LIMIT 100")).rows.map(r=>decode(r.payload) as AgendaJournal);}
export async function GET(request:NextRequest){
 if(!await isAuthorized(request))return NextResponse.json({message:'Entre novamente no DMP.'},{status:401});
 try{
  const kind=request.nextUrl.searchParams.get('kind'),id=request.nextUrl.searchParams.get('lessonId'),saved=await recent(pool);
  const operations=saved.filter(j=>kind==='kids-substitute'?j.plan.lessonId===id:j.plan.command.kind==='personal-day').slice(0,20).map(publicAgenda);
  if(kind==='kids-substitute')return NextResponse.json({ok:true,operations},{headers:{'Cache-Control':'no-store'}});
  const auth=await getGoogleAccessToken(request);if(!auth.accessToken)throw new MaintenanceError('Conecte o Google nesta sessão.',401);
  const {students,kids}=await read(pool),rows=await personalDay(request.nextUrl.searchParams.get('date')||'',students,personalCalendarApi(auth.accessToken),new Date().toISOString(),kids);
  const response=NextResponse.json({ok:true,rows,operations},{headers:{'Cache-Control':'no-store'}});if(auth.refreshed)setGoogleCookies(response,auth.refreshed);return response;
 }catch(e){return failure(e);}
}
export async function POST(request:NextRequest){
 if(!await isAuthorized(request))return NextResponse.json({message:'Entre novamente no DMP.'},{status:401});
 if(!sameOrigin(request))return NextResponse.json({message:'Origem não autorizada.'},{status:403});
 const input=await request.json().catch(()=>null);if(!input||!['preview','execute'].includes(input.action))return NextResponse.json({message:'Pedido inválido.'},{status:400});
 let client:PoolClient|undefined,locked=false,transaction=false;
 try{
  const auth=await getGoogleAccessToken(request);if(!auth.accessToken)throw new MaintenanceError('Conecte o Google nesta sessão.',401);
  const api=personalCalendarApi(auth.accessToken),finish=(data:Record<string,unknown>)=>{const r=NextResponse.json({ok:true,...data},{headers:{'Cache-Control':'no-store'}});if(auth.refreshed)setGoogleCookies(r,auth.refreshed);return r;};
  if(input.action==='preview'){const command=agendaCommand(input.command),data=await read(pool);return finish({preview:previewAgenda(await buildAgendaPlan(command,data.students,data.kids,api))});}
  if(input.confirmed!==true||!/^[-a-zA-Z0-9]{16,80}$/.test(input.operationId||'')||! /^[a-f0-9]{64}$/.test(input.digest||''))throw new MaintenanceError('Confira a prévia antes de confirmar.',400);
  client=await pool.connect();locked=(await client.query('SELECT pg_try_advisory_lock(hashtext($1)) AS locked',['dmp_calendar_time_change'])).rows[0]?.locked===true;
  if(!locked)throw new MaintenanceError('Outra alteração da agenda está em andamento. Aguarde.');
  const key=prefix+input.operationId;let j=decode((await client.query('SELECT payload FROM dmp_data WHERE id=$1',[key])).rows[0]?.payload) as AgendaJournal|undefined;
  const save=async(value:AgendaJournal)=>{await pool.query('INSERT INTO dmp_data(id,payload,updated_at) VALUES($1,$2,clock_timestamp()) ON CONFLICT(id) DO UPDATE SET payload=EXCLUDED.payload,updated_at=clock_timestamp()',[key,JSON.stringify(value)]);};
  if(j){if(j.digest!==input.digest)throw new MaintenanceError('Operação divergente. Reabra a conferência.');if(j.done)return finish({operation:publicAgenda(j)});}
  else{
   const command=agendaCommand(input.command),data=await read(client),plan=await buildAgendaPlan(command,data.students,data.kids,api);
   if(maintenanceHash(plan)!==input.digest)throw new MaintenanceError('A agenda ou os participantes mudaram. Confira uma nova prévia.');
   if(command.kind==='kids-substitute'&&(await recent(client)).some(old=>old.plan.lessonId===command.lessonId&&!old.done))throw new MaintenanceError('Retome a substituição já iniciada para esta aula.');
   const createdAt=new Date().toISOString();j={operationId:input.operationId,digest:input.digest,plan,createdAt,errors:{},maintenance:{operationId:input.operationId,digest:input.digest,createdAt,plan:plan.maintenance,completed:{}}};await save(j);
  }
  const journal=j;
  const complete=await executeAgenda(journal,api,save,async step=>{
   await client!.query('BEGIN');transaction=true;
   try{const data=await read(client!,true);
    if(journal.plan.command.kind==='personal-day')assertPersonalUnperformed(step,data.students,journal.plan.date);
    else{const binding=kidsBinding(data.kids!,journal.plan.lessonId!);if(binding.hash!==journal.plan.binding)throw new MaintenanceError('A turma ou o horário Kids mudou. A chamada foi preservada.');if(Date.parse(binding.date+'T'+binding.end+':00-03:00')<=Date.now())throw new MaintenanceError('A aula Kids já terminou. Histórico preservado.');}
   }catch(e){await client!.query('ROLLBACK');transaction=false;throw e;}
   return async()=>{await client!.query('COMMIT');transaction=false;};
  });
  if(complete&&journal.plan.command.kind==='kids-substitute'){
   await client.query('BEGIN');transaction=true;
   const r=await client.query('SELECT payload FROM dmp_data WHERE id=$1 FOR UPDATE',['kids_v1']),data=decode(r.rows[0]?.payload) as KidsData,k=kidsBinding(data,journal.plan.lessonId!);
   if(k.hash!==journal.plan.binding)throw new MaintenanceError('A aula Kids mudou. A agenda já confirmada foi preservada; consulte a operação pendente.');
   if(k.lesson.teacherSubstitution&&k.lesson.teacherSubstitution.operationId!==journal.operationId)throw new MaintenanceError('Esta aula já possui outra substituição.');
   if(!k.lesson.teacherSubstitution){const recordedAt=new Date().toISOString(),teacherSubstitution={operationId:journal.operationId,date:k.date,recordedAt,googleEventIds:journal.plan.maintenance.steps.map(s=>s.before.id),...(journal.plan.command.teacherName?{teacherName:journal.plan.command.teacherName}:{})};
    const next={...data,lessons:data.lessons.map(l=>l.id===k.lessonId?{...l,teacherSubstitution}:l),updatedAt:recordedAt};
    await client.query('UPDATE dmp_data SET payload=$2,updated_at=clock_timestamp() WHERE id=$1',['kids_v1',JSON.stringify(next)]);
   }
   await client.query('COMMIT');transaction=false;
  }
  journal.done=complete;await save(journal);return finish({operation:publicAgenda(journal)});
 }catch(e){if(transaction&&client)await client.query('ROLLBACK').catch(()=>{});return failure(e);}
 finally{if(client){if(locked)await client.query('SELECT pg_advisory_unlock(hashtext($1))',['dmp_calendar_time_change']).catch(()=>{});client.release();}}
}
