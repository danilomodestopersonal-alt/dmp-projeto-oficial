import {NextRequest,NextResponse} from 'next/server';
import {isAuthorized} from '@/lib/auth';
import {sameOrigin} from '@/lib/widget/devices';
import {readRoutine,routineHash,routineTransaction} from '@/lib/routine/store';
import {routineDay,activeRoutine,planRoutineActivation,applyRoutineActivation,saveRoutineDraft,markRoutine,RoutineError} from '@/lib/routine/model';
export const runtime='nodejs';
const reply=(v:unknown,status=200)=>NextResponse.json(v,{status,headers:{'Cache-Control':'no-store'}});
const failed=(e:unknown)=>reply({message:e instanceof RoutineError?e.message:'Não foi possível confirmar. Atualize a rotina antes de repetir.'},e instanceof RoutineError?e.status:503);
export async function GET(request:NextRequest){
 if(!await isAuthorized(request))return reply({message:'Entre novamente no DMP.'},401);
 try{const data=await readRoutine();if(request.nextUrl.searchParams.get('today')==='1'){const date=routineDay(),version=activeRoutine(data,date),marks=data.marks.filter(m=>m.date===date);return reply({data:{...data,files:[],drafts:[],operations:[],versions:data.versions.filter(v=>v.id===version?.id||marks.some(m=>m.versionId===v.id)),marks,days:data.days.filter(d=>d.date===date)},today:date});}return reply({data,today:routineDay()});}catch(e){return failed(e);}
}
export async function POST(request:NextRequest){
 if(!await isAuthorized(request))return reply({message:'Entre novamente no DMP.'},401);
 if(!sameOrigin(request))return reply({message:'Origem não autorizada.'},403);
 try{
  if(Number(request.headers.get('content-length')||0)>1024*1024)throw new RoutineError('Pedido grande demais.',413);
  const body=await request.json();if(!['draft','preview','activate','mark','day'].includes(body.action))throw new RoutineError('Operação inválida.',400);
  if(body.action==='preview'){const data=await readRoutine(),plan=planRoutineActivation(data,body.input);return reply({preview:{revision:data.revision,digest:routineHash({revision:data.revision,input:body.input,items:plan.items,warnings:plan.warnings}),changes:plan.changes,warnings:plan.warnings,count:plan.items.length}});}
  if(!/^[-a-zA-Z0-9]{16,100}$/.test(body.operationId||''))throw new RoutineError('Identificador da operação inválido.',400);
  const digest=routineHash({action:body.action,input:body.input}),now=new Date();
  const result=await routineTransaction(async data=>{
   const previous=data.operations.find(o=>o.id===body.operationId);
   if(previous){if(previous.digest!==digest)throw new RoutineError('Esta operação já foi usada com dados diferentes.');return {data,result:{ok:true,replayed:true},write:false};}
   if(body.revision!==data.revision)throw new RoutineError('A rotina mudou em outra tela. Atualize e confira novamente.');
   let next=data;
   if(body.action==='draft')next=saveRoutineDraft(data,body.input,now);
   if(body.action==='activate'){
    const plan=planRoutineActivation(data,body.input,routineDay(now));
    if(body.previewDigest!==routineHash({revision:data.revision,input:body.input,items:plan.items,warnings:plan.warnings}))throw new RoutineError('Confira as alterações antes de aprovar.');
    next=applyRoutineActivation(data,body.input,body.operationId,now);
   }
   if(body.action==='mark')next=markRoutine(data,body.input,now);
   if(body.action==='day'){if(body.input?.date!==routineDay(now)||typeof body.input?.cycling!=='boolean')throw new RoutineError('Confira o dia atual.',400);next={...data,days:[...data.days.filter(d=>d.date!==body.input.date),{date:body.input.date,cycling:body.input.cycling,updatedAt:now.toISOString()}]};}
   next={...next,operations:[...next.operations,{id:body.operationId,digest,at:now.toISOString(),action:body.action}]};
   return {data:next,result:{ok:true,replayed:false}};
  });return reply(result);
 }catch(e){return failed(e);}
}
