import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";

export const runtime = "nodejs";

const DATA_ID = "student_files_v1";

type StudentFileCategory =
  | "MEDICAL_CERTIFICATE"
  | "EXAM"
  | "ASSESSMENT"
  | "REPORT"
  | "DOCUMENT"
  | "OTHER";

type StudentFileRecord = {
  id: string;
  studentId: string;
  name: string;
  category: StudentFileCategory;
  date: string;
  notes: string;
  mimeType: string;
  size: number;
  dataUrl: string;
  createdAt: string;
};

async function readAll(): Promise<StudentFileRecord[]> {
  const result = await pool.query(
    "SELECT payload FROM dmp_data WHERE id = $1",
    [DATA_ID]
  );

  return Array.isArray(result.rows[0]?.payload)
    ? result.rows[0].payload
    : [];
}

async function saveAll(files: StudentFileRecord[]) {
  await pool.query(
    `
      INSERT INTO dmp_data (id, payload, updated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (id)
      DO UPDATE
      SET payload = EXCLUDED.payload,
          updated_at = NOW()
    `,
    [DATA_ID, JSON.stringify(files)]
  );
}

export async function GET(request: NextRequest) {
  try {
    const studentId =
      new URL(request.url).searchParams.get("studentId") || "";

    if (!studentId) {
      return NextResponse.json(
        { ok: false, error: "Aluno não informado." },
        { status: 400 }
      );
    }

    const files = (await readAll())
      .filter(file => file.studentId === studentId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return NextResponse.json({ ok: true, data: files });
  } catch (error) {
    console.error("Erro ao ler arquivos do aluno:", error);

    return NextResponse.json(
      { ok: false, data: [], error: "Erro ao carregar arquivos." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as StudentFileRecord;

    if (
      !body?.studentId ||
      !body?.name ||
      !body?.mimeType ||
      !body?.dataUrl
    ) {
      return NextResponse.json(
        { ok: false, error: "Dados do arquivo incompletos." },
        { status: 400 }
      );
    }

    const allowed =
      body.mimeType === "application/pdf" ||
      body.mimeType.startsWith("image/");

    if (!allowed) {
      return NextResponse.json(
        { ok: false, error: "Envie PDF ou imagem." },
        { status: 400 }
      );
    }

    if (Number(body.size || 0) > 5 * 1024 * 1024) {
      return NextResponse.json(
        { ok: false, error: "O arquivo deve ter no máximo 5 MB." },
        { status: 400 }
      );
    }

    const files = await readAll();

    const record: StudentFileRecord = {
      ...body,
      id: body.id || crypto.randomUUID(),
      notes: body.notes || "",
      date: body.date || new Date().toISOString().slice(0, 10),
      createdAt: body.createdAt || new Date().toISOString(),
    };

    await saveAll([record, ...files]);

    return NextResponse.json({ ok: true, data: record });
  } catch (error) {
    console.error("Erro ao salvar arquivo do aluno:", error);

    return NextResponse.json(
      { ok: false, error: "Erro ao salvar arquivo." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = new URL(request.url).searchParams.get("id") || "";

    if (!id) {
      return NextResponse.json(
        { ok: false, error: "Arquivo não informado." },
        { status: 400 }
      );
    }

    const files = await readAll();
    await saveAll(files.filter(file => file.id !== id));

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Erro ao excluir arquivo do aluno:", error);

    return NextResponse.json(
      { ok: false, error: "Erro ao excluir arquivo." },
      { status: 500 }
    );
  }
}
