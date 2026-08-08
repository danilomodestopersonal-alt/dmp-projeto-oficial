import { NextResponse } from "next/server";
import { getConnection, revokeStrava } from "@/lib/strava";
export const runtime = "nodejs";
export async function POST() {
  try { const connection = await getConnection(); if (connection) await revokeStrava(connection); return NextResponse.json({ ok: true }); }
  catch (error) { console.error("Erro ao desconectar Strava:", error); return NextResponse.json({ ok: false, error: "Erro ao desconectar Strava." }, { status: 500 }); }
}
