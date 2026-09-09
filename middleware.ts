import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const session = request.cookies.get("dmp_session")?.value;

  // O middleware faz apenas a barreira de navegação.
  // A validação real da sessão acontece nas APIs no servidor.
  if (!session) {
    return NextResponse.redirect(
      new URL("/login", request.url)
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/app/:path*"]
};