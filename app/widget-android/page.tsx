"use client";
import {useEffect,useRef,useState} from "react";
type Device={id:string;name:string;created_at:string;revoked_at:string|null};
type Notice={text:string;error:boolean};
async function jsonRequest(url:string,init:RequestInit={}){
 const response=await fetch(url,{...init,cache:"no-store",credentials:"same-origin",signal:AbortSignal.timeout(20000)});
 const body=await response.json().catch(()=>({error:"Resposta indisponível. Tente novamente."}));
 return {response,body};
}
export default function WidgetDevices(){
 const [pair,setPair]=useState(""),[deviceName,setDeviceName]=useState(""),[approved,setApproved]=useState(false);
 const [devices,setDevices]=useState<Device[]>([]),[message,setMessage]=useState("Verificando solicitação…");
 const [notice,setNotice]=useState<Notice|null>(null),[listError,setListError]=useState("");
 const [busy,setBusy]=useState(false),[expired,setExpired]=useState(false),[checking,setChecking]=useState("");
 const [diagnostic,setDiagnostic]=useState("");
 const approvedRef=useRef(false),actionRef=useRef(false);
 async function load(){
  try{
   const {response,body}=await jsonRequest("/api/widget/devices");
   if(response.ok&&Array.isArray(body.devices)){setDevices(body.devices);setListError("");}
   else setListError(response.status===401?"Entre no DMP nesta mesma sessão do navegador.":`Não foi possível consultar os dispositivos (HTTP ${response.status}).`);
  }catch{setListError("Falha de conexão ao consultar os dispositivos.");}
 }
 useEffect(()=>{
  if(window.self!==window.top){setMessage("Abra esta página diretamente no navegador.");return;}
  let active=true;
  const id=new URLSearchParams(location.search).get("pair")||"";setPair(id);
  const check=async()=>{
   void load();
   if(!id){setMessage("Para iniciar uma conexão, abra o aplicativo dos widgets e toque em Conectar DMP.");return;}
   try{
    const {response,body}=await jsonRequest("/api/widget/pair?id="+encodeURIComponent(id));
    if(!active||approvedRef.current)return;
    if(!response.ok){if(response.status===410){setExpired(true);setNotice({text:"Solicitação expirada. Volte ao aplicativo dos widgets e toque em Conectar DMP para iniciar outra.",error:true});}setMessage(`${body.error||"Não foi possível verificar a solicitação."} (HTTP ${response.status})`);return;}
    setDeviceName(typeof body.name==="string"?body.name:"");
    if(body.approved_at){approvedRef.current=true;setApproved(true);setNotice({text:"Autorizado. Volte ao aplicativo dos widgets e toque em Concluir conexão.",error:false});}
    else setMessage("Confira o nome do dispositivo e toque em Autorizar. Aguarde a confirmação nesta página.");
   }catch{if(active&&!approvedRef.current)setMessage("Falha de conexão ao verificar a solicitação.");}
  };
  void check();window.addEventListener("focus",check);
  return()=>{active=false;window.removeEventListener("focus",check);};
 },[]);
 async function approve(){
  if(window.self!==window.top||actionRef.current||approvedRef.current||!pair)return;
  actionRef.current=true;setBusy(true);setNotice({text:"Autorizando este celular… Aguarde nesta página.",error:false});
  try{
   const {response,body}=await jsonRequest("/api/widget/pair",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"approve",id:pair})});
   if(response.ok){approvedRef.current=true;setApproved(true);setNotice({text:"Autorizado. Agora volte ao aplicativo dos widgets, à tela com cinco botões, e toque em Concluir conexão.",error:false});}
   else setNotice({text:`${body.error||"Não foi possível autorizar este celular."} (HTTP ${response.status})`,error:true});
  }catch{setNotice({text:"Falha de conexão. A autorização não foi confirmada. Tente novamente nesta página.",error:true});}
  finally{actionRef.current=false;setBusy(false);}
 }
 async function revoke(id:string){
  if(actionRef.current||!confirm("Revogar este widget? Ele deixará de receber o resumo."))return;
  actionRef.current=true;setBusy(true);
  try{
   const {response}=await jsonRequest("/api/widget/devices?id="+encodeURIComponent(id),{method:"DELETE"});
   setNotice({text:response.ok?"Dispositivo revogado.":`Não foi possível revogar (HTTP ${response.status}).`,error:!response.ok});
   if(response.ok)await load();
  }catch{setNotice({text:"Falha de conexão ao revogar. Consulte o estado do dispositivo antes de tentar novamente.",error:true});}
  finally{actionRef.current=false;setBusy(false);}
 }
 async function diagnose(id:string){
  if(actionRef.current)return;
  actionRef.current=true;setChecking(id);setDiagnostic("Verificando o acesso deste widget à agenda…");
  try{
   const {response,body}=await jsonRequest("/api/widget/connection-check",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({deviceId:id})});
   setDiagnostic(`${body.message||body.error||"Verificação indisponível."}${body.code?`\nCódigo: ${body.code}`:""}${body.stage?`\nEtapa: ${body.stage}`:""}${body.googleError?`\nGoogle: ${body.googleError}`:""}${body.upstreamStatus?`\nHTTP Google: ${body.upstreamStatus}`:""}${body.liveCommit?`\nVersão: ${body.liveCommit}`:""}${body.checkedAt?`\nVerificado: ${new Date(body.checkedAt).toLocaleString("pt-BR")}`:""}${!response.ok?`\nHTTP DMP: ${response.status}`:""}`);
  }catch{setDiagnostic("Falha de conexão. A verificação não foi concluída.");}
  finally{actionRef.current=false;setChecking("");}
 }
 return <main style={{maxWidth:520,margin:"32px auto",padding:20}}>
  <h1>Conectar os widgets DMP</h1>
  <p>Autorize este celular para receber os dados dos widgets DMP — Hoje e DMP Agenda.</p>
  <p><a href="/app?home=1" target="_blank" rel="noreferrer">Entrar no DMP</a> · <a href="/api/google/auth" target="_blank" rel="noreferrer">Renovar autorização Google</a></p>
  <p>Se renovar o Google, conclua a autorização na outra tela e retorne aqui.</p>
  {pair?<button type="button" className="primary" disabled={busy||Boolean(checking)||!deviceName||approved||expired} onClick={()=>void approve()}>{approved?"Autorizado":busy?"Autorizando…":`Autorizar ${deviceName||"este celular"}`}</button>:null}
  <p role="status" aria-live="polite" style={{padding:12,border:"1px solid",borderColor:notice?.error?"#b42318":"#cad5cf",borderRadius:8,whiteSpace:"pre-wrap"}}>{notice?.text||message}</p>
  <h2>Dispositivos</h2>
  <p>Uma conexão anterior não impede a nova autorização. Revogar encerra apenas o acesso daquele vínculo.</p>
  {listError?<p role="alert">{listError}</p>:null}
  {devices.map(d=><section key={d.id} style={{borderBottom:"1px solid #cad5cf",padding:"12px 0"}}>
   <p>{d.name} · {new Date(d.created_at).toLocaleString("pt-BR")}{d.revoked_at?" — revogado":""}</p>
   {!d.revoked_at?<div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
    <button type="button" disabled={busy||Boolean(checking)} onClick={()=>void diagnose(d.id)}>{checking===d.id?"Verificando…":"Verificar acesso à agenda"}</button>
    <button type="button" disabled={busy||Boolean(checking)} onClick={()=>void revoke(d.id)}>Revogar</button>
   </div>:null}
  </section>)}
  {diagnostic?<p role="status" style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{diagnostic}</p>:null}
  <p>Após concluir a conexão no aplicativo dos widgets, reabra esta página para conferir o novo dispositivo.</p>
 </main>;
}
