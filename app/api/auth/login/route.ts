import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const body = await request.json();
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");

  if (email !== "danilo@dmp.local" || password !== "Dmp@2026") {
    return NextResponse.json({ message: "E-mail ou senha inválidos." }, { status: 401 });
  }

  const response = NextResponse.json({
    user: { id: "demo-user", name: "Danilo Modesto", email }
  });

  response.cookies.set("dmp_session", "demo-session-token", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7
  });

  return response;
}
