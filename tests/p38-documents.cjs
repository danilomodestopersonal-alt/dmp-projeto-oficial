'use strict';
const A=require('node:assert/strict'),fs=require('node:fs'),H=require('./p15-harness.cjs'),{PDFDocument,StandardFonts}=require('pdf-lib');
(async()=>{
 const src=H.read('tests/p37-api.cjs').split('(async()=>{')[0],m={exports:{}};new Function('require','module',src+'\nmodule.exports={database,request};')(id=>id==='./p15-harness.cjs'?H:require(id),m);const db=m.exports.database(),request=m.exports.request;
 let auth=true,origin=true;const load=H.loader({'@/lib/db':{pool:db.pool},'@/lib/auth':{isAuthorized:async()=>auth},'@/lib/widget/devices':{sameOrigin:()=>origin}}),imp=load('app/api/routine/import/route.ts'),route=load('app/api/routine/route.ts'),files=load('app/api/routine/files/route.ts'),M=load('lib/routine/model.ts');
 const pdf=await PDFDocument.create(),page=pdf.addPage([595,842]),font=await pdf.embedFont(StandardFonts.Helvetica);const lines=['ROTINA DE SUPLEMENTACAO','SEUS 4 PRODUTOS','Produto A: 1 unidade / dia','HORARIOS PARA O DIA A DIA','ALMOCO Produto A: 1 unidade','ALMOCO Produto B: 1 unidade','TODO DIA Produto C: 3 g (horario livre)','16H Produto D: comecar com 3 g em agua','JANTAR Produto E: 1 unidade*','NOITE Produto F: 1 unidade','PEDAL Produto G: somente se necessario no treino','ATENCAO ANTES DE INICIAR','* Confirmar condicoes no documento. Nao alterar a dose.','Produto D: conferir a agua e o intervalo de remedios.'];lines.forEach((line,i)=>page.drawText(line,{font,size:11,x:35,y:800-i*35}));const bytes=Buffer.from(await pdf.save());
 function req(data=bytes,name='estrutura-sintetica.pdf',category='SUPPLEMENT'){const form=new FormData();form.set('file',new File([data],name));form.set('category',category);return {headers:new Headers(),formData:async()=>form};}
 auth=false;A.equal((await imp.POST(req())).status,401);auth=true;origin=false;A.equal((await imp.POST(req())).status,403);origin=true;
 let r=await imp.POST(req()),d=await r.json();A.equal(r.status,200,JSON.stringify(d));A.equal(d.data.files.length,1);A.equal(d.data.versions.length,0);const draft=d.data.drafts[0];A.equal(draft.items.length,7);A.ok(draft.items.every(i=>!i.reviewed));A.equal(draft.items[3].clock,'16:00');A.equal(draft.items[6].quantity,'');A.equal(draft.items[6].conditional,true);A.ok(draft.warnings.some(w=>w.includes('Confirmar')));
 A.equal((await(await imp.POST(req())).json()).duplicate,true);A.equal(db.get('personal_routine_v1').files.length,1);
 const original=await files.GET(request(null,'https://test.local/api/routine/files?id='+draft.fileId));A.equal(Buffer.from(await original.arrayBuffer()).compare(bytes),0);
 const today=M.routineDay(),input={draftId:draft.id,title:draft.title,effectiveFrom:today,mode:'REPLACE_CATEGORIES',categories:['SUPPLEMENT'],items:draft.items,acknowledgedWarnings:true};A.equal((await route.POST(request({action:'preview',input}))).status,409,'unreviewed extraction cannot activate');
 input.items=input.items.map(i=>({...i,reviewed:true}));input.items[0].quantity='2';let preview=(await(await route.POST(request({action:'preview',input}))).json()).preview;
 const command={action:'activate',input,operationId:'p38-document-activate-001',revision:1,previewDigest:preview.digest};A.equal((await route.POST(request(command))).status,200);A.equal(db.get('personal_routine_v1').versions[0].items[0].quantity,'2');
 const home=await(await route.GET(request(null,'https://test.local/api/routine?today=1'))).json();A.equal(home.data.versions.length,1);A.equal(home.data.files.length,0);
 const loaded=await(await route.GET(request())).json();A.equal(loaded.data.files.length,1);A.equal(loaded.data.drafts.length,1);A.equal(loaded.data.versions.length,1);A.equal(loaded.data.versions[0].warnings.length,draft.warnings.length);
 const counts=JSON.stringify(db.get('personal_routine_v1'));const oversized=req(Buffer.alloc(5*1024*1024+1));A.equal((await imp.POST(oversized)).status,400);A.equal(JSON.stringify(db.get('personal_routine_v1')),counts);
 const tooLarge=req();tooLarge.headers.set('content-length',String(6*1024*1024));A.equal((await imp.POST(tooLarge)).status,413);
 // Existing real-decoder regression checks PDF, scanned PDF, PNG, JPG and DOCX.

 console.log('PASS P38 documents: source-shaped PDF through actual import API, original byte integrity, extraction/review/edit/approval/load/Home, deduplication, auth/size limits; no real plan activated.');
})().catch(e=>{console.error(e);process.exitCode=1});
