"use client";
import {useEffect,useState} from "react";
export function FinanceDeviceTrust({onRevoked}:{onRevoked?:()=>void}){
  const [trusted,setTrusted]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState("");
  useEffect(()=>{let active=true;void fetch("/api/finance/pin",{cache:"no-store"}).then(async r=>{if(r.ok){const result=await r.json();if(active)setTrusted(result.trusted===true);}}).catch(()=>{});return()=>{active=false;};},[]);
  async function revoke(){
    if(!confirm("Revogar a confiança deste dispositivo? O próximo acesso exigirá o PIN."))return;
    setBusy(true);setError("");
    try{const response=await fetch("/api/finance/pin",{method:"DELETE"});if(!response.ok)throw Error();setTrusted(false);onRevoked?.();}catch{setError("Não foi possível revogar. Tente novamente.");}finally{setBusy(false);}
  }
  return trusted?<div><button className="secondary" disabled={busy} onClick={()=>void revoke()}>{busy?"Revogando...":"Revogar confiança deste dispositivo"}</button>{error?<p role="alert">{error}</p>:null}</div>:null;
}
