import { getDrizzle } from '@/app-layer/db/drizzle';
import { patientDailyWarmupVideoViews } from '../../../db/schema';
import type { PatientDailyWarmupVideoViewPort } from '@/modules/patient-home/dailyWarmupVideoViewPorts';
import { getCurrentDbPrincipalOrganizationId } from '@bersoncare/db-principal';

export function createPgPatientDailyWarmupVideoViewPort(): PatientDailyWarmupVideoViewPort {
  return {
    async recordView(userId, contentPageId) {
      const organizationId = getCurrentDbPrincipalOrganizationId();
      if (!organizationId) throw new Error('organization_principal_required');
      const db = getDrizzle();
      await db
        .insert(patientDailyWarmupVideoViews)
        .values({ organizationId, userId, contentPageId });
    },
  };
}
