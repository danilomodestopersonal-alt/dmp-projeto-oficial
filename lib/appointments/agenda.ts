import {fixedOccurrences,type FixedStore,type FixedOccurrence} from './fixed';

// Local projection only. Never feed the monthly calendar, lesson matching or widgets.
export function fixedAgendaProjection(store:FixedStore,anchor:string,range:string,enabled=true):FixedOccurrence[]{
 if(!enabled||!['day','week','list'].includes(range))return [];
 const start=new Date(anchor+'T12:00:00Z');
 if(Number.isNaN(start.getTime()))return [];
 let days=range==='list'?90:1;
 if(range==='week'){const weekday=start.getUTCDay();start.setUTCDate(start.getUTCDate()-(weekday===0?6:weekday-1));days=6;}
 const end=new Date(start);end.setUTCDate(end.getUTCDate()+days-1);
 return fixedOccurrences(store,start.toISOString().slice(0,10),end.toISOString().slice(0,10));
}
