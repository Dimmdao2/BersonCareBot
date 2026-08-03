/**
 * Disposable-Postgres proof (Б1/Б3, #1081): doctor analytics metric accounts via
 * `createPgDoctorAnalyticsMetricAccountsPort` exercising real SQL, not a mock.
 *
 * Migrated off the shared dev DB (was `.devDb.integration.test.ts`, opt-in env flags never set
 * anywhere — never ran in CI). The original fixture query selected from a table named
 * `organizations`, which does not exist in this schema (the real table is `be_organizations`) --
 * so even on a real dev DB this would have thrown, not silently passed; the `if (!orgId) return`
 * guard never protected against that, it only covered a genuinely empty org table. Corrected to
 * the real table name and given its own fixture client so the found branch is proven for real.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPool } from '@/infra/db/client';
import { createPgDoctorAnalyticsMetricAccountsPort } from '@/infra/repos/pgDoctorAnalyticsMetricAccounts';

const ORG_ID = '50000000-0000-4000-8000-000000000001';
let clientId: string;

describe('pgDoctorAnalyticsMetricAccounts (disposable Postgres)', () => {
  beforeAll(async () => {
    const client = await getPool().connect();
    try {
      await client.query(
        `ALTER TABLE be_organizations DISABLE ROW LEVEL SECURITY;
         ALTER TABLE be_organizations DISABLE TRIGGER be_organizations_reference_catalog_snapshot;
         ALTER TABLE platform_users DISABLE ROW LEVEL SECURITY;`,
      );
      await client.query(`INSERT INTO be_organizations (id, title) VALUES ($1, 'B3 analytics')`, [
        ORG_ID,
      ]);
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO platform_users (display_name, role) VALUES ($1, 'client') RETURNING id`,
        ['B3 analytics client'],
      );
      clientId = inserted.rows[0]!.id;
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    await getPool().end();
  });

  it('listMetricAccounts clients_total returns the real fixture client', async () => {
    const port = createPgDoctorAnalyticsMetricAccountsPort(async () => ORG_ID);
    const result = await port.listMetricAccounts({
      metric: 'clients_total',
      period: { preset: 'week' },
      limit: 5,
      offset: 0,
      iana: 'Europe/Moscow',
    });

    expect(result.items.some((row) => row.userId === clientId)).toBe(true);
    expect(result.hasMore).toBe(false);
    expect(result.nextOffset).toBeNull();
  });
});
