import {NextResponse} from "next/server";

export const runtime="nodejs";

function numberFrom(value:string|undefined|null){
  if(!value)return undefined;
  const cleaned=value.replace(/\s/g,"").replace(/\.(?=\d{3}(?:\D|$))/g,"").replace(",",".").replace(/[^0-9.-]/g,"");
  const number=Number(cleaned);
  return Number.isFinite(number)?number:undefined;
}

function parseGalileuText(raw:string){
  const text=raw.normalize("NFD").replace(/[\u0300-\u036f]/g,"");
  const pick=(regex:RegExp,index=1)=>numberFrom(text.match(regex)?.[index]);

  const dateMatch=text.match(/(\d{2}\/\d{2}\/\d{4})\s+(?:as|às)/i);
  const date=dateMatch?dateMatch[1].split("/").reverse().join("-"):undefined;

  const weight=pick(/Peso:\s*(\d+[.,]\d+)\s*kg/i) ?? pick(/(\d+[.,]\d+)\s*kg/i);
  const height=pick(/Altura:\s*(\d+[.,]?\d*)\s*cm/i);
  const bmi=pick(/IMC[\s\S]{0,250}?(\d+[.,]\d+)\s*(?:Kg\/m|Km)/i);
  const basalMetabolicRate=pick(/Taxa Metabolica[\s\S]{0,450}?(\d{1,2}[.]?\d{3})\s*kca[i|l]?/i);

  let fatMass=pick(/Massa Gorda[\s\S]{0,250}?(\d+[.,]\d+)\s*(?:Kg|K9|x9|kg)/i);
  let bodyFatPercent=pick(/%\s*Gordura[\s\S]{0,250}?(\d+[.,]\d+)\s*%/i);

  const leanMass=pick(/Massa Magra(?:\s+e\s+Muscular)?[\s\S]{0,350}?(\d+[.,]\d+)\s*(?:Kg|K9|x9|kg)/i);
  const leanMassPercent=pick(/Massa Magra(?:\s+e\s+Muscular)?[\s\S]{0,420}?\d+[.,]\d+\s*(?:Kg|K9|x9|kg)\s*\/\s*(\d+[.,]\d+)\s*%/i)
    ?? (bodyFatPercent!==undefined?100-bodyFatPercent:undefined);

  const muscleMass=pick(/Massa Muscular[\s\S]{0,250}?(\d+[.,]\d+)\s*(?:Kg|K9|x9|kg)/i);
  const muscleMassPercent=pick(/Massa Muscular[\s\S]{0,300}?\d+[.,]\d+\s*(?:Kg|K9|x9|kg)\s*\/\s*(\d+[.,]\d+)\s*%/i);

  const totalBodyWaterLiters=pick(/Agua Corporal Total[\s\S]{0,250}?(\d+[.,]\d+)\s*litros/i);
  const waterPercent=pick(/Agua Corporal Total[\s\S]{0,300}?\d+[.,]\d+\s*litros[\s\S]{0,80}?(\d+[.,]\d+)\s*%/i)
    ?? (totalBodyWaterLiters!==undefined&&weight?totalBodyWaterLiters/weight*100:undefined);

  const hydrationIndex=pick(/Indice de hidratacao[\s\S]{0,220}?(\d+[.,]\d+)/i);
  const waterLeanPercent=pick(/Agua na Massa Magra[\s\S]{0,220}?(\d+[.,]\d+)\s*%/i);
  const intracellularWaterLiters=pick(/Intracelular[\s\S]{0,180}?(\d+[.,]\d+)\s*litros/i);
  const extracellularWaterLiters=pick(/Extracelular[\s\S]{0,180}?(\d+[.,]\d+)\s*litros/i);
  const intracellularWaterPercent=pick(/Agua Intracelular\s*%[\s\S]{0,220}?(\d+[.,]\d+)\s*%/i);

  const muscleFatRatio=pick(/Razao Musculo[\s\S]{0,300}?(\d+[.,]\d+)(?:\s*kg\s*musculo)?/i);
  const phaseAngle=pick(/Angulo de Fase[\s\S]{0,250}?(\d+[.,]\d+)\s*(?:graus|º|°)/i);
  const cellularAge=pick(/Idade Celular[\s\S]{0,250}?(\d{1,3})\s*anos/i);
  if(fatMass===undefined&&weight!==undefined&&leanMass!==undefined)fatMass=weight-leanMass;
  if(bodyFatPercent===undefined&&weight&&fatMass!==undefined)bodyFatPercent=fatMass/weight*100;

  return {
    date,weight,height,bmi,bodyFatPercent,fatMass,leanMass,leanMassPercent,
    waterPercent,totalBodyWaterLiters,hydrationIndex,waterLeanPercent,
    intracellularWaterLiters,extracellularWaterLiters,intracellularWaterPercent,
    muscleMass,muscleMassPercent,muscleFatRatio,basalMetabolicRate,phaseAngle,cellularAge
  };
}

export async function POST(request:Request){
  try{
    const form=await request.formData();
    const file=form.get("file");

    if(!(file instanceof File)){
      return NextResponse.json({message:"PDF não enviado."},{status:400});
    }

    if(file.size>12*1024*1024){
      return NextResponse.json({message:"O PDF deve ter no máximo 12 MB."},{status:400});
    }

    const {getData}=await import("pdf-parse/worker");
    const {PDFParse}=await import("pdf-parse");
    PDFParse.setWorker(getData());
    const bytes=new Uint8Array(await file.arrayBuffer());
    const parser=new PDFParse({data:bytes});
    const result=await parser.getText();
    const extracted=result.text||"";

    if(!extracted.trim()){
      await parser.destroy();
      return NextResponse.json({message:"Não encontrei texto legível neste PDF."},{status:422});
    }

    let combinedText=extracted;
    let data=parseGalileuText(combinedText);
    let identified=Object.values(data).filter(value=>value!==undefined&&value!==null).length;

    if(identified<12){
      try{
        const screenshot=await parser.getScreenshot({partial:[1],scale:2,imageDataUrl:false,imageBuffer:true});
        const image=screenshot.pages?.[0]?.data;
        if(image){
          const {createWorker}=await import("tesseract.js");
          const {createRequire}=await import("module");
          const require=createRequire(import.meta.url);
          const workerPath=require.resolve("tesseract.js/src/worker-script/node/index.js");
          const worker=await createWorker("por",1,{workerPath});
          try{
            const ocr=await worker.recognize(Buffer.from(image));
            combinedText+=`\n${ocr.data.text||""}`;
            data=parseGalileuText(combinedText);
            identified=Object.values(data).filter(value=>value!==undefined&&value!==null).length;
          }finally{
            await worker.terminate();
          }
        }
      }catch(ocrError){
        console.error("OCR complementar do Galileu falhou:",ocrError);
      }
    }

    await parser.destroy();
    return NextResponse.json({ok:true,data,identified,fileName:file.name});
  }catch(error){
    console.error("Erro ao importar PDF da avaliação:",error);
    return NextResponse.json({message:"Não foi possível processar o PDF no servidor."},{status:500});
  }
}