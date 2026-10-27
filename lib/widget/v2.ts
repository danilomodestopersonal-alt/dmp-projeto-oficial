import type {CalendarEvent,Student} from "@/types/models";
import type {KidsData} from "@/types/kids";
import type {PerformanceActivity} from "@/types/performance";
import {normalizeKidsData} from "@/lib/kids/seed";
import {widgetToday,dayKey} from "./today";
import {matchCalendarEvents,kidsCalendarRequest,getCalendarEventStudents,calendarEventDate,categoryLabelForHome} from "./home-source";
import {localKidsForHome} from "./kids-source";
import {widgetLink} from "./links";
import {widgetOccurrenceHistory,widgetOccurrenceTitle} from "./occurrence-history";
export const nextDay=(date:string)=>new Date(new Date(date+"T12:00:00Z").getTime()+86400000).toISOString().slice(0,10);
const time=(v:string)=>new Intl.DateTimeFormat("pt-BR",{timeZone:"America/Sao_Paulo",hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date(v));
const labels:Record<string,string>={CYCLING:"Ciclismo",STRENGTH:"Musculação",PILATES:"Pilates",RUNNING:"Corrida",TENNIS:"Tênis",OTHER:"Outro"};
export function widgetAgendaProjection(students:Student[],google:CalendarEvent[],raw:KidsData|null,date:string){
 const data=raw?normalizeKidsData(structuredClone(raw)):null,local=data?localKidsForHome(data,date):[],matched=matchCalendarEvents(google,students);
 const merged=[...local,...matched.filter(g=>!local.some(l=>{const a=kidsCalendarRequest(g),b=kidsCalendarRequest(l);return a&&b&&a.date===b.date&&a.time===b.time&&a.category===b.category;}))];
 const projection=widgetOccurrenceHistory(students,merged,date);
 const items=projection.occurrences.sort((a,b)=>Date.parse(a.event.start)-Date.parse(b.event.start)||a.event.id.localeCompare(b.event.id)).map(item=>{
  const e=item.event,kids=kidsCalendarRequest(e),ss=item.students,category=kids?categoryLabelForHome(kids.category):null;
  return {id:e.id,date,start:e.allDay?null:time(e.start),end:e.allDay?null:time(e.end),allDay:Boolean(e.allDay),title:widgetOccurrenceTitle(item),type:kids?"Tênis Kids":ss.length?"Personal":"Compromisso",category,color:kids?({RED:"#C34242",ORANGE:"#BC671C",GREEN:"#287951",YELLOW:"#8D7918"}[kids.category as "RED"]||"#BC671C"):ss.length?"#17674B":"#476C89",studentIds:ss.map(s=>s.id),studentNames:ss.map(s=>s.name),studentStates:item.states,source:item.historyOnly?"dmp-history":"google",...(item.historyOnly?{historyOnly:true}:{}),destination:widgetLink(kids?"kids":"event",date,e.id,kids||undefined)};
 });
 return {items,diagnostics:projection.diagnostics};
}
export function widgetAgenda(students:Student[],google:CalendarEvent[],raw:KidsData|null,date:string){return widgetAgendaProjection(students,google,raw,date).items;}
export function widgetV2(students:Student[],google:CalendarEvent[],raw:KidsData|null,activities:PerformanceActivity[],notes:{id:string;title:string;dueTime:string}[],now:Date){const date=dayKey(now),v1=widgetToday(students,google,raw,now),agenda=widgetAgenda(students,google,raw,date),candidate=agenda.find(e=>e.start===v1.next?.time&&e.title===v1.next?.title)||agenda.find(e=>e.start===v1.next?.time&&e.studentIds.some(id=>v1.next?.title.includes(students.find(s=>s.id===id)?.name||"__")));return {...v1,version:2,links:{home:widgetLink("home",date),agenda:widgetLink("agenda",date),programmed:widgetLink("programmed",date),attended:widgetLink("attended",date),absent:widgetLink("absent",date),remaining:widgetLink("remaining",date)},next:v1.next&&candidate?{...v1.next,id:candidate.id,type:candidate.type,category:candidate.category,color:candidate.color,destination:candidate.destination}:null,workouts:activities.filter(a=>a.date===date).sort((a,b)=>(b.createdAt||"").localeCompare(a.createdAt||"")).map(a=>({id:a.id,title:a.title||labels[a.type],type:labels[a.type]||a.type,distanceKm:a.distanceKm??null,destination:widgetLink("performance",date,a.id)})),commitments:[...agenda.filter(e=>e.type==="Compromisso"&&!e.historyOnly&&e.date===date&&!notes.some(n=>n.id===(google.find(g=>g.id===e.id) as (CalendarEvent&{widgetTodoistTaskId?:string})|undefined)?.widgetTodoistTaskId)).map(e=>({id:e.id,title:e.title,time:e.start,source:e.source,destination:e.destination})),...notes.map(n=>({id:n.id,title:n.title,time:n.dueTime||null,source:"todoist",destination:widgetLink("commitment",date,n.id)}))].sort((a,b)=>(a.time||"").localeCompare(b.time||"")||a.title.localeCompare(b.title))};}

export function widgetCommitments(notes:{id:string;title:string;dueDate:string;dueTime:string}[]){return notes.map(n=>({id:n.id,date:n.dueDate,start:n.dueTime||null,end:null,allDay:!n.dueTime,title:n.title,type:"Compromisso",category:null,color:"#476C89",studentIds:[],studentNames:[],source:"todoist",destination:widgetLink("commitment",n.dueDate,n.id)}));}
