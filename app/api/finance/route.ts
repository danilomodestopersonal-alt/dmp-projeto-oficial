import { isAuthorized } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import {otherReceiptsPreserved} from "@/lib/financeiro/other-receipts";

import {cancellationsPreserved} from "@/lib/financeiro/invoice-cancellation";

export const runtime = "nodejs";
const DATA_ID = "finance_v1";
const VERSION_HEADER = "x-dmp-expected-updated-at";

function iso(value: unknown) {
  return value ? new Date(value instanceof Date ? value.getTime() : String(value)).toISOString() : null;
}

export async function GET(request: NextRequest) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json(
      { message: "Sessão inválida. Entre novamente no DMP." },
      { status: 401 }
    );
  }
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
      updatedAt: iso(result.rows[0].updated_at),
    });
  } catch (error) {
    console.error("Erro ao ler Financeiro do DMP:", error);

    return NextResponse.json(
      { ok: false, error: "Erro ao ler dados financeiros." },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json(
      { message: "Sessão inválida. Entre novamente no DMP." },
      { status: 401 }
    );
  }
  const client = await pool.connect();

  try {
    const body = await request.json();

    if (body?.version !== 1) {
      return NextResponse.json(
        { ok: false, error: "Formato financeiro inválido." },
        { status: 400 }
      );
    }

    const expected = request.headers.get(VERSION_HEADER);

    await client.query("BEGIN");

    const current = await client.query(
      "SELECT payload, updated_at FROM dmp_data WHERE id = $1 FOR UPDATE",
      [DATA_ID]
    );

    if (current.rows.length > 0) {
      if (!cancellationsPreserved(current.rows[0].payload, body)) {
        await client.query("ROLLBACK");
        return NextResponse.json({error:"Cancelamentos protegidos. Atualize e use a ação específica da cobrança."},{status:409});
      }
      if (!otherReceiptsPreserved(current.rows[0].payload, body)) {
        await client.query("ROLLBACK");
        return NextResponse.json({ok:false,error:"Os outros recebimentos mudaram. Atualize o Financeiro antes de salvar."},{status:409});
      }
      const currentUpdatedAt = iso(current.rows[0].updated_at);

      if (!expected || expected !== currentUpdatedAt) {
        await client.query("ROLLBACK");

        return NextResponse.json(
          {
            ok: false,
            conflict: true,
            error: "O Financeiro foi alterado em outra aba ou dispositivo.",
            currentUpdatedAt,
          },
          { status: 409 }
        );
      }
    } else if (expected) {
      await client.query("ROLLBACK");

      return NextResponse.json(
        {
          ok: false,
          conflict: true,
          error: "A versão carregada do Financeiro não corresponde ao banco.",
          currentUpdatedAt: null,
        },
        { status: 409 }
      );
    }

    const result = await client.query(
      `
        INSERT INTO dmp_data (id, payload, updated_at)
        VALUES ($1, $2, NOW())
        ON CONFLICT (id)
        DO UPDATE
        SET payload = EXCLUDED.payload,
            updated_at = NOW()
        RETURNING updated_at
      `,
      [DATA_ID, JSON.stringify(body)]
    );

    await client.query("COMMIT");

    return NextResponse.json({
      ok: true,
      updatedAt: iso(result.rows[0].updated_at),
    });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {}

    console.error("Erro ao salvar Financeiro do DMP:", error);

    return NextResponse.json(
      { ok: false, error: "Erro ao salvar dados financeiros." },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
