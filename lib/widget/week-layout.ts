export function weekDays(anchor:string){const base=new Date(anchor+"T12:00:00Z"),offset=(base.getUTCDay()+6)%7;base.setUTCDate(base.getUTCDate()-offset);return Array.from({length:7},(_,i)=>new Date(base.getTime()+i*86400000).toISOString().slice(0,10));}
export type WeekItem={id:string;date:string;time:string;end:string;allDay:boolean;title:string;color:string;kind:string;source:"event"|"note"};
const minutes=(time:string)=>{const[h,m]=time.split(":").map(Number);return h*60+m};
export function placeWeekItems(items:WeekItem[]){const sorted=items.filter(e=>!e.allDay).map(item=>({item,start:minutes(item.time),end:Math.min(1440,Math.max(minutes(item.time)+30,minutes(item.end)||0)),lane:0,lanes:1})).sort((a,b)=>a.start-b.start||a.end-b.end||a.item.id.localeCompare(b.item.id));let group:typeof sorted=[];let until=0;
 const flush=()=>{const ends:number[]=[];for(const e of group){let lane=ends.findIndex(end=>end<=e.start);if(lane<0)lane=ends.length;e.lane=lane;ends[lane]=e.end;}for(const e of group)e.lanes=ends.length;group=[];};
 for(const e of sorted){if(group.length&&e.start>=until)flush();if(!group.length)until=e.end;group.push(e);until=Math.max(until,e.end)}flush();return sorted;
}
