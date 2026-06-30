/**
 * Opt-in read-only smoke против dev-БД для doctor-wide методов
 * pgProgramItemDiscussionPort. Ловит SQL-ошибки, которые мок-тесты пропускают
 * (напр. дубликат столбца "id" в CTE — реальная регрессия TODO#3).
 *
 *   USE_REAL_DATABASE=1 RUN_DOCTOR_COMMENTS_DEV_DB=1 \
 *     pnpm --dir apps/webapp exec vitest run \
 *     src/infra/repos/pgProgramItemDiscussion.doctorComments.devDb.integration.test.ts
 */
import { afterAll, describe, expect, it } from "vitest";
import pg from "pg";
import { createPgProgramItemDiscussionPort } from "@/infra/repos/pgProgramItemDiscussion";

async function assertDevDb(client: pg.PoolClient): Promise<void> {
  const r = await client.query<{ n: string }>(`SELECT current_database() AS n`);
  const n = r.rows[0]?.n ?? "";
  const ok = /_dev$/i.test(n) || n === "bcb_webapp_dev";
  if (!ok) {
    throw new Error(`refusing: current_database="${n}" — expected dev DB`);
  }
}

const enabled =
  process.env.RUN_DOCTOR_COMMENTS_DEV_DB === "1" &&
  process.env.USE_REAL_DATABASE === "1" &&
  Boolean((process.env.DATABASE_URL ?? "").trim());

describe.skipIf(!enabled)("pgProgramItemDiscussion doctor-wide (dev DB, opt-in)", () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

  afterAll(async () => {
    await pool.end();
  });

  /** Берём реальные patient_user_id из активных doctor/course-инстансов dev-БД. */
  async function samplePatientIds(viewerLike: string): Promise<{ ids: string[]; viewer: string }> {
    const client = await pool.connect();
    try {
      await assertDevDb(client);
      const rows = await client.query<{ patient_user_id: string }>(
        `SELECT DISTINCT patient_user_id
           FROM treatment_program_instances
          WHERE status = 'active' AND assignment_source IN ('doctor','course')
          LIMIT 5`,
      );
      const ids = rows.rows.map((r) => r.patient_user_id);
      return { ids, viewer: ids[0] ?? viewerLike };
    } finally {
      client.release();
    }
  }

  it("listUnreadExerciseCommentsForDoctor executes without SQL error and returns an array", async () => {
    const { ids, viewer } = await samplePatientIds("00000000-0000-4000-8000-000000000001");
    const port = createPgProgramItemDiscussionPort();
    const result = await port.listUnreadExerciseCommentsForDoctor({
      patientUserIds: ids.length ? ids : ["00000000-0000-4000-8000-000000000001"],
      viewerUserId: viewer,
      limit: 50,
    });
    expect(Array.isArray(result)).toBe(true);
    // shape-проверка при наличии данных
    for (const row of result) {
      expect(typeof row.patientUserId).toBe("string");
      expect(typeof row.instanceId).toBe("string");
      expect(typeof row.stageItemId).toBe("string");
      expect(row.latestMessage.senderRole).toBe("patient");
      expect(row.latestMessage.mediaFileId).toBeNull();
    }
  });

  it("listExerciseCommentsForDoctor (history) executes and paginates by cursor without SQL error", async () => {
    const { ids, viewer } = await samplePatientIds("00000000-0000-4000-8000-000000000001");
    const port = createPgProgramItemDiscussionPort();
    const page1 = await port.listExerciseCommentsForDoctor({
      patientUserIds: ids.length ? ids : ["00000000-0000-4000-8000-000000000001"],
      viewerUserId: viewer,
      limit: 2,
    });
    expect(Array.isArray(page1)).toBe(true);

    if (page1.length > 0) {
      const last = page1[page1.length - 1]!;
      const page2 = await port.listExerciseCommentsForDoctor({
        patientUserIds: ids,
        viewerUserId: viewer,
        limit: 2,
        cursor: { createdAt: last.createdAt, id: last.latestMessage.id },
      });
      expect(Array.isArray(page2)).toBe(true);
      // курсор строго «раньше» — page2 не содержит последний элемент page1
      for (const row of page2) {
        expect(row.latestMessage.id).not.toBe(last.latestMessage.id);
      }
    }
  });
});
