/**
 * Opt-in REAL-Postgres proof for D10c.
 *
 * Concrete failures caught:
 * - firstTryAt is ignored and a fixed appointment reminder is stored relative to enqueue time;
 * - the legacy delay form stops scheduling relative retries;
 * - an already-due absolute reminder is not claimable by the real worker role.
 *
 * Producer/setup and cleanup use app_staff. Claiming uses the exact locked
 * worker:job-queue-drain source and its SELECT/UPDATE-only operational role.
 */
import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getIntegratorDrizzleSession } from '../drizzle.js';
import { createRealPostgresIntegrationTestHarness } from '../realPostgresIntegrationTestHarness.js';
import { messageRetryJobs } from '../schema/integratorQueues.js';
import { claimDueMessageRetryJobs, enqueueMessageRetryJob } from './jobQueue.js';

const enabled =
  process.env.RUN_JOB_QUEUE_ABSTIME_TEST === '1' &&
  process.env.USE_REAL_DATABASE === '1' &&
  Boolean((process.env.DATABASE_URL ?? '').trim()) &&
  Boolean((process.env.DB_PRINCIPAL_SIGNING_SECRET ?? '').trim());

describe.skipIf(!enabled)(
  'integrator.message_retry_jobs accepts a delay or an absolute timestamp (opt-in, real Postgres)',
  () => {
    const harness = createRealPostgresIntegrationTestHarness('worker:job-queue-drain');
    const writtenPhones: string[] = [];

    function uniquePhone(label: string): string {
      const phone = `d10c-${label}-${randomUUID()}`;
      writtenPhones.push(phone);
      return phone;
    }

    async function readRowByPhone(
      phoneNormalized: string,
    ): Promise<{ id: number; nextTryAt: string; status: string }> {
      const rows = await harness.withRuntime((db) =>
        getIntegratorDrizzleSession(db)
          .select({
            id: messageRetryJobs.id,
            nextTryAt: messageRetryJobs.nextTryAt,
            status: messageRetryJobs.status,
          })
          .from(messageRetryJobs)
          .where(eq(messageRetryJobs.phoneNormalized, phoneNormalized)),
      );
      const row = rows[0];
      if (!row) throw new Error(`readRowByPhone: ${phoneNormalized} not found`);
      return row;
    }

    beforeAll(async () => {
      await harness.assertTestDatabases();
    });

    afterAll(async () => {
      await harness.assertTestDatabases();
      if (writtenPhones.length > 0) {
        await harness.withFixtures((db) =>
          getIntegratorDrizzleSession(db)
            .delete(messageRetryJobs)
            .where(inArray(messageRetryJobs.phoneNormalized, writtenPhones)),
        );
      }
    });

    it('stores an absolute firstTryAt in integrator.message_retry_jobs.next_try_at unchanged', async () => {
      const phone = uniquePhone('absolute');
      const dueAt = new Date(Date.now() + 3_600_000).toISOString();

      await harness.withFixtures((db) =>
        enqueueMessageRetryJob(db, {
          phoneNormalized: phone,
          messageText: 'reminder',
          firstTryDelaySeconds: 0,
          firstTryAt: dueAt,
          maxAttempts: 1,
          kind: 'message.deliver',
          payloadJson: {},
        }),
      );

      const row = await readRowByPhone(phone);
      expect(new Date(row.nextTryAt).getTime()).toBe(new Date(dueAt).getTime());
    });

    it('keeps the relative delay form for retry scheduling', async () => {
      const phone = uniquePhone('delay');
      const beforeMs = Date.now();

      await harness.withFixtures((db) =>
        enqueueMessageRetryJob(db, {
          phoneNormalized: phone,
          messageText: 'retry',
          firstTryDelaySeconds: 120,
          maxAttempts: 3,
          kind: 'message.deliver',
          payloadJson: {},
        }),
      );

      const gotMs = new Date((await readRowByPhone(phone)).nextTryAt).getTime();
      expect(gotMs).toBeGreaterThan(beforeMs + 100_000);
      expect(gotMs).toBeLessThan(beforeMs + 140_000);
    });

    it('lets the real worker claim an absolute timestamp that is already due', async () => {
      const phone = uniquePhone('past');

      await harness.withFixtures((db) =>
        enqueueMessageRetryJob(db, {
          phoneNormalized: phone,
          messageText: 'overdue reminder',
          firstTryDelaySeconds: 0,
          firstTryAt: '2000-01-01T00:00:00.000Z',
          maxAttempts: 1,
          kind: 'message.deliver',
          payloadJson: {},
        }),
      );

      const inserted = await readRowByPhone(phone);
      expect(inserted.status).toBe('pending');

      const claimed = await harness.withRuntime((db) => claimDueMessageRetryJobs(db, 1));
      expect(claimed.map((job) => job.id)).toEqual([inserted.id]);
      expect((await readRowByPhone(phone)).status).toBe('processing');
    });
  },
);
