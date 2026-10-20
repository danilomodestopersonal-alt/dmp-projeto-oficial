import {NextRequest,NextResponse} from "next/server";
import {isAuthorized} from "@/lib/auth";
import {pool} from "@/lib/db";
import {sameOrigin,decryptGoogle} from "@/lib/widget/devices";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const reply=(body:Record<string,unknown>,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"no-store, private","Vary":"Cookie","Referrer-Policy":"no-referrer"}});
const knownGoogleErrors=new Set(["invalid_grant","invalid_client","unauthorized_client","invalid_scope","access_denied","temporarily_unavailable"]);
// Read-only probe: no approval, credential changes, or event writes. Success
// confirms Google access, not the widget's complete synchronization pipeline.
export async function POST(request:NextRequest){
 let stage="session";
 const commit=process.env.RENDER_GIT_COMMIT||"";
 const meta={checkedAt:new Date().toISOString(),liveCommit:/^[a-f0-9]{40}$/.test(commit)?commit:"NOT_VERIFIED"};
 try{
  if(!sameOrigin(request)||!await isAuthorized(request))return reply({error:"Entre no DMP nesta mesma sessão do navegador.",code:"ACCESS_DENIED"},403);
  const raw=await request.text();if(raw.length>256)return reply({error:"Pedido inválido."},400);
  let body:{deviceId?:unknown};try{body=JSON.parse(raw);}catch{return reply({error:"Pedido inválido."},400);}
  if(!body||typeof body.deviceId!=="string"||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(body.deviceId))return reply({error:"Pedido inválido."},400);
  stage="device";
  const selected=await pool.query("SELECT google_cipher FROM dmp_widget_devices WHERE id=$1 AND revoked_at IS NULL AND expires_at>NOW()",[body.deviceId]);
  const cipher=selected.rows[0]?.google_cipher;
  if(!cipher)return reply({...meta,code:"DEVICE_NOT_ACTIVE",message:"Este vínculo não está ativo ou não tem uma autorização Google. Inicie uma nova conexão pelo aplicativo dos widgets."},409);
  if(!process.env.GOOGLE_CLIENT_ID||!process.env.GOOGLE_CLIENT_SECRET)return reply({...meta,code:"GOOGLE_CONFIGURATION_MISSING",message:"Falta configuração Google no servidor. A configuração do Render precisa ser conferida."},503);
  stage="credential";const refresh=decryptGoogle(cipher);
  stage="google_refresh";
  const tokenResponse=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({client_id:process.env.GOOGLE_CLIENT_ID,client_secret:process.env.GOOGLE_CLIENT_SECRET,refresh_token:refresh,grant_type:"refresh_token"}),cache:"no-store",redirect:"error",signal:AbortSignal.timeout(7000)});
  const token=await tokenResponse.json().catch(()=>null);
  if(!tokenResponse.ok){
   const googleError=typeof token?.error==="string"&&knownGoogleErrors.has(token.error)?token.error:"unclassified";
   return reply({...meta,code:googleError==="invalid_grant"?"GOOGLE_REAUTH_REQUIRED":"GOOGLE_TOKEN_REJECTED",googleError,upstreamStatus:tokenResponse.status,message:googleError==="invalid_grant"?"O Google recusou a autorização salva deste widget. Renove a autorização Google e depois conecte o widget novamente.":"O Google recusou a renovação do acesso deste widget. O código abaixo identifica a resposta recebida."},502);
  }
  if(typeof token?.access_token!=="string"||!token.access_token)return reply({...meta,code:"GOOGLE_RESPONSE_INVALID",message:"O Google retornou uma resposta de autorização inválida."},502);
  stage="google_calendar";
  const params=new URLSearchParams({timeMin:new Date().toISOString(),singleEvents:"true",orderBy:"startTime",maxResults:"1"});
  const calendar=await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events?"+params,{headers:{Authorization:"Bearer "+token.access_token},cache:"no-store",redirect:"error",signal:AbortSignal.timeout(7000)});
  if(!calendar.ok)return reply({...meta,code:"GOOGLE_CALENDAR_REJECTED",upstreamStatus:calendar.status,message:"A autorização foi renovada, mas o Google recusou a leitura da agenda deste widget."},502);
  const events=await calendar.json().catch(()=>null);
  if(!Array.isArray(events?.items))return reply({...meta,code:"GOOGLE_CALENDAR_INVALID",message:"A resposta da agenda não pôde ser validada."},502);
  return reply({...meta,code:"GOOGLE_ACCESS_OK",message:"O Google aceitou a autorização salva deste widget e permitiu a leitura da agenda. Isso confirma o acesso; a sincronização completa ainda deve ser conferida nos widgets."});
 }catch{
  return reply({...meta,code:stage==="credential"?"GOOGLE_CREDENTIAL_UNREADABLE":stage==="device"?"DEVICE_QUERY_FAILED":stage==="session"?"SESSION_CHECK_FAILED":"GOOGLE_CONNECTION_FAILED",stage,message:stage==="credential"?"O servidor não conseguiu abrir a autorização salva deste widget. Uma nova conexão é necessária.":"A verificação não foi concluída. Consulte o código e a etapa abaixo."},503);
 }
}
