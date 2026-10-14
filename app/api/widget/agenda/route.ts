import {NextRequest,NextResponse} from "next/server";
import {authorize} from "@/lib/widget/devices";
import {loadWidgetV2} from "@/lib/widget/load-v2";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function GET(r:NextRequest){const reply=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{"Cache-Control":"no-store, private",Vary:"Authorization"}});try{const device=await authorize(r);if(!device)return reply({error:"Dispositivo não autorizado"},401);if(!device.google_cipher)return reply({error:"Reconecte a agenda"},409);return reply((await loadWidgetV2(device)).agenda);}catch{return reply({error:"Agenda temporariamente indisponível"},503);}}
