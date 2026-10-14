import { NextRequest, NextResponse } from "next/server";
import {widgetReturn} from "@/lib/widget/links";

export function middleware(request: NextRequest) {
  const session = request.cookies.get("dmp_session")?.value;

  // O middleware faz apenas a barreira de navegação.
  // A validação real da sessão acontece nas APIs no servidor.
  if (!session) {
    const login=new URL("/login",request.url);const destination=widgetReturn(request.nextUrl.pathname+request.nextUrl.search);if(destination!=="/app")login.searchParams.set("next",destination);return NextResponse.redirect(login);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/app/:path*"]
};