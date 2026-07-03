import { Pool } from "pg";
import { env } from "@/config/env";
import { withPoolClient } from "@/infra/db/withClient";

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
    return await withPoolClient(getPool(), async (client) => {
      await client.query("select 1");
      return true;
    });
  } catch {
    return false;
  }
}
