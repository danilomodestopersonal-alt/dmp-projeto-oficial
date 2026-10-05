import type {PerformanceActivity} from "@/types/performance";
export function validActivityDate(value:string){const date=new Date(value+"T12:00:00Z");return /^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;}
const sum=(items:PerformanceActivity[],field:"distanceKm"|"durationMinutes"|"elevationMeters")=>items.reduce((n,a)=>n+(typeof a[field]==="number"&&Number.isFinite(a[field])?a[field]!:0),0);
export function activityTotals(items:PerformanceActivity[]){return {distance:sum(items,"distanceKm"),minutes:sum(items,"durationMinutes"),elevation:sum(items,"elevationMeters"),count:items.length};}
export function changePercent(current:number,previous:number){return previous>0?(current-previous)/previous*100:null;}
export function monthOffset(key:string,offset:number){const [y,m]=key.split("-").map(Number),date=new Date(Date.UTC(y,m-1+offset,1));return date.toISOString().slice(0,7);}
export function dayOffset(key:string,offset:number){const date=new Date(key+"T12:00:00Z");date.setUTCDate(date.getUTCDate()+offset);return date.toISOString().slice(0,10);}
export function activityStreak(items:PerformanceActivity[],today:string){
 const dates=[...new Set(items.filter(a=>validActivityDate(a.date)&&a.date<=today).map(a=>a.date))].sort();let length=0,longest=0,start="",bestStart="",bestEnd="",previous="";
 for(const date of dates){length=previous&&dayOffset(previous,1)===date?length+1:1;if(length===1)start=date;if(length>longest){longest=length;bestStart=start;bestEnd=date;}previous=date;}
 const set=new Set(dates);let cursor=set.has(today)?today:dayOffset(today,-1),current=0;while(set.has(cursor)){current++;cursor=dayOffset(cursor,-1);}
 return {longest,current,start:bestStart,end:bestEnd};
}
export function performanceInsights(activities:PerformanceActivity[],today:string,length:3|6|12=3){
 const items=activities.filter(a=>validActivityDate(a.date)&&a.date<=today),month=today.slice(0,7),lastMonth=monthOffset(month,-1),start7=dayOffset(today,-6);
 const current=items.filter(a=>a.date.startsWith(month)),previous=items.filter(a=>a.date.startsWith(lastMonth)),week=items.filter(a=>a.date>=start7);
 // Comparação usa meses encerrados: mesma quantidade, sem mês parcial.
 const endA=monthOffset(month,-1),startA=monthOffset(month,-length),endB=monthOffset(month,-length-1),startB=monthOffset(month,-length*2);
 const periodA=items.filter(a=>a.date.slice(0,7)>=startA&&a.date.slice(0,7)<=endA),periodB=items.filter(a=>a.date.slice(0,7)>=startB&&a.date.slice(0,7)<=endB);
 const distribution=Object.entries(items.reduce<Record<string,PerformanceActivity[]>>((map,a)=>{(map[a.type]??=[]).push(a);return map;},{})).map(([type,records])=>({type,records,count:records.length}));
 const activeDays=new Set(week.map(a=>a.date)).size;
 return {items,current,previous,week,start7,activeDays,daysWithoutRecord:7-activeDays,month,lastMonth,periodA,periodB,startA,endA,startB,endB,distribution,streak:activityStreak(items,today)};
}
