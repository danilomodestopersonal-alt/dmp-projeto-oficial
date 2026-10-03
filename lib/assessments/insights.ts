import type { Assessment } from "@/types/models";
export const assessmentInsightMetrics = [
  {key:"weight",label:"Peso",unit:"kg"},
  {key:"bodyFatPercent",label:"Gordura corporal",unit:"%"},
  {key:"leanMass",label:"Massa magra",unit:"kg"},
  {key:"muscleMass",label:"Massa muscular",unit:"kg"},
  {key:"leanMassPercent",label:"Massa magra",unit:"%"},
  {key:"muscleMassPercent",label:"Massa muscular",unit:"%"},
] as const;
export type InsightMetric = typeof assessmentInsightMetrics[number]["key"];
export function assessmentInsightValue(item:Assessment,key:InsightMetric):number|null {
  const value=item[key];return typeof value==="number"&&Number.isFinite(value)?value:null;
}
export function assessmentInsightSeries(items:Assessment[],key:InsightMetric){
  return items.filter(item=>/^\d{4}-\d{2}-\d{2}$/.test(item.date)&&Number.isFinite(Date.parse(item.date)))
    .flatMap(item=>{const value=assessmentInsightValue(item,key);return value===null?[]:[{id:item.id,date:item.date,value}];})
    .sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
}
export function assessmentInsightDifference(a:Assessment|undefined,b:Assessment|undefined,key:InsightMetric){
  if(!a||!b)return null;
  const av=assessmentInsightValue(a,key),bv=assessmentInsightValue(b,key);
  return av===null||bv===null?null:bv-av;
}
export function assessmentReminderDate(items:Assessment[],interval:number){
  if(!Number.isInteger(interval)||interval<1||interval>730)return null;
  const latest=items.map(item=>item.date).filter(date=>/^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(Date.parse(date))).sort().at(-1);
  if(!latest)return null;
  const date=new Date(`${latest}T12:00:00`);date.setDate(date.getDate()+interval);
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
}
