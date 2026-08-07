import { NextRequest, NextResponse } from "next/server";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

export function googleConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function appOrigin(request: NextRequest) {
  return process.env.APP_URL || request.nextUrl.origin;
}

export function googleRedirectUri(request: NextRequest) {
  return `${appOrigin(request)}/api/google/callback`;
}

export function buildGoogleAuthUrl(request: NextRequest, state: string) {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID || "",
    redirect_uri: googleRedirectUri(request),
    response_type: "code",
    scope: "https://www.googleapis.com/auth/calendar.events",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export async function exchangeCode(request: NextRequest, code: string) {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID || "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
      redirect_uri: googleRedirectUri(request),
      grant_type: "authorization_code"
    }),
    cache: "no-store"
  });
  if (!response.ok) throw new Error(`Falha ao conectar Google (${response.status})`);
  return response.json() as Promise<{access_token:string;expires_in:number;refresh_token?:string;scope?:string;token_type?:string}>;
}

export async function refreshAccessToken(refreshToken: string) {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID || "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
      grant_type: "refresh_token"
    }),
    cache: "no-store"
  });
  if (!response.ok) throw new Error(`Falha ao renovar Google (${response.status})`);
  return response.json() as Promise<{access_token:string;expires_in:number;scope?:string;token_type?:string}>;
}

export function setGoogleCookies(response: NextResponse, token: {access_token:string;expires_in:number;refresh_token?:string}) {
  const secure = process.env.NODE_ENV === "production";
  response.cookies.set("dmp_google_access", token.access_token, {httpOnly:true,secure,sameSite:"lax",path:"/",maxAge:Math.max(60,token.expires_in-60)});
  if (token.refresh_token) response.cookies.set("dmp_google_refresh", token.refresh_token, {httpOnly:true,secure,sameSite:"lax",path:"/",maxAge:60*60*24*365});
}

export async function getGoogleAccessToken(request: NextRequest) {
  const direct = request.cookies.get("dmp_google_access")?.value;
  if (direct) return {accessToken:direct, refreshed:null as null | {access_token:string;expires_in:number}};
  const refresh = request.cookies.get("dmp_google_refresh")?.value;
  if (!refresh) return {accessToken:null,refreshed:null};
  const token = await refreshAccessToken(refresh);
  return {accessToken:token.access_token,refreshed:token};
}
