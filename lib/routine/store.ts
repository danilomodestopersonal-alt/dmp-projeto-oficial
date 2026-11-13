import {createHash} from 'node:crypto';
import type {PoolClient} from 'pg';
import {pool} from '@/lib/db';
import type {RoutineData} from '@/types/routine';
import {emptyRoutine,RoutineError} from './model';
export const ROUTINE_KEY='personal_routine_v1';
export const routineHash=(value:unknown)=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
export async function readRoutine(client:Pick<PoolClient,'query'>=pool):Promise<RoutineData>{
 const raw=(await client.query('SELECT payload FROM dmp_data WHERE id=$1',[ROUTINE_KEY])).rows[0]?.payload;
 if(raw==null)return emptyRoutine();const data=typeof raw==='string'?JSON.parse(raw):raw;
 if(data.schema!==1||!Number.isInteger(data.revision)||!['files','drafts','versions','marks','days','operations'].every(k=>Array.isArray(data[k])))throw new RoutineError('Não foi possível conferir a integridade da rotina. Os dados foram preservados.',503);
 return data;
}
export async function routineTransaction<T>(fn:(data:RoutineData,client:PoolClient)=>Promise<{data:RoutineData;result:T;write?:boolean}>){
 const client=await pool.connect();let started=false;
 try{
  await client.query('BEGIN');started=true;await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[ROUTINE_KEY]);
  const data=await readRoutine(client),next=await fn(data,client);
  if(next.write!==false){next.data={...next.data,revision:data.revision+1};await client.query('INSERT INTO dmp_data(id,payload,updated_at) VALUES($1,$2,clock_timestamp()) ON CONFLICT(id) DO UPDATE SET payload=EXCLUDED.payload,updated_at=clock_timestamp()',[ROUTINE_KEY,JSON.stringify(next.data)]);}
  await client.query('COMMIT');started=false;return {...next.result,data:next.data};
 }catch(e){if(started)await client.query('ROLLBACK').catch(()=>{});throw e;}finally{client.release();}
}
