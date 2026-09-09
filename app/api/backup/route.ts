import { isAuthorized } from "@/lib/auth";
import { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createStoredBackup, listBackups, maybeCreateDailyBackup } from "@/lib/backup";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json(
      { message: "Sessão inválida. Entre novamente no DMP." },
      { status: 401 }
    );
  }
  try {
    const automatic = await maybeCreateDailyBackup();
    const backups = await listBackups(40);
    return NextResponse.json({ ok: true, backups, automatic });
  } catch (error) {
    console.error("Erro ao listar backups do DMP:", error);
    return NextResponse.json({ ok: false, error: "Erro ao consultar backups." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json(
      { message: "Sessão inválida. Entre novamente no DMP." },
      { status: 401 }
    );
  }
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
