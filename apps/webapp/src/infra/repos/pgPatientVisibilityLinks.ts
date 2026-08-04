import { and, eq, sql } from 'drizzle-orm';
import { getDrizzle } from '@/app-layer/db/drizzle';
import type { PatientVisibilityLinkPort } from '@/modules/patient-visibility/ports';
import { patientSpecialistLinks } from '../../../db/schema/patientSpecialistLinks';

export function createPgPatientVisibilityLinkPort(): PatientVisibilityLinkPort {
  return {
    async hasActiveLink({ organizationId, patientUserId, specialistId }) {
      const db = getDrizzle();
      const rows = await db
        .select({ id: patientSpecialistLinks.id })
        .from(patientSpecialistLinks)
        .where(
          and(
            eq(patientSpecialistLinks.organizationId, organizationId),
            eq(patientSpecialistLinks.patientUserId, patientUserId),
            eq(patientSpecialistLinks.specialistId, specialistId),
            eq(patientSpecialistLinks.status, 'active'),
          ),
        )
        .limit(1);
      return rows.length > 0;
    },

    async createLinkIfAbsent({ organizationId, patientUserId, specialistId, createdVia }) {
      const db = getDrizzle();
      const inserted = await db
        .insert(patientSpecialistLinks)
        .values({
          organizationId,
          patientUserId,
          specialistId,
          status: 'active',
          createdVia,
        })
        .onConflictDoNothing({
          // The unique index is partial (`WHERE status = 'active'`) — Postgres only matches an
          // ON CONFLICT target against a partial index when the same predicate is repeated here.
          target: [patientSpecialistLinks.patientUserId, patientSpecialistLinks.specialistId],
          where: sql`${patientSpecialistLinks.status} = 'active'`,
        })
        .returning({ id: patientSpecialistLinks.id });
      return { created: inserted.length > 0 };
    },
  };
}
