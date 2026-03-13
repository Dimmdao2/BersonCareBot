import { Pool } from "pg";
import { env } from "@/config/env";

let pool: Pool | null = null;

function getPool(): Pool {
  pool ??= new Pool({
    connectionString: env.DATABASE_URL,
    max: 5,
  });

  return pool;
}

export async function checkDbHealth(): Promise<boolean> {
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
