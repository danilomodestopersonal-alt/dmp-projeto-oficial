import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {NextRequest,NextResponse} from 'next/server';
import {isAuthorized} from '@/lib/auth';
import {sameOrigin} from '@/lib/widget/devices';
import {pool} from '@/lib/db';
import {ensureBackupTable,buildBackup,validateBackup} from '@/lib/backup';
import {importedStudents2026} from '@/lib/imported-data';
import {IMPORT_CONFIRMATION,importRecoveryPreview} from '@/lib/students/import-recovery';
export const runtime='nodejs';
const reply=(v:unknown,status=200)=>NextResponse.json(v,{status,headers:{'Cache-Control':'no-store'}});
export async function GET(request:NextRequest){
 if(!await isAuthorized(request))return reply({message:'Entre novamente no DMP.'},401);
 try{const current=(await pool.query('SELECT payload FROM dmp_data WHERE id=$1',['students'])).rows[0]?.payload;if(!Array.isArray(current))return reply({message:'Não foi possível conferir a base atual. Nenhuma restauração foi iniciada.'},409);return reply({preview:importRecoveryPreview(current,importedStudents2026)});}catch{return reply({message:'Não foi possível preparar a prévia.'},503);}
}
export async function POST(request:NextRequest){
 if(!await isAuthorized(request))return reply({message:'Entre novamente no DMP.'},401);
 if(!sameOrigin(request))return reply({message:'Origem não autorizada.'},403);
 let client:PoolClient|undefined;
 try{
  const body=await request.json();
  if(body.confirmation!==IMPORT_CONFIRMATION||!/^[-a-zA-Z0-9]{16,100}$/.test(body.operationId||'')||!/^\w{64}$/.test(body.digest||''))return reply({message:'Confira a prévia e digite a confirmação específica.'},400);
  await ensureBackupTable();client=await pool.connect();await client.query('BEGIN');
  await client.query('LOCK TABLE dmp_data IN EXCLUSIVE MODE');
  const operationKey='dmp_import_restore:'+body.operationId;
  const previous=(await client.query('SELECT payload FROM dmp_data WHERE id=$1',[operationKey])).rows[0]?.payload;
  if(previous){await client.query('ROLLBACK');return previous.digest===body.digest?reply({ok:true,replayed:true,backupId:previous.backupId}):reply({message:'Operação já utilizada com outra prévia.'},409);}
  const current=(await client.query('SELECT payload FROM dmp_data WHERE id=$1',['students'])).rows[0]?.payload;
  if(!Array.isArray(current)||importRecoveryPreview(current,importedStudents2026).digest!==body.digest){await client.query('ROLLBACK');return reply({message:'Os cadastros mudaram. Confira uma nova prévia antes de restaurar.'},409);}
  const envelope=validateBackup(await buildBackup('PRE_RESTORE',client)),backupId='backup-import-'+randomUUID();
  await client.query('INSERT INTO dmp_backups(id,kind,payload,checksum,created_at) VALUES($1,$2,$3,$4,$5)',[backupId,'PRE_RESTORE',JSON.stringify(envelope),envelope.checksum,envelope.createdAt]);
  const verified=validateBackup((await client.query('SELECT payload FROM dmp_backups WHERE id=$1',[backupId])).rows[0]?.payload);
  if(verified.checksum!==envelope.checksum||!verified.rows.some(r=>r.id==='students'&&JSON.stringify(r.payload)===JSON.stringify(current)))throw Error('Backup não verificável.');
  await client.query('UPDATE dmp_data SET payload=$2,updated_at=clock_timestamp() WHERE id=$1',['students',JSON.stringify(importedStudents2026)]);
  await client.query('INSERT INTO dmp_data(id,payload,updated_at) VALUES($1,$2,clock_timestamp())',[operationKey,JSON.stringify({digest:body.digest,backupId,at:new Date().toISOString(),source:'importedStudents2026'})]);
  await client.query('COMMIT');return reply({ok:true,backupId});
 }catch{if(client)await client.query('ROLLBACK').catch(()=>{});return reply({message:'A restauração não foi confirmada. Confira a tentativa antes de repetir; nenhum backup foi descartado.'},503);}finally{client?.release();}
}
