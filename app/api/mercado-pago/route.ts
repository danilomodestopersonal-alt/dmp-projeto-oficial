import {isAuthorized} from "@/lib/auth";
import {NextRequest,NextResponse} from "next/server";

export const runtime="nodejs";
export const dynamic="force-dynamic";

const MP_API="https://api.mercadopago.com";
const SETTLEMENT_BASE="/v1/account/settlement_report";
const RELEASE_BASE="/v1/account/release_report";
const CLASSIFICATION_VERSION="v4-smart-2026-09-18";

type ReportKind="settlement"|"release";
type AnyRow=Record<string,string>;
type MoveStatus="AUTO"|"REVIEW"|"TECHNICAL";

type MpReport={
  id?:number|string;
  report_id?:number|string;
  status?:string;
  file_name?:string;
  begin_date?:string;
  end_date?:string;
  generation_date?:string;
  date_created?:string;
  last_modified?:string;
  [key:string]:unknown;
};

class MpUpstreamError extends Error{
  status:number;
  code:string;
  constructor(status:number,code:string,message:string){super(message);this.status=status;this.code=code;}
}

function token(){
  const value=process.env.MERCADO_PAGO_ACCESS_TOKEN?.trim();
  if(!value)throw new MpUpstreamError(500,"token_missing","MERCADO_PAGO_ACCESS_TOKEN não está configurado no servidor.");
  return value;
}

async function mpRequest(path:string,init:RequestInit={},allowMissing=false){
  const headers=new Headers(init.headers||{});
  headers.set("Authorization",`Bearer ${token()}`);
  if(init.body&&!headers.has("Content-Type"))headers.set("Content-Type","application/json");
  headers.set("Accept",headers.get("Accept")||"application/json");
  const response=await fetch(`${MP_API}${path}`,{...init,headers,cache:"no-store"});
  const contentType=response.headers.get("content-type")||"";
  const text=await response.text();
  let data:unknown=text;
  if(contentType.includes("json")||text.trim().startsWith("{")||text.trim().startsWith("[")){
    try{data=JSON.parse(text);}catch{}
  }
  if(!response.ok){
    if(allowMissing&&response.status!==401&&response.status!==403)return {ok:false,status:response.status,data};
    const payload=data&&typeof data==="object"?data as Record<string,unknown>:{};
    const code=String(payload.error||payload.code||"mp_error");
    const message=response.status===401||response.status===403
      ?"O Mercado Pago recusou a credencial de produção. Confira o Access Token salvo no Render."
      :String(payload.message||payload.error||`Mercado Pago respondeu HTTP ${response.status}.`);
    throw new MpUpstreamError(response.status,code,message);
  }
  return {ok:true,status:response.status,data};
}

function reportBase(kind:ReportKind){return kind==="settlement"?SETTLEMENT_BASE:RELEASE_BASE;}

const settlementColumnKeys=[
  "TRANSACTION_DATE","SETTLEMENT_DATE","TRANSACTION_DATE_SHORT","SETTLEMENT_DATE_SHORT","SOURCE_ID","EXTERNAL_REFERENCE",
  "TRANSACTION_TYPE","TRANSACTION_AMOUNT","SETTLEMENT_NET_AMOUNT","REAL_AMOUNT","FEE_AMOUNT","PAYMENT_METHOD","PAYMENT_METHOD_TYPE",
  "DESCRIPTION","SALE_DETAIL","STORE_NAME","POS_NAME","BUSINESS_UNIT","SUB_UNIT","PURCHASE_ID","PAY_BANK_TRANSFER_ID","OPERATION_TAGS","METADATA"
];
const releaseColumnKeys=[
  "DATE","SOURCE_ID","EXTERNAL_REFERENCE","RECORD_TYPE","DESCRIPTION","SALE_DETAIL","NET_CREDIT_AMOUNT","NET_DEBIT_AMOUNT","GROSS_AMOUNT",
  "METADATA","PAYMENT_METHOD","BALANCE_AMOUNT","PAYOUT_BANK_ACCOUNT_NUMBER","ITEM_ID","CURRENCY"
];
const settlementColumns=settlementColumnKeys.map(key=>({key}));
const releaseColumns=releaseColumnKeys.map(key=>({key}));

