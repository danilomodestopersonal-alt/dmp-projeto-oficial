import {parseGalileuStructuredText} from "./text-import";
export const PERFORMANCE_COMPOSITION_FIELDS=[["height", "Altura (cm)"], ["bmi", "IMC"], ["fatMass", "Massa de gordura (kg)"], ["leanMass", "Massa magra (kg)"], ["leanMassPercent", "Massa magra (%)"], ["waterPercent", "Água corporal (%)"], ["totalBodyWaterLiters", "Água corporal total (L)"], ["hydrationIndex", "Índice de hidratação"], ["waterLeanPercent", "Água na massa magra (%)"], ["intracellularWaterLiters", "Água intracelular (L)"], ["extracellularWaterLiters", "Água extracelular (L)"], ["intracellularWaterPercent", "Água intracelular (%)"], ["muscleMassPercent", "Massa muscular (%)"], ["muscleFatRatio", "Relação músculo/gordura"], ["basalMetabolicRate", "TMB"], ["phaseAngle", "Ângulo de fase"], ["cellularAge", "Idade celular"]] as const;
export type PerformanceCompositionField=typeof PERFORMANCE_COMPOSITION_FIELDS[number][0];
export const emptyCompositionFields=()=>Object.fromEntries(PERFORMANCE_COMPOSITION_FIELDS.map(([key])=>[key,""])) as Record<PerformanceCompositionField,string>;
export function importPerformanceAssessment(raw:string) {
  const parsed=parseGalileuStructuredText(raw);
  return Object.fromEntries(Object.entries(parsed).filter(([,value])=>value!==undefined && value!==null).map(([key,value])=>[
    key==="weight"?"weightKg":key==="muscleMass"?"muscleMassKg":key,typeof value==="number"?String(Math.round(value*10)/10):value
  ]));
}
