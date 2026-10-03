import type {PerformanceActivity} from "@/types/performance";
export type EvolutionMetric="distance"|"minutes"|"elevation"|"count";
export function performanceEvolution(activities:PerformanceActivity[],year:number,month:number,length:3|6|12){
  return Array.from({length},(_,index)=>{
    const date=new Date(year,month-length+index,1);const key=`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}`;
    const items=activities.filter(item=>item.date.startsWith(key));
    return {key,label:date.toLocaleDateString("pt-BR",{month:"short",year:"2-digit"}),distance:items.reduce((sum,a)=>sum+(a.distanceKm||0),0),minutes:items.reduce((sum,a)=>sum+(a.durationMinutes||0),0),elevation:items.reduce((sum,a)=>sum+(a.elevationMeters||0),0),count:items.length};
  });
}
