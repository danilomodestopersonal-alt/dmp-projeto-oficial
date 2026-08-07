import { NextRequest, NextResponse } from "next/server";
import { googleConfigured } from "@/lib/google-calendar";

export async function GET(request: NextRequest) {
  return NextResponse.json({
    configured: googleConfigured(),
    connected: Boolean(request.cookies.get("dmp_google_access")?.value || request.cookies.get("dmp_google_refresh")?.value)
  });
}
