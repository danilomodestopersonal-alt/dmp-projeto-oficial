// Presentation only: never use these fields as a reconciliation or learning key.
export type OutgoingIdentity={label:string;kind:"name"|"description";source:"METADATA"|"STORE_NAME"|"POS_NAME"|"SALE_DETAIL"|"DESCRIPTION"};
type Row=Record<string,string>;
const generic=new Set(["settlement","settlements","payout","payouts","payment","release","movement","movimentacao mercado pago","pix transferencia enviada","pagamento transferencia via pix","liquidacao mercado pago","produto sem descricao","transferencia para banco","reserve for payment","reserve for payout","reserve for refund","reserve for chargeback","reserve for dispute","refund","chargeback","dispute","fee","tax","withdrawal","asset management gain","asset management loss","available balance","initial available balance","total","subtotal","null","undefined"]);
function key(value:string){return value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();}
function label(value:unknown,operation=""){
  if(typeof value!=="string")return "";
  const text=value.trim().replace(/^["']+|["']+$/g,"").trim();
  return text.length<=200&&/\p{L}/u.test(text)&&!generic.has(key(text))&&key(text)!==key(operation)?text:"";
}
function metadataName(raw:string|undefined){
  if(!raw||raw.length>200000)return "";
  try{
    const parsed:unknown=JSON.parse(raw);
    const names=new Set<string>();
    const roles=new Set(["receiver","beneficiary","counterparty","counterpart","merchant"]);
    const fields=new Set([...roles].map(role=>`${role} name`));
    function walk(node:unknown,role="",depth=0){
      if(!node||typeof node!=="object"||depth>8)return;
      if(Array.isArray(node)){node.forEach(item=>walk(item,role,depth+1));return;}
      const obj=node as Record<string,unknown>;
      if(roles.has(role)){
        const full=label(obj.name)||label(obj.full_name)||label([obj.first_name,obj.last_name].filter(v=>typeof v==="string").join(" "));
        if(full)names.add(full);
      }
      for(const [field,value]of Object.entries(obj)){
        const normalized=key(field);
        // Sender/payer/account-holder fields can identify the account owner, not the recipient.
        if(["sender","payer","account holder","bank account holder"].includes(normalized))continue;
        if(fields.has(normalized)){const name=label(value);if(name)names.add(name);}
        if(value&&typeof value==="object")walk(value,normalized,depth+1);
      }
    }
    walk(parsed);
    // Conflicting counterpart names are not safe to choose automatically for display.
    return names.size===1?[...names][0]:"";
  }catch{return "";}
}
function fromRow(row:Row):OutgoingIdentity|undefined{
  const operation=row.TRANSACTION_TYPE||row.DESCRIPTION||row.RECORD_TYPE||"";
  const metadata=metadataName(row.METADATA);
  if(metadata)return {label:metadata,kind:"name",source:"METADATA"};
  for(const source of ["STORE_NAME","POS_NAME","SALE_DETAIL","DESCRIPTION"] as const){
    const value=label(row[source],source==="DESCRIPTION"?(row.TRANSACTION_TYPE||row.RECORD_TYPE||""):operation);
    if(value)return {label:value,kind:source==="STORE_NAME"||source==="POS_NAME"?"name":"description",source};
  }
}
function amount(row:Row){
  const number=(v:string|undefined)=>{const raw=(v||"").trim().replace(/\s/g,"");return Number(raw.includes(",")&&!raw.includes(".")?raw.replace(",","."):raw.replace(/,/g,""));};
  return number(row.SETTLEMENT_NET_AMOUNT)||number(row.REAL_AMOUNT)||number(row.TRANSACTION_AMOUNT)||(number(row.NET_CREDIT_AMOUNT)-number(row.NET_DEBIT_AMOUNT));
}
function sameOutgoing(primary:Row,secondary:Row){
  const firstDate=(primary.TRANSACTION_DATE||primary.SETTLEMENT_DATE||primary.TRANSACTION_DATE_SHORT||primary.SETTLEMENT_DATE_SHORT||"").slice(0,10);
  const secondDate=(secondary.TRANSACTION_APPROVAL_DATE||secondary.DATE||"").slice(0,10);
  const firstAmount=amount(primary),secondAmount=amount(secondary);
  return Boolean(primary.SOURCE_ID?.trim()&&primary.SOURCE_ID.trim()===secondary.SOURCE_ID?.trim()&&/^\d{4}-\d{2}-\d{2}$/.test(firstDate)&&firstDate===secondDate&&firstAmount<0&&secondAmount<0&&Math.round(firstAmount*100)===Math.round(secondAmount*100));
}
export function reportOutgoingIdentity(primary:Row,secondary?:Row):OutgoingIdentity|undefined{
  return fromRow(primary)||(secondary&&sameOutgoing(primary,secondary)?fromRow(secondary):undefined);
}
export function outgoingIdentityTitle(identity:OutgoingIdentity|undefined){
  // Also reject technical labels in an already-loaded response. Never infer a
  // recipient from a learned rule, a manual expense description or an API status.
  return label(identity?.label)||"Destinatário não identificado";
}
export function outgoingIdentityHint(identity:OutgoingIdentity|undefined){
  if(!identity||!label(identity.label))return "Destinatário/estabelecimento não informado neste relatório do Mercado Pago.";
  return identity.kind==="name"?"Identificação fornecida pelo Mercado Pago.":"Descrição fornecida pelo Mercado Pago.";
}
