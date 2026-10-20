import {NextRequest,NextResponse} from "next/server";
import {pool} from "@/lib/db";
import {authorize,decryptGoogle} from "@/lib/widget/devices";
import {dayKey,widgetToday} from "@/lib/widget/today";
import {dailyGoogle} from "@/lib/widget/google-source";
import type {Student} from "@/types/models";
export const runtime="nodejs";export const dynamic="force-dynamic";
const reply=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{"Cache-Control":"no-store, private","Vary":"Authorization"}});
export async function GET(r:NextRequest){let stage="authorize";try{const device=await authorize(r);if(!device)return reply({error:"Dispositivo não autorizado"},401);if(!device.google_cipher)return reply({error:"Reconecte a agenda"},409);if(r.nextUrl.searchParams.get("v")==="3"&&r.nextUrl.searchParams.has("month")){const month=r.nextUrl.searchParams.get("month")||"";if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||Number(month.slice(0,4))<2000||Number(month.slice(0,4))>2100)return reply({error:"Mês inválido"},400);const {loadWidgetCalendar}=await import("@/lib/widget/calendar-month");stage="calendar_month";return reply(await loadWidgetCalendar(device,month));}if(["2","3"].includes(r.nextUrl.searchParams.get("v")||"")){const {loadWidgetV2}=await import("@/lib/widget/load-v2");stage=r.nextUrl.searchParams.get("v")==="3"?"load_v3":"load_v2";return reply(await loadWidgetV2(device,new Date(),r.nextUrl.searchParams.get("v")==="3"));}const now=new Date();stage="data";const q=await pool.query("SELECT id,payload FROM dmp_data WHERE id=ANY($1::text[])",[["students","kids_v1"]]),studentsRaw=q.rows.find(x=>x.id==="students")?.payload;if(!Array.isArray(studentsRaw))return reply({error:"Dados indisponíveis"},503);const students=studentsRaw.map(s=>({...s,sessions:Array.isArray(s.sessions)?s.sessions:[],assessments:Array.isArray(s.assessments)?s.assessments:[]})) as Student[];stage="google";const google=await dailyGoogle(decryptGoogle(device.google_cipher),dayKey(now));return reply(widgetToday(students,google,q.rows.find(x=>x.id==="kids_v1")?.payload||null,now));}catch(error){return reply({error:"Resumo temporariamente indisponível",stage,reason:failureReason(error)},503);}}

// Only fixed classifications are returned; exception messages and data stay private.
function failureReason(error:unknown){
 const message=error instanceof Error?error.message:"";
 if(/^Falha ao renovar Google \((400|401)\)$/.test(message))return "google_token_rejected";
 if(/^Falha ao renovar Google \(\d{3}\)$/.test(message))return "google_refresh_failed";
 if(message==="Agenda indisponível")return "google_calendar_failed";
 if(message==="Série indisponível")return "google_series_failed";
 if(message==="Série inválida"||message==="Participantes da agenda inválidos")return "google_roster_invalid";
 if(message==="Resposta inválida"||message==="Agenda incompleta")return "google_payload_invalid";
 if(message==="Dados indisponíveis")return "data_unavailable";
 const code=error&&typeof error==="object"&&"code" in error?error.code:null;
 if(code==="42P01"||code==="42703")return "database_schema";
 if(code==="08006"||code==="53300"||code==="57P01")return "database_unavailable";
 if(error instanceof Error&&(error.name==="TimeoutError"||error.name==="AbortError"))return "upstream_timeout";
 return "unclassified";
}
