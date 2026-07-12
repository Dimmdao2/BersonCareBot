import type { Pool } from "pg";
import { runWithDbInfraPrincipal } from "@bersoncare/db-principal";
import { env } from "@/config/env";
import { withPoolClient } from "@/infra/db/withClient";
import { createWebappPoolProvider } from "@/infra/db/webappPoolProvider";

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set");
  }
  pool ??= createWebappPoolProvider({ connectionString: env.DATABASE_URL });

  return pool;
}

export async function checkDbHealth(): Promise<boolean> {
  if (!env.DATABASE_URL) return false;
  try {
    return await runWithDbInfraPrincipal({ source: "webapp-health-check" }, () =>
      withPoolClient(getPool(), async (client) => {
        await client.query("select 1");
        return true;
      }),
    );
  } catch {
    return false;
  }
}
