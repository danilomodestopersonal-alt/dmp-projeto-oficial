import {isAuthorized} from "@/lib/auth";
import {NextRequest,NextResponse} from "next/server";

export const runtime="nodejs";
export const dynamic="force-dynamic";

const MP_API="https://api.mercadopago.com";
const SETTLEMENT_BASE="/v1/account/settlement_report";
const RELEASE_BASE="/v1/account/release_report";

type ReportKind="settlement"|"release";
type AnyRow=Record<string,string>;

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

const settlementColumns=[
  "TRANSACTION_DATE","SOURCE_ID","EXTERNAL_REFERENCE","TRANSACTION_TYPE","TRANSACTION_AMOUNT",
  "SETTLEMENT_NET_AMOUNT","PAYMENT_METHOD","PAYMENT_METHOD_TYPE","DESCRIPTION","METADATA",
  "OPERATION_TAGS","SALE_DETAIL","TRANSACTION_DATE_SHORT"
].map(key=>({key}));

const releaseColumns=[
  "DATE","SOURCE_ID","EXTERNAL_REFERENCE","RECORD_TYPE","DESCRIPTION","NET_CREDIT_AMOUNT",
  "NET_DEBIT_AMOUNT","GROSS_AMOUNT","METADATA","PAYMENT_METHOD","BALANCE_AMOUNT"
].map(key=>({key}));

async function getConfig(kind:ReportKind){
  return mpRequest(`${reportBase(kind)}/config`,{method:"GET"},true);
}

