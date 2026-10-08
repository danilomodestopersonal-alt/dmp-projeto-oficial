import {NextRequest,NextResponse} from "next/server";
import {isAuthorized} from "@/lib/auth";
import {pool} from "@/lib/db";
import {compatiblePixRecords,editPixPayer,type PayerState} from "@/lib/financeiro/pix-payer-edit";
import type {FinanceData} from "@/types/financeiro";
export const runtime="nodejs";
const STATE="mercado_pago_reconciliation_v1",FINANCE="finance_v1";
export async function GET(request:NextRequest){
 if(!(await isAuthorized(request)))return NextResponse.json({error:"Sessão inválida."},{status:401});
 try{
 const rows=await pool.query("SELECT id,payload FROM dmp_data WHERE id = ANY($1)",[[STATE,FINANCE]]);
 const state=rows.rows.find(row=>row.id===STATE)?.payload as PayerState|undefined;
 const data=rows.rows.find(row=>row.id===FINANCE)?.payload as FinanceData|undefined;
 return NextResponse.json({records:data&&state?compatiblePixRecords(data,state):[]},{headers:{"Cache-Control":"no-store"}});
 }catch{return NextResponse.json({error:"Não foi possível conferir os vínculos PIX."},{status:500});}
}
export async function PATCH(request:NextRequest){
 if(!(await isAuthorized(request)))return NextResponse.json({error:"Sessão inválida."},{status:401});
 const body=await request.json().catch(()=>null);
 if(!body||typeof body.fingerprint!=="string"||typeof body.payerName!=="string"||typeof body.expectedName!=="string")return NextResponse.json({error:"Edição inválida."},{status:400});
 const client=await pool.connect();
 try{
  await client.query("BEGIN");
  // Same lock order as the reconciliation writer; no Mercado Pago calls.
  const sr=await client.query("SELECT payload FROM dmp_data WHERE id=$1 FOR UPDATE",[STATE]);
  const fr=await client.query("SELECT payload,updated_at FROM dmp_data WHERE id=$1 FOR UPDATE",[FINANCE]);
  const state=sr.rows[0]?.payload as PayerState|undefined,data=fr.rows[0]?.payload as FinanceData|undefined;
  const revision=fr.rows[0]?.updated_at?new Date(fr.rows[0].updated_at).toISOString():null;
  if(!data||!state||!revision||request.headers.get("x-dmp-expected-updated-at")!==revision){await client.query("ROLLBACK");return NextResponse.json({error:"Financeiro alterado. Atualize antes de editar."},{status:409});}
  const result=editPixPayer(data,state,body.fingerprint,body.payerName,body.expectedName,new Date().toISOString());
  await client.query("INSERT INTO dmp_data (id,payload,updated_at) VALUES ($1,$2,NOW()) ON CONFLICT (id) DO NOTHING",["finance_v1_pre_pix_payer_edit",JSON.stringify(data)]);
  await client.query("UPDATE dmp_data SET payload=$2,updated_at=NOW() WHERE id=$1",[STATE,JSON.stringify(result.state)]);
  await client.query("UPDATE dmp_data SET payload=$2,updated_at=NOW() WHERE id=$1",[FINANCE,JSON.stringify(result.data)]);
  await client.query("COMMIT");
  return NextResponse.json({ok:true});
 }catch(error){await client.query("ROLLBACK");return NextResponse.json({error:error instanceof Error&&/^(Vínculo PIX|Registro sem vínculo|O pagador foi|Informe uma identificação)/.test(error.message)?error.message:"Não foi possível salvar o pagador."},{status:400});}
 finally{client.release();}
}
