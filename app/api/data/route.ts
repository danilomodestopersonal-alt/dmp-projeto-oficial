import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";

export const runtime = "nodejs";

const DATA_ID = "students";

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
  try {
    const body = await request.json();

    const result = await pool.query(
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

    return NextResponse.json({
      ok: true,
      updatedAt: result.rows[0].updated_at,
    });
  } catch (error) {
    console.error("Erro ao salvar dados do DMP:", error);

    return NextResponse.json(
      { ok: false, error: "Erro ao salvar dados." },
      { status: 500 }
    );
  }
}