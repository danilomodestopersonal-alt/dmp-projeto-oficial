import { NextResponse } from "next/server";
import { createStoredBackup, listBackups, maybeCreateDailyBackup } from "@/lib/backup";

export const runtime = "nodejs";

export async function GET() {
  try {
    const automatic = await maybeCreateDailyBackup();
    const backups = await listBackups(40);
    return NextResponse.json({ ok: true, backups, automatic });
  } catch (error) {
    console.error("Erro ao listar backups do DMP:", error);
    return NextResponse.json({ ok: false, error: "Erro ao consultar backups." }, { status: 500 });
  }
}

export async function POST() {
  try {
    const created = await createStoredBackup("MANUAL");
    return NextResponse.json({
      ok: true,
      backup: {
        id: created.id,
        createdAt: created.envelope.createdAt,
        rowCount: created.envelope.rowCount,
      },
    });
  } catch (error) {
    console.error("Erro ao criar backup do DMP:", error);
    return NextResponse.json({ ok: false, error: "Erro ao criar backup." }, { status: 500 });
  }
}
