import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const session = request.cookies.get("dmp_session")?.value;
  if (request.nextUrl.pathname.startsWith("/api/data") && !session) {
  return NextResponse.json(
    { error: "Não autorizado" },
    { status: 401 }
  );
}

  if (request.nextUrl.pathname.startsWith("/app") && !session) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (request.nextUrl.pathname === "/login" && session) {
    return NextResponse.redirect(new URL("/app", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/login", "/app/:path*", "/api/data/:path*"]
};
