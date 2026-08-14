import {createHash} from "crypto";
import {NextResponse} from "next/server";
import {pool} from "@/lib/db";

export const runtime="nodejs";
const DATA_ID="access_v1";
const DEFAULT_EMAIL="danilo@dmp.local";
const DEFAULT_PASSWORD="Dmp@2026";
const hash=(value:string)=>createHash("sha256").update(value,"utf8").digest("hex");

async function readAccess(){
  try{const result=await pool.query("SELECT payload FROM dmp_data WHERE id = $1",[DATA_ID]);const payload=result.rows[0]?.payload;if(payload?.email&&payload?.passwordHash)return{email:String(payload.email).toLowerCase(),passwordHash:String(payload.passwordHash)};}catch(error){console.error("Erro ao ler credenciais:",error);throw error;}
  return{email:DEFAULT_EMAIL,passwordHash:hash(DEFAULT_PASSWORD)};
}

export async function POST(request:Request){
  const body=await request.json();const email=String(body.email||"").trim().toLowerCase();const password=String(body.password||"");const access=await readAccess();
  if(email!==access.email||hash(password)!==access.passwordHash)return NextResponse.json({message:"E-mail ou senha inválidos."},{status:401});
  const response=NextResponse.json({user:{id:"dmp-user",name:"Danilo Modesto",email}});
  response.cookies.set("dmp_session","demo-session-token",{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",path:"/",maxAge:60*60*24*7});
  return response;
}
