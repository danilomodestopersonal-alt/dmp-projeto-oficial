import type {PerformanceGear} from '@/types/performance';
import {isGearId} from '@/lib/performance-cycling';
export async function resolveStravaGears(accessToken:string,ids:string[],previous:PerformanceGear[]=[]){
 const gears=new Map(previous.map(g=>[g.id,{...g}]));let unavailable=0;
 const unique=[...new Set(ids)].filter(isGearId),deadline=Date.now()+15000;
 for(const id of unique)if(!gears.has(id))gears.set(id,{id,name:null});
 unavailable+=Math.max(0,unique.length-30);
 for(const [index,id] of unique.slice(0,30).entries()){
  const remaining=deadline-Date.now();if(remaining<=0){unavailable+=Math.min(unique.length,30)-index;break;}
  const old=gears.get(id)||{id,name:null};
  try{
   const r=await fetch('https://www.strava.com/api/v3/gear/'+encodeURIComponent(id),{headers:{Authorization:'Bearer '+accessToken},cache:'no-store',signal:AbortSignal.timeout(Math.min(10000,remaining))});
   if(!r.ok){unavailable++;gears.set(id,old);if(r.status===429){unavailable+=Math.min(unique.length,30)-index-1;break;}continue;}
   const g=await r.json();if(g.id!==id)throw Error('Gear mismatch');
   const full=[g.brand_name,g.model_name].filter(v=>typeof v==='string'&&v.trim()).join(' ');
   const name=(typeof g.name==='string'&&g.name.trim()&&!isGearId(g.name)?g.name.trim():full||old.name)||null;
   // Official gear API: 1 MTB, 2 cross, 3 road, 4 time trial.
   const frameType=Number(g.frame_type),kind=frameType===1?'MTB':frameType===3||frameType===4?'SPEED':null;
   gears.set(id,{...old,name,frameType:Number.isFinite(frameType)?frameType:undefined,checkedAt:new Date().toISOString(),...(old.kindSource!=='MANUAL'&&kind?{cyclingKind:kind,kindSource:'STRAVA' as const}:{})});
  }catch{unavailable+=Math.min(unique.length,30)-index;gears.set(id,old);break;}
 }
 return {gears:[...gears.values()],unavailable};
}
