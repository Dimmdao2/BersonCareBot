/**
 * D20 level-3 item 14 — disposable-Postgres proof for `repos/idempotencyKeys.ts`
 * `createPostgresIdempotencyPort().tryAcquire`, the event-gateway's incoming-webhook dedup guard
 * (`kernel/eventGateway/index.ts`): a provider retries the same webhook delivery concurrently
 * (e.g. two in-flight retries racing after a slow first response), and only one may win the row —
 * a second acquire on the same live key must fail, not both succeed and process the event twice.
 *
 * Runs against its own throwaway PostgreSQL instance (see d30DisposablePostgres.ts); reads no
 * application env and touches no configured DATABASE_URL. Same sanctioned mechanism as the two
 * sibling D30 scripts in this directory — see `.cursor/rules/test-execution-policy.md`.
 */
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { startDisposablePostgres } from './d30DisposablePostgres.js';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const IDEMPOTENCY_KEYS_DDL = `
CREATE SCHEMA IF NOT EXISTS integrator;
CREATE TABLE integrator.idempotency_keys (
  key text PRIMARY KEY,
  request_hash text NOT NULL,
  status smallint NOT NULL,
  response_body jsonb NOT NULL DEFAULT '{}'::jsonb,
  expires_at timestamptz NOT NULL
);
`;

async function main(): Promise<void> {
  const disposable = startDisposablePostgres('idempotency_keys');
  process.env.DATABASE_URL = disposable.connectionString;
  process.env.APP_BASE_URL = 'http://127.0.0.1:4200';
  process.env.BOOKING_URL = 'http://127.0.0.1:4200/app/patient/cabinet';
  process.env.NODE_ENV = 'development';

  try {
    const ddlClient = new pg.Client({ connectionString: disposable.connectionString });
    await ddlClient.connect();
    await ddlClient.query(IDEMPOTENCY_KEYS_DDL);
    await ddlClient.end();

    const { createPostgresIdempotencyPort } = await import('../db/repos/idempotencyKeys.js');
    const { createDbPort, closeDb } = await import('../db/client.js');
    const { runWithInfraPrincipal } = await import('../principal/organizationPrincipal.js');

    const db = createDbPort();
    const port = createPostgresIdempotencyPort(db);
    const key = `d30-idem-race-${randomUUID()}`;

    // --- Two concurrent tryAcquire on the same fresh key: exactly one must win ----------------
    const [first, second] = await Promise.all([
      runWithInfraPrincipal({ source: 'delivery-handler' }, () => port.tryAcquire(key, 60)),
      runWithInfraPrincipal({ source: 'delivery-handler' }, () => port.tryAcquire(key, 60)),
    ]);
    const wins = [first, second].filter(Boolean).length;
    assert(wins === 1, `expected exactly one concurrent tryAcquire to win, got ${wins} (first=${first}, second=${second})`);
    console.log('[piece 1] PASS: two concurrent tryAcquire on the same key, exactly one won');

    // --- A third acquire while the key is still live must also lose (not a fluke of the pair) --
    const third = await runWithInfraPrincipal({ source: 'delivery-handler' }, () =>
      port.tryAcquire(key, 60),
    );
    assert(third === false, 'a third acquire on the still-live key must also fail');
    console.log('[piece 2] PASS: a further acquire on the still-live key also failed');

    await closeDb();
    console.log('check-d30-idempotency-key-concurrency: PASS');
  } finally {
    disposable.stop();
  }
}

main().catch((err) => {
  console.error(
    `check-d30-idempotency-key-concurrency: FAIL: ${err instanceof Error ? err.message : String(err)}`,
  );
  process.exit(1);
});
