import type {FinanceData,OtherReceipt} from "@/types/financeiro";
export function receiptDescription(value:unknown){
 if(typeof value!=="string"||!value.trim()||value.trim().length>300||/[\x00-\x1F\x7F]/.test(value))throw Error("Informe o motivo do recebimento, com até 300 caracteres.");
 return value.trim();
}
export function addOtherReceipt(data:FinanceData,receipt:OtherReceipt){
 const description=receiptDescription(receipt.description),competence=receipt.date.slice(0,7);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(receipt.date)||!Number.isFinite(Date.parse(receipt.date+"T12:00:00Z"))||new Date(receipt.date+"T12:00:00Z").toISOString().slice(0,10)!==receipt.date||receipt.competence!==competence||!data.competences[competence]||data.competences[competence].status==="CLOSED")throw Error("A competência do recebimento não está aberta no Financeiro.");
 if(!receipt.id||!receipt.fingerprint||!Number.isFinite(receipt.amount)||receipt.amount<=0||Math.abs(receipt.amount*100-Math.round(receipt.amount*100))>0.00001)throw Error("Recebimento inválido. Confira a movimentação original.");
 const existing=(data.otherReceipts||[]).find(r=>r.fingerprint===receipt.fingerprint||r.id===receipt.id);
 if(existing){if(existing.amount!==receipt.amount||existing.date!==receipt.date||existing.fingerprint!==receipt.fingerprint)throw Error("O recebimento existente diverge desta movimentação.");return {data,changed:false,id:existing.id,description:existing.description};}
 return {data:{...data,otherReceipts:[...(data.otherReceipts||[]),{...receipt,description}],history:[...(data.history||[]),{id:"history-"+receipt.id,occurredAt:new Date().toISOString(),competence,kind:"OTHER_RECEIPT_ADDED" as const,description:"Outros recebimentos · "+description,amount:receipt.amount,entityId:receipt.id,...(receipt.mercadoPago?{mercadoPago:receipt.mercadoPago}:{})}]},changed:true,id:receipt.id,description};
}
export function otherReceiptsPreserved(current:FinanceData,incoming:FinanceData){
 // Receipts are created by the atomic reconciliation endpoint. Stale clients may not erase them.
 return JSON.stringify(current.otherReceipts||[])===JSON.stringify(incoming.otherReceipts||[]);
}
