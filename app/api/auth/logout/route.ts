import { NextRequest, NextResponse } from "next/server";
import {
  revokeSession,
  sessionCookieOptions
} from "@/lib/auth";

export async function POST(request: NextRequest) {
  const current =
    request.cookies.get("dmp_session")?.value;

  try {
    await revokeSession(current);
  } catch (error) {
    console.error(
      "Erro ao invalidar sessão:",
      error
    );
  }

  const response =
    NextResponse.json({ ok: true });

  response.cookies.set(
    "dmp_session",
    "",
    {
      ...sessionCookieOptions,
      maxAge: 0
    }
  );

  return response;
}