import { isAuthorized } from "@/lib/auth";
import { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json(
      { message: "Sessão inválida. Entre novamente no DMP." },
      { status: 401 }
    );
  }
  const response = NextResponse.json({ok:true});
  for (const name of ["dmp_google_access","dmp_google_refresh","dmp_google_state"]) response.cookies.delete(name);
  return response;
}
