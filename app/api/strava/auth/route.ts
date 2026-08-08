import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { stravaConfigured, stravaRedirectUri } from "@/lib/strava";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!stravaConfigured()) return NextResponse.json({ ok: false, error: "Strava não configurado no servidor." }, { status: 503 });
  const state = randomBytes(24).toString("hex");
  const authorize = new URL("https://www.strava.com/oauth/authorize");
  authorize.searchParams.set("client_id", process.env.STRAVA_CLIENT_ID!);
  authorize.searchParams.set("redirect_uri", stravaRedirectUri(request.url));
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("approval_prompt", "auto");
  authorize.searchParams.set("scope", "read,activity:read_all");
  authorize.searchParams.set("state", state);
  const response = NextResponse.redirect(authorize);
  response.cookies.set("dmp_strava_oauth_state", state, { httpOnly: true, sameSite: "lax", secure: request.nextUrl.protocol === "https:", maxAge: 600, path: "/" });
  return response;
}
