import {NextRequest,NextResponse} from 'next/server';
import {isAuthorized} from '@/lib/auth';
import {pool} from '@/lib/db';
import {CancellationError,changeInvoiceCancellation} from '@/lib/financeiro/invoice-cancellation';
import type {FinanceData} from '@/types/financeiro';
import type {Student} from '@/types/models';
export const runtime='nodejs';

export async function POST(request:NextRequest) {
  if (!await isAuthorized(request)) return NextResponse.json({error:'Sessão inválida.'},{status:401});
  if (request.headers.get('x-dmp-action')!=='invoice-cancellation' || !request.headers.get('content-type')?.startsWith('application/json') || (request.headers.get('sec-fetch-site') && request.headers.get('sec-fetch-site')!=='same-origin')) return NextResponse.json({error:'Origem inválida.'},{status:403});
  const body=await request.json().catch(()=>null);
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    // Same lock order as Mercado Pago reconciliation. No external request or rule changes.
    const mp=await client.query('SELECT payload FROM dmp_data WHERE id=$1 FOR UPDATE',['mercado_pago_reconciliation_v1']);
    const fr=await client.query('SELECT payload,updated_at FROM dmp_data WHERE id=$1 FOR UPDATE',['finance_v1']);
    const data=fr.rows[0]?.payload as FinanceData|undefined;
    const account=await client.query("SELECT payload->>'email' AS email FROM dmp_data WHERE id=$1",['access_v1']);
    if (!data || !account.rows[0]?.email) throw new CancellationError('Financeiro ou operador indisponível.');
    const operator=String(account.rows[0].email);
    const retry=body?.operationId && data.invoiceCancellationAudit?.some(item=>item.operationId===body.operationId);
    if (!retry && request.headers.get('x-dmp-expected-updated-at')!==new Date(fr.rows[0].updated_at).toISOString()) throw new CancellationError('Financeiro alterado em outra aba. Atualize antes de confirmar.');
    if (!retry && typeof body?.invoiceId==='string' && JSON.stringify(mp.rows[0]?.payload||{}).includes(body.invoiceId)) throw new CancellationError('Cobrança vinculada à conciliação Mercado Pago. Solicite revisão.');
    const now=new Date().toISOString();
    let next=changeInvoiceCancellation(data,body,operator,now);
    if (next===data) { await client.query('ROLLBACK'); return NextResponse.json({ok:true,repeated:true}); }
    const invoice=next.personalInvoices.find(item=>item.id===body.invoiceId)!;
    if (invoice.studentId) {
      const sr=await client.query('SELECT payload FROM dmp_data WHERE id=$1 FOR SHARE',['students']);
      const matches=(sr.rows[0]?.payload as Student[]|undefined)?.filter(item=>item.id===invoice.studentId)||[];
      if (matches.length!==1) throw new CancellationError('Vínculo com o aluno indisponível. Solicite revisão.');
      if (body.action==='RESTORE' && (matches[0].financialActive!==true || matches[0].status!=='ACTIVE')) next={...next,personalInvoices:next.personalInvoices.map(item=>item.id===invoice.id?{...item,autoRenew:false}:item)};
    }
    const backup=JSON.stringify(data);
    await client.query('INSERT INTO dmp_data(id,payload,updated_at) VALUES($1,$2,NOW())', ['finance_invoice_backup:'+body.operationId,backup]);
    await client.query('UPDATE dmp_data SET payload=$2,updated_at=NOW() WHERE id=$1',['finance_v1',JSON.stringify(next)]);
    await client.query('COMMIT');
    return NextResponse.json({ok:true});
  } catch(error) {
    await client.query('ROLLBACK');
    return NextResponse.json({error:error instanceof CancellationError?error.message:'Não foi possível concluir. Atualize e confira a cobrança antes de tentar novamente.'},{status:error instanceof CancellationError?409:500});
  } finally { client.release(); }
}
