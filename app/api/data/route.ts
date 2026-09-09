import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";

export const runtime = "nodejs";

const DATA_ID = "students";

function getSessionIds(value: unknown): Set<string> {
  const ids = new Set<string>();

  if (!Array.isArray(value)) return ids;

  for (const student of value) {
    if (!student || typeof student !== "object") continue;

    const sessions = Array.isArray((student as { sessions?: unknown[] }).sessions)
      ? (student as { sessions: unknown[] }).sessions
      : [];

    for (const session of sessions) {
      if (!session || typeof session !== "object") continue;

      const id = (session as { id?: unknown }).id;

      if (typeof id === "string" && id) {
        ids.add(id);
      }
    }
  }

  return ids;
}

export async function GET() {
  try {
    const result = await pool.query(
      "SELECT payload, updated_at FROM dmp_data WHERE id = $1",
      [DATA_ID]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({
        ok: true,
        data: null,
        updatedAt: null,
      });
    }

    return NextResponse.json({
      ok: true,
      data: result.rows[0].payload,
      updatedAt: result.rows[0].updated_at,
    });
  } catch (error) {
    console.error("Erro ao ler dados do DMP:", error);

    return NextResponse.json(
      { ok: false, error: "Erro ao ler dados." },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  const client = await pool.connect();

  try {
    const body = await request.json();

    if (!Array.isArray(body)) {
      return NextResponse.json(
        { ok: false, error: "Formato de dados inválido." },
        { status: 400 }
      );
    }

    await client.query("BEGIN");

    const current = await client.query(
      "SELECT payload FROM dmp_data WHERE id = $1 FOR UPDATE",
      [DATA_ID]
    );

    if (current.rows.length > 0) {
      const currentIds = getSessionIds(current.rows[0].payload);
      const incomingIds = getSessionIds(body);

      const missingIds = [...currentIds].filter(id => !incomingIds.has(id));

      const explicitSingleDelete =
        request.headers.get("x-dmp-session-delete") === "1" &&
        missingIds.length === 1;

      if (missingIds.length > 0 && !explicitSingleDelete) {
        await client.query("ROLLBACK");

        console.error(
          `DMP SAFETY: gravação bloqueada porque removeria ${missingIds.length} sessão(ões).`
        );

        return NextResponse.json(
          {
            ok: false,
            error:
              `Proteção do histórico acionada. ` +
              `Esta gravação tentaria remover ${missingIds.length} sessão(ões) já existentes.`,
          },
          { status: 409 }
        );
      }
    }

    const result = await client.query(
      `
        INSERT INTO dmp_data (id, payload, updated_at)
        VALUES ($1, $2, NOW())
        ON CONFLICT (id)
        DO UPDATE SET
          payload = EXCLUDED.payload,
          updated_at = NOW()
        RETURNING updated_at
      `,
      [DATA_ID, JSON.stringify(body)]
    );

    await client.query("COMMIT");

    return NextResponse.json({
      ok: true,
      updatedAt: result.rows[0].updated_at,
    });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {}

    console.error("Erro ao salvar dados do DMP:", error);

    return NextResponse.json(
      { ok: false, error: "Erro ao salvar dados." },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
