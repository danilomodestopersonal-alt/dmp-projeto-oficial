import { NextRequest, NextResponse } from "next/server";
import { exchangeAuthorizationCode } from "@/lib/strava";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const error = request.nextUrl.searchParams.get("error");
  const cookieState = request.cookies.get("dmp_strava_oauth_state")?.value;
  const home = new URL("/app", request.url);
  if (error) { home.searchParams.set("strava", "denied"); return NextResponse.redirect(home); }
  if (!code || !state || !cookieState || state !== cookieState) { home.searchParams.set("strava", "state-error"); return NextResponse.redirect(home); }
  try {
    await exchangeAuthorizationCode(code, request.url);
    home.searchParams.set("strava", "connected");
    const response = NextResponse.redirect(home);
    response.cookies.delete("dmp_strava_oauth_state");
    return response;
  } catch (err) {
    console.error("Erro no callback Strava:", err);
    home.searchParams.set("strava", "error");
    return NextResponse.redirect(home);
  }
}