async function ensureConfig(kind:ReportKind){
  const current=await getConfig(kind);
  if(current.ok)return {created:false,data:current.data};
  const body=kind==="settlement"?{
    columns:settlementColumns,
    file_name_prefix:"dmp-settlement-report",
    frequency:{hour:0,value:1,type:"monthly"},
    include_withdraw:true,
    refund_detailed:true,
    show_chargeback_cancel:true
  }:{
    columns:releaseColumns,
    file_name_prefix:"dmp-release-report",
    frequency:{hour:0,value:1,type:"monthly"},
    include_withdrawal_at_end:true,
    check_available_balance:true,
    compensate_detail:true,
    execute_after_withdrawal:false
  };
  const created=await mpRequest(`${reportBase(kind)}/config`,{method:"POST",body:JSON.stringify(body)},true);
  if(created.ok)return {created:true,data:created.data};
  if(created.status===409){
    const retry=await getConfig(kind);
    if(retry.ok)return {created:false,data:retry.data};
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

function reportDate(report:MpReport){
  return String(report.generation_date||report.date_created||report.last_modified||report.end_date||report.begin_date||"");
}

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

function categoryFor(text:string){
  const s=text.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
  const rules:[RegExp,string][]=[
    [/(ifood|restaur|lanch|padar|panif|pizza|subway|mcdon|cafe|food)/,"Alimentação"],
    [/(covabra|supermerc|mercado|mercadinho|hortifruti)/,"Mercado"],
    [/(conectcar|posto|combust|gasolin|uber|99app|estacion|pedagio)/,"Transporte"],
    [/(drogar|farmac|clinica|hospital|saude|medic)/,"Saúde"],
    [/(cinema|pousada|hotel|evento|ingresso|lazer)/,"Lazer"],
    [/(google|amazon|magalu|mercadolivre|shopping|loja|decathlon)/,"Compras"],
    [/(escola|brinquedo|kids|crianca|filho)/,"Filho"],
    [/(tarifa|fee|taxa)/,"Taxas bancárias"]
  ];
  for(const [pattern,category] of rules)if(pattern.test(s))return {category,confidence:94};
  return {category:"Outros",confidence:45};
}

function settlementMovements(rows:AnyRow[]){
  return rows.map((row,index)=>{
    const amount=numberValue(row.SETTLEMENT_NET_AMOUNT)||numberValue(row.REAL_AMOUNT)||numberValue(row.TRANSACTION_AMOUNT);
    if(!amount)return null;
    const date=row.TRANSACTION_DATE||row.SETTLEMENT_DATE||row.TRANSACTION_DATE_SHORT||"";
    const type=row.TRANSACTION_TYPE||"MOVEMENT";
    const primary=row.SALE_DETAIL||row.DESCRIPTION||type;
    const detail=[type,row.PAYMENT_METHOD_TYPE||row.PAYMENT_METHOD,row.EXTERNAL_REFERENCE?`Ref. ${row.EXTERNAL_REFERENCE}`:""].filter(Boolean).join(" · ");
    const suggestion=categoryFor(Object.values(row).join(" "));
    return {
      id:`${row.SOURCE_ID||"mp"}-${date||index}-${index}`,
      sourceId:row.SOURCE_ID||"",
      date,
      description:primary||"Movimentação Mercado Pago",
      detail,
      kind:amount<0?"OUT":"IN",
      amount:Math.abs(amount),
      category:suggestion.category,
      confidence:suggestion.confidence,
      status:suggestion.category==="Outros"?"REVIEW":"AUTO"
    };
  }).filter(Boolean).sort((a,b)=>String((b as any).date).localeCompare(String((a as any).date))).slice(0,300);
}

function releaseBalance(rows:AnyRow[]){
  const withBalance=rows.filter(row=>row.BALANCE_AMOUNT&&Number.isFinite(numberValue(row.BALANCE_AMOUNT)));
  if(withBalance.length){
    const ordered=withBalance.slice().sort((a,b)=>String(a.DATE||"").localeCompare(String(b.DATE||"")));
    return {value:numberValue(ordered[ordered.length-1].BALANCE_AMOUNT),source:"BALANCE_AMOUNT"};
  }
  const initialIndex=rows.findIndex(row=>String(row.RECORD_TYPE||"").toLowerCase()==="initial_available_balance");
  if(initialIndex>=0){
    let balance=numberValue(rows[initialIndex].NET_CREDIT_AMOUNT)-numberValue(rows[initialIndex].NET_DEBIT_AMOUNT);
    for(const row of rows.slice(initialIndex+1)){
      const type=String(row.RECORD_TYPE||"").toLowerCase();
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
  return {
    id:report.report_id??report.id??null,
    status:String(report.status||"unknown"),
    beginDate:report.begin_date||null,
    endDate:report.end_date||null,
    generatedAt:report.generation_date||report.date_created||report.last_modified||null,
    fileName:report.file_name||null
  };
}

async function overview(){
  const [settlementConfig,releaseConfig,settlementReports,releaseReports]=await Promise.all([
    getConfig("settlement"),getConfig("release"),listReports("settlement"),listReports("release")
  ]);
  const configured={settlement:settlementConfig.ok,release:releaseConfig.ok};
  const needsSetup=!configured.settlement||!configured.release;
  const [settlementCsv,releaseCsv]=await Promise.all([
    latestCsv("settlement",settlementReports),latestCsv("release",releaseReports)
  ]);
  const movements=settlementMovements(settlementCsv.rows);
  const balance=releaseBalance(releaseCsv.rows);
  const latestDates=[reportDate(settlementCsv.report||{}),reportDate(releaseCsv.report||{})].filter(Boolean).sort().reverse();
  const pending=isPending(settlementReports[0])||isPending(releaseReports[0]);
  return {
    connected:true,
    needsSetup,
    configured,
    pending,
    balance:balance.value,
    balanceSource:balance.source,
    lastSync:latestDates[0]||null,
    movements,
    reports:{settlement:summaryReport(settlementReports[0]),release:summaryReport(releaseReports[0])},
    firstCollectionNotice:configured.settlement&&movements.length===0,
    readOnly:true
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
  try{
    const data=await overview();
    return NextResponse.json({ok:true,...data},{headers:{"Cache-Control":"no-store"}});
  }catch(error){return errorResponse(error);}
}

export async function POST(request:NextRequest){
  if(!(await isAuthorized(request)))return NextResponse.json({ok:false,error:"Sessão inválida. Entre novamente no DMP."},{status:401});
  try{
    const body=await request.json().catch(()=>({}));
    const action=String(body?.action||"sync");
    if(action!=="setup"&&action!=="sync")return NextResponse.json({ok:false,error:"Ação inválida."},{status:400});
    const setupResults=await Promise.all([ensureConfig("settlement"),ensureConfig("release")]);
    const reports=await Promise.all([createReport("settlement"),createReport("release")]);
    return NextResponse.json({ok:true,action,configured:true,configCreated:setupResults.some(item=>item.created),reports,message:"Sincronização solicitada ao Mercado Pago. Os relatórios podem levar alguns minutos para ficar prontos."},{status:202});
  }catch(error){return errorResponse(error);}
}
