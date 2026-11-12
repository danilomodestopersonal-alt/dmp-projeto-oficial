import type { PoolClient } from 'pg';
import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { isAuthorized } from '@/lib/auth';
import { sameOrigin } from '@/lib/widget/devices';
import { pool } from '@/lib/db';
import { ExternalReplacementError, planExternalReplacement } from '@/lib/kids/external-replacement';
import type { KidsData } from '@/types/kids';
export const runtime='nodejs';
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'no-store'}});
export async function POST(request:NextRequest){
  if(!await isAuthorized(request))return reply({error:'Sessão inválida. Entre novamente no DMP.'},401);
  if(!sameOrigin(request))return reply({error:'Origem inválida.'},403);
  let client:PoolClient|undefined;
  try{
    const body=await request.json();
    if(!['preview','commit'].includes(body?.phase))return reply({error:'Etapa inválida.'},400);
    client=await pool.connect();await client.query('BEGIN');
    const row=(await client.query('SELECT payload, updated_at FROM dmp_data WHERE id = $1 FOR UPDATE',['kids_v1'])).rows[0];
    if(!row?.payload)throw new ExternalReplacementError('BASE','Carregue Aulas Kids antes de continuar.');
    const updatedAt=new Date(row.updated_at).toISOString();
    const plan=planExternalReplacement(row.payload as KidsData,body.command);
    // A committed request can be replayed even if its response or local version was lost.
    if(plan.replay){await client.query('COMMIT');return reply({ok:true,confirmed:true,replayed:true,data:row.payload,updatedAt,audit:plan.audit});}
    const expected=request.headers.get('x-dmp-expected-updated-at');
    if(body.phase==='commit'&&expected!==updatedAt)throw new ExternalReplacementError('STALE','Os dados Kids mudaram. Confira uma nova prévia antes de confirmar.');
    const {createdAt:_created,updatedAt:_updated,...record}=plan.audit.after;
    const digest=createHash('sha256').update(JSON.stringify({requestKey:plan.audit.requestKey,updatedAt,record,before:plan.audit.balanceBefore,after:plan.audit.balanceAfter,outsidePeriod:plan.outsidePeriod})).digest('hex');
    if(body.phase==='preview'){
      await client.query('ROLLBACK');
      return reply({ok:true,preview:{digest,updatedAt,record:plan.audit.after,before:plan.audit.balanceBefore,after:plan.audit.balanceAfter,outsidePeriod:plan.outsidePeriod}});
    }
    if(body.digest!==digest)throw new ExternalReplacementError('PREVIEW','A prévia mudou. Confira novamente antes de confirmar.');
    const saved=await client.query('UPDATE dmp_data SET payload = $2, updated_at = clock_timestamp() WHERE id = $1 RETURNING updated_at',['kids_v1',JSON.stringify(plan.data)]);
    await client.query('COMMIT');
    return reply({ok:true,confirmed:true,data:plan.data,updatedAt:new Date(saved.rows[0].updated_at).toISOString(),audit:plan.audit});
  }catch(error){
    if(client)try{await client.query('ROLLBACK');}catch{}
    if(error instanceof ExternalReplacementError)return reply({error:error.message,code:error.code},error.status);
    if(error instanceof SyntaxError)return reply({error:'Formato inválido.'},400);
    console.error('Kids: falha no registro de reposição externa.');
    return reply({error:'Não foi possível confirmar o lançamento. Confira a lista antes de repetir.'},503);
  }finally{client?.release();}
}
