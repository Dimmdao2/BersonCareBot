/**
 * Поведенческая проверка JOIN `appointment_records` ↔ `platform_users`: один номер у двух канонов
 * в разные периоды (`user_phone_history`) — legacy-строка без `platform_user_id` должна цепляться
 * только к владельцу номера на `record_at`.
 *
 * Не гоняется в обычном CI (skip). Dev:
 *   USE_REAL_DATABASE=1 RUN_PG_DOCTOR_CLIENTS_APPOINTMENT_JOIN_DB=1 pnpm --dir apps/webapp exec vitest run src/infra/repos/pgDoctorClients.appointmentJoin.devDb.integration.test.ts
 *
 * Всё в одной транзакции с ROLLBACK — данных не остаётся.
 */
import { afterAll, describe, expect, it } from "vitest";
import pg from "pg";
import { appointmentRecordsJoinPu } from "@/infra/repos/pgDoctorClients";

const MARKER = "[dev-appt-join]";
const PHONE = "+79991110077";
const T_SPLIT = "2020-06-01T00:00:00.000Z";
const T_EARLY = "2020-03-15T12:00:00.000Z";
const T_LATE = "2020-09-10T15:00:00.000Z";

async function assertDevDb(client: pg.PoolClient): Promise<void> {
  const r = await client.query<{ n: string }>(`SELECT current_database() AS n`);
  const n = r.rows[0]?.n ?? "";
  const ok = /_dev$/i.test(n) || n === "bcb_webapp_dev";
  if (!ok) {
    throw new Error(
      `refusing: current_database="${n}" — ожидается dev (например *_dev или bcb_webapp_dev).`,
    );
  }
}

const enabled =
  process.env.RUN_PG_DOCTOR_CLIENTS_APPOINTMENT_JOIN_DB === "1" &&
  process.env.USE_REAL_DATABASE === "1" &&
  Boolean((process.env.DATABASE_URL ?? "").trim());

describe.skipIf(!enabled)("pgDoctorClients appointment join (dev DB, opt-in)", () => {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 2,
  });

  afterAll(async () => {
    await pool.end();
  });

  it("matches legacy appointment to phone owner at record_at (recycled number)", async () => {
    const client = await pool.connect();
    try {
      await assertDevDb(client);
      await client.query("BEGIN");

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
        [idA, PHONE, "2020-01-01T00:00:00.000Z", T_SPLIT],
      );

      await client.query(`UPDATE platform_users SET phone_normalized = NULL WHERE id = $1::uuid`, [idA]);
      await client.query(`UPDATE platform_users SET phone_normalized = $2 WHERE id = $1::uuid`, [idB, PHONE]);

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

      const joinSql = appointmentRecordsJoinPu("pu", "ar");

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

      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
  });
});
