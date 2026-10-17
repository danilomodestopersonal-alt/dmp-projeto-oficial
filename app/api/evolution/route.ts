import {NextRequest,NextResponse} from 'next/server';
import {createHash} from 'node:crypto';
import {isAuthorized} from '@/lib/auth';
import {pool} from '@/lib/db';
import {permittedStudent} from '@/lib/evolution/model';
import type {Student} from '@/types/models';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store, max-age=0','Vary':'Cookie'};
export async function GET(req:NextRequest){
 if(!await isAuthorized(req))return NextResponse.json({error:'Entre novamente no DMP.'},{status:401,headers});
 const id=req.nextUrl.searchParams.get('student');if(!id||id.length>200)return NextResponse.json({error:'Aluno inválido.'},{status:400,headers});
 try{
 const result=await pool.query('SELECT payload FROM dmp_data WHERE id=$1',['students']);
 const students=result.rows[0]?.payload;if(!Array.isArray(students))throw Error('Dados indisponíveis');
 const matches=(students as Student[]).filter(s=>s.id===id);if(matches.length!==1)return NextResponse.json({error:'Aluno não encontrado ou identificação ambígua.'},{status:404,headers});
 const student=permittedStudent(matches[0],req.nextUrl.searchParams.get('health')==='confirmed');
 return NextResponse.json({student,fingerprint:createHash('sha256').update(JSON.stringify(student)).digest('hex')},{headers});
 }catch{return NextResponse.json({error:'Não foi possível ler os dados atualizados. Tente novamente.'},{status:503,headers});}
}
