/**
 * D30 Ш0 §2a condition 2 — disposable-Postgres proof for the scheduler advisory lock:
 *
 * 1. Two concurrent `tryAcquireSchedulerLock` calls on the same key: the second must get `null`
 *    while the first holds it; after `release()`, the next acquire must succeed.
 * 2. `DbLockHandle.assertStillHeld()` must throw `SchedulerLockLostError` once the holding
 *    connection's backend is killed (simulating a dropped connection / DB restart), and the lock
 *    must become acquirable again from a fresh connection — proving it was genuinely released,
 *    not just reported lost.
 *
 * Runs against its own throwaway PostgreSQL instance (see d30DisposablePostgres.ts); reads no
 * application env and touches no configured DATABASE_URL.
 */
import { sql } from 'drizzle-orm';
import { startDisposablePostgres } from './d30DisposablePostgres.js';
import { runIntegratorSql } from '../db/runIntegratorSql.js';

const LOCK_KEY = 42001001;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

// D20 level-3 F5: a `main()` that returns early must not exit 0 with an empty log. `passedPieces`
// lives outside `main()` so the completion check below still fires even if `main()` never reaches it.
const EXPECTED_PIECES = ['piece 1', 'piece 2'] as const;
const passedPieces = new Set<string>();

function reportPiecePass(id: (typeof EXPECTED_PIECES)[number], message: string): void {
  passedPieces.add(id);
  console.log(`[${id}] PASS: ${message}`);
}

async function main(): Promise<void> {
  const disposable = startDisposablePostgres('scheduler_lock');
  process.env.DATABASE_URL = disposable.connectionString;
  process.env.APP_BASE_URL = 'http://127.0.0.1:4200';
  process.env.BOOKING_URL = 'http://127.0.0.1:4200/app/patient/cabinet';
  process.env.NODE_ENV = 'development';

  try {
    const { tryAcquireSchedulerLock, SchedulerLockLostError } = await import(
      '../db/repos/schedulerLocks.js'
    );
    const { runWithInfraPrincipal } = await import('../principal/organizationPrincipal.js');
    const { createDbPort, closeDb } = await import('../db/client.js');

    const db = createDbPort();
    const acquire = () =>
      runWithInfraPrincipal({ source: 'scheduler:acquire-lock' }, () =>
        tryAcquireSchedulerLock(LOCK_KEY),
      );

    // --- Piece 1: two concurrent instances ---------------------------------------------------
    const first = await acquire();
    assert(first !== null, 'first acquire on a free lock must succeed');

    const second = await acquire();
    assert(second === null, 'a second concurrent acquire must return null while the first holds the lock');

    await first.release();
    const third = await acquire();
    assert(third !== null, 'acquire after release() must succeed');
    reportPiecePass('piece 1', 'second concurrent acquire got null, post-release acquire succeeded');

    // --- Piece 2: ownership check detects a killed connection --------------------------------
    await third.assertStillHeld(); // sanity: alive connection reports held, must not throw

    const pidRow = await runIntegratorSql<{ pid: number }>(
      db,
      sql`SELECT pid FROM pg_locks
          WHERE locktype = 'advisory' AND objsubid = 1
            AND (classid::bigint << 32 | objid::bigint) = ${LOCK_KEY}::bigint
            AND granted`,
    );
    const victimPid = pidRow.rows[0]?.pid;
    assert(victimPid !== undefined, 'could not find the backend pid holding the lock');
    await runIntegratorSql(db, sql`SELECT pg_terminate_backend(${victimPid})`);
    await new Promise((resolve) => setTimeout(resolve, 300));

    let lostErrorThrown = false;
    try {
      await third.assertStillHeld();
    } catch (err) {
      lostErrorThrown = err instanceof SchedulerLockLostError;
      if (!lostErrorThrown) throw err;
    }
    assert(
      lostErrorThrown,
      'assertStillHeld() must throw SchedulerLockLostError after the holding connection was terminated',
    );
    // Mirrors what main.ts does on SchedulerLockLostError: release the dead handle so the pool
    // destroys the broken client instead of waiting on it forever (it will never come back).
    await third.release();

    const fourth = await acquire();
    assert(fourth !== null, 'the lock must be acquirable again once its dead-connection holder is gone');
    await fourth.release();
    reportPiecePass(
      'piece 2',
      'assertStillHeld() threw SchedulerLockLostError after connection loss, lock was re-acquirable',
    );

    await closeDb();
    console.log('check-d30-scheduler-lock-concurrency: PASS');
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
    console.error(`check-d30-scheduler-lock-concurrency: FAIL: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
