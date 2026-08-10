import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import type { KidsData } from "@/types/kids";

export const runtime="nodejs";
const DATA_ID="kids_v1";

export async function GET(){
  try{const result=await pool.query("SELECT payload, updated_at FROM dmp_data WHERE id = $1",[DATA_ID]);return NextResponse.json({ok:true,data:result.rows[0]?.payload||null,updatedAt:result.rows[0]?.updated_at||null});}
  catch(error){console.error("Erro ao ler Aulas Kids:",error);return NextResponse.json({ok:false,data:null,error:"Erro ao ler Aulas Kids."},{status:500});}
}

export async function PUT(request:NextRequest){
  try{const body=await request.json() as KidsData;if(!body||body.version!==1||!Array.isArray(body.classes)||!Array.isArray(body.lessons))return NextResponse.json({ok:false,error:"Formato inválido."},{status:400});const result=await pool.query(`INSERT INTO dmp_data (id,payload,updated_at) VALUES ($1,$2,NOW()) ON CONFLICT (id) DO UPDATE SET payload=EXCLUDED.payload,updated_at=NOW() RETURNING updated_at`,[DATA_ID,JSON.stringify(body)]);return NextResponse.json({ok:true,updatedAt:result.rows[0].updated_at});}
  catch(error){console.error("Erro ao salvar Aulas Kids:",error);return NextResponse.json({ok:false,error:"Erro ao salvar Aulas Kids."},{status:500});}
}
