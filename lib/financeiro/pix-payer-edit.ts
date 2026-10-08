import {createHash} from "crypto";
import type {FinanceData} from "@/types/financeiro";
import {manualPixPayer,pixTitle,type PixMetadata} from "@/lib/mercado-pago/pix-payer";
type Decision={fingerprint:string;target:string;financeEntityId?:string;pix?:PixMetadata;[key:string]:unknown};
export type PayerState={decisions:Record<string,Decision>;[key:string]:unknown};
const hash=(value:string)=>createHash("sha256").update(value).digest("hex").slice(0,24);
const legacy=(value:string)=>/PIX(?:\/transferência)? recebida|PIX recebido/i.test(value);
export function compatiblePixRecords(data:FinanceData,state:PayerState){
 const result:Array<{id:string;fingerprint:string;pix:PixMetadata;kind:"DS"|"PERSONAL"}>=[];
 for(const [key,decision] of Object.entries(state.decisions||{})){
  if(!decision.fingerprint||decision.fingerprint!==key||!["DS","PERSONAL","TRANSFER","IGNORE"].includes(decision.target))continue;
  const matches=(id:string,meta:PixMetadata|undefined,text:string,kind:"DS"|"PERSONAL",invoiceId?:string)=>{
   const linked=meta?.isPix&&meta.fingerprint===key&&(!meta.destination||meta.destination===kind);
   const oldLinked=!meta&&legacy(text)&&(kind==="DS"?decision.financeEntityId===id&&id.startsWith('mp-ds-'):id===`mp-payment-${hash(`${key}|PERSONAL|${invoiceId}`)}`||id===`mp-payment-${hash(`${key}|PERSONAL_SPLIT|${invoiceId}`)}`);
   if(decision.target===kind&&(linked||oldLinked))result.push({id,fingerprint:key,pix:meta||decision.pix||{isPix:true,fingerprint:key,destination:kind},kind});
  };
  for(const receipts of Object.values(data.dsReceipts||{}))for(const receipt of receipts)matches(receipt.id,receipt.mercadoPago,[receipt.sourceName,receipt.note].join(' '),"DS");
  for(const invoice of data.personalInvoices||[])for(const payment of invoice.payments)matches(payment.id,payment.mercadoPago,payment.note||'',"PERSONAL",invoice.id);
 }
 // Ambiguous record IDs are not editable.
 return result.filter(row=>result.filter(other=>other.id===row.id).length===1);
}
export function editPixPayer(data:FinanceData,state:PayerState,fingerprint:string,value:unknown,expectedName:unknown,at:string){
 const decision=state.decisions?.[fingerprint];
 if(!decision||decision.fingerprint!==fingerprint)throw new Error('Vínculo PIX não encontrado.');
 const records=compatiblePixRecords(data,state).filter(row=>row.fingerprint===fingerprint);
 const pix=decision.pix||records[0]?.pix;
 if(!pix?.isPix||(pix.fingerprint&&pix.fingerprint!==fingerprint)||(pix.destination&&pix.destination!==decision.target)||(!records.length&&!["TRANSFER","IGNORE"].includes(decision.target)))throw new Error('Registro sem vínculo PIX seguro para edição.');
 if((pix.payerName||'')!==expectedName)throw new Error('O pagador foi alterado em outra aba. Atualize antes de editar.');
 const validated=manualPixPayer({...pix,payerOrigin:"manual"},value)!;
 const nextPix:PixMetadata={...validated,payerOrigin:"manual",payerEdits:[...(pix.payerEdits||[]),{at,previous:pix.payerName||'',name:validated.payerName||''}]};
 const update=(meta:PixMetadata|undefined,context:string)=>{
  const before=meta||pix;const oldTitle=pixTitle(before)!;
  const displayContext=before.displayContext??(/^(?:PIX\/transferência recebida|PIX recebido)$/i.test(context.trim())?'':context.startsWith(oldTitle)?context.slice(oldTitle.length).replace(/^ · /,''):context);
  return {...before,payerName:nextPix.payerName,payerOrigin:"manual" as const,payerEdits:nextPix.payerEdits,displayContext};
 };
 const ids=new Set(records.map(row=>row.id));
 const historyIds=new Set(records.map(row=>row.id.replace(/^mp-(ds|payment)-/,'mp-')));
 const next:FinanceData={...data,
  dsReceipts:Object.fromEntries(Object.entries(data.dsReceipts||{}).map(([month,receipts])=>[month,receipts.map(receipt=>ids.has(receipt.id)?{...receipt,mercadoPago:update(receipt.mercadoPago,receipt.sourceName||'')}:receipt)])),
  personalInvoices:data.personalInvoices.map(invoice=>({...invoice,payments:invoice.payments.map(payment=>ids.has(payment.id)?{...payment,mercadoPago:update(payment.mercadoPago,payment.note||'')}:payment)})),
  history:(data.history||[]).map(entry=>entry.mercadoPago?.fingerprint===fingerprint||historyIds.has(entry.id)?{...entry,mercadoPago:update(entry.mercadoPago,entry.description)}:entry),
 };
 return {data:next,state:{...state,decisions:{...state.decisions,[fingerprint]:{...decision,pix:nextPix}}}};
}
