'use strict';
const A=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{PDFDocument,StandardFonts}=require('pdf-lib'),H=require('./p15-harness.cjs'),load=H.loader(),D=load('lib/routine/documents.ts'),E=load('lib/routine/extraction.ts');
(async()=>{
 const pdf=await PDFDocument.create(),page=pdf.addPage(),font=await pdf.embedFont(StandardFonts.Helvetica);
 ['PLANO SINTETICO DE TESTE','ROTINA DIARIA','ALMOCO Item Teste: 1 unidade','16H Item B: 2 g em agua','PEDAL Item C: somente se necessario','ATENCAO','Conferir no original.'].forEach((text,n)=>page.drawText(text,{x:50,y:750-35*n,size:15,font}));const bytes=Buffer.from(await pdf.save()),r=await D.readRoutineDocument(bytes,'application/pdf'),parsed=E.extractRoutine(r.pages,'SUPPLEMENT');
 A.equal(parsed.items.length,3);A.equal(parsed.items[0].clock,'');A.equal(parsed.items[0].timing,'Com o almoço');A.equal(parsed.items[1].clock,'16:00');A.equal(parsed.items[2].conditional,true);A.equal(parsed.items[2].quantity,'');A.ok(parsed.items.every(i=>i.reviewed===false));A.ok(parsed.warnings.some(w=>w.includes('Conferir no original')));
 for(const name of ['synthetic-routine.docx','synthetic-routine.png','synthetic-routine.jpg','synthetic-scan.pdf']){
  const b=fs.readFileSync(path.join(__dirname,'fixtures/p37',name)),read=await D.readRoutineDocument(b,D.routineMime(name,b)),out=E.extractRoutine(read.pages,'SUPPLEMENT');
  A.equal(out.items.length,2,name+' '+JSON.stringify(read.warnings));A.equal(out.items[0].quantity,'1');A.equal(out.items[1].quantity,'2');A.equal(out.items[1].clock,'16:00');A.ok(out.warnings.some(w=>w.includes('Conferir')));if(!name.endsWith('docx')){A.equal(read.pages[0].method,'OCR');A.equal(out.items[0].evidence.name.confidence,'OCR_REVIEW');}console.log('PASS leitura real '+name);
 }
 const bad=await D.readRoutineDocument(Buffer.from('%PDF-corrupt'),'application/pdf');A.equal(bad.pages.length,0);A.ok(bad.warnings.length);A.equal(E.extractRoutine(bad.pages,'SUPPLEMENT').items.length,0);
 A.throws(()=>D.routineMime('fake.png',Buffer.from('not-an-image')));A.throws(()=>D.docxRoutineText(Buffer.from('broken-document')));
 const ambiguous=E.extractRoutine([{page:2,method:'TEXT',text:'Produto indefinido sem dose ou horário\nItem Teste: 2 unidades'}],'SUPPLEMENT');A.equal(ambiguous.items.length,1);A.equal(ambiguous.items[0].frequency,'REVIEW');A.equal(ambiguous.items[0].clock,'');A.equal(ambiguous.items[0].evidence.name.page,2);
 const food=E.extractRoutine([{page:1,method:'TEXT',text:'PLANO ALIMENTAR\nCafé da manhã: Pão 2 fatias\nAlmoço: Arroz 100 g\nObservações\nTexto de ressalva'}],'FOOD');A.equal(food.items.length,2);A.equal(food.items[1].clock,'');A.ok(food.warnings.includes('Texto de ressalva'));
 console.log('PASS P37 documents: actual text PDF, scanned PDF/PNG/JPG OCR, DOCX, corrupt file fallback, source/confidence, conditional items, undefined frequency and no invented dose/time.');
})().catch(e=>{console.error(e);process.exitCode=1});
