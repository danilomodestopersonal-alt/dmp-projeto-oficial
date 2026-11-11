import {NextRequest,NextResponse} from 'next/server';
import type {PoolClient} from 'pg';
import type {Student} from '@/types/models';
import {pool} from '@/lib/db';
import {isAuthorized} from '@/lib/auth';
import {sameOrigin} from '@/lib/widget/devices';
import {getGoogleAccessToken,setGoogleCookies} from '@/lib/google-calendar';
import {currentPause} from '@/lib/students/lifecycle';
import {buildLifecyclePlan,lifecycleCommand,executeLifecycle,publicLifecyclePlan,type LifecycleJournal} from '@/lib/students/lifecycle-calendar';
import {maintenanceHash,MaintenanceError,personalCalendarApi} from '@/lib/calendar/personal-maintenance';
export const runtime='nodejs';
const prefix='dmp_student_lifecycle:';
const decode=(v:any)=>typeof v==='string'?JSON.parse(v):v;
const failure=(e:unknown,extra={})=>NextResponse.json({ok:false,message:e instanceof Error?e.message:'Não foi possível concluir. Retome a mesma operação.',...extra},{status:e instanceof MaintenanceError?e.status:502});
const norm=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
async function snapshot(client:{query:PoolClient['query']},studentId:string,lock=false){
 // Same lock order as the Finance API: finance, then student data.
 const f=await client.query('SELECT payload FROM dmp_data WHERE id=$1'+(lock?' FOR UPDATE':''),['finance_v1']);
 const s=await client.query('SELECT payload FROM dmp_data WHERE id=$1'+(lock?' FOR UPDATE':''),['students']);
 const students=decode(s.rows[0]?.payload) as Student[],finance=decode(f.rows[0]?.payload);
 if(!Array.isArray(students))throw new MaintenanceError('Cadastro indisponível.',503);
 const student=students.find(s=>s.id===studentId);if(!student)throw new MaintenanceError('Aluno não encontrado.',404);
 const unique=students.filter(s=>norm(s.name)===norm(student.name)).length===1;
 const issued=(finance?.personalInvoices||[]).filter((i:any)=>i.studentId===studentId||!i.studentId&&unique&&norm(i.studentName)===norm(student.name)).map((i:any)=>i.id);
 return {students,student,issued};
}
export async function GET(request:NextRequest){
 if(!await isAuthorized(request))return NextResponse.json({message:'Entre novamente no DMP.'},{status:401});
 try{
  const {student}=await snapshot(pool,request.nextUrl.searchParams.get('studentId')||'');
  const id=student.lifecycle?.pending?.operationId;
  if(!id)return NextResponse.json({ok:true,pending:null},{headers:{'Cache-Control':'no-store'}});
  const r=await pool.query('SELECT payload FROM dmp_data WHERE id=$1',[prefix+id]);const j=decode(r.rows[0]?.payload) as LifecycleJournal;
  if(!j)throw new MaintenanceError('Operação pendente indisponível. O cadastro continua protegido.',503);
  return NextResponse.json({ok:true,pending:{operationId:id,digest:j.digest,command:j.plan.command,preview:publicLifecyclePlan(j.plan),completed:Object.keys(j.maintenance.completed).length+Object.keys(j.inserted).length}},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return failure(e);}
}
export async function POST(request:NextRequest){
 if(!await isAuthorized(request))return NextResponse.json({message:'Entre novamente no DMP.'},{status:401});
 if(!sameOrigin(request))return NextResponse.json({message:'Origem não autorizada.'},{status:403});
 const input=await request.json().catch(()=>null);
 if(!input||!['preview','execute'].includes(input.action))return NextResponse.json({message:'Pedido inválido.'},{status:400});
 let client:PoolClient|undefined,locked=false,j:LifecycleJournal|undefined,inTransaction=false;
 try{
  const auth=await getGoogleAccessToken(request);if(!auth.accessToken)throw new MaintenanceError('Conecte o Google nesta sessão.',401);
  const api=personalCalendarApi(auth.accessToken);
  const finish=(data:Record<string,unknown>)=>{const r=NextResponse.json({ok:true,...data},{headers:{'Cache-Control':'no-store'}});if(auth.refreshed)setGoogleCookies(r,auth.refreshed);return r;};
  if(input.action==='preview'){
   const c=lifecycleCommand(input.command),s=await snapshot(pool,c.studentId);
   if(s.student.lifecycle?.pending)throw new MaintenanceError('Retome primeiro a operação pendente.');
   return finish({preview:publicLifecyclePlan(await buildLifecyclePlan(c,s.students,s.issued,api))});
  }
  if(input.confirmed!==true||!/^[-a-zA-Z0-9]{16,80}$/.test(input.operationId||'')||! /^[a-f0-9]{64}$/.test(input.digest||''))throw new MaintenanceError('Confira a prévia antes de confirmar.',400);
  client=await pool.connect();locked=(await client.query('SELECT pg_try_advisory_lock(hashtext($1)) AS locked',['dmp_calendar_time_change'])).rows[0]?.locked===true;
  if(!locked)throw new MaintenanceError('Outra alteração da agenda está em andamento. Aguarde.');
  const key=prefix+input.operationId;
  j=decode((await client.query('SELECT payload FROM dmp_data WHERE id=$1',[key])).rows[0]?.payload);
  const save=async(value:LifecycleJournal)=>{await client!.query('INSERT INTO dmp_data(id,payload,updated_at) VALUES($1,$2,clock_timestamp()) ON CONFLICT(id) DO UPDATE SET payload=EXCLUDED.payload,updated_at=clock_timestamp()',[key,JSON.stringify(value)]);};
  if(j){
   if(j.digest!==input.digest||j.plan.command.studentId!==input.command?.studentId)throw new MaintenanceError('Operação divergente. Reabra o aluno.');
   if(j.done)return finish({done:true,data:(await snapshot(client,j.plan.command.studentId)).students});
  }else{
   const c=lifecycleCommand(input.command),s=await snapshot(client,c.studentId);
   if(s.student.lifecycle?.pending)throw new MaintenanceError('Retome a operação já iniciada para este aluno.');
   const plan=await buildLifecyclePlan(c,s.students,s.issued,api);
   if(maintenanceHash(plan)!==input.digest)throw new MaintenanceError('O cadastro, as cobranças ou a agenda mudaram. Gere uma nova prévia.');
   j={operationId:input.operationId,digest:input.digest,plan,inserted:{},maintenance:{operationId:input.operationId,digest:input.digest,createdAt:new Date().toISOString(),completed:{},plan:{command:{kind:'repair-batch',selection:[]},steps:plan.patches,kept:[],excluded:[],description:'Inativação/reativação individual'}}};
   await client.query('BEGIN');inTransaction=true;
   const fresh=await snapshot(client,c.studentId,true);
   if(maintenanceHash(fresh.student)!==plan.studentVersion||maintenanceHash([...fresh.issued].sort())!==maintenanceHash(plan.issuedIds))throw new MaintenanceError('O cadastro ou as cobranças mudaram. Confira novamente.');
   const periods=[...(fresh.student.lifecycle?.periods||[])];
   if(c.kind==='pause')periods.push({id:input.operationId,from:c.from,expectedReturn:c.expectedReturn,issuedIds:plan.issuedIds});
   const lifecycle={...fresh.student.lifecycle,revision:input.operationId,periods,issuedIds:[...new Set([...(fresh.student.lifecycle?.issuedIds||[]),...plan.issuedIds])],pending:{operationId:input.operationId,kind:c.kind,digest:input.digest}};
   await client.query('UPDATE dmp_data SET payload=$2,updated_at=clock_timestamp() WHERE id=$1',['students',JSON.stringify(fresh.students.map(s=>s.id===c.studentId?{...s,lifecycle,...(c.kind==='pause'?{status:'ARCHIVED' as const}:{})}:s))]);
   await save(j);await client.query('COMMIT');inTransaction=false;
  }
  await executeLifecycle(j,api,save);
  await client.query('BEGIN');inTransaction=true;
  const c=j.plan.command,fresh=await snapshot(client,c.studentId,true),s=fresh.student;
  if(s.lifecycle?.pending?.operationId!==j.operationId)throw new MaintenanceError('O estado da inativação mudou. A agenda confirmada foi preservada.');
  const lifecycle={...s.lifecycle,revision:j.operationId+'-done',pending:undefined,issuedIds:[...new Set([...(s.lifecycle.issuedIds||[]),...fresh.issued])],...(c.kind==='resume'?{billingStart:c.billingFrom}:{}),periods:s.lifecycle.periods.map(p=>c.kind==='resume'&&!p.resumedOn?{...p,resumedOn:c.from,billingFrom:c.billingFrom,issuedIds:[...new Set([...p.issuedIds,...fresh.issued])]}:p)};
  const next:Student={...s,lifecycle,...(c.kind==='resume'?{status:'ACTIVE',financialActive:c.financialActive,monthlyAmount:c.monthlyAmount,financeDueDay:c.dueDay,trainingSchedule:c.slots!.map(x=>x.date+' '+x.start+'–'+x.end+' semanal até '+x.until).join('; ')}:{})};
  const data=fresh.students.map(s=>s.id===c.studentId?next:s);
  await client.query('UPDATE dmp_data SET payload=$2,updated_at=clock_timestamp() WHERE id=$1',['students',JSON.stringify(data)]);
  j.done=true;await save(j);await client.query('COMMIT');inTransaction=false;
  return finish({done:true,data});
 }catch(e){if(inTransaction&&client)await client.query('ROLLBACK').catch(()=>{});return failure(e,{pending:Boolean(j&&!j.done),...(j?{operationId:j.operationId}:{}),completed:j?Object.keys(j.maintenance.completed).length+Object.keys(j.inserted).length:0});}
 finally{if(client){if(locked)await client.query('SELECT pg_advisory_unlock(hashtext($1))',['dmp_calendar_time_change']).catch(()=>{});client.release();}}
}
