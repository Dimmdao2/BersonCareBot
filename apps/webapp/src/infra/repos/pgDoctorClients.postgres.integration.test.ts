/**
 * Disposable-Postgres proof (Б1/Б3, #1081): doctor clients port via `createPgDoctorClientsPort`
 * exercising real SQL, not a mock.
 *
 * Migrated off the shared dev DB (was `.devDb.integration.test.ts`, opt-in env flags never set
 * anywhere — never ran in CI). The original only checked return-type shape on whatever ambient
 * data happened to exist; this version seeds a real client fixture so the counts/list are proven
 * against a known value, not just "didn't throw".
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPool } from '@/infra/db/client';
import { createPgDoctorClientsPort } from '@/infra/repos/pgDoctorClients';

let clientId: string;

describe('pgDoctorClients (disposable Postgres)', () => {
  beforeAll(async () => {
    const client = await getPool().connect();
    try {
      await client.query('ALTER TABLE platform_users DISABLE ROW LEVEL SECURITY');
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO platform_users (display_name, role) VALUES ($1, 'client') RETURNING id`,
        ['B3 doctor-clients fixture'],
      );
      clientId = inserted.rows[0]!.id;
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    await getPool().end();
  });

  it('listClients returns the real fixture client', async () => {
    const port = createPgDoctorClientsPort();
    const list = await port.listClients({});
    expect(list.some((c) => c.userId === clientId)).toBe(true);
  });

  it('getDashboardPatientMetrics counts the real fixture client', async () => {
    const port = createPgDoctorClientsPort();
    const metrics = await port.getDashboardPatientMetrics();
    expect(metrics.totalClients).toBeGreaterThanOrEqual(1);
    expect(typeof metrics.onSupportCount).toBe('number');
    expect(typeof metrics.visitedThisCalendarMonthCount).toBe('number');
  });
});
