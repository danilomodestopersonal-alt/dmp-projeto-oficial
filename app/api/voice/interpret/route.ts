import {NextRequest,NextResponse} from 'next/server';
import {createHash} from 'node:crypto';
import {pool} from '@/lib/db';
import {authorize} from '@/lib/widget/devices';
import {voiceConfigured,interpretVoice} from '@/lib/voice/interpret';
import {formatWorkout} from '@/lib/voice/contract';
export const runtime='nodejs';export const dynamic='force-dynamic';
const reply=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'no-store, private','Vary':'Authorization'}});
let ready:Promise<unknown>|undefined;
async function setup(){if(!ready)ready=pool.query(`CREATE TABLE IF NOT EXISTS dmp_voice_interpretations(device_id UUID NOT NULL,id UUID NOT NULL,transcript_hash TEXT NOT NULL,state TEXT NOT NULL,result JSONB,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(device_id,id))`).catch(e=>{ready=undefined;throw e;});await ready;}
export async function POST(r:NextRequest){
 let id='',deviceId='',claimed=false;
 try{
 const device=await authorize(r);if(!device)return reply({error:'Dispositivo não autorizado'},401);
 if(!voiceConfigured())return reply({error:'Interpretação não configurada no servidor. Sua transcrição permanece no celular.'},503);
 const length=Number(r.headers.get('content-length')||0);if(length>40000)return reply({error:'Ditado muito longo'},413);const raw=await r.text();if(raw.length>16000)return reply({error:'Ditado muito longo'},413);let b;try{b=JSON.parse(raw);}catch{return reply({error:'Pedido inválido'},400);}
 if(typeof b.id!=='string'||! /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(b.id)||typeof b.transcript!=='string'||b.transcript.trim().length<3||b.transcript.length>10000)return reply({error:'Ditado inválido'},400);
 id=b.id;deviceId=device.id;const transcript=b.transcript.trim(),hash=createHash('sha256').update(transcript).digest('hex');await setup();
 const client=await pool.connect();let previous:any;
 try{await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[deviceId]);const q=await client.query('SELECT transcript_hash,state,result,created_at FROM dmp_voice_interpretations WHERE device_id=$1 AND id=$2',[deviceId,id]);previous=q.rows[0];
 if(!previous){const n=await client.query("SELECT COUNT(*)::int AS n FROM dmp_voice_interpretations WHERE device_id=$1 AND created_at>NOW()-INTERVAL '1 hour'",[deviceId]);if(n.rows[0].n>=12){await client.query('ROLLBACK');return reply({error:'Limite de 12 interpretações por hora atingido. Ditado preservado.'},429);}await client.query("INSERT INTO dmp_voice_interpretations(device_id,id,transcript_hash,state) VALUES($1,$2,$3,'processing')",[deviceId,id,hash]);claimed=true;}await client.query('COMMIT');}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
 if(previous){if(previous.transcript_hash!==hash)return reply({error:'Identificador já usado com outro ditado'},409);if(previous.state==='ready')return reply(previous.result);if(previous.state==='processing'&&Date.now()-new Date(previous.created_at).getTime()<120000)return reply({state:'processing'},202);return reply({error:'Tentativa anterior não concluída. Nova interpretação deve ser solicitada pelo botão de tentar novamente.'},409);}
 const workout=await interpretVoice(transcript),result={id,state:workout.warnings.length?'review':'ready',workout,text:formatWorkout(workout)};
 await pool.query("UPDATE dmp_voice_interpretations SET state='ready',result=$3 WHERE device_id=$1 AND id=$2",[deviceId,id,JSON.stringify(result)]);
 // Retain a short server cache for duplicate requests. Never touch student/workout tables.
 await pool.query("UPDATE dmp_voice_interpretations SET state='expired',result=NULL WHERE device_id=$1 AND created_at<NOW()-INTERVAL '7 days' AND state<>'expired'",[deviceId]).catch(()=>{});return reply(result);
 }catch{if(claimed)await pool.query("UPDATE dmp_voice_interpretations SET state='failed' WHERE device_id=$1 AND id=$2 AND state='processing'",[deviceId,id]).catch(()=>{});return reply({error:'Não foi possível concluir. O ditado foi preservado no celular.'},503);}
}
