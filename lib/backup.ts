import { createHash } from "node:crypto";
import { pool } from "@/lib/db";

export const BACKUP_FORMAT = "dmp-full-backup" as const;
export const BACKUP_VERSION = 1 as const;

export type BackupKind = "MANUAL" | "AUTO" | "PRE_RESTORE";

export type BackupRow = {
  id: string;
  payload: unknown;
  updatedAt: string | null;
};

export type BackupEnvelope = {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  createdAt: string;
  appVersion: "4.7.2";
  kind: BackupKind;
  rowCount: number;
  rows: BackupRow[];
  excludedIds: string[];
  checksum: string;
};

const SENSITIVE_ID_PATTERNS = [
  /strava_connection/i,
  /oauth/i,
  /token/i,
  /credential/i,
  /secret/i,
];

function isSensitiveId(id: string) {
  return SENSITIVE_ID_PATTERNS.some(pattern => pattern.test(id));
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);

  if (Array.isArray(value)) {
    return "[" + value.map(item => stableJson(item)).join(",") + "]";
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return "{" + keys.map(key => JSON.stringify(key) + ":" + stableJson(record[key])).join(",") + "}";
}

function payloadForChecksum(envelope: Omit<BackupEnvelope, "checksum">) {
  return stableJson(envelope);
}

function checksum(envelope: Omit<BackupEnvelope, "checksum">) {
  return createHash("sha256").update(payloadForChecksum(envelope)).digest("hex");
}

export async function ensureBackupTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS dmp_backups (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      payload JSONB NOT NULL,
      checksum TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS dmp_backups_created_at_idx ON dmp_backups (created_at DESC)`);
}

export async function buildBackup(kind: BackupKind): Promise<BackupEnvelope> {
  const result = await pool.query("SELECT id, payload, updated_at FROM dmp_data ORDER BY id");
  const excludedIds: string[] = [];
  const rows: BackupRow[] = [];

  for (const row of result.rows) {
    const id = String(row.id);
    if (isSensitiveId(id)) {
      excludedIds.push(id);
      continue;
    }
    rows.push({
      id,
      payload: row.payload,
      updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
    });
  }

  const base: Omit<BackupEnvelope, "checksum"> = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    appVersion: "4.7.2",
    kind,
    rowCount: rows.length,
    rows,
    excludedIds,
  };

  return { ...base, checksum: checksum(base) };
}

export function validateBackup(input: unknown): BackupEnvelope {
  if (!input || typeof input !== "object") throw new Error("Arquivo de backup inválido.");
  const envelope = input as BackupEnvelope;
  if (envelope.format !== BACKUP_FORMAT || envelope.version !== BACKUP_VERSION) {
    throw new Error("Formato de backup não reconhecido.");
  }
  if (!Array.isArray(envelope.rows) || !Array.isArray(envelope.excludedIds)) {
    throw new Error("Backup incompleto.");
  }
  for (const row of envelope.rows) {
    if (!row || typeof row.id !== "string" || !("payload" in row)) throw new Error("Backup contém registro inválido.");
    if (isSensitiveId(row.id)) throw new Error(`Backup contém registro sensível não permitido: ${row.id}`);
  }
  const { checksum: received, ...base } = envelope;
  const expected = checksum(base);
  if (!received || received !== expected) throw new Error("Checksum do backup não confere. O arquivo pode estar corrompido.");
  return envelope;
}

function backupId(kind: BackupKind) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `backup-${kind.toLowerCase()}-${stamp}`;
}

export async function createStoredBackup(kind: BackupKind) {
  await ensureBackupTable();
  const envelope = await buildBackup(kind);
  const id = backupId(kind);
  await pool.query(
    `INSERT INTO dmp_backups (id, kind, payload, checksum, created_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, kind, JSON.stringify(envelope), envelope.checksum, envelope.createdAt]
  );
  if (kind === "AUTO") {
    await pool.query(`DELETE FROM dmp_backups WHERE kind = 'AUTO' AND created_at < NOW() - INTERVAL '45 days'`);
  }
  return { id, envelope };
}

export async function listBackups(limit = 30) {
  await ensureBackupTable();
  const result = await pool.query(
    `SELECT id, kind, created_at, checksum, octet_length(payload::text) AS size_bytes,
            COALESCE(jsonb_array_length(payload->'rows'), 0) AS row_count
     FROM dmp_backups
     ORDER BY created_at DESC
     LIMIT $1`,
    [Math.max(1, Math.min(100, limit))]
  );
  return result.rows.map(row => ({
    id: row.id as string,
    kind: row.kind as BackupKind,
    createdAt: new Date(row.created_at).toISOString(),
    checksum: row.checksum as string,
    sizeBytes: Number(row.size_bytes || 0),
    rowCount: Number(row.row_count || 0),
  }));
}

export async function getStoredBackup(id: string): Promise<BackupEnvelope | null> {
  await ensureBackupTable();
  const result = await pool.query("SELECT payload FROM dmp_backups WHERE id = $1", [id]);
  if (!result.rows[0]) return null;
  return validateBackup(result.rows[0].payload);
}

export async function maybeCreateDailyBackup() {
  await ensureBackupTable();
  const result = await pool.query(
    `SELECT created_at FROM dmp_backups WHERE kind = 'AUTO' ORDER BY created_at DESC LIMIT 1`
  );
  const last = result.rows[0]?.created_at ? new Date(result.rows[0].created_at).getTime() : 0;
  if (last && Date.now() - last < 20 * 60 * 60 * 1000) return { created: false as const };
  const created = await createStoredBackup("AUTO");
  return { created: true as const, id: created.id, createdAt: created.envelope.createdAt };
}

export async function restoreBackup(envelopeInput: unknown) {
  const envelope = validateBackup(envelopeInput);
  await ensureBackupTable();
  const safety = await createStoredBackup("PRE_RESTORE");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const row of envelope.rows) {
      await client.query(
        `INSERT INTO dmp_data (id, payload, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (id)
         DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()`,
        [row.id, JSON.stringify(row.payload)]
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  return {
    restoredRows: envelope.rows.length,
    restoredFrom: envelope.createdAt,
    safetyBackupId: safety.id,
  };
}
