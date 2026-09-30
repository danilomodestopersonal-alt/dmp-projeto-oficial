export type GalileuPdfImport = {
  date?:string; weight?:number; height?:number; bmi?:number; bodyFatPercent?:number; fatMass?:number;
  leanMass?:number; leanMassPercent?:number; waterPercent?:number; totalBodyWaterLiters?:number;
  hydrationIndex?:number; waterLeanPercent?:number; intracellularWaterLiters?:number;
  extracellularWaterLiters?:number; intracellularWaterPercent?:number; muscleMass?:number;
  muscleMassPercent?:number; muscleFatRatio?:number; basalMetabolicRate?:number; phaseAngle?:number; cellularAge?:number;
};
export function ocrNumber(value:string|undefined|null){if(!value)return undefined;const cleaned=value.replace(/\s/g,"").replace(/\.(?=\d{3}(?:\D|$))/g,"").replace(",",".").replace(/[^0-9.-]/g,"");const number=Number(cleaned);return Number.isFinite(number)?number:undefined;}
export function parseGalileuStructuredText(raw:string):GalileuPdfImport{
  const text=raw.normalize("NFD").replace(/[\u0300-\u036f]/g,"");
  const pick=(labels:string[])=>{
    for(const label of labels){
      const regex=new RegExp(`^\\s*${label}\\s*:\\s*([\\d.,]+)`,"im");
      const value=ocrNumber(text.match(regex)?.[1]);
      if(value!==undefined)return value;
    }
    return undefined;
  };
  const dateMatch=text.match(/^\s*Data\s*:\s*(\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2})/im);
  const date=dateMatch?(dateMatch[1].includes("/")?dateMatch[1].split("/").reverse().join("-"):dateMatch[1]):undefined;
  return{
    date,
    weight:pick(["Peso"]),
    height:pick(["Altura"]),
    bmi:pick(["IMC"]),
    bodyFatPercent:pick(["Gordura corporal","Percentual de gordura","Gordura %"]),
    fatMass:pick(["Massa de gordura","Massa gorda"]),
    leanMass:pick(["Massa magra kg","Massa magra \\(kg\\)"]),
    leanMassPercent:pick(["Massa magra %","Massa magra percentual"]),
    waterPercent:pick(["Agua corporal %","Agua corporal percentual"]),
    totalBodyWaterLiters:pick(["Agua corporal total","Agua corporal total L"]),
    hydrationIndex:pick(["Indice de hidratacao"]),
    waterLeanPercent:pick(["Agua na massa magra","Agua na massa magra %"]),
    intracellularWaterLiters:pick(["Agua intracelular L","Agua intracelular \\(L\\)"]),
    extracellularWaterLiters:pick(["Agua extracelular L","Agua extracelular \\(L\\)"]),
    intracellularWaterPercent:pick(["Agua intracelular %","Agua intracelular percentual"]),
    muscleMass:pick(["Massa muscular kg","Massa muscular \\(kg\\)"]),
    muscleMassPercent:pick(["Massa muscular %","Massa muscular percentual"]),
    muscleFatRatio:pick(["Relacao musculo/gordura","Razao musculo/gordura"]),
    basalMetabolicRate:pick(["TMB","Metabolismo basal","Taxa metabolica basal"]),
    phaseAngle:pick(["Angulo de fase"]),
    cellularAge:pick(["Idade celular"])
  };
}
