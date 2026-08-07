import { NextRequest, NextResponse } from "next/server";
import { exchangeCode, setGoogleCookies } from "@/lib/google-calendar";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const expected = request.cookies.get("dmp_google_state")?.value;
  if (!code || !state || !expected || state !== expected) return NextResponse.redirect(new URL("/app?google=error", request.url));
  try {
    const token = await exchangeCode(request, code);
    const response = NextResponse.redirect(new URL("/app?google=connected", request.url));
    response.cookies.delete("dmp_google_state");
    setGoogleCookies(response, token);
    return response;
  } catch {
    return NextResponse.redirect(new URL("/app?google=error", request.url));
  }
}
