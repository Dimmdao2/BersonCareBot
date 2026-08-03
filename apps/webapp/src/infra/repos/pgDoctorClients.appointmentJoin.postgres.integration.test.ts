/**
 * Disposable-Postgres proof (Б1/Б3, #1081) — JOIN `appointment_records` ↔ `platform_users`: a
 * phone number recycled between two canonical users (`user_phone_history`) must attribute a
 * legacy row (no `platform_user_id`) to whoever owned the number at `record_at`, not to whoever
 * owns it now.
 *
 * Migrated off the shared dev DB (was `.devDb.integration.test.ts`, opt-in env flags never set
 * anywhere — never ran in CI). Runs inside one BEGIN/ROLLBACK — no data persists either way.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { getPool } from '@/infra/db/client';
import { appointmentRecordsJoinPu } from '@/infra/repos/pgDoctorClients';

const MARKER = '[b3-appt-join]';
const PHONE = '+79991110077';
const T_SPLIT = '2020-06-01T00:00:00.000Z';
const T_EARLY = '2020-03-15T12:00:00.000Z';
const T_LATE = '2020-09-10T15:00:00.000Z';

describe('pgDoctorClients appointment join (disposable Postgres)', () => {
  afterAll(async () => {
    await getPool().end();
  });

  it('matches legacy appointment to phone owner at record_at (recycled number)', async () => {
    const client = await getPool().connect();
    try {
      await client.query(
        `ALTER TABLE platform_users DISABLE ROW LEVEL SECURITY;
         ALTER TABLE appointment_records DISABLE ROW LEVEL SECURITY;
         ALTER TABLE user_phone_history DISABLE ROW LEVEL SECURITY;`,
      );
      await client.query('BEGIN');

      const insA = await client.query<{ id: string }>(
        `INSERT INTO platform_users (display_name, role, phone_normalized)
         VALUES ($1, 'client', $2)
         RETURNING id`,
        [`${MARKER}-A`, PHONE],
      );
      const idA = insA.rows[0]!.id;

      const insB = await client.query<{ id: string }>(
        `INSERT INTO platform_users (display_name, role)
         VALUES ($1, 'client')
         RETURNING id`,
        [`${MARKER}-B`],
      );
      const idB = insB.rows[0]!.id;

      await client.query(
        `INSERT INTO user_phone_history (platform_user_id, phone_normalized, valid_from, valid_to, source)
         VALUES ($1::uuid, $2, $3::timestamptz, $4::timestamptz, 'admin')`,
        [idA, PHONE, '2020-01-01T00:00:00.000Z', T_SPLIT],
      );

      await client.query(`UPDATE platform_users SET phone_normalized = NULL WHERE id = $1::uuid`, [
        idA,
      ]);
      await client.query(`UPDATE platform_users SET phone_normalized = $2 WHERE id = $1::uuid`, [
        idB,
        PHONE,
      ]);

      await client.query(
        `INSERT INTO user_phone_history (platform_user_id, phone_normalized, valid_from, valid_to, source)
         VALUES ($1::uuid, $2, $3::timestamptz, NULL, 'admin')`,
        [idB, PHONE, T_SPLIT],
      );

      await client.query(
        `INSERT INTO appointment_records (
           integrator_record_id, phone_normalized, record_at, status, platform_user_id
         ) VALUES ($1, $2, $3::timestamptz, 'created', NULL)`,
        [`${MARKER}-early`, PHONE, T_EARLY],
      );
      await client.query(
        `INSERT INTO appointment_records (
           integrator_record_id, phone_normalized, record_at, status, platform_user_id
         ) VALUES ($1, $2, $3::timestamptz, 'created', NULL)`,
        [`${MARKER}-late`, PHONE, T_LATE],
      );

      const joinSql = appointmentRecordsJoinPu('pu', 'ar');

      const early = await client.query<{ id: string }>(
        `SELECT pu.id::text AS id
         FROM platform_users pu
         INNER JOIN appointment_records ar ON ${joinSql}
         WHERE pu.display_name LIKE $1
           AND ar.integrator_record_id = $2
           AND ar.deleted_at IS NULL`,
        [`${MARKER}%`, `${MARKER}-early`],
      );
      expect(early.rows.map((r) => r.id).sort()).toEqual([idA].sort());

      const late = await client.query<{ id: string }>(
        `SELECT pu.id::text AS id
         FROM platform_users pu
         INNER JOIN appointment_records ar ON ${joinSql}
         WHERE pu.display_name LIKE $1
           AND ar.integrator_record_id = $2
           AND ar.deleted_at IS NULL`,
        [`${MARKER}%`, `${MARKER}-late`],
      );
      expect(late.rows.map((r) => r.id).sort()).toEqual([idB].sort());
    } finally {
      await client.query('ROLLBACK').catch(() => undefined);
      await client
        .query(
          `ALTER TABLE platform_users ENABLE ROW LEVEL SECURITY;
           ALTER TABLE appointment_records ENABLE ROW LEVEL SECURITY;
           ALTER TABLE user_phone_history ENABLE ROW LEVEL SECURITY;`,
        )
        .catch(() => undefined);
      client.release();
    }
  });
});
