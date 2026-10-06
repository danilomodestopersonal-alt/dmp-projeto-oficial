'use strict';
// Rotina isolada: GET direto na API; sem import do DMP, banco, sync ou configuração.
const API='https://api.mercadopago.com';
const bases={settlement:'/v1/account/settlement_report',release:'/v1/account/release_report'};
function reports(data){if(Array.isArray(data))return data.filter(x=>x&&typeof x==='object');for(const k of ['results','reports','data'])if(Array.isArray(data?.[k]))return reports(data[k]);return data&&typeof data==='object'&&(data.file_name||data.id||data.report_id)?[data]:[];}
function reportDate(r){return String(r.generation_date||r.date_created||r.last_modified||r.end_date||r.begin_date||'');}
function processed(r){const s=String(r.status||'').toLowerCase();if(/pending|processing|in_process|in_progress|preparing|data.check/.test(s))return false;return /^(processed|ready|done|completed|generated|available)$/.test(s)||(!s&&Boolean(r.file_name));}
function parseCsv(text){const clean=text.replace(/^\uFEFF/,''),line=clean.split(/\r?\n/)[0]||'';let quoted=false,counts={';':0,',':0,'\t':0};for(let i=0;i<line.length;i++){const ch=line[i];if(ch==='"'){if(quoted&&line[i+1]==='"'){i++;continue;}quoted=!quoted;}else if(!quoted&&ch in counts)counts[ch]++;}const delimiter=Object.keys(counts).sort((a,b)=>counts[b]-counts[a])[0];const records=[];let row=[],field='';quoted=false;for(let i=0;i<clean.length;i++){const ch=clean[i];if(ch==='"'){if(quoted&&clean[i+1]==='"'){field+='"';i++;}else quoted=!quoted;continue;}if(ch===delimiter&&!quoted){row.push(field);field='';continue;}if((ch==='\r'||ch==='\n')&&!quoted){if(ch==='\r'&&clean[i+1]==='\n')i++;row.push(field);if(row.some(Boolean))records.push(row);row=[];field='';continue;}field+=ch;}if(quoted)throw new Error('CSV_INCOMPLETO');if(field||row.length){row.push(field);records.push(row);}const header=records.shift()||[];return {delimiter,header,rows:records.map(values=>Object.fromEntries(header.map((key,i)=>[key,values[i]??''])))};}
function number(v){const s=String(v||'').trim().replace(/\s/g,'');const n=Number(s.includes(',')&&!s.includes('.')?s.replace(',','.'):s.replace(/,/g,''));return Number.isFinite(n)?n:0;}
function classify(kind,row){const r=Object.fromEntries(Object.entries(row).map(([k,v])=>[k.trim().toUpperCase(),v]));const amount=kind==='settlement'?(number(r.SETTLEMENT_NET_AMOUNT)||number(r.REAL_AMOUNT)||number(r.TRANSACTION_AMOUNT)):(Math.abs(number(r.NET_CREDIT_AMOUNT))-Math.abs(number(r.NET_DEBIT_AMOUNT))||(String(r.RECORD_TYPE||'').toLowerCase()==='release'?number(r.GROSS_AMOUNT):0));if(amount<=0)return null;const marker=[r.PAYMENT_METHOD,r.PAYMENT_METHOD_TYPE,r.TRANSACTION_TYPE,r.RECORD_TYPE,r.DESCRIPTION,r.SALE_DETAIL].filter(Boolean).join(' ').toLowerCase();if(/\bpix\b/.test(marker))return 'PIX_EXPLICITO';if(/bank[_ ]transfer|payout|transfer[eê]ncia/.test(marker))return 'TRANSFERENCIA_ENTRADA_A_CONFIRMAR';return null;}
const secretKey=k=>/(^|[_ -])token($|[_ -])|private[_ -]?key|authorization|(?:access|refresh)[_ -]?token|client[_ -]?secret|password|senha|api[_ -]?key|credential|credencial|(^|[_ -])secret($|[_ -])/i.test(k);
function scrub(value,token){if(typeof value==='string')return value.split(token).join('[CREDENCIAL_REMOVIDA]').replace(/Bearer\s+[^\s"',;]+/gi,'Bearer [CREDENCIAL_REMOVIDA]');if(Array.isArray(value))return value.map(x=>scrub(x,token));if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,secretKey(k)?'[CREDENCIAL_REMOVIDA]':scrub(v,token)]));return value;}
function sanitizeRow(row,token){return Object.fromEntries(Object.entries(row).map(([k,v])=>{if(secretKey(k))return [k,'[CREDENCIAL_REMOVIDA]'];if(k.trim().toUpperCase()==='METADATA'){try{const parsed=JSON.parse(v),safe=scrub(parsed,token);return[k,JSON.stringify(parsed)===JSON.stringify(safe)?scrub(v,token):JSON.stringify(safe)];}catch{return[k,scrub(v,token).replace(/((?:access[_ -]?token|refresh[_ -]?token|authorization|client[_ -]?secret|password|api[_ -]?key)\s*[:=]\s*)[^\s,;]+/gi,'$1[CREDENCIAL_REMOVIDA]')];}}return[k,scrub(v,token)];}));}
async function collect(token,fetcher=fetch){if(!token)throw new Error('CREDENCIAL_AUSENTE_NO_RENDER');async function get(path,csv=false){const url=new URL(API+path);if(url.origin!==API||!Object.values(bases).some(base=>url.pathname.startsWith(base+'/')))throw new Error('CAMINHO_NAO_AUTORIZADO');const response=await fetcher(url.href,{method:'GET',headers:{Authorization:'Bearer '+token,Accept:csv?'text/csv,application/octet-stream,*/*':'application/json'},redirect:'error',cache:'no-store',signal:AbortSignal.timeout(30000)});if(!response.ok)throw new Error('MP_HTTP_'+response.status);return csv?response.text():response.json();}
const result={collectedAt:new Date().toISOString(),readOnly:true,source:'Relatórios existentes na API Mercado Pago',reports:[]};for(const [kind,base] of Object.entries(bases)){try{const all=reports(await get(base+'/list')).sort((a,b)=>reportDate(b).localeCompare(reportDate(a)));const selected=all.find(processed);if(!selected){result.reports.push({kind,status:'SEM_RELATORIO_PROCESSADO'});continue;}let name=selected.file_name;if(!name){const id=selected.report_id??selected.id;if(id!==undefined)name=reports(await get(base+'/search?id='+encodeURIComponent(String(id)))).find(x=>x.file_name)?.file_name;}if(!name){result.reports.push({kind,reportId:selected.report_id??selected.id,status:'SEM_FILE_NAME'});continue;}const csv=parseCsv(await get(base+'/'+encodeURIComponent(String(name)),true));const candidates=csv.rows.map(row=>({row,selection:classify(kind,row)})).filter(x=>x.selection);const withMetadata=candidates.filter(x=>Object.entries(x.row).some(([k,v])=>k.trim().toUpperCase()==='METADATA'&&v.trim()));const withoutMetadata=candidates.filter(x=>!withMetadata.includes(x));const chosen=[...withMetadata.slice(0,8),...withoutMetadata.slice(0,2)];if(chosen.length<10)for(const x of candidates)if(!chosen.includes(x)&&chosen.length<10)chosen.push(x);result.reports.push({kind,reportId:selected.report_id??selected.id,fileName:String(name),reportStatus:selected.status||null,reportDate:reportDate(selected),beginDate:selected.begin_date||null,endDate:selected.end_date||null,header:csv.header,delimiter:csv.delimiter,totalRows:csv.rows.length,candidateIncomingRows:candidates.length,status:chosen.length?'AMOSTRA_COLETADA':'SEM_PIX_OU_TRANSFERENCIA_DE_ENTRADA_NESTE_RELATORIO',sample:chosen.map(x=>({selection:x.selection,fields:sanitizeRow(x.row,token)}))});}catch(e){const message=String(e?.message||'');result.reports.push({kind,status:'ERRO',error:/^(MP_HTTP_\d+|CSV_INCOMPLETO|CAMINHO_NAO_AUTORIZADO)$/.test(message)?message:'FALHA_DE_LEITURA_OU_TIMEOUT'});}}
return scrub(result,token);}

function individualChecks(fields,identifier,payment){
 const amount=Number(payment.transaction_amount),expected=Number(fields.TRANSACTION_AMOUNT);
 const time=Date.parse(fields.TRANSACTION_DATE),times=[payment.date_approved,payment.date_created].map(Date.parse).filter(Number.isFinite);
 const sourceMatches=String(payment.id)===String(fields.SOURCE_ID);
 const checks={returnedIdMatchesRequest:String(payment.id)===identifier,sourceMatches,pix:String(payment.payment_method_id||payment.payment_method?.id||'').toLowerCase()==='pix',amountMatches:Number.isFinite(amount)&&Math.abs(amount-expected)<0.005,dateMatches:Number.isFinite(time)&&times.some(t=>Math.abs(t-time)<=300000)};
 return {...checks,linkVerified:checks.returnedIdMatchesRequest&&checks.sourceMatches&&checks.pix&&checks.amountMatches&&checks.dateMatches};
}
async function auditIndividual(token){
 if(!token||/\s/.test(token))throw new Error('TOKEN_INDISPONIVEL');
 const report=await collect(token),settlement=report.reports.find(r=>r.kind==='settlement');
 const selected=(settlement?.sample||[]).filter(x=>x.selection==='PIX_EXPLICITO').slice(0,3);
 const output={collectedAt:new Date().toISOString(),readOnly:true,source:'GET individual /v1/payments/{id}; IDs candidatos, sem assumir equivalência',report:{reportId:settlement?.reportId,fileName:settlement?.fileName,status:settlement?.status},transactions:[],conclusion:'Pendente de análise das respostas individuais; erros de acesso não provam ausência de pagador.'};
 let stop=false;
 for(const item of selected){
  const fields=item.fields,entry={original:fields,queries:[]};output.transactions.push(entry);
  for(const [identifierField,id] of [['SOURCE_ID',fields.SOURCE_ID],['PAY_BANK_TRANSFER_ID',fields.PAY_BANK_TRANSFER_ID]]){
   if(stop)break;
   if(!/^\d{1,30}$/.test(String(id||''))){entry.queries.push({identifierField,status:'ID_NAO_NUMERICO_OU_AUSENTE'});continue;}
   const path='/v1/payments/'+id;const query={identifierField,candidateId:id,path,status:'PENDENTE'};entry.queries.push(query);
   try{
    const response=await fetch(API+path,{method:'GET',headers:{Authorization:'Bearer '+token},redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000)});
    query.httpStatus=response.status;
    if(!response.ok){query.status='HTTP_'+response.status;if([401,403,429].includes(response.status))stop=true;continue;}
    const data=await response.json();query.status='RESPOSTA_INDIVIDUAL';query.checks=individualChecks(fields,String(id),data);query.response=scrub(data,token);
    if(query.checks.linkVerified)break;
   }catch{query.status='FALHA_DE_LEITURA_OU_TIMEOUT';}
  }
 }
 return scrub(output,token);
}
module.exports={collect,auditIndividual,individualChecks,parseCsv,classify,sanitizeRow,processed};
