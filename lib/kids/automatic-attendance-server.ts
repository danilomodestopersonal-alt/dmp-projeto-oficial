import type {Pool} from 'pg';
import {consolidateKidsAttendance,type AttendanceJobState} from './automatic-attendance';
import type {KidsData} from '@/types/kids';
export const ATTENDANCE_JOB_ID='kids_automatic_attendance_v1';

// The job checkpoint, audit and Kids payload commit together. A crash rolls all back.
// Transaction advisory lock serializes workers across restarts/overlapping deployments;
// the row lock also serializes with all existing Kids writers.
export async function runAutomaticAttendance(pool:Pick<Pool,'connect'>){
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    await client.query("SET LOCAL statement_timeout = '15s'");
    await client.query("SET LOCAL lock_timeout = '5s'");
    const lock=await client.query('SELECT pg_try_advisory_xact_lock(140022, 1) AS locked');
    if(!lock.rows[0]?.locked){await client.query('ROLLBACK');return {state:'BUSY'};}
    const clock=await client.query('SELECT clock_timestamp() AS now');
    const now=new Date(clock.rows[0].now).toISOString();
    const current=await client.query('SELECT payload FROM dmp_data WHERE id = $1 FOR UPDATE',['kids_v1']);
    if(!current.rows[0]){await client.query('ROLLBACK');return {state:'NO_KIDS_DATA'};}
    const checkpoint=await client.query('SELECT payload FROM dmp_data WHERE id = $1',[ATTENDANCE_JOB_ID]);
    const result=consolidateKidsAttendance(current.rows[0].payload as KidsData,checkpoint.rows[0]?.payload as AttendanceJobState|undefined,now);
    if(result.changed)await client.query('UPDATE dmp_data SET payload = $2, updated_at = clock_timestamp() WHERE id = $1',['kids_v1',JSON.stringify(result.data)]);
    await client.query('INSERT INTO dmp_data (id,payload,updated_at) VALUES ($1,$2,clock_timestamp()) ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = EXCLUDED.updated_at',[ATTENDANCE_JOB_ID,JSON.stringify(result.state)]);
    await client.query('COMMIT');
    return {state:'OK',changed:result.changed,blocked:result.state.diagnostics.length,activatedAt:result.state.activatedAt};
  }catch(error){try{await client.query('ROLLBACK');}catch{}throw error;}
  finally{client.release();}
}
