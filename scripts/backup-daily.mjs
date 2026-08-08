import pg from "pg";
import crypto from "node:crypto";

const { Pool } = pg;
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL nÃ£o configurada.");
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes("localhost") ? false : { rejectUnauthorized: false },
});
const sensitive = [/strava_connection/i,/oauth/i,/token/i,/credential/i,/secret/i];
const isSensitive = id => sensitive.some(pattern => pattern.test(id));
try {
  await pool.query(`CREATE TABLE IF NOT EXISTS dmp_backups (id TEXT PRIMARY KEY, kind TEXT NOT NULL, payload JSONB NOT NULL, checksum TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await pool.query(`CREATE INDEX IF NOT EXISTS dmp_backups_created_at_idx ON dmp_backups (created_at DESC)`);
  const latest = await pool.query(`SELECT created_at FROM dmp_backups WHERE kind='AUTO' ORDER BY created_at DESC LIMIT 1`);
  if (latest.rows[0] && Date.now() - new Date(latest.rows[0].created_at).getTime() < 20*60*60*1000) {
    console.log("Backup automÃ¡tico recente jÃ¡ existe; nada a fazer.");
    process.exitCode=0;
  } else {
    const result = await pool.query("SELECT id,payload,updated_at FROM dmp_data ORDER BY id");
    const excludedIds=[]; const rows=[];
    for (const row of result.rows) {
      if (isSensitive(String(row.id))) { excludedIds.push(String(row.id)); continue; }
      rows.push({id:String(row.id),payload:row.payload,updatedAt:row.updated_at?new Date(row.updated_at).toISOString():null});
    }
    const base={format:"dmp-full-backup",version:1,createdAt:new Date().toISOString(),appVersion:"4.7.2",kind:"AUTO",rowCount:rows.length,rows,excludedIds};
    const stableJson=value=>value===null||typeof value!=="object"?JSON.stringify(value):Array.isArray(value)?"["+value.map(stableJson).join(",")+"]":"{"+Object.keys(value).sort().map(key=>JSON.stringify(key)+":"+stableJson(value[key])).join(",")+"}"; const checksum=crypto.createHash("sha256").update(stableJson(base)).digest("hex");
    const payload={...base,checksum};
    const id=`backup-auto-${base.createdAt.replace(/[:.]/g,"-")}`;
    await pool.query(`INSERT INTO dmp_backups (id,kind,payload,checksum,created_at) VALUES ($1,'AUTO',$2,$3,$4)`,[id,JSON.stringify(payload),checksum,base.createdAt]);
    await pool.query(`DELETE FROM dmp_backups WHERE kind='AUTO' AND created_at < NOW() - INTERVAL '45 days'`);
    console.log(`Backup automÃ¡tico criado: ${id} | ${rows.length} blocos | SHA-256 ${checksum.slice(0,12)}â€¦`);
  }
} finally { await pool.end(); }

