import type {OtherReceipt} from "@/types/financeiro";
const money=new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"});
export default function OtherReceiptsSummary({receipts,total}:{receipts:OtherReceipt[];total:number}){
 if(!receipts.length)return null;
 return <section className="panel"><div className="panel-head"><h2>Outros recebimentos</h2><strong>{money.format(total)}</strong></div><ul className="simple-list">{receipts.slice().sort((a,b)=>b.date.localeCompare(a.date)||a.id.localeCompare(b.id)).map(receipt=><li key={receipt.id}><div><strong>{receipt.description}</strong><br/><small>{receipt.date.split("-").reverse().join("/")}{receipt.mercadoPago?.payerName?` · ${receipt.mercadoPago.payerName}`:""}</small></div><strong>{money.format(receipt.amount)}</strong></li>)}</ul></section>;
}
