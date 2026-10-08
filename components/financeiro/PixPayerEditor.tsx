"use client";
import {createContext,useContext,useEffect,useState,type ReactNode} from "react";
import type {PixMetadata} from "@/lib/mercado-pago/pix-payer";
type Row={id:string;fingerprint:string;pix:PixMetadata};
const Context=createContext<{rows:Row[];edit:(row:Row)=>void;disabled:boolean}|null>(null);
export function PixPayerEditButton({recordId}:{recordId:string}){
 const context=useContext(Context);const row=context?.rows.find(item=>item.id===recordId||item.id.replace(/^mp-(ds|payment)-/,'mp-')===recordId);
 return row?<button type="button" disabled={context?.disabled} onClick={()=>context?.edit(row)} aria-label="Editar pagador do PIX">Editar</button>:null;
}
export function PixPayerProvider({children,revision,onSaved,onSavingChange,disabled}:{children:ReactNode;revision:number;onSaved:()=>Promise<void>;onSavingChange:(saving:boolean)=>void;disabled:boolean}){
 const [rows,setRows]=useState<Row[]>([]),[selected,setSelected]=useState<Row|null>(null),[name,setName]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{let active=true;fetch('/api/finance/pix-payer',{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error();return r.json();}).then(value=>{if(active)setRows(value.records||[]);}).catch(()=>{if(active)setRows([]);});return ()=>{active=false;};},[revision]);
 async function save(){
  if(!selected||busy)return;setBusy(true);setError('');onSavingChange(true);
  try{
   const response=await fetch('/api/finance/pix-payer',{method:'PATCH',headers:{'Content-Type':'application/json','x-dmp-expected-updated-at':sessionStorage.getItem('dmp_finance_cloud_updated_at')||''},body:JSON.stringify({fingerprint:selected.fingerprint,payerName:name,expectedName:selected.pix.payerName||''})});
   const result=await response.json();if(!response.ok)throw new Error(result.error||'Não foi possível salvar.');
   await onSaved();setSelected(null);
  }catch(err){setError(err instanceof Error?err.message:'Não foi possível salvar.');}
  finally{setBusy(false);onSavingChange(false);}
 }
 return <Context.Provider value={{rows,disabled:disabled||busy,edit:row=>{setSelected(row);setName(row.pix.payerName||'');setError('');}}}>{children}{selected?<div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-labelledby="pix-payer-edit-title"><div className="modal-head"><h2 id="pix-payer-edit-title">Editar pagador do PIX</h2><button type="button" disabled={busy} onClick={()=>setSelected(null)}>Fechar</button></div><form onSubmit={event=>{event.preventDefault();void save();}}><label>Pagador / identificação<input autoFocus maxLength={200} value={name} onChange={event=>setName(event.target.value)} placeholder="Pagador não identificado" disabled={busy}/></label><p className="muted">Somente a identificação será alterada. Origem manual.</p>{error?<p role="alert">{error}</p>:null}<button type="submit" className="primary" disabled={busy||disabled}>{busy?'Salvando...':'Salvar'}</button></form></section></div>:null}</Context.Provider>;
}