function configBody(kind:ReportKind){
  if(kind==="settlement")return {
    columns:settlementColumns,
    file_name_prefix:"dmp-settlement-report",
    frequency:{hour:0,value:1,type:"monthly"},
    include_withdraw:true,
    refund_detailed:true,
    show_chargeback_cancel:true
  };
  return {
    columns:releaseColumns,
    file_name_prefix:"dmp-release-report",
    frequency:{hour:0,value:1,type:"monthly"},
    include_withdrawal_at_end:true,
    check_available_balance:true,
    compensate_detail:true,
    execute_after_withdrawal:false
  };
}

async function getConfig(kind:ReportKind){return mpRequest(`${reportBase(kind)}/config`,{method:"GET"},true);}

function configColumnKeys(data:unknown){
  if(!data||typeof data!=="object")return [] as string[];
  const columns=(data as Record<string,unknown>).columns;
  if(!Array.isArray(columns))return [] as string[];
  return columns.map(item=>item&&typeof item==="object"?String((item as Record<string,unknown>).key||"").toUpperCase():"").filter(Boolean);
}

function configOptimized(kind:ReportKind,data:unknown){
  const present=new Set(configColumnKeys(data));
  const required=kind==="settlement"?settlementColumnKeys:releaseColumnKeys;
  return required.every(key=>present.has(key));
}

async function ensureConfig(kind:ReportKind){
  const current=await getConfig(kind);
  if(current.ok){
    if(configOptimized(kind,current.data))return {created:false,updated:false,data:current.data};
    const updated=await mpRequest(`${reportBase(kind)}/config`,{method:"PUT",body:JSON.stringify(configBody(kind))});
    return {created:false,updated:true,data:updated.data};
  }
  const created=await mpRequest(`${reportBase(kind)}/config`,{method:"POST",body:JSON.stringify(configBody(kind))},true);
  if(created.ok)return {created:true,updated:false,data:created.data};
  if(created.status===409){
    const retry=await getConfig(kind);
    if(retry.ok){
      if(configOptimized(kind,retry.data))return {created:false,updated:false,data:retry.data};
      const updated=await mpRequest(`${reportBase(kind)}/config`,{method:"PUT",body:JSON.stringify(configBody(kind))});
      return {created:false,updated:true,data:updated.data};
    }
  }
  throw new MpUpstreamError(created.status,"config_failed",`Não foi possível configurar o relatório ${kind==="settlement"?"Dinheiro em conta":"Liberações"}.`);
}

function asReports(data:unknown):MpReport[]{
  if(Array.isArray(data))return data.filter(item=>item&&typeof item==="object") as MpReport[];
  if(data&&typeof data==="object"){
    const obj=data as Record<string,unknown>;
    for(const key of ["results","reports","data"]){if(Array.isArray(obj[key]))return obj[key] as MpReport[];}
  }
  return [];
}

function reportDate(report:MpReport){return String(report.generation_date||report.date_created||report.last_modified||report.end_date||report.begin_date||"");}
function sortReports(items:MpReport[]){return items.slice().sort((a,b)=>reportDate(b).localeCompare(reportDate(a)));}
async function listReports(kind:ReportKind){
  const result=await mpRequest(`${reportBase(kind)}/list`,{method:"GET"},true);
  if(!result.ok)return [];
  return sortReports(asReports(result.data));
}
function isPending(report:MpReport|undefined){
  const s=String(report?.status||"").toLowerCase();
  return ["pending","processing","in_process","in_progress","preparing"].some(value=>s.includes(value));
}
function isProcessed(report:MpReport|undefined){
  if(!report)return false;
  const s=String(report.status||"").toLowerCase();
  return Boolean(report.file_name)||!s||["processed","ready","done","completed","generated"].some(value=>s.includes(value));
}

async function resolveFileName(kind:ReportKind,report:MpReport|undefined){
  if(!report)return null;
  if(report.file_name)return String(report.file_name);
  const id=report.report_id??report.id;
  if(id===undefined||id===null)return null;
  const found=await mpRequest(`${reportBase(kind)}/search?id=${encodeURIComponent(String(id))}`,{method:"GET"},true);
  if(!found.ok)return null;
  const candidates=asReports(found.data);
  if(!candidates.length&&found.data&&typeof found.data==="object")candidates.push(found.data as MpReport);
  const file=candidates.find(item=>item.file_name)?.file_name;
  return file?String(file):null;
}

