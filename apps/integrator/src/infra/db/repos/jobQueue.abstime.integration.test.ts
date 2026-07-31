/**
 * Opt-in REAL-Postgres proof for D10c (docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md):
 * `enqueueMessageRetryJob` accepts EITHER a relative delay (seconds) OR an absolute timestamp
 * (`firstTryAt`), both landing in the SAME `next_try_at` column — no second column, no second
 * write path. A mocked DbPort would just echo back whatever the caller passed and prove nothing
 * about which column actually received the value or whether a past timestamp is silently dropped
 * instead of scheduled — the interesting behavior IS the row Postgres ends up holding.
 *
 *   USE_REAL_DATABASE=1 RUN_JOB_QUEUE_ABSTIME_TEST=1 DB_PRINCIPAL_CONTEXT_MODE=locked \
 *   DATABASE_URL=<TEST connection string> DB_PRINCIPAL_SIGNING_SECRET=<TEST secret> \
 *   pnpm exec vitest run src/infra/db/repos/jobQueue.abstime.integration.test.ts
 *
 * This table has no RLS/org column, so no organization principal is needed — only the infra
 * principal the real worker drain runs under (`worker:job-queue-drain` in
 * infra/runtime/worker/main.ts), so DB_PRINCIPAL_CONTEXT_MODE=locked still gets a signed context.
 *
 * Never runs against prod (assertTestDb refuses any database name that isn't test-shaped).
 * Cleans up every row it writes; nothing is committed permanently.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { createDbPort } from '../client.js';
import { runWithInfraPrincipal } from '../../principal/organizationPrincipal.js';
import { claimDueMessageRetryJobs, enqueueMessageRetryJob } from './jobQueue.js';

const enabled =
  process.env.RUN_JOB_QUEUE_ABSTIME_TEST === '1' &&
  process.env.USE_REAL_DATABASE === '1' &&
  Boolean((process.env.DATABASE_URL ?? '').trim()) &&
  Boolean((process.env.DB_PRINCIPAL_SIGNING_SECRET ?? '').trim());

describe.skipIf(!enabled)(
  'message_retry_jobs: enqueue accepts seconds OR an absolute timestamp, same column (opt-in, real Postgres)',
  () => {
    const writtenPhones: string[] = [];

    function withInfra<T>(fn: () => Promise<T>): Promise<T> {
      return runWithInfraPrincipal({ source: 'worker:job-queue-drain' }, fn);
    }

    async function assertTestDb(): Promise<void> {
      const r = await withInfra(() =>
        createDbPort().query<{ n: string }>('SELECT current_database() AS n', []),
      );
      const n = r.rows[0]?.n ?? '';
      if (!/_test$/i.test(n)) {
        throw new Error(`refusing: current_database="${n}" — expected a *_test database`);
      }
    }

    async function readRowByPhone(
      phoneNormalized: string,
    ): Promise<{ id: number; next_try_at: string; status: string }> {
      const res = await withInfra(() =>
        createDbPort().query<{ id: number; next_try_at: string; status: string }>(
          `SELECT id, next_try_at::text AS next_try_at, status
             FROM integrator.message_retry_jobs
            WHERE phone_normalized = $1`,
          [phoneNormalized],
        ),
      );
      const row = res.rows[0];
      if (!row) throw new Error(`readRowByPhone: ${phoneNormalized} not found`);
      return row;
    }

    afterAll(async () => {
      await assertTestDb();
      if (writtenPhones.length > 0) {
        await withInfra(() =>
          createDbPort().query(
            'DELETE FROM integrator.message_retry_jobs WHERE phone_normalized = ANY($1)',
            [writtenPhones],
          ),
        );
      }
    });

    it('an absolute firstTryAt lands in next_try_at as exactly that moment', async () => {
      await assertTestDb();
      const phone = `+7abstime-${Date.now()}`;
      writtenPhones.push(phone);
      const dueAt = new Date(Date.now() + 3600_000).toISOString();

      await withInfra(() =>
        enqueueMessageRetryJob(createDbPort(), {
          phoneNormalized: phone,
          messageText: 'reminder',
          firstTryDelaySeconds: 0,
          firstTryAt: dueAt,
          maxAttempts: 1,
          kind: 'message.deliver',
          payloadJson: {},
        }),
      );

      const row = await withInfra(() => readRowByPhone(phone));
      expect(new Date(row.next_try_at).getTime()).toBe(new Date(dueAt).getTime());
    });

    it('a relative firstTryDelaySeconds still lands next_try_at near now()+delay — legacy retry behavior unchanged', async () => {
      await assertTestDb();
      const phone = `+7delay-${Date.now()}`;
      writtenPhones.push(phone);
      const beforeMs = Date.now();

      await withInfra(() =>
        enqueueMessageRetryJob(createDbPort(), {
          phoneNormalized: phone,
          messageText: 'retry',
          firstTryDelaySeconds: 120,
          maxAttempts: 3,
          kind: 'message.deliver',
          payloadJson: {},
        }),
      );

      const row = await withInfra(() => readRowByPhone(phone));
      const gotMs = new Date(row.next_try_at).getTime();
      // DB computes now()+120s at insert time; assert it landed within a generous window of the
      // caller's own now()+120s instead of pinning to the DB clock, which we don't control here.
      expect(gotMs).toBeGreaterThan(beforeMs + 100_000);
      expect(gotMs).toBeLessThan(beforeMs + 140_000);
    });

    it('a firstTryAt in the past is scheduled for immediate execution, not dropped', async () => {
      await assertTestDb();
      const phone = `+7past-${Date.now()}`;
      writtenPhones.push(phone);
      const pastAt = new Date(Date.now() - 3600_000).toISOString();

      await withInfra(() =>
        enqueueMessageRetryJob(createDbPort(), {
          phoneNormalized: phone,
          messageText: 'overdue reminder',
          firstTryDelaySeconds: 0,
          firstTryAt: pastAt,
          maxAttempts: 1,
          kind: 'message.deliver',
          payloadJson: {},
        }),
      );

      const inserted = await withInfra(() => readRowByPhone(phone));
      expect(inserted.status).toBe('pending');

      const claimed = await withInfra(() => claimDueMessageRetryJobs(createDbPort(), 50));
      const claimedIds = claimed.map((j) => j.id);
      expect(claimedIds).toContain(inserted.id);

      const after = await withInfra(() => readRowByPhone(phone));
      expect(after.status).toBe('processing');
    });
  },
);
