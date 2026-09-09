import { createHash, randomBytes } from "node:crypto";
import { NextRequest } from "next/server";
import { pool } from "@/lib/db";

const SESSION_COOKIE = "dmp_session";
const SESSION_DAYS = 7;

function hashToken(value: string) {
  return createHash("sha256")
    .update(value, "utf8")
    .digest("hex");
}

export async function ensureSessionTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS dmp_sessions (
      token_hash TEXT PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL
    )
  `);

  await pool.query(
    "DELETE FROM dmp_sessions WHERE expires_at <= NOW()"
  );
}

export async function createSession() {
  await ensureSessionTable();

  const token = randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);

  await pool.query(
    `
      INSERT INTO dmp_sessions
        (token_hash, expires_at)
      VALUES
        ($1, NOW() + INTERVAL '7 days')
    `,
    [tokenHash]
  );

  return token;
}

export async function isValidSessionToken(
  token: string | undefined | null
) {
  if (!token) return false;

  await ensureSessionTable();

  const result = await pool.query(
    `
      SELECT 1
      FROM dmp_sessions
      WHERE token_hash = $1
        AND expires_at > NOW()
      LIMIT 1
    `,
    [hashToken(token)]
  );

  return Boolean(result.rows[0]);
}

export async function isAuthorized(
  request: NextRequest
) {
  return isValidSessionToken(
    request.cookies.get(SESSION_COOKIE)?.value
  );
}

export async function revokeSession(
  token: string | undefined | null
) {
  if (!token) return;

  await ensureSessionTable();

  await pool.query(
    "DELETE FROM dmp_sessions WHERE token_hash = $1",
    [hashToken(token)]
  );
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * SESSION_DAYS
};