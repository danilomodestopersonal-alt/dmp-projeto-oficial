import {createHash} from 'node:crypto';
import {NextRequest,NextResponse} from 'next/server';
import {pool} from '@/lib/db';
import {isAuthorized} from '@/lib/auth';
import {sameOrigin} from '@/lib/widget/devices';
import {emptyFixedStore,fixedCommand,applyFixedCommand,FixedError,type FixedStore} from '@/lib/appointments/fixed';
export const runtime='nodejs';
const key='dmp_fixed_appointments_v1';
const decode=(v:any):FixedStore=>v==null?emptyFixedStore():typeof v==='string'?JSON.parse(v):v;
const response=(data:FixedStore)=>NextResponse.json({ok:true,data},{headers:{'Cache-Control':'no-store'}});
const failed=(e:unknown)=>NextResponse.json({ok:false,message:e instanceof FixedError?e.message:'Não foi possível salvar. Atualize a lista e tente novamente.'},{status:e instanceof FixedError?e.status:503});
export async function GET(request:NextRequest){
 if(!await isAuthorized(request))return NextResponse.json({message:'Entre novamente no DMP.'},{status:401});
 try{return response(decode((await pool.query('SELECT payload FROM dmp_data WHERE id=$1',[key])).rows[0]?.payload));}catch(e){return failed(e);}
}
export async function POST(request:NextRequest){
 if(!await isAuthorized(request))return NextResponse.json({message:'Entre novamente no DMP.'},{status:401});
 if(!sameOrigin(request))return NextResponse.json({message:'Origem não autorizada.'},{status:403});
 let client,transaction=false;
 try{
  const text=await request.text();if(text.length>12000)throw new FixedError('Pedido muito grande.',400);
  const input=JSON.parse(text),command=fixedCommand(input.command);
  if(!/^[-a-zA-Z0-9]{16,80}$/.test(input.operationId||'')||!Number.isSafeInteger(input.revision)||input.revision<0||input.confirmed!==true)throw new FixedError('Confira os dados antes de confirmar.',400);
  const digest=createHash('sha256').update(JSON.stringify(command)).digest('hex');
  client=await pool.connect();await client.query('BEGIN');transaction=true;
  await client.query('INSERT INTO dmp_data(id,payload,updated_at) VALUES($1,$2,clock_timestamp()) ON CONFLICT(id) DO NOTHING',[key,JSON.stringify(emptyFixedStore())]);
  const current=decode((await client.query('SELECT payload FROM dmp_data WHERE id=$1 FOR UPDATE',[key])).rows[0]?.payload);
  const done=current.operations.find(op=>op.id===input.operationId);
  if(done){if(done.digest!==digest)throw new FixedError('Operação divergente. Atualize a lista.');await client.query('COMMIT');transaction=false;return response(current);}
  if(current.revision!==input.revision)throw new FixedError('Os compromissos mudaram em outra tela. Atualize a lista antes de salvar.');
  const next=applyFixedCommand(current,command);
  next.operations.push({id:input.operationId,digest});
  await client.query('UPDATE dmp_data SET payload=$2,updated_at=clock_timestamp() WHERE id=$1',[key,JSON.stringify(next)]);
  await client.query('COMMIT');transaction=false;return response(next);
 }catch(e){if(transaction&&client)await client.query('ROLLBACK').catch(()=>{});return failed(e);}
 finally{client?.release();}
}