async function downloadCsv(kind:ReportKind,fileName:string){
  const headers=new Headers();
  headers.set("Authorization",`Bearer ${token()}`);
  headers.set("Accept","text/csv,application/octet-stream,*/*");
  const response=await fetch(`${MP_API}${reportBase(kind)}/${encodeURIComponent(fileName)}`,{headers,cache:"no-store"});
  if(!response.ok){
    if(response.status===404)return null;
    if(response.status===401||response.status===403)throw new MpUpstreamError(response.status,"invalid_token","O Mercado Pago recusou a credencial de produção.");
    throw new MpUpstreamError(response.status,"download_failed",`Falha ao baixar relatório ${kind}.`);
  }
  return response.text();
}

function countDelimiter(line:string,delimiter:string){
  let quoted=false,count=0;
  for(let i=0;i<line.length;i++){
    const ch=line[i];
    if(ch==='"'){
      if(quoted&&line[i+1]==='"'){i++;continue;}
      quoted=!quoted;
    }else if(ch===delimiter&&!quoted)count++;
  }
  return count;
}

function parseCsv(text:string):AnyRow[]{
  const clean=text.replace(/^\uFEFF/,"");
  const firstLine=clean.split(/\r?\n/,1)[0]||"";
  const delimiter=countDelimiter(firstLine,";")>countDelimiter(firstLine,",")?";":",";
  const records:string[][]=[];
  let row:string[]=[],field="",quoted=false;
  for(let i=0;i<clean.length;i++){
    const ch=clean[i];
    if(ch==='"'){
      if(quoted&&clean[i+1]==='"'){field+='"';i++;}
      else quoted=!quoted;
      continue;
    }
    if(ch===delimiter&&!quoted){row.push(field);field="";continue;}
    if((ch==='\n'||ch==='\r')&&!quoted){
      if(ch==='\r'&&clean[i+1]==='\n')i++;
      row.push(field);field="";
      if(row.some(value=>value!==""))records.push(row);
      row=[];continue;
    }
    field+=ch;
  }
  if(field!==""||row.length){row.push(field);records.push(row);}
  if(records.length<2)return [];
  const headers=records[0].map(value=>value.trim().replace(/^\uFEFF/,"").toUpperCase());
  return records.slice(1).map(values=>{
    const obj:AnyRow={};
    headers.forEach((header,index)=>{if(header)obj[header]=(values[index]||"").trim();});
    return obj;
  });
}

function numberValue(value:string|undefined){
  if(!value)return 0;
  const raw=value.trim().replace(/\s/g,"");
  if(!raw)return 0;
  const normalized=raw.includes(",")&&!raw.includes(".")?raw.replace(",","."):raw.replace(/,/g,"");
  const parsed=Number(normalized);
  return Number.isFinite(parsed)?parsed:0;
}

