import {createHash} from "crypto";
import {isAuthorized} from "@/lib/auth";
import {NextRequest,NextResponse} from "next/server";
import {pool} from "@/lib/db";
import type {FinanceData,FinanceHistoryEntry} from "@/types/financeiro";

export const runtime="nodejs";
export const dynamic="force-dynamic";

const MP_API="https://api.mercadopago.com";
const SETTLEMENT_BASE="/v1/account/settlement_report";
const RELEASE_BASE="/v1/account/release_report";
const CLASSIFICATION_VERSION="v6-reconciliation-2026-09-18";
const STATE_ID="mercado_pago_reconciliation_v1";
const FINANCE_ID="finance_v1";
const FINANCE_BACKUP_ID="finance_v1_pre_mercado_pago_v6";
const CUTOVER_DATE="2026-09-18";
const AUTOMATIC_REPORT_INTERVAL_MINUTES=180;
const MANUAL_REPORT_COOLDOWN_MINUTES=60;
const MAX_REPORT_CREATIONS_PER_KIND_PER_24_HOURS=4;
const QUOTA_COOLDOWN_HOURS=12;

type ReportKind="settlement"|"release";
type AnyRow=Record<string,string>;
type MoveKind="IN"|"OUT";
type MoveStatus="AUTO_READY"|"REVIEW"|"PROCESSED"|"IGNORED"|"TECHNICAL"|"HISTORICAL";
type TargetType="EXTRA"|"PERSONAL"|"DS"|"EXPENSE"|"TRANSFER"|"IGNORE";
type RuleMode="SUGGEST"|"AUTO";
type RuleChoice="ONCE"|RuleMode;

type LearnedRule={
  key:string;
  label:string;
  kind:MoveKind;
  target:TargetType;
  category?:string;
  targetName?:string;
  mode:RuleMode;
  approvals:number;
  createdAt:string;
  updatedAt:string;
};
type SavedDecision={
  fingerprint:string;
  target:TargetType;
  category?:string;
  targetName?:string;
  financeEntityId?:string;
  automatic:boolean;
  updatedAt:string;
};
type SavedTask={id:string;kind:ReportKind;createdAt:string};
type ReportRequest={at:string;kind:ReportKind};
type MpState={
  version:1;
  rules:Record<string,LearnedRule>;
  decisions:Record<string,SavedDecision>;
  tasks:{settlement?:SavedTask;release?:SavedTask};
  lastReportRequestAt?:string;
  lastReportRequestAtByKind?:Partial<Record<ReportKind,string>>;
  reportRequestHistory?:ReportRequest[];
  quotaBlockedUntil?:string;
  quotaErrorAt?:string;
};
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
type Movement={
  id:string;
  fingerprint:string;
  sourceId:string;
  date:string;
  dateKey:string;
  description:string;
  detail:string;
  operation:string;
  kind:MoveKind;
  amount:number;
  category:string;
  confidence:number;
  reason:string;
  technical:boolean;
  status:MoveStatus;
  suggestedTarget:TargetType;
  suggestedTargetName?:string;
  ruleMode?:RuleMode;
  ruleKey?:string;
  processedAutomatic?:boolean;
  historical:boolean;
  canLearn:boolean;
};

type FinanceContext={
  competence:string|null;
  categories:string[];
  personal:Array<{id:string;studentName:string;expectedAmount:number;paid:number;remaining:number}>;
  expenses:Array<{id:string;name:string;expectedAmount:number;paid:number;remaining:number}>;
};

