import {createHash} from "node:crypto";
import {NextRequest,NextResponse} from "next/server";
import {pool} from "@/lib/db";
const {collect}=require("@/lib/mercado-pago/diagnostico-temporario.cjs");
export const runtime="nodejs";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"no-store, private","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"};
const page=`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Coleta temporária DMP</title><body><main><h1>Amostra Mercado Pago</h1><p>Leitura dos relatórios já existentes. Nenhum lançamento ou saldo será alterado.</p><button id="download">Baixar amostra para enviar ao Work</button><p id="status" role="status"></p></main><script>
const button=document.getElementById('download'),status=document.getElementById('status');
button.onclick=async()=>{button.disabled=true;status.textContent='Consultando os relatórios existentes. Aguarde...';try{const response=await fetch(location.pathname+'?download=1',{cache:'no-store',credentials:'same-origin'});if(!response.ok){const data=await response.json();throw new Error(data.message||'Não foi possível coletar.');}const blob=await response.blob();const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='DMP_AMOSTRA_MP.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);status.textContent='Amostra baixada. Envie o arquivo DMP_AMOSTRA_MP.json no chat do Work.';}catch(error){status.textContent=error.message;}finally{button.disabled=false;}};
</script></body></html>`;
export async function GET(request:NextRequest){
 try{
  const site=request.headers.get("sec-fetch-site");
  if(site&&site!=="same-origin"&&site!=="none")return NextResponse.json({message:"Abra esta página diretamente pelo DMP."},{status:403,headers});
  const token=request.cookies.get("dmp_session")?.value;
  if(!token)return NextResponse.json({message:"Entre no DMP primeiro e abra este endereço novamente."},{status:401,headers});
  // SELECT apenas: não mantém tabelas nem grava qualquer dado.
  const session=await pool.query("SELECT 1 FROM dmp_sessions WHERE token_hash=$1 AND expires_at>NOW() LIMIT 1",[createHash("sha256").update(token,"utf8").digest("hex")]);
  if(!session.rows.length)return NextResponse.json({message:"Sessão expirada. Entre no DMP novamente."},{status:401,headers});
  if(request.nextUrl.searchParams.get("download")!=="1")return new NextResponse(page,{headers:{...headers,"Content-Type":"text/html; charset=utf-8","Content-Security-Policy":"default-src 'none'; script-src 'sha256-"+createHash("sha256").update(page.split("<script>")[1].split("</script>")[0]).digest("base64")+"'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'"}});
  const credential=process.env.MERCADO_PAGO_ACCESS_TOKEN;
  if(!credential)return NextResponse.json({message:"Credencial Mercado Pago indisponível neste ambiente."},{status:503,headers});
  const sample=await collect(credential);
  return new NextResponse(JSON.stringify(sample,null,2),{headers:{...headers,"Content-Type":"application/json; charset=utf-8","Content-Disposition":'attachment; filename="DMP_AMOSTRA_MP.json"'}});
 }catch{return NextResponse.json({message:"Não foi possível ler a amostra. Nenhum dado foi alterado."},{status:500,headers});}
}
