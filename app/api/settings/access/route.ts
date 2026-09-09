import {hashPassword,verifyPassword} from "@/lib/password";
import {NextRequest,NextResponse} from "next/server";
import {pool} from "@/lib/db";
import {isAuthorized} from "@/lib/auth";

export const runtime="nodejs";

const DATA_ID="access_v1";
type AccessData={
  email:string;
  passwordHash:string;
};

async function readAccess():Promise<AccessData|null>{
  try{
    const result=await pool.query(
      "SELECT payload FROM dmp_data WHERE id = $1",
      [DATA_ID]
    );

    const payload=result.rows[0]?.payload;

    if(payload?.email&&payload?.passwordHash){
      return{
        email:String(payload.email).toLowerCase(),
        passwordHash:String(payload.passwordHash)
      };
    }
  }catch(error){
    console.error("Erro ao ler acesso:",error);
    throw error;
  }

  return null;
}

export async function GET(request:NextRequest){
  if(!(await isAuthorized(request))){
    return NextResponse.json(
      {message:"Sessão inválida."},
      {status:401}
    );
  }

  const access=await readAccess();

  if(!access){
    return NextResponse.json(
      {message:"Acesso não configurado."},
      {status:409}
    );
  }

  return NextResponse.json({
    email:access.email
  });
}

export async function PUT(request:NextRequest){
  try{
    if(!(await isAuthorized(request))){
      return NextResponse.json(
        {
          message:
            "Sessão inválida. Entre novamente no DMP."
        },
        {status:401}
      );
    }

    const body=await request.json();

    const email=
      String(body.email||"")
        .trim()
        .toLowerCase();

    const currentPassword=
      String(body.currentPassword||"");

    const newPassword=
      String(body.newPassword||"");

    if(!email){
      return NextResponse.json(
        {message:"Informe o login / e-mail."},
        {status:400}
      );
    }

    if(!currentPassword){
      return NextResponse.json(
        {message:"Informe a senha atual."},
        {status:400}
      );
    }

    if(!newPassword){
      return NextResponse.json(
        {message:"Defina uma nova senha."},
        {status:400}
      );
    }

    if(newPassword.length<8){
      return NextResponse.json(
        {
          message:
            "A nova senha deve ter pelo menos 8 caracteres."
        },
        {status:400}
      );
    }

    const current=await readAccess();

    if(!current){
      return NextResponse.json(
        {message:"Acesso não configurado."},
        {status:409}
      );
    }

    if(
      !verifyPassword(
        currentPassword,
        current.passwordHash
      )
    ){
      return NextResponse.json(
        {message:"Senha atual inválida."},
        {status:401}
      );
    }

    const payload={
      email,
      passwordHash:hashPassword(newPassword)
    };

    await pool.query(
      `
        INSERT INTO dmp_data
          (id,payload,updated_at)
        VALUES
          ($1,$2,NOW())
        ON CONFLICT(id)
        DO UPDATE SET
          payload=EXCLUDED.payload,
          updated_at=NOW()
      `,
      [DATA_ID,JSON.stringify(payload)]
    );

    return NextResponse.json({
      ok:true,
      email
    });
  }catch(error){
    console.error(
      "Erro ao atualizar acesso:",
      error
    );

    return NextResponse.json(
      {
        message:
          "Não foi possível atualizar o acesso."
      },
      {status:500}
    );
  }
}