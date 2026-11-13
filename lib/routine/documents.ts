import {inflateRawSync} from 'node:zlib';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import type {RoutinePage} from '@/types/routine';
export const ROUTINE_MAX_FILE=5*1024*1024;
export function routineMime(name:string,bytes:Buffer){
 if(/\.pdf$/i.test(name)&&bytes.subarray(0,5).toString()==='%PDF-')return 'application/pdf';
 if(/\.png$/i.test(name)&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'image/png';
 if(/\.jpe?g$/i.test(name)&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'image/jpeg';
 if(/\.docx$/i.test(name)&&bytes.readUInt32LE(0)===0x04034b50)return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
 throw Error('Envie PDF, DOCX, JPG ou PNG válido (até 5 MB). Outros formatos podem ser preenchidos manualmente.');
}
const xmlText=(s:string)=>s.replace(/<[^>]*>/g,'').replace(/&#(x[0-9a-f]+|\d+);/gi,(_,n)=>{const v=n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n);return v>=0&&v<=0x10ffff?String.fromCodePoint(v):'';}).replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&');
export function docxRoutineText(buffer:Buffer){
 let end=-1;for(let i=buffer.length-22;i>=Math.max(0,buffer.length-65558);i--)if(buffer.readUInt32LE(i)===0x06054b50){end=i;break;}
 if(end<0)throw Error('DOCX incompleto.');let offset=buffer.readUInt32LE(end+16),count=buffer.readUInt16LE(end+10);
 if(count>2000)throw Error('DOCX excede o limite de leitura.');
 for(let n=0;n<count;n++){
  if(offset+46>buffer.length||buffer.readUInt32LE(offset)!==0x02014b50)throw Error('Estrutura DOCX inválida.');
  const flags=buffer.readUInt16LE(offset+8),method=buffer.readUInt16LE(offset+10),compressed=buffer.readUInt32LE(offset+20),size=buffer.readUInt32LE(offset+24),nameLen=buffer.readUInt16LE(offset+28),extra=buffer.readUInt16LE(offset+30),comment=buffer.readUInt16LE(offset+32),local=buffer.readUInt32LE(offset+42),name=buffer.subarray(offset+46,offset+46+nameLen).toString();
  offset+=46+nameLen+extra+comment;if(name!=='word/document.xml')continue;
  if(flags&1||size>2*1024*1024||local+30>buffer.length||buffer.readUInt32LE(local)!==0x04034b50)throw Error('DOCX protegido ou grande demais para leitura.');
  const start=local+30+buffer.readUInt16LE(local+26)+buffer.readUInt16LE(local+28);if(start+compressed>buffer.length)throw Error('DOCX corrompido.');
  const data=buffer.subarray(start,start+compressed),xml=(method===0?data:method===8?inflateRawSync(data,{maxOutputLength:2*1024*1024}):Buffer.alloc(0)).toString('utf8');
  if(!xml||/<!DOCTYPE|<!ENTITY/i.test(xml))throw Error('DOCX não compatível.');
  return xmlText(xml.replace(/<\/w:tc>/g,'\t').replace(/<\/w:tr>/g,'\n').replace(/<\/w:p>/g,'\n').replace(/<w:tab\b[^>]*\/>/g,'\t')).trim();
 }
 throw Error('O DOCX não possui conteúdo de texto legível.');
}
async function ocr(bytes:Buffer){
 const {createWorker}=await import('tesseract.js');
 let worker:Awaited<ReturnType<typeof createWorker>>|undefined,timer:ReturnType<typeof setTimeout>|undefined,expired=false;
 const work=(async()=>{const w=await createWorker('por',1,{workerPath:join(process.cwd(),'node_modules/tesseract.js/src/worker-script/node/index.js'),cachePath:tmpdir()});worker=w;if(expired){await w.terminate();throw Error('OCR excedeu o tempo de leitura.');}return (await w.recognize(bytes)).data.text||'';})();
 try{return await Promise.race([work,new Promise<string>((_,reject)=>{timer=setTimeout(()=>{expired=true;void worker?.terminate();reject(Error('OCR excedeu o tempo de leitura.'));},45000);})]);}
 finally{if(timer)clearTimeout(timer);if(worker)await worker.terminate().catch(()=>{});}
}
function checkImageSize(bytes:Buffer,mime:string){
 if(mime==='image/png'){if(bytes.length<24)throw Error('Imagem incompleta.');if(bytes.readUInt32BE(16)*bytes.readUInt32BE(20)>16000000)throw Error('Reduza a imagem para até 16 megapixels.');return;}
 for(let at=2;at+9<bytes.length;){if(bytes[at]!==255){at++;continue;}const marker=bytes[at+1];if(marker===217||marker===218)break;const length=bytes.readUInt16BE(at+2);if(length<2)break;if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)){if(bytes.readUInt16BE(at+5)*bytes.readUInt16BE(at+7)>16000000)throw Error('Reduza a imagem para até 16 megapixels.');return;}at+=2+length;}
}
export async function readRoutineDocument(bytes:Buffer,mime:string){
 const pages:RoutinePage[]=[],warnings:string[]=[];
 try{
  if(mime.includes('wordprocessingml'))pages.push({page:1,text:docxRoutineText(bytes),method:'TEXT'});
  else if(mime.startsWith('image/')){checkImageSize(bytes,mime);pages.push({page:1,text:await ocr(bytes),method:'OCR'});}
  else{
   const {PDFParse}=await import('pdf-parse'),{getData}=await import('pdf-parse/worker');PDFParse.setWorker(getData());const parser=new PDFParse({data:new Uint8Array(bytes)});
   try{
    const info=await parser.getInfo();if(info.total>20)throw Error('O PDF tem mais de 20 páginas. Divida o documento ou preencha manualmente.');
    const result=await parser.getText();
    for(const p of result.pages){let text=p.text||'',method:'TEXT'|'OCR'='TEXT';if(text.trim().length<30){if(p.num<=3){try{const shot=await parser.getScreenshot({partial:[p.num],scale:1.5,imageDataUrl:false,imageBuffer:true});if(shot.pages?.[0]?.data){text=await ocr(Buffer.from(shot.pages[0].data));method='OCR';}}catch{warnings.push('Não foi possível ler a página '+p.num+' por OCR. Confira o original e complete manualmente.');}}else warnings.push('Página '+p.num+' sem texto: OCR limitado às 3 primeiras páginas. Confira e complete manualmente.');}
     pages.push({page:p.num,text:text.slice(0,80000),method});
    }
   }finally{await parser.destroy();}
  }
 }catch(error){warnings.push(error instanceof Error?error.message:'Falha na leitura. O original foi preservado.');}
 if(!pages.some(p=>p.text.trim().length>15))warnings.push('Não foi extraído texto suficiente. Preencha a rotina manualmente; o arquivo não foi interpretado.');
 if(pages.reduce((n,p)=>n+p.text.length,0)>160000){pages.splice(0,pages.length,...pages.map(p=>({...p,text:p.text.slice(0,Math.floor(160000/pages.length))})));warnings.push('Texto excede o limite de leitura. Confira o original completo.');}
 if(mime.includes('wordprocessingml'))warnings.push('No DOCX, a origem indica o documento; a paginação depende do editor.');
 return {pages,warnings};
}
