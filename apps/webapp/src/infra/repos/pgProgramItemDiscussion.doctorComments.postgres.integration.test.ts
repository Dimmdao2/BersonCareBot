/**
 * Disposable-Postgres proof (Б1/Б3, #1081) against doctor-wide methods of
 * `pgProgramItemDiscussionPort`. Catches SQL errors mock tests miss (e.g. duplicate "id" column
 * in a CTE — a real regression, TODO#3).
 *
 * Migrated off the shared dev DB (was `.devDb.integration.test.ts`, opt-in env flags never set
 * anywhere — never ran in CI). The original samples real `treatment_program_instances` rows and
 * degrades gracefully when none exist (a placeholder id, empty-array assertions only); on the
 * disposable clone that's always the empty case, so this is a faithful migration of the same
 * defensive logic, not a new fixture — building a real active-instance fixture here would need a
 * full treatment-program/stage-item/discussion-thread setup well beyond this migration's scope.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { getPool } from '@/infra/db/client';
import { createPgProgramItemDiscussionPort } from '@/infra/repos/pgProgramItemDiscussion';

describe('pgProgramItemDiscussion doctor-wide (disposable Postgres)', () => {
  afterAll(async () => {
    await getPool().end();
  });

  /** Real patient_user_id from active doctor/course instances, if any exist. */
  async function samplePatientIds(viewerLike: string): Promise<{ ids: string[]; viewer: string }> {
    const client = await getPool().connect();
    try {
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

  it('listUnreadExerciseCommentsForDoctor executes without SQL error and returns an array', async () => {
    const { ids, viewer } = await samplePatientIds('00000000-0000-4000-8000-000000000001');
    const port = createPgProgramItemDiscussionPort();
    const result = await port.listUnreadExerciseCommentsForDoctor({
      patientUserIds: ids.length ? ids : ['00000000-0000-4000-8000-000000000001'],
      viewerUserId: viewer,
      limit: 50,
    });
    expect(Array.isArray(result)).toBe(true);
    // shape check when data happens to exist
    for (const row of result) {
      expect(typeof row.patientUserId).toBe('string');
      expect(typeof row.instanceId).toBe('string');
      expect(typeof row.stageItemId).toBe('string');
      expect(row.latestMessage.senderRole).toBe('patient');
      expect(row.latestMessage.mediaFileId).toBeNull();
    }
  });

  it('listExerciseCommentsForDoctor (history) executes and paginates by cursor without SQL error', async () => {
    const { ids, viewer } = await samplePatientIds('00000000-0000-4000-8000-000000000001');
    const port = createPgProgramItemDiscussionPort();
    const page1 = await port.listExerciseCommentsForDoctor({
      patientUserIds: ids.length ? ids : ['00000000-0000-4000-8000-000000000001'],
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
      // cursor is strictly "earlier" — page2 must not repeat page1's last item
      for (const row of page2) {
        expect(row.latestMessage.id).not.toBe(last.latestMessage.id);
      }
    }
  });
});
