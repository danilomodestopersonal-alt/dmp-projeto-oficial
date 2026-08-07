import { Pool } from "pg";

const globalForPg = globalThis as unknown as {
  dmpPool?: Pool;
};

export const pool =
  globalForPg.dmpPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes("localhost")
      ? false
      : { rejectUnauthorized: false },
  });

if (process.env.NODE_ENV !== "production") {
  globalForPg.dmpPool = pool;
}