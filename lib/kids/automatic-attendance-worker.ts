import {Pool} from 'pg';
import {runAutomaticAttendance} from './automatic-attendance-server';

type WorkerGlobal=typeof globalThis&{dmpKidsAttendanceWorker?:boolean};
export function startAutomaticAttendanceWorker(){
  const global=globalThis as WorkerGlobal;
  if(global.dmpKidsAttendanceWorker)return;
  if(!process.env.DATABASE_URL){console.error('KIDS_AUTO: DATABASE_URL ausente; rotina não iniciada.');return;}
  global.dmpKidsAttendanceWorker=true;
  const pool=new Pool({connectionString:process.env.DATABASE_URL,max:1,connectionTimeoutMillis:5000,idleTimeoutMillis:10000,ssl:process.env.DATABASE_URL.includes('localhost')?false:{rejectUnauthorized:false}});
  pool.on('error',()=>console.error('KIDS_AUTO: conexão indisponível; nova tentativa no próximo ciclo.'));
  let running=false;
  const tick=async()=>{if(running)return;running=true;try{
    const result=await runAutomaticAttendance(pool);
    console.info('KIDS_AUTO',JSON.stringify(result));
  }catch{console.error('KIDS_AUTO: ciclo não confirmado; rollback e retomada no próximo ciclo.');}finally{running=false;}};
  void tick();
  setInterval(()=>void tick(),60_000).unref();
}
