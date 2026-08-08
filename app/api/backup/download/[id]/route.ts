import { NextRequest, NextResponse } from "next/server";
import { getStoredBackup } from "@/lib/backup";

export const runtime = "nodejs";

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const backup = await getStoredBackup(id);
    if (!backup) return NextResponse.json({ ok: false, error: "Backup não encontrado." }, { status: 404 });
    const body = JSON.stringify(backup, null, 2);
    const date = backup.createdAt.slice(0, 10);
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="DMP-backup-${date}-${id.slice(-8)}.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Erro ao baixar backup do DMP:", error);
    return NextResponse.json({ ok: false, error: "Erro ao baixar backup." }, { status: 500 });
  }
}
