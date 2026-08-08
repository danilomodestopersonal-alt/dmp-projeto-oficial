import { NextResponse } from "next/server";
import { syncStrava } from "@/lib/strava";
export const runtime = "nodejs";
export async function POST() {
  try { return NextResponse.json({ ok: true, ...(await syncStrava()) }); }
  catch (error) { console.error("Erro ao sincronizar Strava:", error); return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Erro ao sincronizar Strava." }, { status: 500 }); }
}
