import {pool} from "@/lib/db";
import {decryptGoogle} from "./devices";
import {dailyGoogle} from "./google-source";
import {widgetNotes} from "./notes-source";
import {widgetAgenda,nextDay} from "./v2";
import type {Student} from "@/types/models";
export function monthRange(month:string){
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||Number(month.slice(0,4))<2000||Number(month.slice(0,4))>2100)throw new Error("Mês inválido");
 const start=month+"-01",days=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5)),0,12)).getUTCDate();
 return {month,start,end:month+"-"+String(days).padStart(2,"0"),days};
}
/** Optional, authenticated, read-only projection; existing v1/v2/v3 response stays compatible. */
export async function loadWidgetCalendar(device:{google_cipher:string},month:string,now=new Date()){
 const range=monthRange(month),q=await pool.query("SELECT id,payload FROM dmp_data WHERE id=ANY($1::text[])",[["students","kids_v1"]]);
 const raw=q.rows.find(x=>x.id==="students")?.payload;if(!Array.isArray(raw))throw new Error("Dados indisponíveis");
 const students=raw.map(s=>({...s,sessions:Array.isArray(s.sessions)?s.sessions:[]})) as Student[],kids=q.rows.find(x=>x.id==="kids_v1")?.payload||null;
 const [events,notes]=await Promise.all([dailyGoogle(decryptGoogle(device.google_cipher),range.start,range.days),widgetNotes(range.start,range.days)]);
 const dates=new Set<string>();for(let date=range.start;date<=range.end;date=nextDay(date))if(widgetAgenda(students,events,kids,date).length)dates.add(date);
 for(const note of notes.items)if(note.dueDate>=range.start&&note.dueDate<=range.end)dates.add(note.dueDate);
 return {calendar:{...range,eventDates:[...dates].sort(),commitmentsStatus:notes.status,updatedAt:now.toISOString()}};
}
