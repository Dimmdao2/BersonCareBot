import { eq } from 'drizzle-orm';
import { getDrizzle } from '@/app-layer/db/drizzle';
import { patientDailyWarmupPresentations } from '../../../db/schema';
import type {
  DailyWarmupPresentationState,
  PatientDailyWarmupPresentationPort,
} from '@/modules/patient-home/dailyWarmupPresentationPorts';
import { getCurrentDbPrincipalOrganizationId } from '@bersoncare/db-principal';

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
      const organizationId = getCurrentDbPrincipalOrganizationId();
      if (!organizationId) throw new Error('organization_principal_required');
      const db = getDrizzle();
      const now = new Date().toISOString();
      await db
        .insert(patientDailyWarmupPresentations)
        .values({
          organizationId,
          userId,
          contentPageId: state.contentPageId,
          lastRotationAt: state.lastRotationAt,
          skipNextScheduledRotation: state.skipNextScheduledRotation,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: patientDailyWarmupPresentations.userId,
          set: {
            contentPageId: state.contentPageId,
            lastRotationAt: state.lastRotationAt,
            skipNextScheduledRotation: state.skipNextScheduledRotation,
            updatedAt: now,
          },
        });
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
