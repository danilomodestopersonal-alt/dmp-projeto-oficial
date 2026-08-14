import {createHash} from "crypto";
import {NextRequest,NextResponse} from "next/server";
import {pool} from "@/lib/db";

export const runtime="nodejs";
const DATA_ID="access_v1";
const DEFAULT_EMAIL="danilo@dmp.local";
const DEFAULT_PASSWORD="Dmp@2026";
const hash=(value:string)=>createHash("sha256").update(value,"utf8").digest("hex");

type AccessData={email:string;passwordHash:string};
async function readAccess():Promise<AccessData>{
  try{const result=await pool.query("SELECT payload FROM dmp_data WHERE id = $1",[DATA_ID]);const payload=result.rows[0]?.payload;if(payload?.email&&payload?.passwordHash)return{email:String(payload.email).toLowerCase(),passwordHash:String(payload.passwordHash)};}catch(error){console.error("Erro ao ler acesso:",error);throw error;}
  return{email:DEFAULT_EMAIL,passwordHash:hash(DEFAULT_PASSWORD)};
}

export async function GET(){const access=await readAccess();return NextResponse.json({email:access.email});}
export async function PUT(request:NextRequest){
  try{
    const body=await request.json();const email=String(body.email||"").trim().toLowerCase();const currentPassword=String(body.currentPassword||"");const newPassword=String(body.newPassword||"");
    if(!email||!currentPassword)return NextResponse.json({message:"Informe o login e a senha atual."},{status:400});
    if(newPassword&&newPassword.length<8)return NextResponse.json({message:"A nova senha deve ter pelo menos 8 caracteres."},{status:400});
    const current=await readAccess();if(hash(currentPassword)!==current.passwordHash)return NextResponse.json({message:"Senha atual inválida."},{status:401});
    const payload={email,passwordHash:newPassword?hash(newPassword):current.passwordHash};
    await pool.query(`INSERT INTO dmp_data (id,payload,updated_at) VALUES ($1,$2,NOW()) ON CONFLICT (id) DO UPDATE SET payload=EXCLUDED.payload,updated_at=NOW()`,[DATA_ID,JSON.stringify(payload)]);
    return NextResponse.json({ok:true,email});
  }catch(error){console.error("Erro ao atualizar acesso:",error);return NextResponse.json({message:"Não foi possível atualizar o acesso."},{status:500});}
}
