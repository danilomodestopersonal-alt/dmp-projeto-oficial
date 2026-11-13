import {createHash} from 'node:crypto';
import {NextRequest,NextResponse} from 'next/server';
import {isAuthorized} from '@/lib/auth';
import {pool} from '@/lib/db';
export const runtime='nodejs';
export async function GET(request:NextRequest){
 if(!await isAuthorized(request))return NextResponse.json({message:'Entre novamente no DMP.'},{status:401});
 const id=request.nextUrl.searchParams.get('id');if(!id||!/^\w{64}$/.test(id))return NextResponse.json({message:'Arquivo inválido.'},{status:400});
 try{
  const raw=(await pool.query('SELECT payload FROM dmp_data WHERE id=$1',['personal_routine_file:'+id])).rows[0]?.payload;
  if(!raw)return NextResponse.json({message:'Arquivo não encontrado.'},{status:404});const record=typeof raw==='string'?JSON.parse(raw):raw,bytes=Buffer.from(record.base64,'base64');
  if(record.sha256!==id||bytes.length!==record.size||createHash('sha256').update(bytes).digest('hex')!==id)return NextResponse.json({message:'Não foi possível verificar a integridade do original.'},{status:503});
  const download=request.nextUrl.searchParams.get('download')==='1'||record.mime.includes('wordprocessingml');
  return new NextResponse(new Uint8Array(bytes),{headers:{'Content-Type':record.mime,'Content-Length':String(bytes.length),'Content-Disposition':(download?'attachment':'inline')+"; filename*=UTF-8''"+encodeURIComponent(record.name),'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox"}});
 }catch{return NextResponse.json({message:'Não foi possível abrir o original.'},{status:503});}
}
