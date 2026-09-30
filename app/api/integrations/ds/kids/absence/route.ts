import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { applyDsAbsence, validateDsAbsence } from "@/lib/kids/ds-absence";
import { AbsenceError } from "@/lib/kids/individual-absence";
import { computeKidsStudentReplacementBalance } from "@/lib/kids/replacement-balance";
import type { KidsData } from "@/types/kids";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"no-store"}});
export async function POST(request:NextRequest) {
  const expected=process.env.DMP_DS_WRITE_TOKEN?.trim();
  if(!expected) return reply({ok:false,code:"NOT_CONFIGURED",error:"Integração não configurada."},503);
  const authorization=request.headers.get("authorization")||"";
  const received=authorization.startsWith("Bearer ")?authorization.slice(7):"";
  const a=Buffer.from(received),b=Buffer.from(expected);
  if(a.length!==b.length || !timingSafeEqual(a,b)) return reply({ok:false,code:"UNAUTHORIZED",error:"Não autorizado."},401);
  let input;
  try {
    if(!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return reply({ok:false,code:"INVALID_PAYLOAD",error:"Use application/json."},400);
    const reader=request.body?.getReader();
    if(!reader) return reply({ok:false,code:"INVALID_PAYLOAD"},400);
    const chunks:Uint8Array[]=[]; let size=0;
    while(true) { const part=await reader.read(); if(part.done) break;
      size+=part.value.byteLength; if(size>8192) {await reader.cancel();return reply({ok:false,code:"PAYLOAD_TOO_LARGE"},413);} chunks.push(part.value);
    }
    const text=Buffer.concat(chunks).toString("utf8");
    input=validateDsAbsence(JSON.parse(text));
  } catch(error) {return reply({ok:false,code:"INVALID_PAYLOAD",error:error instanceof AbsenceError?error.message:"JSON inválido."},400);}
  const client=await pool.connect();
  try {
    await client.query("BEGIN");
    const result=await client.query("SELECT payload, updated_at FROM dmp_data WHERE id=$1 FOR UPDATE",["kids_v1"]);
    if(!result.rows.length) throw new AbsenceError("NO_KIDS_DATA","Dados Kids não encontrados.",409);
    const applied=applyDsAbsence(result.rows[0].payload as KidsData,input);
    let updatedAt=new Date(result.rows[0].updated_at).toISOString();
    if(!applied.duplicate) {
      const saved=await client.query("UPDATE dmp_data SET payload=$2, updated_at=clock_timestamp() WHERE id=$1 RETURNING updated_at",["kids_v1",JSON.stringify(applied.data)]);
      updatedAt=new Date(saved.rows[0].updated_at).toISOString();
    }
    const balance=computeKidsStudentReplacementBalance(applied.data,input.studentId);
    await client.query("COMMIT");
    return reply({ok:true,key:applied.key,revision:applied.revision,duplicate:applied.duplicate,updatedAt,state:{attendance:input.attendance,replacementRight:input.replacementRight},balance:{due:balance.due,replaced:balance.replaced,balance:balance.balance}});
  } catch(error) {
    await client.query("ROLLBACK");
    if(error instanceof AbsenceError) return reply({ok:false,code:error.code,error:error.message},error.status);
    console.error("Falha na integração DS de faltas Kids.");
    return reply({ok:false,code:"INTERNAL_ERROR",error:"Erro ao consolidar falta Kids."},500);
  } finally {client.release();}
}
