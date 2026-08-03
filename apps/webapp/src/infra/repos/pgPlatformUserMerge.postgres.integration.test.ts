/**
 * Disposable-Postgres proof (Б1/Б3, #1081): two `platform_users` rows → `pickMergeTargetId` →
 * `mergePlatformUsersInTransaction` (reason `projection`) — the only test of the merge
 * transaction's real DB effects (no other file references either function).
 *
 * Migrated off the shared dev DB (was `.devDb.integration.test.ts`, opt-in env flags never set
 * anywhere — never ran in CI). Runs inside one BEGIN/ROLLBACK — no data persists either way.
 *
 * Migrating this file off the dead env-gate is what surfaced a real, previously-undiscovered bug:
 * `mergePlatformUsersInTransaction`'s `product_analytics_user_hourly` step referenced
 * `ON CONFLICT ON CONSTRAINT product_analytics_user_hourly_pkey`, a constraint migration 0200
 * dropped in favor of two partial unique indexes -- so the statement failed to even PARSE
 * (Postgres validates a named `ON CONFLICT ON CONSTRAINT` target at parse time, independent of
 * whether any row would actually be inserted), meaning every real invocation of this merge path
 * would have crashed, on any correctly-migrated database. It also silently dropped
 * `organization_id` from the merged row. Fixed in `packages/platform-merge/src/pgPlatformUserMerge.ts`
 * alongside this migration; the second `it` below inserts a genuine conflicting analytics row for
 * both users so the fix's summing arithmetic is actually exercised, not just its absence of a crash.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { getPool } from '@/infra/db/client';
import {
  mergePlatformUsersInTransaction,
  pickMergeTargetId,
} from '@/infra/repos/pgPlatformUserMerge';

const MARKER = '[b3-merge]';
const PHONE = '+79991110099';

describe('pgPlatformUserMerge (disposable Postgres)', () => {
  afterAll(async () => {
    await getPool().end();
  });

  it('projection merge: trusted phone on the canon, phoneless duplicate → merged_into_id', async () => {
    const client = await getPool().connect();
    try {
      await client.query(
        `ALTER TABLE platform_users DISABLE ROW LEVEL SECURITY;
         ALTER TABLE user_channel_bindings DISABLE ROW LEVEL SECURITY;`,
      );
      await client.query('BEGIN');

      const insA = await client.query<{ id: string }>(
        `INSERT INTO platform_users (display_name, role, phone_normalized, patient_phone_trust_at)
         VALUES ($1, 'client', $2, now())
         RETURNING id`,
        [`${MARKER} target-phone`, PHONE],
      );
      const insB = await client.query<{ id: string }>(
        `INSERT INTO platform_users (display_name, role)
         VALUES ($1, 'client')
         RETURNING id`,
        [`${MARKER} dup-no-phone`],
      );
      const idA = insA.rows[0]!.id;
      const idB = insB.rows[0]!.id;

      const rows = await client.query<{
        id: string;
        phone_normalized: string | null;
        integrator_user_id: string | null;
        created_at: Date;
      }>(
        `SELECT id, phone_normalized, integrator_user_id::text AS integrator_user_id, created_at
         FROM platform_users WHERE id IN ($1::uuid, $2::uuid)`,
        [idA, idB],
      );
      const ra = rows.rows.find((x) => x.id === idA)!;
      const rb = rows.rows.find((x) => x.id === idB)!;
      const picked = pickMergeTargetId(
        {
          id: ra.id,
          phone_normalized: ra.phone_normalized,
          integrator_user_id: ra.integrator_user_id,
          created_at: ra.created_at,
        },
        {
          id: rb.id,
          phone_normalized: rb.phone_normalized,
          integrator_user_id: rb.integrator_user_id,
          created_at: rb.created_at,
        },
      );

      await mergePlatformUsersInTransaction(client, picked.target, picked.duplicate, 'projection');

      const verify = await client.query<{
        id: string;
        merged_into_id: string | null;
        phone_normalized: string | null;
        patient_phone_trust_at: Date | null;
      }>(
        `SELECT id, merged_into_id, phone_normalized, patient_phone_trust_at
         FROM platform_users WHERE id IN ($1::uuid, $2::uuid) ORDER BY id`,
        [idA, idB],
      );
      const dupRow = verify.rows.find((r) => r.id === picked.duplicate);
      const tgtRow = verify.rows.find((r) => r.id === picked.target);
      expect(dupRow?.merged_into_id).toBe(picked.target);
      expect(tgtRow?.phone_normalized?.trim()).toBe(PHONE);
      expect(tgtRow?.patient_phone_trust_at).toBeTruthy();
    } finally {
      await client.query('ROLLBACK').catch(() => undefined);
      await client
        .query(
          `ALTER TABLE platform_users ENABLE ROW LEVEL SECURITY;
           ALTER TABLE user_channel_bindings ENABLE ROW LEVEL SECURITY;`,
        )
        .catch(() => undefined);
      client.release();
    }
  });

  it('merges colliding product_analytics_user_hourly rows by summing counters, both org-scoped and global buckets', async () => {
    const client = await getPool().connect();
    try {
      await client.query(
        `ALTER TABLE platform_users DISABLE ROW LEVEL SECURITY;
         ALTER TABLE be_organizations DISABLE ROW LEVEL SECURITY;
         ALTER TABLE be_organizations DISABLE TRIGGER be_organizations_reference_catalog_snapshot;
         ALTER TABLE product_analytics_user_hourly DISABLE ROW LEVEL SECURITY;`,
      );
      await client.query('BEGIN');

      const orgId = '30000000-0000-4000-8000-000000000001';
      await client.query(`INSERT INTO be_organizations (id, title) VALUES ($1, 'B3 analytics merge')`, [
        orgId,
      ]);
      const insTarget = await client.query<{ id: string }>(
        `INSERT INTO platform_users (display_name, role) VALUES ($1, 'client') RETURNING id`,
        [`${MARKER} analytics-target`],
      );
      const insDup = await client.query<{ id: string }>(
        `INSERT INTO platform_users (display_name, role) VALUES ($1, 'client') RETURNING id`,
        [`${MARKER} analytics-dup`],
      );
      const targetId = insTarget.rows[0]!.id;
      const duplicateId = insDup.rows[0]!.id;

      const bucketHour = '2027-01-01T10:00:00.000Z';

      // Global bucket (organization_id IS NULL) — both users have a row for the SAME
      // (bucket_hour, entry_channel, page_key), forcing the ON CONFLICT DO UPDATE branch.
      await client.query(
        `INSERT INTO product_analytics_user_hourly
           (organization_id, bucket_hour, user_id, entry_channel, page_key, app_opens, page_views, push_opens, active_minutes, last_seen_at, updated_at)
         VALUES
           (NULL, $1::timestamptz, $2::uuid, 'telegram', '__all__', 3, 1, 0, 2, $1::timestamptz, now()),
           (NULL, $1::timestamptz, $3::uuid, 'telegram', '__all__', 4, 5, 1, 6, $1::timestamptz, now())`,
        [bucketHour, targetId, duplicateId],
      );
      // Org-scoped bucket — only the duplicate has a row, so this exercises the plain INSERT path
      // (no pre-existing target row to conflict with) for the organization_id IS NOT NULL branch.
      await client.query(
        `INSERT INTO product_analytics_user_hourly
           (organization_id, bucket_hour, user_id, entry_channel, page_key, app_opens, page_views, push_opens, active_minutes, last_seen_at, updated_at)
         VALUES
           ($1::uuid, $2::timestamptz, $3::uuid, 'max', 'home', 1, 0, 0, 1, $2::timestamptz, now())`,
        [orgId, bucketHour, duplicateId],
      );

      await mergePlatformUsersInTransaction(client, targetId, duplicateId, 'projection');

      const globalRow = await client.query<{ app_opens: number; page_views: number; push_opens: number; active_minutes: number }>(
        `SELECT app_opens, page_views, push_opens, active_minutes
         FROM product_analytics_user_hourly
         WHERE user_id = $1::uuid AND organization_id IS NULL AND bucket_hour = $2::timestamptz AND entry_channel = 'telegram'`,
        [targetId, bucketHour],
      );
      expect(globalRow.rows).toEqual([{ app_opens: 7, page_views: 6, push_opens: 1, active_minutes: 8 }]);

      const orgRow = await client.query<{ organization_id: string; app_opens: number }>(
        `SELECT organization_id, app_opens
         FROM product_analytics_user_hourly
         WHERE user_id = $1::uuid AND entry_channel = 'max' AND page_key = 'home'`,
        [targetId],
      );
      expect(orgRow.rows).toEqual([{ organization_id: orgId, app_opens: 1 }]);

      const leftover = await client.query(
        `SELECT 1 FROM product_analytics_user_hourly WHERE user_id = $1::uuid`,
        [duplicateId],
      );
      expect(leftover.rows).toEqual([]);
    } finally {
      await client.query('ROLLBACK').catch(() => undefined);
      await client
        .query(
          `ALTER TABLE platform_users ENABLE ROW LEVEL SECURITY;
           ALTER TABLE be_organizations ENABLE ROW LEVEL SECURITY;
           ALTER TABLE be_organizations ENABLE TRIGGER be_organizations_reference_catalog_snapshot;
           ALTER TABLE product_analytics_user_hourly ENABLE ROW LEVEL SECURITY;`,
        )
        .catch(() => undefined);
      client.release();
    }
  });
});
