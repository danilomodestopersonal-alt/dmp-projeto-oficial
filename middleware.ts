import { NextRequest, NextResponse } from "next/server";

const privateApiPrefixes = ["/api/data", "/api/finance", "/api/kids", "/api/notes", "/api/performance", "/api/backup"];

export function middleware(request: NextRequest) {
  const session = request.cookies.get("dmp_session")?.value;
  const pathname = request.nextUrl.pathname;

  if (privateApiPrefixes.some(prefix => pathname.startsWith(prefix)) && !session) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  if (pathname.startsWith("/app") && !session) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (pathname === "/login" && session) {
    return NextResponse.redirect(new URL("/app", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/login",
    "/app/:path*",
    "/api/data/:path*",
    "/api/finance/:path*",
    "/api/kids/:path*",
    "/api/notes/:path*",
    "/api/performance/:path*",
    "/api/backup/:path*",
  ],
};
