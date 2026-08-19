import { sql } from 'drizzle-orm';
import { describe, it } from 'vitest';
import type { PoolConfig } from 'pg';
import pg from 'pg';
import { createWebappPortContextRuntimeConfig } from '@/infra/db/portContextRuntime';
import { getWebappSqlFromPgClient } from '@/infra/db/runWebappSql';

/* Плоского `DATABASE_URL` в port-context режиме нет (dev/test держат по строке на пул), и `getDrizzle()`
   требует принципала в контексте запроса, которого у голого smoke-теста нет. Пул строится тем же
   построителем, что и у приложения, тем же путём, что и `platformAnalyticsDashboard.devDbProof.test.ts`. */
function proofPoolConfig(): PoolConfig | null {
  try {
    return createWebappPortContextRuntimeConfig(process.env).globalAdmin;
  } catch {
    return null;
  }
}

const POOL_CONFIG = proofPoolConfig();
const hasRealDb = process.env.USE_REAL_DATABASE === '1' && POOL_CONFIG !== null;

describe('Drizzle smoke read', () => {
  /** Real DB only — default `pnpm test` clears DATABASE_URL in vitest.setup. */
  it.skipIf(!hasRealDb)('runs select 1 via shared pool', async () => {
    const pool = new pg.Pool({ ...(POOL_CONFIG as PoolConfig), max: 1 });
    const client = await pool.connect();
    try {
      const db = getWebappSqlFromPgClient(client);
      await db.execute(sql`select 1 as n`);
    } finally {
      client.release();
      await pool.end();
    }
  });
});
