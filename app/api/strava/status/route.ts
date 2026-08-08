import { NextResponse } from "next/server";
import { getConnection, stravaConfigured } from "@/lib/strava";
export const runtime = "nodejs";
export async function GET() {
  try {
    const connection = await getConnection();
    return NextResponse.json({ ok: true, configured: stravaConfigured(), connected: Boolean(connection), athlete: connection ? { id: connection.athleteId, name: connection.athleteName } : null, lastSyncAt: connection?.lastSyncAt ?? null, lastSync: connection?.lastSync ?? null });
  } catch (error) {
    console.error("Erro ao consultar status Strava:", error);
    return NextResponse.json({ ok: false, configured: stravaConfigured(), connected: false, error: "Erro ao consultar Strava." }, { status: 500 });
  }
}
