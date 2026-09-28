import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATA_ID = "kids_v1";
const TOKEN_ENV = "DMP_DS_READ_TOKEN";

function iso(value: unknown) {
  return value ? new Date(String(value)).toISOString() : null;
}

function sameSecret(received: string, expected: string) {
  const a = Buffer.from(received, "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

function authorized(request: NextRequest) {
  const expected = process.env[TOKEN_ENV]?.trim();
  if (!expected) return { ok: false as const, configurationError: true };

  const auth = request.headers.get("authorization") || "";
  const prefix = "Bearer ";
  const received = auth.startsWith(prefix) ? auth.slice(prefix.length).trim() : "";

  return {
    ok: Boolean(received) && sameSecret(received, expected),
    configurationError: false,
  } as const;
}

export async function GET(request: NextRequest) {
  const auth = authorized(request);

  if (auth.configurationError) {
    console.error(`${TOKEN_ENV} não configurado; integração DS bloqueada.`);
    return NextResponse.json(
      { ok: false, error: "Integração não configurada." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: "Não autorizado." },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    // IMPORTANTE: esta rota é deliberadamente SOMENTE LEITURA.
    // Não há INSERT/UPDATE/DELETE nem métodos POST/PUT/PATCH/DELETE.
    const result = await pool.query(
      "SELECT payload, updated_at FROM dmp_data WHERE id = $1",
      [DATA_ID]
    );

    return NextResponse.json(
      {
        ok: true,
        source: "DMP",
        dataset: DATA_ID,
        mode: "read-only",
        updatedAt: iso(result.rows[0]?.updated_at),
        data: result.rows[0]?.payload || null,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Erro na consulta somente-leitura DMP -> DS:", error);
    return NextResponse.json(
      { ok: false, error: "Erro ao consultar dados Kids." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
