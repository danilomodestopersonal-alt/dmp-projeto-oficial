import type {CalendarEvent,Student} from "@/types/models";
import {normalizeKidsData} from "@/lib/kids/seed";
import type {KidsData} from "@/types/kids";
import {officialCounts} from "./summary";
import {matchCalendarEvents,kidsCalendarRequest,getCalendarEventStudents,calendarEventDate} from "./home-source";
import {localKidsForHome} from "./kids-source";
export function dayKey(now:Date){return new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).format(now);}
export function widgetToday(students:Student[],google:CalendarEvent[],rawKids:KidsData|null,now:Date){const date=dayKey(now),data=rawKids?normalizeKidsData(structuredClone(rawKids)):null,local=data?localKidsForHome(data,date):[],matched=matchCalendarEvents(google,students);
const merged=[...local,...matched.filter(g=>{const k=kidsCalendarRequest(g);return !local.some(l=>{const x=kidsCalendarRequest(l);return Boolean(x&&k&&x.date===k.date&&x.time===k.time&&x.category===k.category);});})].filter(e=>calendarEventDate(e)===date);
const sessions=students.flatMap(student=>student.sessions.filter(s=>s.date===date).map(session=>({student,session}))),counts=officialCounts(merged,students,sessions),done=new Set(sessions.map(s=>s.student.id));
const next=merged.filter(e=>!e.allDay&&new Date(e.start).getTime()>=now.getTime()).sort((a,b)=>a.start.localeCompare(b.start)).find(e=>{const k=kidsCalendarRequest(e);if(k)return !data?.lessons.some(l=>l.id===k.lessonId&&l.status==="COMPLETED");const ss=getCalendarEventStudents(e,students);return ss.some(s=>!done.has(s.id));});
let item:null|{time:string;title:string;type?:string}=null;if(next){const k=kidsCalendarRequest(next),ss=getCalendarEventStudents(next,students).filter(s=>!done.has(s.id));item={time:new Intl.DateTimeFormat("pt-BR",{timeZone:"America/Sao_Paulo",hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date(next.start)),title:(k?next.summary:ss.map(s=>s.name).join(" · ")).slice(0,200),...(k?{type:"Tênis Kids"}:{})};}
return {date,...counts,next:item,updatedAt:now.toISOString()};}
