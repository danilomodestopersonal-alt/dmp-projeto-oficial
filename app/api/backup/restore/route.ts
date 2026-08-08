import { NextRequest, NextResponse } from "next/server";
import { getStoredBackup, restoreBackup } from "@/lib/backup";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    let input: unknown = body?.backup;
    if (!input && body?.backupId) input = await getStoredBackup(String(body.backupId));
    if (!input) return NextResponse.json({ ok: false, error: "Backup não informado." }, { status: 400 });
    const result = await restoreBackup(input);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("Erro ao restaurar backup do DMP:", error);
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Erro ao restaurar backup." }, { status: 400 });
  }
}
