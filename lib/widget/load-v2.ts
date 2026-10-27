import {pool} from "@/lib/db";
import {decryptGoogle} from "./devices";
import {dailyGoogle} from "./google-source";
import {dayKey} from "./today";
import {widgetAgendaProjection,widgetV2,widgetCommitments,nextDay} from "./v2";
import {widgetNotes} from "./notes-source";
import type {Student} from "@/types/models";
export async function loadWidgetV2(device:{google_cipher:string},now=new Date(),extended=false){
 if(!extended){const date=dayKey(now),tomorrow=nextDay(date),q=await pool.query("SELECT id,payload FROM dmp_data WHERE id=ANY($1::text[])",[["students","kids_v1","performance_v1"]]),raw=q.rows.find(x=>x.id==="students")?.payload;if(!Array.isArray(raw))throw new Error("Dados indisponíveis");const students=raw.map(s=>({...s,sessions:Array.isArray(s.sessions)?s.sessions:[],assessments:Array.isArray(s.assessments)?s.assessments:[]})) as Student[],kids=q.rows.find(x=>x.id==="kids_v1")?.payload||null,activities=q.rows.find(x=>x.id==="performance_v1")?.payload?.activities||[],refresh=decryptGoogle(device.google_cipher);const [google,following,notes]=await Promise.all([dailyGoogle(refresh,date),dailyGoogle(refresh,tomorrow),widgetNotes(date,1,true)]);const first=widgetAgendaProjection(students,google,kids,date),second=widgetAgendaProjection(students,following,kids,tomorrow);return {today:{...widgetV2(students,google,kids,Array.isArray(activities)?activities:[],notes.items.filter(n=>n.dueDate===date),now),upcomingCommitments:widgetCommitments(notes.items).map(e=>({...e,time:e.start})),commitmentsStatus:notes.status},agenda:{date,updatedAt:now.toISOString(),items:[...first.items,...second.items],attendanceDiagnostics:[...first.diagnostics,...second.diagnostics]}};}

 const date=dayKey(now),monthStart=date.slice(0,7)+"-01",monthEnd=new Date(Date.UTC(Number(date.slice(0,4)),Number(date.slice(5,7)),0,12)).toISOString().slice(0,10);
 const dates=[date];for(let i=1;i<7;i++)dates.push(nextDay(dates[i-1]));
 const end=dates[6]>monthEnd?dates[6]:monthEnd,days=Math.round((Date.parse(end+"T12:00:00Z")-Date.parse(monthStart+"T12:00:00Z"))/86400000)+1;
 const q=await pool.query("SELECT id,payload FROM dmp_data WHERE id=ANY($1::text[])",[["students","kids_v1","performance_v1"]]),raw=q.rows.find(x=>x.id==="students")?.payload;
 if(!Array.isArray(raw))throw new Error("Dados indisponíveis");
 const students=raw.map(s=>({...s,sessions:Array.isArray(s.sessions)?s.sessions:[],assessments:Array.isArray(s.assessments)?s.assessments:[]})) as Student[],kids=q.rows.find(x=>x.id==="kids_v1")?.payload||null,activities=q.rows.find(x=>x.id==="performance_v1")?.payload?.activities||[],refresh=decryptGoogle(device.google_cipher);
 const [google,notes]=await Promise.all([dailyGoogle(refresh,monthStart,days),widgetNotes(monthStart,days,true)]);
 const projected=[],attendanceDiagnostics=[];for(let day=monthStart;day<=end;day=nextDay(day)){const part=widgetAgendaProjection(students,google,kids,day);projected.push(...part.items);attendanceDiagnostics.push(...part.diagnostics);}
 const tasks=widgetCommitments(notes.items.filter(n=>n.dueDate>=monthStart&&n.dueDate<=end)),items=[...projected,...tasks].filter(e=>e.date>=date&&e.date<=dates[6]).sort((a,b)=>a.date.localeCompare(b.date)||(a.start||"00:00").localeCompare(b.start||"00:00")||a.id.localeCompare(b.id));
 const eventDates=Array.from(new Set([...projected,...tasks].map(e=>e.date))).sort();
 return {today:{...widgetV2(students,google,kids,Array.isArray(activities)?activities:[],notes.items.filter(n=>n.dueDate===date),now),upcomingCommitments:widgetCommitments(notes.items).map(e=>({...e,time:e.start})),commitmentsStatus:notes.status,eventDates},agenda:{date,days:7,updatedAt:now.toISOString(),items,attendanceDiagnostics,commitmentsStatus:notes.status}};
}
