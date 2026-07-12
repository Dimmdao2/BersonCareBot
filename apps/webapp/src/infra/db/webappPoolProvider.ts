import { Pool } from "pg";
import type { PoolClient } from "pg";
import {
  applyCurrentDbPrincipalToConnection,
  buildDbPrincipalApplyOptionsFromEnv,
  clearDbPrincipalFromConnection,
} from "@bersoncare/db-principal";

type WebappPoolProviderConfig = {
  connectionString: string;
};

function prepareWebappPoolClient(_client: PoolClient): void {
  // Dormant SAAS hook: future per-process DB principal setup belongs here.
}

function installPrincipalAwarePoolQuery(pool: Pool): void {
  const rawQuery = pool.query.bind(pool);
  const queryWithPrincipal = async (
    ...args: Parameters<Pool["query"]>
  ): Promise<Awaited<ReturnType<Pool["query"]>>> => {
    const principalApplyOptions = buildDbPrincipalApplyOptionsFromEnv(process.env);
    const client = await pool.connect();
    try {
      await applyCurrentDbPrincipalToConnection(client, principalApplyOptions);
      const query = client.query.bind(client) as unknown as (...innerArgs: Parameters<Pool["query"]>) => ReturnType<Pool["query"]>;
      return await query(...args);
    } finally {
      try {
        await clearDbPrincipalFromConnection(client, principalApplyOptions);
      } finally {
        client.release();
      }
    }
  };

  pool.query = ((...args: Parameters<Pool["query"]>) => {
    if (typeof args.at(-1) === "function") {
      return rawQuery(...args);
    }
    return queryWithPrincipal(...args);
  }) as unknown as Pool["query"];
}

export function createWebappPoolProvider(config: WebappPoolProviderConfig): Pool {
  const pool = new Pool({
    connectionString: config.connectionString,
    max: 5,
  });
  pool.on("connect", prepareWebappPoolClient);
  installPrincipalAwarePoolQuery(pool);
  return pool;
}
