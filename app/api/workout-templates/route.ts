import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";

export const runtime = "nodejs";

const DATA_ID = "workout_templates_v1";
const VERSION_HEADER = "x-dmp-expected-updated-at";

function iso(value: unknown) {
  return value ? new Date(String(value)).toISOString() : null;
}

export async function GET() {
  try {
    const result = await pool.query(
      "SELECT payload, updated_at FROM dmp_data WHERE id = $1",
      [DATA_ID]
    );

    return NextResponse.json({
      ok: true,
      data: result.rows[0]?.payload || [],
      updatedAt: iso(result.rows[0]?.updated_at),
    });
  } catch (error) {
    console.error(
      "Erro ao ler biblioteca de treinos:",
      error
    );

    return NextResponse.json(
      {
        ok: false,
        data: [],
        error: "Erro ao carregar biblioteca de treinos.",
      },
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
        {
          ok: false,
          error: "Formato da biblioteca de treinos inválido.",
        },
        { status: 400 }
      );
    }

    const expected = request.headers.get(VERSION_HEADER);

    await client.query("BEGIN");

    const current = await client.query(
      "SELECT updated_at FROM dmp_data WHERE id = $1 FOR UPDATE",
      [DATA_ID]
    );

    if (current.rows.length > 0) {
      const currentUpdatedAt = iso(
        current.rows[0].updated_at
      );

      if (
        !expected ||
        !currentUpdatedAt ||
        iso(expected) !== currentUpdatedAt
      ) {
        await client.query("ROLLBACK");

        return NextResponse.json(
          {
            ok: false,
            conflict: true,
            error:
              "Biblioteca de treinos alterada em outra aba ou dispositivo.",
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
          error:
            "A versão da biblioteca não corresponde ao servidor.",
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

    console.error(
      "Erro ao salvar biblioteca de treinos:",
      error
    );

    return NextResponse.json(
      {
        ok: false,
        error: "Erro ao salvar biblioteca de treinos.",
      },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}