import {NextRequest,NextResponse} from "next/server";
import {isAuthorized} from "@/lib/auth";
import {pool} from "@/lib/db";
import {AbsenceError} from "@/lib/kids/individual-absence";
import {applyHomeAttendance,type HomeAttendanceCommand} from "@/lib/kids/home-attendance";
export const runtime="nodejs";

export async function POST(request:NextRequest){
  if(!(await isAuthorized(request)))return NextResponse.json({ok:false,error:"Sessão expirada. Entre novamente."},{status:401});
  const client=await pool.connect();
  try{
    const command=await request.json() as HomeAttendanceCommand;
    await client.query("BEGIN");
    const rows=await client.query("SELECT payload, updated_at FROM dmp_data WHERE id = $1 FOR UPDATE",["kids_v1"]);
    const row=rows.rows[0],version=row?.updated_at?new Date(row.updated_at).toISOString():null;
    if(!row||!version||request.headers.get("x-dmp-expected-updated-at")!==version){
      await client.query("ROLLBACK");
      return NextResponse.json({ok:false,error:"Dados alterados. Atualize a página e tente novamente."},{status:409});
    }
    const result=applyHomeAttendance(row.payload,command);
    let updatedAt=version;
    if(result.changed){
      const saved=await client.query("UPDATE dmp_data SET payload = $2, updated_at = NOW() WHERE id = $1 RETURNING updated_at",["kids_v1",JSON.stringify(result.data)]);
      updatedAt=new Date(saved.rows[0].updated_at).toISOString();
    }
    await client.query("COMMIT");
    return NextResponse.json({ok:true,data:result.data,updatedAt,operationId:command.operationId});
  }catch(error){
    try{await client.query("ROLLBACK");}catch{}
    if(error instanceof AbsenceError)return NextResponse.json({ok:false,error:error.message,code:error.code},{status:error.status});
    return NextResponse.json({ok:false,error:"Não foi possível confirmar a chamada. Atualize a página."},{status:500});
  }finally{client.release();}
}
