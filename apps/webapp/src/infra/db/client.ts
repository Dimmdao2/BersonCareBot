import { Pool } from "pg";
import { env } from "@/config/env";

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set");
  }
  pool ??= new Pool({
    connectionString: env.DATABASE_URL,
    max: 5,
  });

  return pool;
}

export async function checkDbHealth(): Promise<boolean> {
  if (!env.DATABASE_URL) return false;
  try {
    const client = await getPool().connect();
    try {
      await client.query("select 1");
      return true;
    } finally {
      client.release();
    }
  } catch {
    return false;
  }
}
