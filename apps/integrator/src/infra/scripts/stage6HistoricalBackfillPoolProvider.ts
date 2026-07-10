import { Pool } from "pg";
import type { PoolClient } from "pg";

type Stage6HistoricalBackfillPoolConfig = {
  connectionString: string;
};

function prepareStage6HistoricalBackfillPoolClient(_client: PoolClient): void {
  // Dormant SAAS hook: one-off backfill DB principal setup belongs here.
}

export function createStage6HistoricalBackfillPoolProvider(
  config: Stage6HistoricalBackfillPoolConfig,
): Pool {
  const pool = new Pool({ connectionString: config.connectionString, max: 4 });
  pool.on("connect", prepareStage6HistoricalBackfillPoolClient);
  return pool;
}
