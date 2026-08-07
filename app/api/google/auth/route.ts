import { NextRequest, NextResponse } from "next/server";
import { buildGoogleAuthUrl, googleConfigured } from "@/lib/google-calendar";

export async function GET(request: NextRequest) {
  if (!googleConfigured()) return NextResponse.redirect(new URL("/app?google=not-configured", request.url));
  const state = crypto.randomUUID();
  const response = NextResponse.redirect(buildGoogleAuthUrl(request, state));
  response.cookies.set("dmp_google_state", state, {httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",path:"/",maxAge:600});
  return response;
}
