import {NextRequest,NextResponse} from 'next/server';
import {isAuthorized} from '@/lib/auth';
import {pool} from '@/lib/db';
export const runtime='nodejs';
export async function GET(request:NextRequest){
  if(!(await isAuthorized(request)))return NextResponse.json({ok:false},{status:401});
  try{
    const result=await pool.query('SELECT payload FROM dmp_data WHERE id = $1',['kids_automatic_attendance_v1']);
    const state=result.rows[0]?.payload;
    return NextResponse.json({ok:true,active:Boolean(state),activatedAt:state?.activatedAt||null,lastRunAt:state?.lastRunAt||null,diagnostics:state?.diagnostics||[]},{headers:{'Cache-Control':'no-store'}});
  }catch{return NextResponse.json({ok:false,error:'Não foi possível conferir a rotina Kids.'},{status:503});}
}
