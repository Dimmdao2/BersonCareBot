import { Pool } from "pg";
import type { PoolClient } from "pg";

type WebappPoolProviderConfig = {
  connectionString: string;
};

function prepareWebappPoolClient(_client: PoolClient): void {
  // Dormant SAAS hook: future per-process DB principal setup belongs here.
}

export function createWebappPoolProvider(config: WebappPoolProviderConfig): Pool {
  const pool = new Pool({
    connectionString: config.connectionString,
    max: 5,
  });
  pool.on("connect", prepareWebappPoolClient);
  return pool;
}