function emptyState():MpState{return {version:1,rules:{},decisions:{},tasks:{}};}
function reportRequestHistory(value:unknown):ReportRequest[]{
  if(!Array.isArray(value))return [];
  return value.flatMap(item=>{
    if(!item||typeof item!=="object")return [];
    const record=item as Record<string,unknown>;
    const at=typeof record.at==="string"?record.at:"";
    const kind=record.kind==="settlement"||record.kind==="release"?record.kind:null;
    return at&&kind?[{at,kind}]:[];
  });
}
function parseState(raw:unknown):MpState{
  if(!raw||typeof raw!=="object")return emptyState();
  const value=raw as Partial<MpState>;
  return {
    version:1,
    rules:value.rules&&typeof value.rules==="object"?value.rules:{},
    decisions:value.decisions&&typeof value.decisions==="object"?value.decisions:{},
    tasks:value.tasks&&typeof value.tasks==="object"?value.tasks:{},
    lastReportRequestAt:typeof value.lastReportRequestAt==="string"?value.lastReportRequestAt:undefined,
    lastReportRequestAtByKind:value.lastReportRequestAtByKind&&typeof value.lastReportRequestAtByKind==="object"?value.lastReportRequestAtByKind:{},
    reportRequestHistory:reportRequestHistory(value.reportRequestHistory),
    quotaBlockedUntil:typeof value.quotaBlockedUntil==="string"?value.quotaBlockedUntil:undefined,
    quotaErrorAt:typeof value.quotaErrorAt==="string"?value.quotaErrorAt:undefined,
  };
}
async function loadState():Promise<MpState>{
  try{
    const result=await pool.query("SELECT payload FROM dmp_data WHERE id = $1",[STATE_ID]);
    return result.rows.length?parseState(result.rows[0].payload):emptyState();
  }catch(error){
    console.error("Erro ao ler estado Mercado Pago:",error);
    return emptyState();
  }
}
async function deleteLearnedRule(key:string){
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    const result=await client.query("SELECT payload FROM dmp_data WHERE id = $1 FOR UPDATE",[STATE_ID]);
    const state=result.rows.length?parseState(result.rows[0].payload):emptyState();
    if(!state.rules[key]){await client.query("ROLLBACK");return {found:false,count:Object.keys(state.rules).length};}
    delete state.rules[key];
    await client.query(`
      INSERT INTO dmp_data (id,payload,updated_at) VALUES ($1,$2,NOW())
      ON CONFLICT (id) DO UPDATE SET payload=EXCLUDED.payload,updated_at=NOW()
    `,[STATE_ID,JSON.stringify(state)]);
    await client.query("COMMIT");
    return {found:true,count:Object.keys(state.rules).length};
  }catch(error){
    try{await client.query("ROLLBACK");}catch{}
    throw error;
  }finally{client.release();}
}
async function saveReportTracking(source:MpState){
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    const result=await client.query("SELECT payload FROM dmp_data WHERE id = $1 FOR UPDATE",[STATE_ID]);
    const current=result.rows.length?parseState(result.rows[0].payload):emptyState();
    current.tasks=source.tasks;
    current.lastReportRequestAt=source.lastReportRequestAt;
    current.lastReportRequestAtByKind=source.lastReportRequestAtByKind;
    current.reportRequestHistory=source.reportRequestHistory;
    current.quotaBlockedUntil=source.quotaBlockedUntil;
    current.quotaErrorAt=source.quotaErrorAt;
    await client.query(`
      INSERT INTO dmp_data (id,payload,updated_at) VALUES ($1,$2,NOW())
      ON CONFLICT (id) DO UPDATE SET payload=EXCLUDED.payload,updated_at=NOW()
    `,[STATE_ID,JSON.stringify(current)]);
    await client.query("COMMIT");
  }catch(error){
    try{await client.query("ROLLBACK");}catch{}
    throw error;
  }finally{client.release();}
}

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
function configBody(kind:ReportKind){
  if(kind==="settlement")return {
    columns:settlementColumnKeys.map(key=>({key})),file_name_prefix:"dmp-settlement-report",
    frequency:{hour:0,value:1,type:"monthly"},include_withdraw:true,refund_detailed:true,show_chargeback_cancel:true
  };
  return {
    columns:releaseColumnKeys.map(key=>({key})),file_name_prefix:"dmp-release-report",
    frequency:{hour:0,value:1,type:"monthly"},include_withdrawal_at_end:true,check_available_balance:true,compensate_detail:true,execute_after_withdrawal:false
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
  return result.ok?sortReports(asReports(result.data)):[];
}
async function taskReport(kind:ReportKind,taskId:string|undefined){
  if(!taskId)return null;
  const result=await mpRequest(`${reportBase(kind)}/task/${encodeURIComponent(taskId)}`,{method:"GET"},true);
  return result.ok&&result.data&&typeof result.data==="object"?result.data as MpReport:null;
}
function isPending(report:MpReport|undefined|null){
  const s=String(report?.status||"").toLowerCase();
  return ["pending","processing","in_process","in_progress","preparing","data-check","data_check"].some(value=>s.includes(value));
}
function isProcessed(report:MpReport|undefined|null){
  if(!report)return false;
  const s=String(report.status||"").toLowerCase();
  return Boolean(report.file_name)||!s||["processed","ready","done","completed","generated","available"].some(value=>s.includes(value));
}
async function resolveFileName(kind:ReportKind,report:MpReport|undefined|null){
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
  const cleanText=text.replace(/^\uFEFF/,"");
  const firstLine=cleanText.split(/\r?\n/,1)[0]||"";
  const delimiter=countDelimiter(firstLine,";")>countDelimiter(firstLine,",")?";":",";
  const records:string[][]=[];
  let row:string[]=[],field="",quoted=false;
  for(let i=0;i<cleanText.length;i++){
    const ch=cleanText[i];
    if(ch==='"'){
      if(quoted&&cleanText[i+1]==='"'){field+='"';i++;}else quoted=!quoted;
      continue;
    }
    if(ch===delimiter&&!quoted){row.push(field);field="";continue;}
    if((ch==='\n'||ch==='\r')&&!quoted){
      if(ch==='\r'&&cleanText[i+1]==='\n')i++;
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
function normalizeKey(value:string){return normalize(value).replace(/[^a-z0-9]+/g," ").trim();}
function clean(value:string|undefined){return (value||"").trim().replace(/^['"]+|['"]+$/g,"").trim();}
function compactRef(value:string|undefined){const v=clean(value);if(!v)return "";return v.length<=18?`Ref. ${v}`:`Ref. …${v.slice(-10)}`;}
function maskedAccount(value:string|undefined){const digits=(value||"").replace(/\D/g,"");return digits?`Destino •••• ${digits.slice(-4)}`:"";}
function isGenericCandidate(value:string,type:string){
  const n=normalizeKey(value),t=normalizeKey(type);
  return !n||n===t||["settlement","settlements","payout","payouts","movement","movimentacao mercado pago"].includes(n);
}
function meaningfulDescription(row:AnyRow,type:string){
  for(const candidate of [row.SALE_DETAIL,row.STORE_NAME,row.POS_NAME,row.DESCRIPTION]){
    const value=clean(candidate);
    if(value&&!isGenericCandidate(value,type))return value;
  }
  return "";
}
function genericLearningDescription(value:string){
  const n=normalizeKey(value);
  return !n||[
    "pix transferencia enviada","pix transferencia recebida","pagamento transferencia via pix","liquidacao mercado pago",
    "produto sem descricao","transferencia para banco","movimentacao mercado pago"
  ].includes(n);
}
function canLearn(description:string){return normalizeKey(description).length>=4&&!genericLearningDescription(description);}
function ruleKey(description:string,kind:MoveKind){return `${kind}:${normalizeKey(description)}`;}
function movementDateKey(value:string){
  const direct=value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(direct)return `${direct[1]}-${direct[2]}-${direct[3]}`;
  const parsed=new Date(value);
  if(Number.isNaN(parsed.getTime()))return "";
  const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(parsed);
  const read=(type:string)=>parts.find(part=>part.type===type)?.value||"";
  return `${read("year")}-${read("month")}-${read("day")}`;
}
function movementFingerprint(sourceId:string,date:string,kind:MoveKind,amount:number,description:string,type:string){
  if(sourceId)return [sourceId,normalizeKey(type||"movimento"),kind,amount.toFixed(2)].join("|");
  return ["sem-source",date||"sem-data",kind,amount.toFixed(2),normalizeKey(description||type||"movimento")].join("|");
}
function hashId(value:string){return createHash("sha256").update(value).digest("hex").slice(0,24);}
function operationLabel(type:string,kind:MoveKind,paymentType:string,description:string){
  const t=normalizeKey(type),p=normalizeKey(paymentType);
  if(t==="payout"||t==="payouts")return "PIX/transferência enviada";
  if(t==="withdrawal")return "Transferência para banco";
  if(t==="withdrawal cancel")return "Cancelamento de transferência";
  if(t==="refund")return "Estorno/devolução";
  if(t==="cashback")return "Cashback";
  if(t==="chargeback")return "Contestação";
  if(t==="dispute")return "Disputa";
  if(t.includes("trava de recebivel"))return "Trava de recebível";
  if(t==="settlement"&&p==="bank transfer")return kind==="IN"?"PIX/transferência recebida":"Pagamento/transferência via PIX";
  if(t==="settlement")return description||"Liquidação Mercado Pago";
  return description||type||"Movimentação Mercado Pago";
}

type SmartSuggestion={target:TargetType;category?:string;confidence:number;reason:string;autoSafe:boolean};
const smartRules:Array<{pattern:RegExp;category:string;reason:string;confidence:number;autoSafe:boolean}>=[
  {pattern:/(infunger|infanger|covabra|supermerc|mercadinho|hortifruti|atacad|carrefour|assa[ií]|p[aã]o de a[cç][uú]car|mercearia)/,category:"Mercado",reason:"mercado/supermercado reconhecido",confidence:99,autoSafe:true},
  {pattern:/(ifood|ifd\*|restaur|churrasc|marmit|lanch|padar|panif|pizza|pizzar|subway|mcdon|burger|cafeter|boulanger|sushi|confeit|doceria|sorvet)/,category:"Alimentação",reason:"alimentação reconhecida pela descrição",confidence:98,autoSafe:true},
  {pattern:/(conectcar|sem parar|auto ?posto|posto de combust|combust|gasolin|etanol|estacion|ped[aá]gio)/,category:"Transporte",reason:"transporte reconhecido pela descrição",confidence:98,autoSafe:true},
  {pattern:/(drogar|farm[aá]c)/,category:"Saúde",reason:"farmácia/drogaria reconhecida",confidence:98,autoSafe:true},
  {pattern:/(tarifa|fee|taxa|comiss[aã]o)/,category:"Taxas bancárias",reason:"tarifa/taxa identificada",confidence:99,autoSafe:true},
  {pattern:/(clinica|cl[ií]nica|hospital|laborat|odont|dentista)/,category:"Saúde",reason:"saúde reconhecida pela descrição",confidence:94,autoSafe:false},
  {pattern:/(cinema|pousada|hotel|airbnb|booking|evento|ingresso|parque|lazer)/,category:"Lazer",reason:"lazer/viagem reconhecido",confidence:92,autoSafe:false},
  {pattern:/(amazon|magalu|magazine luiza|mercado ?livre|shopping|decathlon|loja|comercio de acessor|camposom)/,category:"Compras",reason:"compra reconhecida pela descrição",confidence:90,autoSafe:false},
];
function smartSuggestion(text:string):SmartSuggestion|null{
  const n=normalizeKey(text);
  for(const rule of smartRules){
    if(rule.pattern.test(n))return {target:"EXTRA",category:rule.category,confidence:rule.confidence,reason:rule.reason,autoSafe:rule.autoSafe};
  }
  return null;
}
function releaseLookup(rows:AnyRow[]){
  const map=new Map<string,AnyRow>();
  for(const row of rows){const id=clean(row.SOURCE_ID);if(id&&!map.has(id))map.set(id,row);}
  return map;
}
function settlementMovements(rows:AnyRow[],releaseRows:AnyRow[],state:MpState):Movement[]{
  const releases=releaseLookup(releaseRows);
  const result:Movement[]=[];
  rows.forEach((row,index)=>{
    const rawAmount=numberValue(row.SETTLEMENT_NET_AMOUNT)||numberValue(row.REAL_AMOUNT)||numberValue(row.TRANSACTION_AMOUNT);
    if(!rawAmount)return;
    const kind:MoveKind=rawAmount<0?"OUT":"IN";
    const amount=Math.abs(rawAmount);
    const rawDate=row.TRANSACTION_DATE||row.SETTLEMENT_DATE||row.TRANSACTION_DATE_SHORT||row.SETTLEMENT_DATE_SHORT||"";
    const dateKey=movementDateKey(rawDate);
    const type=clean(row.TRANSACTION_TYPE)||"MOVEMENT";
    const paymentType=clean(row.PAYMENT_METHOD_TYPE||row.PAYMENT_METHOD);
    const useful=meaningfulDescription(row,type);
    const sourceId=clean(row.SOURCE_ID);
    const release=sourceId?releases.get(sourceId):undefined;
    const payoutAccount=maskedAccount(release?.PAYOUT_BANK_ACCOUNT_NUMBER);
    const typeNorm=normalizeKey(type);
    const fee=Math.abs(numberValue(row.FEE_AMOUNT));
    const fallback=operationLabel(type,kind,paymentType,useful);
    const description=useful||fallback;
    const reference=compactRef(row.EXTERNAL_REFERENCE||row.PURCHASE_ID||row.PAY_BANK_TRANSFER_ID);
    const detail=[operationLabel(type,kind,paymentType,""),paymentType,payoutAccount,reference].filter(Boolean).join(" · ");
    const fingerprint=movementFingerprint(sourceId,rawDate,kind,amount,description,type);
    const historical=Boolean(dateKey&&dateKey<CUTOVER_DATE);

    let technical=false;
    let category="Outros";
    let confidence=35;
    let reason="precisa da sua classificação antes de entrar no Financeiro";
    let status:MoveStatus="REVIEW";
    let suggestedTarget:TargetType=kind==="IN"?"PERSONAL":"EXTRA";
    let suggestedTargetName:string|undefined;
    let learnedMode:RuleMode|undefined;
    let learnedKey:string|undefined;

    if(historical){
      status="HISTORICAL";confidence=100;reason=`histórico anterior ao corte de ${CUTOVER_DATE.split("-").reverse().join("/")}`;
    }else if(["withdrawal","withdrawal cancel","chargeback","dispute","trava de recebivel"].includes(typeNorm)){
      technical=true;status="TECHNICAL";confidence=100;reason="movimento operacional da conta separado do Financeiro";suggestedTarget="IGNORE";
    }else if(!useful&&typeNorm==="settlement"&&amount<=5&&normalizeKey(paymentType)!=="bank transfer"){
      technical=true;status="TECHNICAL";confidence=100;reason="ajuste técnico de liquidação sem descrição comercial";suggestedTarget="IGNORE";
    }else{
      const decision=state.decisions[fingerprint];
      if(decision){
        status=decision.target==="IGNORE"||decision.target==="TRANSFER"?"IGNORED":"PROCESSED";
        suggestedTarget=decision.target;
        category=decision.category||category;
        suggestedTargetName=decision.targetName;
        confidence=100;
        reason=decision.automatic?"processada automaticamente por regra autorizada":"processada após sua confirmação";
      }else if(canLearn(description)&&state.rules[ruleKey(description,kind)]){
        const learned=state.rules[ruleKey(description,kind)];
        learnedKey=learned.key;learnedMode=learned.mode;suggestedTarget=learned.target;category=learned.category||category;suggestedTargetName=learned.targetName;
        confidence=99;reason=learned.mode==="AUTO"?"regra automática autorizada por você":"regra aprendida: sugestão para confirmar";
        status=learned.mode==="AUTO"?"AUTO_READY":"REVIEW";
      }else{
        const smart=smartSuggestion([useful,row.DESCRIPTION,row.SALE_DETAIL,row.STORE_NAME,row.POS_NAME,row.BUSINESS_UNIT,row.SUB_UNIT].filter(Boolean).join(" "));
        if(smart&&kind==="OUT"){
          suggestedTarget=smart.target;category=smart.category||category;confidence=smart.confidence;reason=smart.reason;status=smart.autoSafe?"AUTO_READY":"REVIEW";
        }else if(fee>0&&!useful&&kind==="OUT"){
          suggestedTarget="EXTRA";category="Taxas bancárias";confidence=99;reason="tarifa identificada pelo campo de taxa";status="AUTO_READY";
        }else if(kind==="IN"){
          suggestedTarget="PERSONAL";category="Recebimento";confidence=65;reason="entrada encontrada; escolha Personal, DS, transferência própria ou ignorar";
        }else if(typeNorm==="payout"||typeNorm==="payouts"||normalizeKey(paymentType)==="bank transfer"){
          suggestedTarget="EXTRA";confidence=35;reason="PIX/transferência enviada; a finalidade precisa da sua confirmação";
        }
      }
    }

    result.push({
      id:`${sourceId||"mp"}-${rawDate||index}-${index}`,fingerprint,sourceId,date:rawDate,dateKey,description,detail,operation:type,kind,amount,
      category,confidence,reason,technical,status,suggestedTarget,suggestedTargetName,ruleMode:learnedMode,ruleKey:learnedKey,
      processedAutomatic:Boolean(state.decisions[fingerprint]?.automatic),historical,canLearn:canLearn(description),
    });
  });
  return result.sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,500);
}
function releaseBalance(rows:AnyRow[]){
  const withBalance=rows.filter(row=>row.BALANCE_AMOUNT!==undefined&&row.BALANCE_AMOUNT!==""&&Number.isFinite(numberValue(row.BALANCE_AMOUNT)));
  if(withBalance.length){
    const ordered=withBalance.slice().sort((a,b)=>String(a.DATE||"").localeCompare(String(b.DATE||"")));
    return {value:numberValue(ordered[ordered.length-1].BALANCE_AMOUNT),source:"BALANCE_AMOUNT"};
  }
  const initialIndex=rows.findIndex(row=>normalizeKey(row.RECORD_TYPE||"")==="initial available balance");
  if(initialIndex>=0){
    let balance=numberValue(rows[initialIndex].NET_CREDIT_AMOUNT)-numberValue(rows[initialIndex].NET_DEBIT_AMOUNT);
    for(const row of rows.slice(initialIndex+1)){
      const type=normalizeKey(row.RECORD_TYPE||"");
      if(["total","subtotal","initial available balance","available balance"].includes(type))continue;
      balance+=numberValue(row.NET_CREDIT_AMOUNT)-numberValue(row.NET_DEBIT_AMOUNT);
    }
    return {value:balance,source:"CALCULATED"};
  }
  return {value:null as number|null,source:null as string|null};
}
async function latestCsv(kind:ReportKind,reports:MpReport[],task:MpReport|null=null){
  const processed=(task&&isProcessed(task)?task:null)||reports.find(item=>isProcessed(item));
  if(!processed)return {report:null as MpReport|null,rows:[] as AnyRow[],fileName:null as string|null};
  const fileName=await resolveFileName(kind,processed);
  if(!fileName)return {report:processed,rows:[] as AnyRow[],fileName:null};
  const csv=await downloadCsv(kind,fileName);
  return {report:processed,rows:csv?parseCsv(csv):[],fileName};
}
function summaryReport(report:MpReport|undefined|null){
  if(!report)return null;
  return {id:report.report_id??report.id??null,status:String(report.status||"unknown"),beginDate:report.begin_date||null,endDate:report.end_date||null,generatedAt:report.generation_date||report.date_created||report.last_modified||null,fileName:report.file_name||null};
}
function paid(payments:Array<{amount:number}>|undefined){return (payments||[]).reduce((sum,item)=>sum+Number(item.amount||0),0);}
function financeContext(data:FinanceData|null):FinanceContext{
  if(!data||data.version!==1)return {competence:null,categories:[],personal:[],expenses:[]};
  const competence=data.currentCompetence;
  return {
    competence,
    categories:Array.isArray(data.categories)?data.categories:[],
    personal:data.personalInvoices.filter(item=>item.competence===competence&&!item.excludedFromTotals).map(item=>({id:item.id,studentName:item.studentName,expectedAmount:item.expectedAmount,paid:paid(item.payments),remaining:Math.max(0,item.expectedAmount-paid(item.payments))})).sort((a,b)=>a.studentName.localeCompare(b.studentName,"pt-BR")),
    expenses:data.expenses.filter(item=>item.competence===competence).map(item=>({id:item.id,name:item.name,expectedAmount:item.expectedAmount,paid:paid(item.payments),remaining:Math.max(0,item.expectedAmount-paid(item.payments))})).sort((a,b)=>a.name.localeCompare(b.name,"pt-BR")),
  };
}
async function loadFinance():Promise<FinanceData|null>{
  try{
    const result=await pool.query("SELECT payload FROM dmp_data WHERE id = $1",[FINANCE_ID]);
    const raw=result.rows[0]?.payload as FinanceData|undefined;
    return raw?.version===1?raw:null;
  }catch(error){console.error("Erro ao ler Financeiro para conciliação Mercado Pago:",error);return null;}
}

type OverviewInternal={
  response:Record<string,unknown>;
  movements:Movement[];
  state:MpState;
};
async function buildOverview():Promise<OverviewInternal>{
  const state=await loadState();
  const [settlementConfig,releaseConfig,settlementReports,releaseReports,finance]=await Promise.all([
    getConfig("settlement"),getConfig("release"),listReports("settlement"),listReports("release"),loadFinance()
  ]);
  const [settlementTask,releaseTask]=await Promise.all([
    taskReport("settlement",state.tasks.settlement?.id),taskReport("release",state.tasks.release?.id)
  ]);
  const configured={settlement:settlementConfig.ok,release:releaseConfig.ok};
  const needsSetup=!configured.settlement||!configured.release;
  const configurationOptimized=Boolean(settlementConfig.ok&&releaseConfig.ok&&configOptimized("settlement",settlementConfig.data)&&configOptimized("release",releaseConfig.data));
  const [settlementCsv,releaseCsv]=await Promise.all([
    latestCsv("settlement",settlementReports,settlementTask),latestCsv("release",releaseReports,releaseTask)
  ]);
  const movements=settlementMovements(settlementCsv.rows,releaseCsv.rows,state);
  const balance=releaseBalance(releaseCsv.rows);
  const settlementStatus=settlementTask||settlementReports[0]||null;
  const releaseStatus=releaseTask||releaseReports[0]||null;
  const latestDates=[reportDate(settlementCsv.report||{}),reportDate(releaseCsv.report||{}),reportDate(settlementTask||{}),reportDate(releaseTask||{})].filter(Boolean).sort().reverse();
  const pending=isPending(settlementStatus);
  const learnedRules=Object.values(state.rules).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).slice(0,50);
  const operational=movements.filter(item=>!item.historical&&!item.technical);
  const response={
    connected:true,needsSetup,configured,configurationOptimized,pending,balance:balance.value,balanceSource:balance.source,lastSync:latestDates[0]||null,
    movements,classificationVersion:CLASSIFICATION_VERSION,cutoverDate:CUTOVER_DATE,
    counts:{
      review:operational.filter(item=>item.status==="REVIEW"||item.status==="AUTO_READY").length,
      autoReady:operational.filter(item=>item.status==="AUTO_READY").length,
      processed:operational.filter(item=>item.status==="PROCESSED").length,
      automatic:operational.filter(item=>item.status==="PROCESSED"&&item.processedAutomatic).length,
      technical:movements.filter(item=>item.technical).length,
      historical:movements.filter(item=>item.historical).length,
    },
    learnedRuleCount:Object.keys(state.rules).length,learnedRules,
    reports:{settlement:summaryReport(settlementStatus),release:summaryReport(releaseStatus)},
    firstCollectionNotice:configured.settlement&&movements.length===0,
    financeContext:financeContext(finance),financeConnected:Boolean(finance),readOnly:false,
  };
  return {response,movements,state};
}

function reportUtcDate(value:Date){
  return value.toISOString().replace(/\.\d{3}Z$/,"Z");
}
function dateRange(days=35){
  const end=new Date();
  const begin=new Date(end.getTime()-days*24*60*60*1000);
  return {begin_date:reportUtcDate(begin),end_date:reportUtcDate(end)};
}
function missingDateParameter(error:unknown){
  if(!(error instanceof MpUpstreamError))return false;
  const text=`${error.code} ${error.message}`.toLowerCase();
  return text.includes("begin_date")||text.includes("end_date")||text.includes("invalid_begin_date")||text.includes("invalid_end_date");
}
function validDateMs(value:string|undefined){
  if(!value)return null;
  const parsed=new Date(value).getTime();
  return Number.isFinite(parsed)?parsed:null;
}
function trimReportRequestHistory(state:MpState){
  const cutoff=Date.now()-24*60*60*1000;
  state.reportRequestHistory=(state.reportRequestHistory||[]).filter(item=>{
    const at=validDateMs(item.at);
    return at!==null&&at>=cutoff;
  }).sort((a,b)=>a.at.localeCompare(b.at));
  return state.reportRequestHistory;
}
function quotaCooldown(state:MpState){
  const until=validDateMs(state.quotaBlockedUntil);
  if(until===null||until<=Date.now()){
    state.quotaBlockedUntil=undefined;
    return null;
  }
  return new Date(until).toISOString();
}
function reportQuotaReached(error:unknown){
  if(!(error instanceof MpUpstreamError))return false;
  const text=`${error.code} ${error.message}`.toLowerCase();
  return text.includes("max number of reports")||text.includes("maximum number of reports")||text.includes("reports achieved");
}
function blockReportQuota(state:MpState){
  const now=new Date();
  state.quotaErrorAt=now.toISOString();
  state.quotaBlockedUntil=new Date(now.getTime()+QUOTA_COOLDOWN_HOURS*60*60*1000).toISOString();
  return state.quotaBlockedUntil;
}
function creationCooldown(state:MpState,kind:ReportKind,force:boolean){
  const byKind=state.lastReportRequestAtByKind||{};
  const legacyFallback=Object.keys(byKind).length===0?state.lastReportRequestAt:undefined;
  const at=validDateMs(byKind[kind]||legacyFallback);
  if(at===null)return null;
  const minutes=force?MANUAL_REPORT_COOLDOWN_MINUTES:AUTOMATIC_REPORT_INTERVAL_MINUTES;
  const retryAt=at+minutes*60*1000;
  return retryAt>Date.now()?new Date(retryAt).toISOString():null;
}
function recordReportRequest(state:MpState,kind:ReportKind){
  const at=new Date().toISOString();
  const history=trimReportRequestHistory(state);
  history.push({at,kind});
  state.lastReportRequestAt=at;
  state.lastReportRequestAtByKind={...(state.lastReportRequestAtByKind||{}),[kind]:at};
  state.quotaBlockedUntil=undefined;
  state.quotaErrorAt=undefined;
}
async function createReport(kind:ReportKind,state:MpState,force:boolean){
  const savedTask=state.tasks[kind];
  if(savedTask){
    const task=await taskReport(kind,savedTask.id);
    if(task&&isPending(task))return {created:false,pending:true,report:summaryReport(task),taskId:savedTask.id,reason:"pending"};
  }
  const reports=await listReports(kind);
  const latest=reports[0];
  if(isPending(latest)){
    const id=latest.id??latest.report_id;
    if(id!==undefined&&id!==null)state.tasks[kind]={id:String(id),kind,createdAt:new Date().toISOString()};
    return {created:false,pending:true,report:summaryReport(latest),taskId:id??null,reason:"pending"};
  }
  const blockedUntil=quotaCooldown(state);
  if(blockedUntil)return {created:false,pending:false,report:summaryReport(latest),taskId:null,reason:"quota-cooldown",retryAt:blockedUntil};
  const retryAt=creationCooldown(state,kind,force);
  if(retryAt)return {created:false,pending:false,report:summaryReport(latest),taskId:null,reason:"cooldown",retryAt};
  const kindHistory=trimReportRequestHistory(state).filter(item=>item.kind===kind);
  if(kindHistory.length>=MAX_REPORT_CREATIONS_PER_KIND_PER_24_HOURS){
    const oldest=kindHistory[0];
    const oldestAt=validDateMs(oldest?.at);
    const dailyRetryAt=new Date((oldestAt??Date.now())+24*60*60*1000).toISOString();
    return {created:false,pending:false,report:summaryReport(latest),taskId:null,reason:"daily-cap",retryAt:dailyRetryAt};
  }
  const range=dateRange();
  let result;
  try{
    result=await mpRequest(reportBase(kind),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(range)});
  }catch(error){
    if(reportQuotaReached(error)){
      const retryAt=blockReportQuota(state);
      return {created:false,pending:false,report:summaryReport(latest),taskId:null,reason:"quota-cooldown",retryAt};
    }
    if(!missingDateParameter(error))throw error;
    const query=`?begin_date=${encodeURIComponent(range.begin_date)}&end_date=${encodeURIComponent(range.end_date)}`;
    try{
      result=await mpRequest(`${reportBase(kind)}${query}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(range)});
    }catch(retryError){
      if(reportQuotaReached(retryError)){
        const retryAt=blockReportQuota(state);
        return {created:false,pending:false,report:summaryReport(latest),taskId:null,reason:"quota-cooldown",retryAt};
      }
      throw retryError;
    }
  }
  const report=(result.data&&typeof result.data==="object"?result.data:{}) as MpReport;
  const id=report.id??report.report_id;
  if(id!==undefined&&id!==null)state.tasks[kind]={id:String(id),kind,createdAt:new Date().toISOString()};
  recordReportRequest(state,kind);
  return {created:true,pending:true,report:summaryReport(report),taskId:id??null,reason:"created"};
}
function financeHistory(id:string,competence:string,kind:FinanceHistoryEntry["kind"],description:string,amount:number|undefined,entityId:string):FinanceHistoryEntry{
  return {id:`history-${id}`,occurredAt:new Date().toISOString(),competence,kind,description,amount,entityId};
}
function resolvePersonal(data:FinanceData,competence:string,targetId?:string,targetName?:string){
  const byId=targetId?data.personalInvoices.find(item=>item.id===targetId&&item.competence===competence&&!item.excludedFromTotals):undefined;
  if(byId)return byId;
  const key=normalizeKey(targetName||"");
  if(!key)return undefined;
  const matches=data.personalInvoices.filter(item=>item.competence===competence&&!item.excludedFromTotals&&normalizeKey(item.studentName)===key);
  return matches.length===1?matches[0]:undefined;
}
function resolveExpense(data:FinanceData,competence:string,targetId?:string,targetName?:string){
  const byId=targetId?data.expenses.find(item=>item.id===targetId&&item.competence===competence):undefined;
  if(byId)return byId;
  const key=normalizeKey(targetName||"");
  if(!key)return undefined;
  const matches=data.expenses.filter(item=>item.competence===competence&&normalizeKey(item.name)===key);
  return matches.length===1?matches[0]:undefined;
}
function validateTarget(kind:MoveKind,target:TargetType){
  if(kind==="IN")return ["PERSONAL","DS","TRANSFER","IGNORE"].includes(target);
  return ["EXTRA","EXPENSE","TRANSFER","IGNORE"].includes(target);
}
function applyToFinance(data:FinanceData,move:Movement,target:TargetType,options:{category?:string;targetId?:string;targetName?:string}){
  const competence=(move.dateKey||CUTOVER_DATE).slice(0,7);
  if(!data.competences?.[competence])return {ok:false as const,error:`A competência ${competence} não existe no Financeiro.`};
  if(data.competences[competence]?.status==="CLOSED")return {ok:false as const,error:`A competência ${competence} está fechada no Financeiro.`};
  const unique=hashId(`${move.fingerprint}|${target}|${options.targetName||options.targetId||options.category||""}`);
  const note=`Mercado Pago · ${move.description}${move.sourceId?` · ref. ${move.sourceId}`:""}`;

  if(target==="TRANSFER"||target==="IGNORE")return {ok:true as const,data,changed:false,entityId:undefined,targetName:options.targetName};
  if(target==="EXTRA"){
    if(move.kind!=="OUT")return {ok:false as const,error:"Gasto extra só pode ser usado em uma saída."};
    const category=(options.category||"Outros").trim()||"Outros";
    const id=`mp-extra-${unique}`;
    if(data.extraExpenses.some(item=>item.id===id))return {ok:true as const,data,changed:false,entityId:id,targetName:move.description};
    const categories=data.categories.includes(category)?data.categories:[...data.categories,category].sort((a,b)=>a.localeCompare(b,"pt-BR"));
    const next:FinanceData={
      ...data,categories,
      extraExpenses:[...data.extraExpenses,{id,competence,date:move.dateKey||CUTOVER_DATE,description:move.description,category,paymentMethod:"Mercado Pago",amount:move.amount}],
      history:[...(data.history||[]),financeHistory(`mp-${unique}`,competence,"EXTRA_CREATED",`Mercado Pago · gasto extra ${move.description} criado.`,move.amount,id)],
    };
    return {ok:true as const,data:next,changed:true,entityId:id,targetName:move.description};
  }
  if(target==="DS"){
    if(move.kind!=="IN")return {ok:false as const,error:"Recebimento DS só pode ser usado em uma entrada."};
    const id=`mp-ds-${unique}`;
    if(Object.values(data.dsReceipts||{}).flat().some(item=>item.id===id))return {ok:true as const,data,changed:false,entityId:id,targetName:move.description};
    const receipt={id,date:move.dateKey||CUTOVER_DATE,amount:move.amount,sourceName:move.description,note};
    const next:FinanceData={
      ...data,dsReceipts:{...data.dsReceipts,[competence]:[...(data.dsReceipts[competence]||[]),receipt]},
      history:[...(data.history||[]),financeHistory(`mp-${unique}`,competence,"DS_RECEIPT_ADDED",`Mercado Pago · recebimento DS registrado · ${move.description}.`,move.amount,id)],
    };
    return {ok:true as const,data:next,changed:true,entityId:id,targetName:move.description};
  }
  if(target==="PERSONAL"){
    if(move.kind!=="IN")return {ok:false as const,error:"Recebimento Personal só pode ser usado em uma entrada."};
    const invoice=resolvePersonal(data,competence,options.targetId,options.targetName);
    if(!invoice)return {ok:false as const,error:"Não encontrei uma mensalidade Personal única para esta movimentação. Escolha o aluno novamente."};
    const paymentId=`mp-payment-${unique}`;
    if(invoice.payments.some(item=>item.id===paymentId))return {ok:true as const,data,changed:false,entityId:invoice.id,targetName:invoice.studentName};
    const open=Math.max(0,invoice.expectedAmount-paid(invoice.payments));
    if(open<=0.005)return {ok:false as const,error:`${invoice.studentName} já está quitado nesta competência.`};
    if(move.amount>open+0.005)return {ok:false as const,error:`O PIX de ${move.amount.toFixed(2)} é maior que o saldo em aberto de ${open.toFixed(2)} para ${invoice.studentName}.`};
    const payment={id:paymentId,date:move.dateKey||CUTOVER_DATE,amount:move.amount,note};
    const next:FinanceData={
      ...data,personalInvoices:data.personalInvoices.map(item=>item.id===invoice.id?{...item,payments:[...item.payments,payment]}:item),
      history:[...(data.history||[]),financeHistory(`mp-${unique}`,competence,"PERSONAL_PAYMENT_ADDED",`Mercado Pago · recebimento de ${invoice.studentName} registrado.`,move.amount,invoice.id)],
    };
    return {ok:true as const,data:next,changed:true,entityId:invoice.id,targetName:invoice.studentName};
  }
  if(target==="EXPENSE"){
    if(move.kind!=="OUT")return {ok:false as const,error:"Conta do plano só pode ser usada em uma saída."};
    const expense=resolveExpense(data,competence,options.targetId,options.targetName);
    if(!expense)return {ok:false as const,error:"Não encontrei uma conta única do plano para esta movimentação. Escolha a conta novamente."};
    const paymentId=`mp-payment-${unique}`;
    if(expense.payments.some(item=>item.id===paymentId))return {ok:true as const,data,changed:false,entityId:expense.id,targetName:expense.name};
    const open=Math.max(0,expense.expectedAmount-paid(expense.payments));
    if(open<=0.005)return {ok:false as const,error:`A conta ${expense.name} já está quitada nesta competência.`};
    if(move.amount>open+0.005)return {ok:false as const,error:`O PIX de ${move.amount.toFixed(2)} é maior que o saldo em aberto de ${open.toFixed(2)} da conta ${expense.name}.`};
    const payment={id:paymentId,date:move.dateKey||CUTOVER_DATE,amount:move.amount,note};
    const next:FinanceData={
      ...data,expenses:data.expenses.map(item=>item.id===expense.id?{...item,payments:[...item.payments,payment]}:item),
      history:[...(data.history||[]),financeHistory(`mp-${unique}`,competence,"EXPENSE_PAYMENT_ADDED",`Mercado Pago · pagamento de ${expense.name} registrado.`,move.amount,expense.id)],
    };
    return {ok:true as const,data:next,changed:true,entityId:expense.id,targetName:expense.name};
  }
  return {ok:false as const,error:"Destino financeiro inválido."};
}
function ruleFromChoice(move:Movement,target:TargetType,mode:RuleMode,options:{category?:string;targetName?:string},current?:LearnedRule):LearnedRule{
  const now=new Date().toISOString();
  const key=ruleKey(move.description,move.kind);
  return {key,label:move.description,kind:move.kind,target,category:options.category||undefined,targetName:options.targetName||undefined,mode,approvals:(current?.approvals||0)+1,createdAt:current?.createdAt||now,updatedAt:now};
}
async function persistDecision(move:Movement,target:TargetType,options:{category?:string;targetId?:string;targetName?:string;ruleChoice:RuleChoice;automatic:boolean}){
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    const stateResult=await client.query("SELECT payload FROM dmp_data WHERE id = $1 FOR UPDATE",[STATE_ID]);
    const state=stateResult.rows.length?parseState(stateResult.rows[0].payload):emptyState();
    if(state.decisions[move.fingerprint]){
      await client.query("ROLLBACK");
      return {ok:true,already:true,decision:state.decisions[move.fingerprint]};
    }
    const financeResult=await client.query("SELECT payload FROM dmp_data WHERE id = $1 FOR UPDATE",[FINANCE_ID]);
    const finance=financeResult.rows[0]?.payload as FinanceData|undefined;
    if(!finance||finance.version!==1){await client.query("ROLLBACK");return {ok:false,error:"Financeiro oficial não está disponível para conciliação."};}
    const applied=applyToFinance(finance,move,target,{category:options.category,targetId:options.targetId,targetName:options.targetName});
    if(!applied.ok){await client.query("ROLLBACK");return {ok:false,error:applied.error};}
    if(applied.changed){
      await client.query(`
        INSERT INTO dmp_data (id,payload,updated_at) VALUES ($1,$2,NOW())
        ON CONFLICT (id) DO NOTHING
      `,[FINANCE_BACKUP_ID,JSON.stringify(finance)]);
      await client.query("UPDATE dmp_data SET payload=$2, updated_at=NOW() WHERE id=$1",[FINANCE_ID,JSON.stringify(applied.data)]);
    }
    const decision:SavedDecision={fingerprint:move.fingerprint,target,category:options.category||undefined,targetName:applied.targetName||options.targetName||undefined,financeEntityId:applied.entityId,automatic:options.automatic,updatedAt:new Date().toISOString()};
    state.decisions[move.fingerprint]=decision;
    if(options.ruleChoice!=="ONCE"&&move.canLearn){
      const key=ruleKey(move.description,move.kind);
      state.rules[key]=ruleFromChoice(move,target,options.ruleChoice,{category:options.category,targetName:applied.targetName||options.targetName},state.rules[key]);
    }
    await client.query(`INSERT INTO dmp_data (id,payload,updated_at) VALUES ($1,$2,NOW()) ON CONFLICT (id) DO UPDATE SET payload=EXCLUDED.payload,updated_at=NOW()`,[STATE_ID,JSON.stringify(state)]);
    await client.query("COMMIT");
    return {ok:true,already:false,decision,financeChanged:applied.changed,learned:options.ruleChoice!=="ONCE"&&move.canLearn};
  }catch(error){
    try{await client.query("ROLLBACK");}catch{}
    throw error;
  }finally{client.release();}
}
function autoTargetOptions(move:Movement,state:MpState){
  const learned=move.canLearn?state.rules[ruleKey(move.description,move.kind)]:undefined;
  if(learned?.mode==="AUTO")return {target:learned.target,category:learned.category,targetName:learned.targetName,source:"learned"};
  if(move.status==="AUTO_READY"&&move.suggestedTarget==="EXTRA")return {target:"EXTRA" as const,category:move.category,targetName:undefined,source:"builtin"};
  return null;
}
async function processAutomatic(movements:Movement[]){
  const state=await loadState();
  let processed=0,blocked=0;
  const errors:string[]=[];
  for(const move of movements){
    if(move.historical||move.technical||state.decisions[move.fingerprint])continue;
    const auto=autoTargetOptions(move,state);
    if(!auto)continue;
    const result=await persistDecision(move,auto.target,{category:auto.category,targetName:auto.targetName,ruleChoice:"ONCE",automatic:true});
    if(result.ok){processed++;state.decisions[move.fingerprint]=result.decision as SavedDecision;}
    else{blocked++;if(result.error)errors.push(`${move.description}: ${result.error}`);}
  }
  return {processed,blocked,errors:errors.slice(0,5)};
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
  try{return NextResponse.json({ok:true,...(await buildOverview()).response},{headers:{"Cache-Control":"no-store"}});}catch(error){return errorResponse(error);}
}

export async function POST(request:NextRequest){
  if(!(await isAuthorized(request)))return NextResponse.json({ok:false,error:"Sessão inválida. Entre novamente no DMP."},{status:401});
  try{
    const body=await request.json().catch(()=>({}));
    const action=String(body?.action||"sync");

    if(action==="decision"){
      const fingerprint=String(body?.fingerprint||"").trim();
      const target=String(body?.target||"").toUpperCase() as TargetType;
      const category=String(body?.category||"").trim();
      const targetId=String(body?.targetId||"").trim();
      const targetName=String(body?.targetName||"").trim();
      const ruleChoice=String(body?.ruleChoice||"ONCE").toUpperCase() as RuleChoice;
      if(!fingerprint||!["EXTRA","PERSONAL","DS","EXPENSE","TRANSFER","IGNORE"].includes(target)||!["ONCE","SUGGEST","AUTO"].includes(ruleChoice))return NextResponse.json({ok:false,error:"Decisão inválida."},{status:400});
      const snapshot=await buildOverview();
      const move=snapshot.movements.find(item=>item.fingerprint===fingerprint);
      if(!move)return NextResponse.json({ok:false,error:"Movimentação não encontrada no relatório atual. Atualize a leitura e tente novamente."},{status:404});
      if(move.historical)return NextResponse.json({ok:false,error:"Movimentações anteriores ao corte de 18/09/2026 ficam apenas no histórico."},{status:400});
      if(move.technical)return NextResponse.json({ok:false,error:"Este movimento é técnico e não precisa ser lançado no Financeiro."},{status:400});
      if(!validateTarget(move.kind,target))return NextResponse.json({ok:false,error:"Esse tratamento não combina com o tipo da movimentação."},{status:400});
      if(target==="EXTRA"&&!category)return NextResponse.json({ok:false,error:"Escolha a categoria do gasto extra."},{status:400});
      if(target==="PERSONAL"&&!targetId&&!targetName)return NextResponse.json({ok:false,error:"Escolha o aluno do Personal."},{status:400});
      if(target==="EXPENSE"&&!targetId&&!targetName)return NextResponse.json({ok:false,error:"Escolha a conta do plano."},{status:400});
      if(ruleChoice!=="ONCE"&&!move.canLearn)return NextResponse.json({ok:false,error:"A descrição desta movimentação é genérica demais para criar uma regra. A decisão pode valer somente para esta transação."},{status:400});
      const result=await persistDecision(move,target,{category,targetId,targetName,ruleChoice,automatic:false});
      if(!result.ok)return NextResponse.json({ok:false,error:result.error},{status:400});
      return NextResponse.json(result);
    }

    if(action==="delete-rule"){
      const key=String(body?.key||"").trim();
      if(!key)return NextResponse.json({ok:false,error:"Regra inválida."},{status:400});
      const result=await deleteLearnedRule(key);
      if(!result.found)return NextResponse.json({ok:false,error:"Regra não encontrada."},{status:404});
      return NextResponse.json({ok:true,learnedRuleCount:result.count});
    }

    if(action==="process-auto"){
      const snapshot=await buildOverview();
      const result=await processAutomatic(snapshot.movements);
      return NextResponse.json(result);
    }

    if(action!=="setup"&&action!=="sync")return NextResponse.json({ok:false,error:"Ação inválida."},{status:400});
    const force=Boolean(body?.force);
    const snapshot=await buildOverview();
    const auto=await processAutomatic(snapshot.movements);
    const state=await loadState();
    const setupResults=await Promise.all([ensureConfig("settlement"),ensureConfig("release")]);
    const reports:Array<Record<string,unknown>>=[];
    const failures:unknown[]=[];
    for(const kind of ["settlement","release"] as ReportKind[]){
      try{reports.push(await createReport(kind,state,force));}
      catch(error){
        failures.push(error);
        reports.push({created:false,pending:false,report:null,taskId:null,reason:"error",kind,error:error instanceof Error?error.message:"Falha ao solicitar relatório."});
      }
    }
    if(failures.length===2)throw failures[0];
    await saveReportTracking(state);
    const partial=failures.length>0;
    const protectedReason=reports.find(item=>["quota-cooldown","daily-cap","cooldown"].includes(String(item.reason||"")))?.reason;
    const message=protectedReason==="quota-cooldown"
      ?"O Mercado Pago limitou temporariamente novos relatórios. O DMP pausou as tentativas e continuará usando os últimos dados disponíveis."
      :protectedReason==="daily-cap"
        ?"Limite interno de segurança atingido. O DMP continuará consultando os relatórios existentes sem criar novos até a liberação."
        :protectedReason==="cooldown"
          ?"Verificação concluída. O próximo relatório novo respeitará o intervalo seguro configurado."
          :partial
            ?"Sincronização parcial: um dos relatórios do Mercado Pago ainda não respondeu. O DMP continuará usando o relatório disponível e tentará o outro novamente."
            :"Sincronização solicitada. O DMP acompanhará as tarefas sem duplicar relatórios em processamento.";
    return NextResponse.json({ok:true,action,configured:true,configCreated:setupResults.some(item=>item.created),configUpdated:setupResults.some(item=>item.updated),reports,auto,partial,protected:Boolean(protectedReason),message},{status:202});
  }catch(error){return errorResponse(error);}
}
