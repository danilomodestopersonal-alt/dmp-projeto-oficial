import {pool} from "@/lib/db";
import {decryptGoogle} from "./devices";
import {dailyGoogle} from "./google-source";
import {dayKey} from "./today";
import {widgetAgenda,widgetV2,nextDay} from "./v2";
import {widgetNotes} from "./notes-source";
import type {Student} from "@/types/models";
export async function loadWidgetV2(device:{google_cipher:string},now=new Date()){const date=dayKey(now),tomorrow=nextDay(date),q=await pool.query("SELECT id,payload FROM dmp_data WHERE id=ANY($1::text[])",[["students","kids_v1","performance_v1"]]),raw=q.rows.find(x=>x.id==="students")?.payload;if(!Array.isArray(raw))throw new Error("Dados indisponíveis");const students=raw.map(s=>({...s,sessions:Array.isArray(s.sessions)?s.sessions:[],assessments:Array.isArray(s.assessments)?s.assessments:[]})) as Student[],kids=q.rows.find(x=>x.id==="kids_v1")?.payload||null,activities=q.rows.find(x=>x.id==="performance_v1")?.payload?.activities||[],refresh=decryptGoogle(device.google_cipher);const [google,following,notes]=await Promise.all([dailyGoogle(refresh,date),dailyGoogle(refresh,tomorrow),widgetNotes(date)]);return {today:{...widgetV2(students,google,kids,Array.isArray(activities)?activities:[],notes.items,now),commitmentsStatus:notes.status},agenda:{date,updatedAt:now.toISOString(),items:[...widgetAgenda(students,google,kids,date),...widgetAgenda(students,following,kids,tomorrow)]}};}
