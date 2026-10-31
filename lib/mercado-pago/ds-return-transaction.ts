import {pool} from '@/lib/db';
import {applyDsBankReturn,dsReturnPreview,DsReturnError,type DsMovement} from '@/lib/financeiro/ds-bank-return';
import type {FinanceData} from '@/types/financeiro';
export async function dsReturnTransaction(move:DsMovement|undefined,body:any,expectedRevision:string|null) {
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    // Same lock order as all MP reconciliation transactions.
    const mr=await client.query('SELECT payload FROM dmp_data WHERE id=$1 FOR UPDATE',['mercado_pago_reconciliation_v1']);
    const fr=await client.query('SELECT payload,updated_at FROM dmp_data WHERE id=$1 FOR UPDATE',['finance_v1']);
    const data=fr.rows[0]?.payload as FinanceData|undefined;
    if(!data||!mr.rows[0]?.payload)throw new DsReturnError('Financeiro ou conciliação indisponível.');
    const state=mr.rows[0].payload,revision=new Date(fr.rows[0].updated_at).toISOString();
    if(body.action==='PREVIEW') {
      if(!move)throw new DsReturnError('PIX indisponível no relatório atual.');
      if(move.fingerprintAliases.some(f=>state.decisions?.[f]))throw new DsReturnError('Movimento já classificado. Atualize para conferir.');
      const preview=dsReturnPreview(data,move,body.competence,String(body.existingId||''));
      await client.query('ROLLBACK');return {ok:true,preview,revision};
    }
    const account=await client.query("SELECT payload->>'email' AS email FROM dmp_data WHERE id=$1",['access_v1']);
    if(!account.rows[0]?.email)throw new DsReturnError('Operador indisponível.');
    const retry=data.dsBankAudit?.some(a=>a.operationId===body.operationId);
    if(!retry&&expectedRevision!==revision)throw new DsReturnError('Financeiro alterado desde a prévia. Atualize antes de confirmar.');
    if(!retry&&body.action==='APPLY'&&move?.fingerprintAliases.some(f=>state.decisions?.[f]))throw new DsReturnError('PIX já classificado. Não será registrado novamente.');
    const now=new Date().toISOString(),next=applyDsBankReturn(data,move,body,String(account.rows[0].email),now);
    if(next===data){await client.query('ROLLBACK');return {ok:true,repeated:true,financeChanged:false};}
    let decisions={...state.decisions};
    if(body.action==='UNDO') {
      const link=data.dsBankLinks!.find(l=>l.id===body.linkId)!;
      const keys=link.aliases.filter(f=>decisions[f]);
      if(keys.length!==1||decisions[keys[0]].target!=='DS_RETURN'||decisions[keys[0]].financeEntityId!==link.returnId)throw new DsReturnError('Classificação bancária mudou. Solicite revisão.');
      delete decisions[keys[0]];
    }else{
      const link=next.dsBankLinks!.find(l=>l.id==='dslink-'+body.operationId)!;
      decisions[link.fingerprint]={fingerprint:link.fingerprint,target:'DS_RETURN',targetName:'DS Tennis · '+link.competence,financeEntityId:link.returnId,automatic:false,updatedAt:now};
    }
    await client.query('INSERT INTO dmp_data(id,payload,updated_at) VALUES($1,$2,NOW())',['finance_ds_return_backup:'+body.operationId,JSON.stringify({finance:data,mercadoPago:state})]);
    await client.query('UPDATE dmp_data SET payload=$2,updated_at=NOW() WHERE id=$1',['finance_v1',JSON.stringify(next)]);
    await client.query('UPDATE dmp_data SET payload=$2,updated_at=NOW() WHERE id=$1',['mercado_pago_reconciliation_v1',JSON.stringify({...state,decisions})]);
    await client.query('COMMIT');return {ok:true,financeChanged:true};
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
