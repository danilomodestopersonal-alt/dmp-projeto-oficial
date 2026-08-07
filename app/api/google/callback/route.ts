import { NextRequest, NextResponse } from "next/server";
import { appOrigin, exchangeCode, setGoogleCookies } from "@/lib/google-calendar";

function appRedirect(request: NextRequest, status: "connected" | "error") {
  return new URL(`/app?google=${status}`, appOrigin(request));
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const expected = request.cookies.get("dmp_google_state")?.value;

  if (!code || !state || !expected || state !== expected) {
    return NextResponse.redirect(appRedirect(request, "error"));
  }

  try {
    const token = await exchangeCode(request, code);
    const response = NextResponse.redirect(appRedirect(request, "connected"));

    response.cookies.delete("dmp_google_state");
    setGoogleCookies(response, token);

    return response;
  } catch {
    return NextResponse.redirect(appRedirect(request, "error"));
  }
}
