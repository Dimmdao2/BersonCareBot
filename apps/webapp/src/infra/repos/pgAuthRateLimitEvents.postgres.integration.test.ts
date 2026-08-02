/**
 * Disposable-Postgres proof (Б1/Б3, #1081): sliding-window rate limit records rows in
 * `auth_rate_limit_events` and enforces `maxPerWindow` — migrated off the shared dev DB, which
 * never ran this file (opt-in env flags were set nowhere in CI or package.json).
 */
import { afterAll, describe, expect, it } from 'vitest';
import { getPool } from '@/infra/db/client';
import { runWebappPgText } from '@/infra/db/runWebappSql';
import { checkAndRecordAuthRateLimitEvent } from '@/infra/repos/pgAuthRateLimitEvents';

const SCOPE = 'test.auth_rate_limit';
const KEY = 'harness-key';

describe('pgAuthRateLimitEvents (disposable Postgres)', () => {
  afterAll(async () => {
    await getPool().end();
  });

  it('records events and enforces maxPerWindow inside a transaction', async () => {
    const params = {
      scope: SCOPE,
      key: KEY,
      windowMs: 3_600_000,
      maxPerWindow: 2,
    };

    expect(await checkAndRecordAuthRateLimitEvent(params)).toBe(false);
    expect(await checkAndRecordAuthRateLimitEvent(params)).toBe(false);
    expect(await checkAndRecordAuthRateLimitEvent(params)).toBe(true);

    const count = await runWebappPgText<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM auth_rate_limit_events WHERE scope = $1 AND key = $2`,
      [SCOPE, KEY],
    );
    expect(Number.parseInt(count.rows[0]?.c ?? '0', 10)).toBe(2);
  });
});
