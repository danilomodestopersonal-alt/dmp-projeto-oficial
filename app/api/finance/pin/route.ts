import {createHash,timingSafeEqual,randomBytes} from "node:crypto";
import {NextRequest,NextResponse} from "next/server";
import {isAuthorized} from "@/lib/auth";
import {pool} from "@/lib/db";
export const runtime="nodejs";
const PIN_HASH="6249017f9372350bfc9cf3456c324bbb3661e1bb5a7a10d61912fd1be650d52f";
const lifetime=10*60*1000;
const trustLifetime=30*24*60*60*1000;
const trustCookie="dmp_finance_trust";
const cookieOptions={httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"strict" as const,path:"/api/finance/pin",maxAge:trustLifetime/1000};
function trustKey(request:NextRequest){const token=request.cookies.get(trustCookie)?.value;return token&&/^[a-f0-9]{64}$/.test(token)?"finance_trust_"+createHash("sha256").update(token).digest("hex"):null;}
function sameOrigin(request:NextRequest){const origin=request.headers?.get("origin");return !origin||origin===request.nextUrl?.origin;}

function sessionKey(request:NextRequest){return "finance_pin_"+createHash("sha256").update(request.cookies.get("dmp_session")?.value||"").digest("hex");}
export async function GET(request:NextRequest){
  if(!await isAuthorized(request))return NextResponse.json({message:"Sessão inválida."},{status:401});
  try{
    const key=trustKey(request);
    const trusted=key?await pool.query("SELECT payload FROM dmp_data WHERE id=$1",[key]):null;
    const trustedUntil=Number(trusted?.rows[0]?.payload?.until||0);
    const result=await pool.query("SELECT payload FROM dmp_data WHERE id=$1",[sessionKey(request)]);
    const until=trustedUntil>Date.now()?Date.now()+lifetime:Number(result.rows[0]?.payload?.until||0);
    return NextResponse.json({unlocked:until>Date.now(),until:until>Date.now()?until:0,trusted:trustedUntil>Date.now(),trustedUntil:trustedUntil>Date.now()?trustedUntil:0},{headers:{"Cache-Control":"no-store"}});
  }catch{return NextResponse.json({message:"Não foi possível conferir o acesso."},{status:500,headers:{"Cache-Control":"no-store"}});}

}
export async function POST(request:NextRequest){
  if(!await isAuthorized(request))return NextResponse.json({message:"Sessão inválida."},{status:401});
  if(!sameOrigin(request))return NextResponse.json({message:"Origem inválida."},{status:403});
  let pin:unknown,trustDevice=false;try{const body=await request.json();pin=body.pin;trustDevice=body.trustDevice===true;}catch{return NextResponse.json({message:"PIN inválido."},{status:400});}
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
    let token:string|undefined;
    if(valid&&trustDevice){
      // The secret is only in an HttpOnly cookie; the database stores its hash.
      token=randomBytes(32).toString("hex");
      const previous=trustKey(request);
      if(previous)await client.query("DELETE FROM dmp_data WHERE id=$1",[previous]);
      const deviceKey="finance_trust_"+createHash("sha256").update(token).digest("hex");
      await client.query("INSERT INTO dmp_data(id,payload) VALUES($1,$2::jsonb)",[deviceKey,JSON.stringify({until:now+trustLifetime})]);
    }
    await client.query("COMMIT");
    const response=NextResponse.json(valid?{until:next.until,trusted:!!token}:{message:"PIN incorreto."},{status:valid?200:403,headers:{"Cache-Control":"no-store"}});
    if(token)response.cookies.set(trustCookie,token,cookieOptions);
    return response;
  }catch(error){await client.query("ROLLBACK");console.error("Falha ao validar acesso financeiro.");return NextResponse.json({message:"Não foi possível validar o PIN."},{status:500});}finally{client.release();}
}

export async function DELETE(request:NextRequest){
  if(!await isAuthorized(request))return NextResponse.json({message:"Sessão inválida."},{status:401});
  if(!sameOrigin(request))return NextResponse.json({message:"Origem inválida."},{status:403});
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    const key=trustKey(request);
    if(key)await client.query("DELETE FROM dmp_data WHERE id=$1",[key]);
    const session=sessionKey(request);
    const state=await client.query("SELECT payload FROM dmp_data WHERE id=$1 FOR UPDATE",[session]);
    await client.query("UPDATE dmp_data SET payload=$2::jsonb,updated_at=NOW() WHERE id=$1",[session,JSON.stringify({...state.rows[0]?.payload,until:0})]);
    await client.query("COMMIT");
    const response=NextResponse.json({unlocked:false,trusted:false},{headers:{"Cache-Control":"no-store"}});
    response.cookies.set(trustCookie,"",{...cookieOptions,maxAge:0});
    return response;
  }catch{await client.query("ROLLBACK");return NextResponse.json({message:"Não foi possível revogar. Tente novamente."},{status:500});}finally{client.release();}
}
