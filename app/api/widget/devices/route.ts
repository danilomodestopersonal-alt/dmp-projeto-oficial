import {NextRequest,NextResponse} from "next/server";
import {isAuthorized} from "@/lib/auth";
import {pool} from "@/lib/db";
import {setup,sameOrigin} from "@/lib/widget/devices";
export const runtime="nodejs";
const reply=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{"Cache-Control":"no-store"}});
export async function GET(r:NextRequest){if(!await isAuthorized(r))return reply({error:"Entre no DMP"},401);try{await setup();const d=await pool.query("SELECT id,name,created_at,revoked_at FROM dmp_widget_devices ORDER BY created_at DESC LIMIT 50");return reply({devices:d.rows});}catch{return reply({error:"Indisponível"},503);}}
export async function DELETE(r:NextRequest){if(!sameOrigin(r)||!await isAuthorized(r))return reply({error:"Acesso negado"},403);try{const id=r.nextUrl.searchParams.get("id");if(!/^[a-f0-9-]{36}$/.test(id||""))return reply({error:"Pedido inválido"},400);await pool.query("UPDATE dmp_widget_devices SET revoked_at=NOW(),google_cipher=NULL WHERE id=$1",[id]);return reply({ok:true});}catch{return reply({error:"Indisponível"},503);}}
