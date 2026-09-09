import {hashPassword,needsPasswordUpgrade,verifyPassword} from "@/lib/password";
import {NextRequest,NextResponse} from "next/server";
import {pool} from "@/lib/db";
import {
  createSession,
  sessionCookieOptions
} from "@/lib/auth";

export const runtime="nodejs";

const DATA_ID="access_v1";
async function readAccess(){
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
    console.error(
      "Erro ao ler credenciais:",
      error
    );
    throw error;
  }

  return null;
}

export async function POST(request:NextRequest){
  try{
    const body=await request.json();

    const email=
      String(body.email||"")
        .trim()
        .toLowerCase();

    const password=
      String(body.password||"");

    const access=await readAccess();

    if(!access){
      return NextResponse.json(
        {message:"E-mail ou senha inválidos."},
        {status:401}
      );
    }

    const passwordValid=
      verifyPassword(password,access.passwordHash);

    if(
      email!==access.email ||
      !passwordValid
    ){
      return NextResponse.json(
        {message:"E-mail ou senha inválidos."},
        {status:401}
      );
    }

    if(needsPasswordUpgrade(access.passwordHash)){
      const upgradedPayload={
        email:access.email,
        passwordHash:hashPassword(password)
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
        [DATA_ID,JSON.stringify(upgradedPayload)]
      );
    }

    const token=await createSession();

    const response=NextResponse.json({
      user:{
        id:"dmp-user",
        name:"Danilo Modesto",
        email
      }
    });

    response.cookies.set(
      "dmp_session",
      token,
      sessionCookieOptions
    );

    return response;
  }catch(error){
    console.error("Erro no login:",error);

    return NextResponse.json(
      {message:"Não foi possível entrar."},
      {status:500}
    );
  }
}