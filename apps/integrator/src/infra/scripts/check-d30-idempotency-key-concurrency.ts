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

// D20 level-3 F5: a `main()` that returns early (a bug, or someone "temporarily" commenting out a
// piece) must not exit 0 with an empty log — this is the same self-check gate already used for the
// constants gate. `passedPieces` lives outside `main()` on purpose: the completion check below runs
// unconditionally after `main()` settles, so it still fires even if `main()` itself never reaches it.
const EXPECTED_PIECES = ['piece 1', 'piece 2', 'piece 3'] as const;
const passedPieces = new Set<string>();

function reportPiecePass(id: (typeof EXPECTED_PIECES)[number], message: string): void {
  passedPieces.add(id);
  console.log(`[${id}] PASS: ${message}`);
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
    reportPiecePass('piece 1', 'two concurrent tryAcquire on the same key, exactly one won');

    // --- A third acquire while the key is still live must also lose (not a fluke of the pair) --
    const third = await runWithInfraPrincipal({ source: 'delivery-handler' }, () =>
      port.tryAcquire(key, 60),
    );
    assert(third === false, 'a third acquire on the still-live key must also fail');
    reportPiecePass('piece 2', 'a further acquire on the still-live key also failed');

    // --- Piece 3 (F1): release() must only free the ONE key it names, not the whole table -------
    const keyA = `d30-idem-release-a-${randomUUID()}`;
    const keyB = `d30-idem-release-b-${randomUUID()}`;
    const acquiredA = await runWithInfraPrincipal({ source: 'delivery-handler' }, () =>
      port.tryAcquire(keyA, 60),
    );
    const acquiredB = await runWithInfraPrincipal({ source: 'delivery-handler' }, () =>
      port.tryAcquire(keyB, 60),
    );
    assert(acquiredA, 'setup: acquiring fresh key A must succeed');
    assert(acquiredB, 'setup: acquiring fresh key B must succeed');
    assert(port.release, 'createPostgresIdempotencyPort must implement release for this piece');

    await runWithInfraPrincipal({ source: 'delivery-handler' }, () => port.release!(keyA));

    const keyBStillLive = await runWithInfraPrincipal({ source: 'delivery-handler' }, () =>
      port.tryAcquire(keyB, 60),
    );
    assert(
      keyBStillLive === false,
      'releasing key A must not free key B — a re-acquire of the still-live key B must fail',
    );

    const keyAReleased = await runWithInfraPrincipal({ source: 'delivery-handler' }, () =>
      port.tryAcquire(keyA, 60),
    );
    assert(keyAReleased === true, 'the released key A must be acquirable again');
    reportPiecePass('piece 3', "release() frees only its own key — the still-live sibling key stayed dead, and only the released key was reacquirable");

    await closeDb();
    console.log('check-d30-idempotency-key-concurrency: PASS');
  } finally {
    disposable.stop();
  }
}

main()
  .then(() => {
    const missing = EXPECTED_PIECES.filter((id) => !passedPieces.has(id));
    assert(
      missing.length === 0,
      `expected all of [${EXPECTED_PIECES.join(', ')}] to report PASS, missing: ${missing.join(', ')} (a piece was skipped, or main() returned before reaching it)`,
    );
  })
  .catch((err) => {
    console.error(
      `check-d30-idempotency-key-concurrency: FAIL: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
  });
