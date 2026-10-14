import {NextRequest,NextResponse} from "next/server";
import {pool} from "@/lib/db";
import {authorize,decryptGoogle} from "@/lib/widget/devices";
import {dayKey,widgetToday} from "@/lib/widget/today";
import {dailyGoogle} from "@/lib/widget/google-source";
import type {Student} from "@/types/models";
export const runtime="nodejs";export const dynamic="force-dynamic";
const reply=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{"Cache-Control":"no-store, private","Vary":"Authorization"}});
export async function GET(r:NextRequest){try{const device=await authorize(r);if(!device)return reply({error:"Dispositivo não autorizado"},401);if(!device.google_cipher)return reply({error:"Reconecte a agenda"},409);const now=new Date(),q=await pool.query("SELECT id,payload FROM dmp_data WHERE id=ANY($1::text[])",[["students","kids_v1"]]),studentsRaw=q.rows.find(x=>x.id==="students")?.payload;if(!Array.isArray(studentsRaw))return reply({error:"Dados indisponíveis"},503);const students=studentsRaw.map(s=>({...s,sessions:Array.isArray(s.sessions)?s.sessions:[],assessments:Array.isArray(s.assessments)?s.assessments:[]})) as Student[];const google=await dailyGoogle(decryptGoogle(device.google_cipher),dayKey(now));return reply(widgetToday(students,google,q.rows.find(x=>x.id==="kids_v1")?.payload||null,now));}catch{return reply({error:"Resumo temporariamente indisponível"},503);}}
