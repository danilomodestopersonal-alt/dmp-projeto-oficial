import {NextRequest,NextResponse} from 'next/server';
import {isAuthorized} from '@/lib/auth';
import {pool} from '@/lib/db';
import {changePlanning,PlanningError} from '@/lib/financeiro/prior-planning';
import type {FinanceData} from '@/types/financeiro';
export const runtime='nodejs';
export async function POST(request:NextRequest) {
  if(!await isAuthorized(request))return NextResponse.json({error:'Sessão inválida.'},{status:401});
  if(request.headers.get('x-dmp-action')!=='prior-planning'||!request.headers.get('content-type')?.startsWith('application/json')||(request.headers.get('sec-fetch-site')&&request.headers.get('sec-fetch-site')!=='same-origin'))return NextResponse.json({error:'Origem inválida.'},{status:403});
  const body=await request.json().catch(()=>null),client=await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT payload FROM dmp_data WHERE id=$1 FOR UPDATE',['mercado_pago_reconciliation_v1']);
    const result=await client.query('SELECT payload,updated_at FROM dmp_data WHERE id=$1 FOR UPDATE',['finance_v1']);
    const data=result.rows[0]?.payload as FinanceData|undefined;
    const account=await client.query("SELECT payload->>'email' AS email FROM dmp_data WHERE id=$1",['access_v1']);
    if(!data||!account.rows[0]?.email)throw new PlanningError('Financeiro ou operador indisponível.');
    const retry=data.priorPlanningAudit?.some(a=>a.operationId===body?.operationId);
    if(!retry&&request.headers.get('x-dmp-expected-updated-at')!==new Date(result.rows[0].updated_at).toISOString())throw new PlanningError('Financeiro alterado. Atualize para conferir a prévia novamente.');
    const next=changePlanning(data,body,String(account.rows[0].email),new Date().toISOString());
    if(next===data){await client.query('ROLLBACK');return NextResponse.json({ok:true,repeated:true});}
    await client.query('INSERT INTO dmp_data(id,payload,updated_at) VALUES($1,$2,NOW())',['finance_prior_backup:'+body.operationId,JSON.stringify(data)]);
    await client.query('UPDATE dmp_data SET payload=$2,updated_at=NOW() WHERE id=$1',['finance_v1',JSON.stringify(next)]);
    await client.query('COMMIT');return NextResponse.json({ok:true});
  }catch(error){await client.query('ROLLBACK');return NextResponse.json({error:error instanceof PlanningError?error.message:'Não foi possível salvar. Atualize para conferir.'},{status:error instanceof PlanningError?409:500});}
  finally{client.release();}
}
