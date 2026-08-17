import { eq, sql } from 'drizzle-orm';
import { getDrizzle } from '@/app-layer/db/drizzle';
import { patientDailyWarmupPresentations } from '../../../db/schema';
import type {
  DailyWarmupPresentationState,
  PatientDailyWarmupPresentationPort,
} from '@/modules/patient-home/dailyWarmupPresentationPorts';
import { getWebappSqlDb, runWebappNamedRoot } from '@/infra/db/runWebappSql';

export function createPgPatientDailyWarmupPresentationPort(): PatientDailyWarmupPresentationPort {
  return {
    async getPresentationState(userId) {
      const db = getDrizzle();
      const rows = await db
        .select({
          contentPageId: patientDailyWarmupPresentations.contentPageId,
          lastRotationAt: patientDailyWarmupPresentations.lastRotationAt,
          skipNextScheduledRotation: patientDailyWarmupPresentations.skipNextScheduledRotation,
        })
        .from(patientDailyWarmupPresentations)
        .where(eq(patientDailyWarmupPresentations.userId, userId))
        .limit(1);
      const row = rows[0];
      if (!row) return null;
      return {
        contentPageId: row.contentPageId,
        lastRotationAt: row.lastRotationAt ?? null,
        skipNextScheduledRotation: row.skipNextScheduledRotation,
      };
    },

    async upsertPresentationState(userId, state) {
      const result = await runWebappNamedRoot<{ saved: boolean }>(
        getWebappSqlDb(),
        'app.save_current_patient_daily_warmup_presentation(uuid,timestamp with time zone,boolean)',
        [state.contentPageId, state.lastRotationAt, state.skipNextScheduledRotation],
        sql`SELECT app.save_current_patient_daily_warmup_presentation(
          ${state.contentPageId}::uuid,
          ${state.lastRotationAt}::timestamptz,
          ${state.skipNextScheduledRotation}::boolean
        ) AS saved`,
      );
      void userId;
      if (result.rows[0]?.saved !== true) throw new Error('daily_warmup_presentation_rejected');
    },

    async getPresentedContentPageId(userId) {
      const state = await this.getPresentationState(userId);
      return state?.contentPageId ?? null;
    },

    async setPresentedContentPageId(userId, contentPageId) {
      const existing = await this.getPresentationState(userId);
      await this.upsertPresentationState(userId, {
        contentPageId,
        lastRotationAt: existing?.lastRotationAt ?? new Date().toISOString(),
        skipNextScheduledRotation: existing?.skipNextScheduledRotation ?? false,
      });
    },
  };
}
