import {createHash,timingSafeEqual} from "node:crypto";
import {NextRequest,NextResponse} from "next/server";
import {isAuthorized} from "@/lib/auth";
import {pool} from "@/lib/db";
export const runtime="nodejs";
const PIN_HASH="6249017f9372350bfc9cf3456c324bbb3661e1bb5a7a10d61912fd1be650d52f";
const lifetime=10*60*1000;
function sessionKey(request:NextRequest){return "finance_pin_"+createHash("sha256").update(request.cookies.get("dmp_session")?.value||"").digest("hex");}
export async function GET(request:NextRequest){
  if(!await isAuthorized(request))return NextResponse.json({message:"Sessão inválida."},{status:401});
  const result=await pool.query("SELECT payload FROM dmp_data WHERE id=$1",[sessionKey(request)]);
  const until=Number(result.rows[0]?.payload?.until||0);
  return NextResponse.json({unlocked:until>Date.now(),until:until>Date.now()?until:0},{headers:{"Cache-Control":"no-store"}});
}
export async function POST(request:NextRequest){
  if(!await isAuthorized(request))return NextResponse.json({message:"Sessão inválida."},{status:401});
  let pin:unknown;try{pin=(await request.json()).pin;}catch{return NextResponse.json({message:"PIN inválido."},{status:400});}
  if(typeof pin!=="string"||!/^\d{4}$/.test(pin))return NextResponse.json({message:"Informe os quatro dígitos do PIN."},{status:400});
  const client=await pool.connect();
  try{
    await client.query("BEGIN");const key=sessionKey(request);
    await client.query("INSERT INTO dmp_data(id,payload) VALUES($1,$2::jsonb) ON CONFLICT(id) DO NOTHING",[key,JSON.stringify({until:0,attempts:0,blockedUntil:0})]);
    const result=await client.query("SELECT payload FROM dmp_data WHERE id=$1 FOR UPDATE",[key]);
    const state=result.rows[0].payload;const now=Date.now();
    if(Number(state.blockedUntil||0)>now){await client.query("ROLLBACK");return NextResponse.json({message:"Aguarde um minuto antes de tentar novamente."},{status:429});}
    const valid=timingSafeEqual(createHash("sha256").update(pin).digest(),Buffer.from(PIN_HASH,"hex"));
    const attempts=valid?0:(Number(state.blockedUntil||0)>0?0:Number(state.attempts||0))+1;
    const next={until:valid?now+lifetime:0,attempts,blockedUntil:attempts>=5?now+60000:0};
    await client.query("UPDATE dmp_data SET payload=$2::jsonb,updated_at=NOW() WHERE id=$1",[key,JSON.stringify(next)]);
    await client.query("COMMIT");
    return NextResponse.json(valid?{until:next.until}:{message:"PIN incorreto."},{status:valid?200:403,headers:{"Cache-Control":"no-store"}});
  }catch(error){await client.query("ROLLBACK");console.error("Falha ao validar acesso financeiro.");return NextResponse.json({message:"Não foi possível validar o PIN."},{status:500});}finally{client.release();}
}
