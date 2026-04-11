/**
 * Ручной smoke против реальной dev-БД: два `platform_users` → `pickMergeTargetId` → `merge` (reason `projection`).
 * В обычном CI не запускается (skip), чтобы не трогать БД.
 *
 * Из каталога apps/webapp:
 *   USE_REAL_DATABASE=1 RUN_PG_MERGE_DEV_DB=1 pnpm exec vitest run src/infra/repos/pgPlatformUserMerge.devDb.integration.test.ts
 *
 * Транзакция в конце откатывается (ROLLBACK) — в БД не остаётся следов. Если когда-то коммитили вручную, очистка:
 *   DELETE FROM user_channel_bindings WHERE user_id IN (SELECT id FROM platform_users WHERE display_name LIKE '[dev-smoke-merge]%');
 *   DELETE FROM platform_users WHERE display_name LIKE '[dev-smoke-merge]%';
 */
import { afterAll, describe, expect, it } from "vitest";
import pg from "pg";
import { mergePlatformUsersInTransaction, pickMergeTargetId } from "@/infra/repos/pgPlatformUserMerge";

const MARKER = "[dev-smoke-merge]";
const PHONE = "+79991110099";

async function assertDevDb(client: pg.PoolClient): Promise<string> {
  const r = await client.query<{ n: string }>(`SELECT current_database() AS n`);
  const n = r.rows[0]?.n ?? "";
  const ok = /_dev$/i.test(n) || n === "bcb_webapp_dev";
  if (!ok) {
    throw new Error(
      `refusing: current_database="${n}" — ожидается dev (например *_dev или bcb_webapp_dev).`,
    );
  }
  return n;
}

async function cleanup(client: pg.PoolClient): Promise<void> {
  const ids = await client.query<{ id: string }>(
    `SELECT id FROM platform_users WHERE display_name LIKE $1`,
    [`${MARKER}%`],
  );
  for (const row of ids.rows) {
    await client.query(`DELETE FROM user_channel_bindings WHERE user_id = $1::uuid`, [row.id]);
  }
  await client.query(`DELETE FROM platform_users WHERE display_name LIKE $1`, [`${MARKER}%`]);
}

const enabled =
  process.env.RUN_PG_MERGE_DEV_DB === "1" &&
  process.env.USE_REAL_DATABASE === "1" &&
  Boolean((process.env.DATABASE_URL ?? "").trim());

describe.skipIf(!enabled)("pgPlatformUserMerge (dev DB, opt-in)", () => {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 2,
  });

  afterAll(async () => {
    await pool.end();
  });

  it("projection merge: trusted phone на каноне, дубликат без телефона → merged_into_id", async () => {
    const client = await pool.connect();
    try {
      await assertDevDb(client);

      await client.query("BEGIN");
      await cleanup(client);

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

      await mergePlatformUsersInTransaction(client, picked.target, picked.duplicate, "projection");

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

      await client.query("ROLLBACK");
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  });
});
