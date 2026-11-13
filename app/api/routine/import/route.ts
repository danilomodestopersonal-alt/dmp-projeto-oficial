import {createHash} from 'node:crypto';
import {NextRequest,NextResponse} from 'next/server';
import {isAuthorized} from '@/lib/auth';
import {sameOrigin} from '@/lib/widget/devices';
import {readRoutineDocument,routineMime,ROUTINE_MAX_FILE} from '@/lib/routine/documents';
import {extractRoutine} from '@/lib/routine/extraction';
import {routineTransaction,readRoutine} from '@/lib/routine/store';
import {activeRoutine,RoutineError} from '@/lib/routine/model';
import type {RoutineCategory,RoutineFile,RoutineDraft} from '@/types/routine';
export const runtime='nodejs';
const reply=(d:unknown,status=200)=>NextResponse.json(d,{status,headers:{'Cache-Control':'no-store'}});
export async function POST(request:NextRequest){
 if(!await isAuthorized(request))return reply({message:'Entre novamente no DMP.'},401);
 if(!sameOrigin(request))return reply({message:'Origem não autorizada.'},403);
 try{
  if(Number(request.headers.get('content-length')||0)>ROUTINE_MAX_FILE+100000)throw new RoutineError('Envie um arquivo de até 5 MB.',413);
  const form=await request.formData(),file=form.get('file'),category=form.get('category') as RoutineCategory;
  if(!(file instanceof File)||file.size<8||file.size>ROUTINE_MAX_FILE||!['SUPPLEMENT','FOOD'].includes(category))throw new RoutineError('Selecione um PDF, DOCX, JPG ou PNG de até 5 MB e o tipo de plano.',400);
  const bytes=Buffer.from(await file.arrayBuffer()),mime=routineMime(file.name,bytes),sha=createHash('sha256').update(bytes).digest('hex');
  const initial=await readRoutine(),existing=initial.files.find(f=>f.sha256===sha);
  if(existing)return reply({ok:true,duplicate:true,data:initial,draftId:initial.drafts.find(d=>d.fileId===existing.id)?.id,message:'Este arquivo já está guardado. Revise o rascunho existente ou edite o plano vigente.'});
  const extracted=await readRoutineDocument(bytes,mime),parsed=extractRoutine(extracted.pages,category),now=new Date().toISOString();
  const warnings=[...extracted.warnings,...parsed.warnings],record:RoutineFile={id:sha,name:file.name.replace(/[\\/\r\n\u0000]/g,'_').slice(0,200),size:bytes.length,mime,sha256:sha,uploadedAt:now,pages:extracted.pages,warnings,status:!extracted.pages.some(p=>p.text.trim().length>15)?'UNREADABLE':warnings.length?'NEEDS_REVIEW':'EXTRACTED'};
  const result=await routineTransaction(async(data,client)=>{
   if(data.files.some(f=>f.sha256===sha))return {data,result:{ok:true,duplicate:true,draftId:data.drafts.find(d=>d.fileId===sha)?.id},write:false};
   if(data.files.length>=100)throw new RoutineError('Limite de 100 documentos atingido. Os originais existentes foram preservados.');
   const current=activeRoutine(data),normalize=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
   const items=parsed.items.map((i,n)=>{const matches=current?.items.filter(old=>old.category===i.category&&normalize(old.name)===normalize(i.name))||[],unique=parsed.items.filter(p=>p.category===i.category&&normalize(p.name)===normalize(i.name)).length===1;return {...i,sourceFileId:sha,id:matches.length===1&&unique?matches[0].id:'i-'+sha.slice(0,20)+'-'+n};});
   const draft:RoutineDraft={id:'draft-'+sha.slice(0,32),title:parsed.title,fileId:sha,sourceDate:parsed.sourceDate,sourceVersion:parsed.sourceVersion,items,warnings,createdAt:now,updatedAt:now,baseVersionId:current?.id};
   await client.query('INSERT INTO dmp_data(id,payload,updated_at) VALUES($1,$2,clock_timestamp()) ON CONFLICT(id) DO NOTHING',['personal_routine_file:'+sha,JSON.stringify({id:sha,name:record.name,mime,size:bytes.length,sha256:sha,base64:bytes.toString('base64')})]);
   return {data:{...data,files:[...data.files,record],drafts:[...data.drafts,draft]},result:{ok:true,duplicate:false,draftId:draft.id}};
  });return reply(result);
 }catch(e){return reply({message:e instanceof Error?e.message:'Falha ao importar. Tente preencher manualmente.'},e instanceof RoutineError?e.status:422);}
}
