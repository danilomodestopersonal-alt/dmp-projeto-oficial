export type PixMetadata={
  isPix:true;
  payerEdits?:Array<{at:string;previous:string;name:string}>;
  displayContext?:string;
  payerName?:string;
  payerOrigin?:"mercado_pago"|"manual";
  sourceId?:string;
  bankTransferId?:string;
  fingerprint?:string;
  date?:string;
  amount?:number;
  destination?:string;
};
// Somente campos explicitamente identificados como pagador/remetente.
// Não usa aluno, valor, histórico, merchant, receiver ou descrição genérica.
export function reportPixPayer(row:Record<string,string>,kind:string):PixMetadata|undefined{
  if(kind!=="IN"||!(/^pix$/i.test((row.PAYMENT_METHOD||"").trim())||/^pix$/i.test((row.PAYMENT_METHOD_TYPE||"").trim())||/\bPIX\b/i.test(row.OPERATION_TAGS||"")))return undefined;
  const direct=[row.PAYER_NAME,row.SENDER_NAME].find(value=>typeof value==="string"&&value.trim());
  return {isPix:true,...(direct?{payerName:direct,payerOrigin:"mercado_pago" as const}:{}),sourceId:row.SOURCE_ID||undefined,bankTransferId:row.PAY_BANK_TRANSFER_ID||undefined};
}
export function manualPixPayer(pix:PixMetadata|undefined,value:unknown):PixMetadata|undefined{
  if(!pix||value===undefined)return pix;
  if(typeof value!=="string"||value.length>200||/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(value)||/\b(?:APP_USR-|TEST-|Bearer\s)/i.test(value))throw new Error("Informe uma identificação de pagador válida, com até 200 caracteres.");
  if(pix.payerOrigin==="mercado_pago"&&value===pix.payerName)return pix;
  if(!value.trim())return pix.payerOrigin==="mercado_pago"?pix:{...pix,payerName:undefined,payerOrigin:undefined};
  return {...pix,payerName:value,payerOrigin:"manual"};
}
export function pixTitle(pix:PixMetadata|undefined){return pix?`PIX recebido — ${pix.payerName||"Pagador não identificado"}`:undefined;}
export function pixForDestination(pix:PixMetadata|undefined,destination:string){return pix?{...pix,destination}:undefined;}

export function pixDisplayLabel(pix:PixMetadata|undefined,label:string){
 if(!pix)return label;
 const title=pixTitle(pix)!;
 if(pix.displayContext!==undefined&&/^PIX(?: recebido|\/transferência)/i.test(label))return title+(pix.displayContext?" · "+pix.displayContext:"");
 return label.startsWith(title)?label:title+" · "+label;
}
