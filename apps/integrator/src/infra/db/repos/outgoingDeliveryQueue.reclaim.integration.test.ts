/**
 * Opt-in REAL-Postgres proof for D10b (docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md):
 * on dev, four rows were found stuck in "processing" since 2026-07-25..28 — capture only picks up
 * "pending"/"failed_retryable", so a row that dies mid-flight in "processing" is silently never
 * retried again — and "sent" rows accumulate in the queue table forever (found back to March 5).
 * Mock-based unit tests cannot catch this: the interesting behavior IS the SQL (stale-row
 * selection by `last_attempt_at`, the reclaim-count dead-letter branch, the retention DELETE) —
 * a mocked DbPort would just echo back whatever the test tells it to, proving nothing.
 *
 *   USE_REAL_DATABASE=1 RUN_OUTGOING_DELIVERY_RECLAIM_TEST=1 DB_PRINCIPAL_CONTEXT_MODE=locked \
 *   DATABASE_URL=<TEST connection string> DB_PRINCIPAL_SIGNING_SECRET=<TEST secret> \
 *   pnpm exec vitest run src/infra/db/repos/outgoingDeliveryQueue.reclaim.integration.test.ts
 *
 * This table has no RLS/org column, so no organization principal is needed — only the infra
 * principal the real worker tick itself runs under (`runWithInfraPrincipal` in
 * outgoingDeliveryWorker.ts), so DB_PRINCIPAL_CONTEXT_MODE=locked still gets a signed context.
 *
 * Never runs against prod (assertTestDb refuses any database name that isn't test-shaped).
 * Cleans up every row it writes; nothing is committed permanently.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { createDbPort } from '../client.js';
import { runWithInfraPrincipal } from '../../principal/organizationPrincipal.js';
import {
  deleteExpiredSentOutgoingDeliveries,
  resetStaleOutgoingDeliveryProcessing,
} from './outgoingDeliveryQueue.js';

const enabled =
  process.env.RUN_OUTGOING_DELIVERY_RECLAIM_TEST === '1' &&
  process.env.USE_REAL_DATABASE === '1' &&
  Boolean((process.env.DATABASE_URL ?? '').trim()) &&
  Boolean((process.env.DB_PRINCIPAL_SIGNING_SECRET ?? '').trim());

describe.skipIf(!enabled)(
  'outgoing_delivery_queue reclaim / retention / dead-letter (opt-in, real Postgres)',
  () => {
    const writtenIds: string[] = [];

    function withInfra<T>(fn: () => Promise<T>): Promise<T> {
      return runWithInfraPrincipal({ source: 'worker:outgoing-delivery-tick' }, fn);
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

    async function insertRow(input: {
      eventId: string;
      status: 'processing' | 'sent';
      lastAttemptAt?: string;
      sentAt?: string;
      reclaimCount?: number;
    }): Promise<string> {
      writtenIds.push(input.eventId);
      const res = await withInfra(() =>
        createDbPort().query<{ id: string }>(
          `INSERT INTO public.outgoing_delivery_queue
             (event_id, kind, channel, payload_json, status, attempt_count, max_attempts,
              next_retry_at, last_attempt_at, sent_at, reclaim_count)
           VALUES ($1, 'operator_alert', 'telegram', '{}'::jsonb, $2, 1, 6,
                   now(), $3, $4, $5)
           RETURNING id`,
          [
            input.eventId,
            input.status,
            input.lastAttemptAt ?? null,
            input.sentAt ?? null,
            input.reclaimCount ?? 0,
          ],
        ),
      );
      const id = res.rows[0]?.id;
      if (!id) throw new Error('insertRow: no id returned');
      return id;
    }

    async function readRow(
      id: string,
    ): Promise<{ status: string; reclaim_count: number; failure_class: string | null }> {
      const res = await withInfra(() =>
        createDbPort().query<{
          status: string;
          reclaim_count: number;
          failure_class: string | null;
        }>(
          'SELECT status, reclaim_count, failure_class FROM public.outgoing_delivery_queue WHERE id = $1',
          [id],
        ),
      );
      const row = res.rows[0];
      if (!row) throw new Error(`readRow: ${id} not found`);
      return row;
    }

    afterAll(async () => {
      await assertTestDb();
      if (writtenIds.length > 0) {
        await withInfra(() =>
          createDbPort().query('DELETE FROM public.outgoing_delivery_queue WHERE event_id = ANY($1)', [
            writtenIds,
          ]),
        );
      }
    });

    it('a "processing" row stuck past the timeout is returned to "pending"; one still within the timeout is left alone', async () => {
      await assertTestDb();
      const staleId = await insertRow({
        eventId: `reclaim-it-stale-${Date.now()}`,
        status: 'processing',
        lastAttemptAt: new Date(Date.now() - 20 * 60_000).toISOString(),
      });
      const freshId = await insertRow({
        eventId: `reclaim-it-fresh-${Date.now()}`,
        status: 'processing',
        lastAttemptAt: new Date().toISOString(),
      });

      const result = await withInfra(() =>
        resetStaleOutgoingDeliveryProcessing(createDbPort(), 10, 5),
      );
      expect(result.reclaimed).toBeGreaterThanOrEqual(1);

      const stale = await withInfra(() => readRow(staleId));
      expect(stale.status).toBe('pending');
      expect(stale.reclaim_count).toBe(1);

      const fresh = await withInfra(() => readRow(freshId));
      expect(fresh.status).toBe('processing');
    });

    it('a row that already hit the reclaim cap is dead-lettered instead of returned to "pending" again', async () => {
      await assertTestDb();
      const id = await insertRow({
        eventId: `reclaim-it-cap-${Date.now()}`,
        status: 'processing',
        lastAttemptAt: new Date(Date.now() - 20 * 60_000).toISOString(),
        reclaimCount: 4,
      });

      const result = await withInfra(() =>
        resetStaleOutgoingDeliveryProcessing(createDbPort(), 10, 5),
      );
      expect(result.deadLettered).toBeGreaterThanOrEqual(1);

      const row = await withInfra(() => readRow(id));
      expect(row.status).toBe('dead');
      expect(row.reclaim_count).toBe(5);
      expect(row.failure_class).toBe('reclaim_limit_exceeded');
    });

    it('a "sent" row older than the retention period is deleted from the queue; a recent one is not', async () => {
      await assertTestDb();
      const oldId = await insertRow({
        eventId: `reclaim-it-retain-old-${Date.now()}`,
        status: 'sent',
        sentAt: new Date(Date.now() - 40 * 24 * 60 * 60_000).toISOString(),
      });
      const recentId = await insertRow({
        eventId: `reclaim-it-retain-recent-${Date.now()}`,
        status: 'sent',
        sentAt: new Date().toISOString(),
      });

      const deletedCount = await withInfra(() =>
        deleteExpiredSentOutgoingDeliveries(createDbPort(), 30),
      );
      expect(deletedCount).toBeGreaterThanOrEqual(1);

      const oldGone = await withInfra(() =>
        createDbPort().query<{ id: string }>(
          'SELECT id FROM public.outgoing_delivery_queue WHERE id = $1',
          [oldId],
        ),
      );
      expect(oldGone.rows).toHaveLength(0);

      const recentStill = await withInfra(() => readRow(recentId));
      expect(recentStill.status).toBe('sent');
    });
  },
);