function normalize(value:string){return value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/["']/g,"").replace(/\s+/g," ").trim();}
function clean(value:string|undefined){return (value||"").trim().replace(/^['"]+|['"]+$/g,"").trim();}
function compactRef(value:string|undefined){
  const v=clean(value);
  if(!v)return "";
  if(v.length<=18)return `Ref. ${v}`;
  return `Ref. …${v.slice(-10)}`;
}
function maskedAccount(value:string|undefined){
  const digits=(value||"").replace(/\D/g,"");
  if(!digits)return "";
  return `Destino •••• ${digits.slice(-4)}`;
}
function genericDescription(value:string,type:string){
  const n=normalize(value),t=normalize(type);
  if(!n)return true;
  return n===t||["settlement","settlements","payout","payouts","movement","movimentacao mercado pago"].includes(n);
}
function meaningfulDescription(row:AnyRow,type:string){
  for(const candidate of [row.SALE_DETAIL,row.STORE_NAME,row.POS_NAME,row.DESCRIPTION]){
    const value=clean(candidate);
    if(value&&!genericDescription(value,type))return value;
  }
  return "";
}

const categoryRules:{pattern:RegExp;category:string;reason:string;confidence:number}[]=[
  {pattern:/(ifood|ifd\*|restaur|churrasc|marmit|lanch|padar|panif|pizza|pizzar|subway|mcdon|burger|cafe|cafeter|food|sushi|boulanger|kopenhagen|sorvet|doceria|confeit)/,category:"Alimentação",reason:"alimentação reconhecida pela descrição",confidence:96},
  {pattern:/(covabra|supermerc|mercadinho|hortifruti|atacad|carrefour|assa[ií]|p[aã]o de a[cç][uú]car|mercearia)/,category:"Mercado",reason:"mercado/supermercado reconhecido",confidence:96},
  {pattern:/(conectcar|sem parar|auto ?posto|posto|combust|gasolin|etanol|uber|99app|estacion|ped[aá]gio)/,category:"Transporte",reason:"transporte reconhecido pela descrição",confidence:96},
  {pattern:/(drogar|farm[aá]c|clinica|cl[ií]nica|hospital|laborat|sa[uú]de|medic|odont|dentista)/,category:"Saúde",reason:"saúde reconhecida pela descrição",confidence:96},
  {pattern:/(cinema|pousada|hotel|airbnb|booking|evento|ingresso|parque|lazer)/,category:"Lazer",reason:"lazer/viagem reconhecido",confidence:94},
  {pattern:/(google brasil|amazon|magalu|magazine luiza|mercado ?livre|shopping|decathlon|loja|comercio de acessor|camposom)/,category:"Compras",reason:"compra reconhecida pela descrição",confidence:92},
  {pattern:/(escola|brinquedo|toy ?kids|kids|crianca|crian[cç]a|filho)/,category:"Filho",reason:"gasto infantil reconhecido",confidence:94},
  {pattern:/(tarifa|fee|taxa|comiss[aã]o)/,category:"Taxas bancárias",reason:"tarifa/taxa identificada",confidence:99}
];
function smartCategory(text:string){
  const n=normalize(text);
  for(const rule of categoryRules)if(rule.pattern.test(n))return {category:rule.category,confidence:rule.confidence,reason:rule.reason};
  return null;
}
function operationLabel(type:string,kind:"IN"|"OUT",paymentType:string,description:string){
  const t=normalize(type),p=normalize(paymentType);
  if(t==="payout"||t==="payouts")return "PIX/transferência enviada";
  if(t==="withdrawal")return "Transferência para banco";
  if(t==="withdrawal_cancel")return "Cancelamento de transferência";
  if(t==="refund")return "Estorno/devolução";
  if(t==="cashback")return "Cashback";
  if(t==="chargeback")return "Contestação";
  if(t==="dispute")return "Disputa";
  if(t.includes("trava_de_recebivel"))return "Trava de recebível";
  if(t==="settlement"&&p==="bank_transfer")return kind==="IN"?"PIX/transferência recebida":"Pagamento/transferência via PIX";
  if(t==="settlement")return description||"Liquidação Mercado Pago";
  return description||type||"Movimentação Mercado Pago";
}

function releaseLookup(rows:AnyRow[]){
  const map=new Map<string,AnyRow>();
  for(const row of rows){const id=clean(row.SOURCE_ID);if(id&&!map.has(id))map.set(id,row);}
  return map;
}

function settlementMovements(rows:AnyRow[],releaseRows:AnyRow[]){
  const releases=releaseLookup(releaseRows);
  return rows.map((row,index)=>{
    const amount=numberValue(row.SETTLEMENT_NET_AMOUNT)||numberValue(row.REAL_AMOUNT)||numberValue(row.TRANSACTION_AMOUNT);
    if(!amount)return null;
    const kind:"IN"|"OUT"=amount<0?"OUT":"IN";
    const date=row.TRANSACTION_DATE||row.SETTLEMENT_DATE||row.TRANSACTION_DATE_SHORT||row.SETTLEMENT_DATE_SHORT||"";
    const type=clean(row.TRANSACTION_TYPE)||"MOVEMENT";
    const paymentType=clean(row.PAYMENT_METHOD_TYPE||row.PAYMENT_METHOD);
    const useful=meaningfulDescription(row,type);
    const sourceId=clean(row.SOURCE_ID);
    const release=sourceId?releases.get(sourceId):undefined;
    const payoutAccount=maskedAccount(release?.PAYOUT_BANK_ACCOUNT_NUMBER);
    const typeNorm=normalize(type);
    const fee=Math.abs(numberValue(row.FEE_AMOUNT));
    const keyword=smartCategory([useful,row.DESCRIPTION,row.SALE_DETAIL,row.STORE_NAME,row.POS_NAME,row.BUSINESS_UNIT,row.SUB_UNIT].filter(Boolean).join(" "));

    let technical=false;
    let category="Outros";
    let confidence=32;
    let reason="descrição insuficiente para classificar com segurança";
    let status:MoveStatus="REVIEW";

    if(["withdrawal","withdrawal_cancel","chargeback","dispute","trava_de_recebivel"].includes(typeNorm)){
      technical=true;status="TECHNICAL";confidence=100;reason="movimento operacional da conta separado dos gastos pessoais";
    }else if(!useful&&typeNorm==="settlement"&&Math.abs(amount)<=5&&paymentType!=="bank_transfer"){
      technical=true;status="TECHNICAL";confidence=100;reason="ajuste técnico de liquidação sem descrição comercial";
    }else if(keyword){
      category=keyword.category;confidence=keyword.confidence;reason=keyword.reason;status=confidence>=90?"AUTO":"REVIEW";
    }else if(fee>0&&!useful&&kind==="OUT"){
      category="Taxas bancárias";confidence=96;reason="tarifa identificada pelo campo de taxa";status="AUTO";
    }else if(typeNorm==="settlement"&&normalize(paymentType)==="bank_transfer"&&kind==="IN"){
      category="Recebimento";confidence=76;reason="entrada via PIX/transferência; precisa conciliar a origem";status="REVIEW";
    }else if(typeNorm==="payout"||typeNorm==="payouts"){
      confidence=28;reason="PIX/transferência enviada sem destinatário legível no relatório";status="REVIEW";
    }

    const fallback=operationLabel(type,kind,paymentType,useful);
    const description=useful||fallback;
    const reference=compactRef(row.EXTERNAL_REFERENCE||row.PURCHASE_ID||row.PAY_BANK_TRANSFER_ID);
    const detail=[operationLabel(type,kind,paymentType,""),paymentType,payoutAccount,reference].filter(Boolean).join(" · ");

    return {
      id:`${sourceId||"mp"}-${date||index}-${index}`,
      sourceId,
      date,
      description,
      detail,
      operation:type,
      kind,
      amount:Math.abs(amount),
      category,
      confidence,
      reason,
      technical,
      status
    };
  }).filter(Boolean).sort((a,b)=>String((b as any).date).localeCompare(String((a as any).date))).slice(0,400);
}

function releaseBalance(rows:AnyRow[]){
  const withBalance=rows.filter(row=>row.BALANCE_AMOUNT&&Number.isFinite(numberValue(row.BALANCE_AMOUNT)));
  if(withBalance.length){
    const ordered=withBalance.slice().sort((a,b)=>String(a.DATE||"").localeCompare(String(b.DATE||"")));
    return {value:numberValue(ordered[ordered.length-1].BALANCE_AMOUNT),source:"BALANCE_AMOUNT"};
  }
  const initialIndex=rows.findIndex(row=>normalize(row.RECORD_TYPE||"")==="initial_available_balance");
  if(initialIndex>=0){
    let balance=numberValue(rows[initialIndex].NET_CREDIT_AMOUNT)-numberValue(rows[initialIndex].NET_DEBIT_AMOUNT);
    for(const row of rows.slice(initialIndex+1)){
      const type=normalize(row.RECORD_TYPE||"");
      if(["total","subtotal","initial_available_balance","available_balance"].includes(type))continue;
      balance+=numberValue(row.NET_CREDIT_AMOUNT)-numberValue(row.NET_DEBIT_AMOUNT);
    }
    return {value:balance,source:"CALCULATED"};
  }
  return {value:null as number|null,source:null as string|null};
}

async function latestCsv(kind:ReportKind,reports:MpReport[]){
  const processed=reports.find(isProcessed);
  if(!processed)return {report:null as MpReport|null,rows:[] as AnyRow[],fileName:null as string|null};
  const fileName=await resolveFileName(kind,processed);
  if(!fileName)return {report:processed,rows:[] as AnyRow[],fileName:null};
  const csv=await downloadCsv(kind,fileName);
  return {report:processed,rows:csv?parseCsv(csv):[],fileName};
}

function summaryReport(report:MpReport|undefined){
  if(!report)return null;
  return {id:report.report_id??report.id??null,status:String(report.status||"unknown"),beginDate:report.begin_date||null,endDate:report.end_date||null,generatedAt:report.generation_date||report.date_created||report.last_modified||null,fileName:report.file_name||null};
}

async function overview(){
  const [settlementConfig,releaseConfig,settlementReports,releaseReports]=await Promise.all([
    getConfig("settlement"),getConfig("release"),listReports("settlement"),listReports("release")
  ]);
  const configured={settlement:settlementConfig.ok,release:releaseConfig.ok};
  const needsSetup=!configured.settlement||!configured.release;
  const configurationOptimized=Boolean(settlementConfig.ok&&releaseConfig.ok&&configOptimized("settlement",settlementConfig.data)&&configOptimized("release",releaseConfig.data));
  const [settlementCsv,releaseCsv]=await Promise.all([latestCsv("settlement",settlementReports),latestCsv("release",releaseReports)]);
  const movements=settlementMovements(settlementCsv.rows,releaseCsv.rows);
  const balance=releaseBalance(releaseCsv.rows);
  const latestDates=[reportDate(settlementCsv.report||{}),reportDate(releaseCsv.report||{})].filter(Boolean).sort().reverse();
  const pending=isPending(settlementReports[0])||isPending(releaseReports[0]);
  return {
    connected:true,needsSetup,configured,configurationOptimized,pending,balance:balance.value,balanceSource:balance.source,
    lastSync:latestDates[0]||null,movements,classificationVersion:CLASSIFICATION_VERSION,
    technicalCount:movements.filter(item=>item&&typeof item==="object"&&(item as any).technical).length,
    reports:{settlement:summaryReport(settlementReports[0]),release:summaryReport(releaseReports[0])},
    firstCollectionNotice:configured.settlement&&movements.length===0,readOnly:true
  };
}

function dateRange(days=30){
  const end=new Date();
  const begin=new Date(end.getTime()-days*24*60*60*1000);
  return {begin_date:begin.toISOString(),end_date:end.toISOString()};
}
async function createReport(kind:ReportKind){
  const reports=await listReports(kind);
  const latest=reports[0];
  if(isPending(latest))return {created:false,pending:true,report:summaryReport(latest)};
  const result=await mpRequest(reportBase(kind),{method:"POST",body:JSON.stringify(dateRange(30))});
  const report=(result.data&&typeof result.data==="object"?result.data:{}) as MpReport;
  return {created:true,pending:true,report:summaryReport(report)};
}

function errorResponse(error:unknown){
  if(error instanceof MpUpstreamError){
    const status=error.status===401||error.status===403?502:error.status>=500?502:400;
    return NextResponse.json({ok:false,error:error.message,code:error.code},{status});
  }
  console.error("Erro na integração Mercado Pago:",error instanceof Error?error.message:"erro desconhecido");
  return NextResponse.json({ok:false,error:"Não foi possível consultar o Mercado Pago agora."},{status:500});
}

export async function GET(request:NextRequest){
  if(!(await isAuthorized(request)))return NextResponse.json({ok:false,error:"Sessão inválida. Entre novamente no DMP."},{status:401});
  try{return NextResponse.json({ok:true,...await overview()},{headers:{"Cache-Control":"no-store"}});}catch(error){return errorResponse(error);}
}

export async function POST(request:NextRequest){
  if(!(await isAuthorized(request)))return NextResponse.json({ok:false,error:"Sessão inválida. Entre novamente no DMP."},{status:401});
  try{
    const body=await request.json().catch(()=>({}));
    const action=String(body?.action||"sync");
    if(action!=="setup"&&action!=="sync")return NextResponse.json({ok:false,error:"Ação inválida."},{status:400});
    const setupResults=await Promise.all([ensureConfig("settlement"),ensureConfig("release")]);
    const reports=await Promise.all([createReport("settlement"),createReport("release")]);
    return NextResponse.json({ok:true,action,configured:true,configCreated:setupResults.some(item=>item.created),configUpdated:setupResults.some(item=>item.updated),reports,message:"Sincronização solicitada. O novo relatório usará a leitura inteligente aprimorada e pode levar alguns minutos para ficar pronto."},{status:202});
  }catch(error){return errorResponse(error);}
}
