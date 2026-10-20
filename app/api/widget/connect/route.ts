import {NextRequest,NextResponse} from "next/server";
import {GET as readPair,POST as submitPair} from "../pair/route";

export const runtime="nodejs";
export const dynamic="force-dynamic";

const escape=(value:string)=>value.replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]!));
const knownErrors=new Set([
 "Acesso negado","Pedido inválido","Não foi possível conectar. Tente novamente.",
 "Conecte o Google na Home do DMP nesta mesma sessão do navegador e retorne aqui.",
 "Solicitação expirada ou já autorizada"
]);

function page(message:string,status:number,id="",approved=false){
 const retry=id&&!approved?`<form method="post" action="/api/widget/connect"><input type="hidden" name="id" value="${escape(id)}"><button type="submit">Autorizar este celular</button></form>`:"";
 const next=approved
  ?"Volte ao aplicativo DMP — Hoje, à tela com cinco botões, e toque em CONCLUIR CONEXÃO."
  :status===403?"Abra Entrar no DMP abaixo e faça o login. Depois retorne a esta página."
  :status===409&&message.includes("Conecte o Google")?"Toque em Renovar autorização Google, conclua a autorização na outra tela e retorne aqui. Depois toque em Autorizar este celular."
  :status===409?"Se a solicitação expirou, abra o aplicativo dos widgets e toque em CONECTAR DMP para iniciar uma nova."
  :"A autorização não foi confirmada. A mensagem acima é a resposta recebida do servidor.";
 const html=`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Conexão dos widgets DMP</title><style>body{margin:0;background:#eef3f6;color:#16232d;font:18px/1.5 system-ui,sans-serif}main{max-width:520px;margin:32px auto;padding:24px}h1{font-size:30px;line-height:1.2}.notice{background:#fff;border:2px solid ${approved?"#28764d":"#b42318"};border-radius:12px;padding:18px}button{font:inherit;font-weight:700;border:0;border-radius:10px;padding:16px 20px;background:#0d638f;color:#fff;margin:16px 0;cursor:pointer}a{color:#154c76}small{display:block;margin-top:10px}</style></head><body><main><h1>${approved?"Celular autorizado":"Autorização não concluída"}</h1><div class="notice" role="${approved?"status":"alert"}">${escape(message)}${approved?"":`<small>HTTP ${status}</small>`}</div><p>${escape(next)}</p>${retry}<p><a href="/api/google/auth" target="_blank" rel="noreferrer">Renovar autorização Google</a></p><p><a href="/app?home=1" target="_blank" rel="noreferrer">Entrar no DMP</a></p><p><a href="/widget-android">Ver dispositivos conectados</a></p></main></body></html>`;
 return new NextResponse(html,{status,headers:{
  "Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store, private","Vary":"Cookie",
  "Referrer-Policy":"no-referrer","X-Content-Type-Options":"nosniff","X-Frame-Options":"DENY",
  "Content-Security-Policy":"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"
 }});
}

// A normal browser form navigates to this response even if a client click handler
// does not run. Approval itself is delegated to the unchanged, protected API.
export async function POST(request:NextRequest){
 let id="";
 try{
  if(request.headers.get("content-type")?.split(";")[0].trim()!=="application/x-www-form-urlencoded")return page("Pedido inválido",400);
  const raw=await request.text();if(raw.length>256)return page("Pedido inválido",400);
  const form=new URLSearchParams(raw);id=form.get("id")||"";
  if([...form.keys()].some(key=>key!=="id")||form.getAll("id").length!==1||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id))return page("Pedido inválido",400);
  const headers=new Headers();
  for(const name of ["origin","cookie"]){const value=request.headers.get(name);if(value!==null)headers.set(name,value);}
  headers.set("content-type","application/json");
  const forwarded=new NextRequest(new URL("/api/widget/pair",request.url),{method:"POST",headers,body:JSON.stringify({action:"approve",id})});
  const response=await submitPair(forwarded),body=await response.json();
  if(response.ok&&body.ok===true)return page("Autorizado. A confirmação foi recebida do servidor.",200,"",true);
  // A second submission must not turn a confirmed approval into an error.
  if(response.status===409&&body.error==="Solicitação expirada ou já autorizada"){
   const checkUrl=new URL("/api/widget/pair",request.url);checkUrl.searchParams.set("id",id);
   const checked=await readPair(new NextRequest(checkUrl,{headers})),pair=await checked.json();
   if(checked.ok&&pair.approved_at)return page("Este pedido já está autorizado. Conclua a conexão no aplicativo dos widgets.",200,"",true);
  }
  const status=[400,403,409,503].includes(response.status)?response.status:503;
  const message=typeof body.error==="string"&&knownErrors.has(body.error)?body.error:"Não foi possível conectar. Tente novamente.";
  return page(message,status,id);
 }catch{return page("Não foi possível conectar. Tente novamente.",503,id);}
}
