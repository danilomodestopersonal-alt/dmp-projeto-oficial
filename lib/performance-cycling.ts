import type {PerformanceActivity,PerformanceCyclingKind,PerformanceGear} from '@/types/performance';
export const isGearId=(value:unknown):value is string=>typeof value==='string'&&/^[bs]\d+$/.test(value);
export const activityGearId=(a:Pick<PerformanceActivity,'gearId'|'gearName'>)=>a.gearId||(isGearId(a.gearName)?a.gearName:null);
export function gearDisplay(a:Pick<PerformanceActivity,'gearId'|'gearName'>,gears:PerformanceGear[]=[]){
 const name=gears.find(g=>g.id===activityGearId(a))?.name||a.gearName;
 return name&&!isGearId(name)?name:'Equipamento não identificado';
}
export function automaticCycling(sport:string|null|undefined,gear?:PerformanceGear):{cyclingKind:PerformanceCyclingKind;cyclingKindSource:PerformanceActivity['cyclingKindSource']}{
 const s=(sport||'').toLowerCase();
 if(s==='virtualride')return {cyclingKind:'INDOOR',cyclingKindSource:'SPORT'};
 if(s==='mountainbikeride'||s==='emountainbikeride')return {cyclingKind:'MTB',cyclingKindSource:'SPORT'};
 if(gear?.cyclingKind)return {cyclingKind:gear.cyclingKind,cyclingKindSource:'GEAR'};
 // Ride alone (and words in a title) cannot determine the bicycle modality.
 return {cyclingKind:'OTHER',cyclingKindSource:'UNKNOWN'};
}
export function classifyCycling(a:PerformanceActivity,gear?:PerformanceGear):PerformanceActivity{
 if(a.type!=='CYCLING')return a;
 if(a.cyclingKindSource==='MANUAL'||a.cyclingKindSource==='LEGACY')return a;
 if(!a.cyclingKindSource&&a.cyclingKind!=null)return {...a,cyclingKindSource:'LEGACY'};
 return {...a,...automaticCycling(a.stravaSportType,gear)};
}
const optionalMetrics=['elapsedMinutes','elevationLossMeters','heartRateAverage','heartRateMax','powerAverage','powerWeighted','powerMax','calories','relativeEffort','gearName','gearId','description'] as const;
export function mergeStravaActivity(old:PerformanceActivity|undefined,incoming:PerformanceActivity,gears:PerformanceGear[]):PerformanceActivity{
 let next={...old,...incoming};
 if(old){
  next.id=old.id;next.createdAt=old.createdAt;
  for(const key of optionalMetrics)if(incoming[key]==null)(next as any)[key]=old[key];
  if(old.cyclingKindSource==='MANUAL'||old.cyclingKindSource==='LEGACY'||(!old.cyclingKindSource&&old.cyclingKind!=null)){
   next.cyclingKind=old.cyclingKind;next.cyclingKindSource=old.cyclingKindSource||'LEGACY';
  }
  next.notes=old.notes?.includes('Importado da planilha histórica')?old.notes+(old.notes.includes('ID Strava vinculado')?'':' • ID Strava vinculado'):old.notes||incoming.notes;
 }
 next.gearId=activityGearId(next);
 const gear=gears.find(g=>g.id===next.gearId);
 next.gearName=gear?.name||(!isGearId(next.gearName)?next.gearName:null)||null;
 return classifyCycling(next,gear);
}
