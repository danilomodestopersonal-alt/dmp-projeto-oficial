import {NextRequest,NextResponse} from 'next/server';
import {isAuthorized} from '@/lib/auth';
import {pool} from '@/lib/db';
import {getConnection,getValidAccessToken} from '@/lib/strava';
import {resolveStravaGears} from '@/lib/strava-gears';
import {activityGearId,isGearId} from '@/lib/performance-cycling';
import type {PerformanceData} from '@/types/performance';
export const runtime='nodejs';
export async function GET(request:NextRequest){
 if(!await isAuthorized(request))return NextResponse.json({message:'Entre novamente no DMP.'},{status:401});
 try{
  const connection=await getConnection();if(!connection)return NextResponse.json({message:'Strava não conectado.'},{status:409});
  const {accessToken}=await getValidAccessToken(connection);
  const data=(await pool.query('SELECT payload FROM dmp_data WHERE id=$1',['performance_v1'])).rows[0]?.payload as PerformanceData|undefined;
  const ids=new Set((data?.activities||[]).map(a=>activityGearId(a)||''));
  // activity:read_all already granted; no new profile scope is requested.
  let limited=false;
  for(let page=1;page<=2;page++){
   const r=await fetch('https://www.strava.com/api/v3/athlete/activities?per_page=200&page='+page,{headers:{Authorization:'Bearer '+accessToken},cache:'no-store',signal:AbortSignal.timeout(15000)});
   if(!r.ok){limited=true;break;}const rows=await r.json();if(!Array.isArray(rows))throw Error('Resposta inválida');
   for(const a of rows)if(isGearId(a.gear_id)&&a.gear_id.startsWith('b'))ids.add(a.gear_id);
   if(rows.length<200)break;
  }
  const result=await resolveStravaGears(accessToken,[...ids].filter(id=>id.startsWith('b')),data?.gears||[]);
  return NextResponse.json({...result,message:limited?'Busca parcial. Equipamentos já conhecidos foram preservados.':null},{headers:{'Cache-Control':'no-store'}});
 }catch{return NextResponse.json({message:'Não foi possível consultar as bicicletas agora. Tente novamente; a conexão e os dados foram preservados.'},{status:503});}
}
