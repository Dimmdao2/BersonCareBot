import { and, eq, sql } from 'drizzle-orm';
import { getDrizzle, type DrizzleDb } from '@/app-layer/db/drizzle';
import type { PatientVisibilityLinkPort } from '@/modules/patient-visibility/ports';
import { patientSpecialistLinks } from '../../../db/schema/patientSpecialistLinks';

export async function ensureActivePatientSpecialistLink(
  db: DrizzleDb,
  params: {
    organizationId: string;
    patientUserId: string;
    specialistId: string;
    createdVia: 'first_appointment' | 'manual_assign' | 'transfer';
  },
): Promise<{ created: boolean }> {
  const inserted = await db
    .insert(patientSpecialistLinks)
    .values({
      organizationId: params.organizationId,
      patientUserId: params.patientUserId,
      specialistId: params.specialistId,
      status: 'active',
      createdVia: params.createdVia,
    })
    .onConflictDoNothing({
      target: [patientSpecialistLinks.patientUserId, patientSpecialistLinks.specialistId],
      where: sql`${patientSpecialistLinks.status} = 'active'`,
    })
    .returning({ id: patientSpecialistLinks.id });
  return { created: inserted.length > 0 };
}

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
      return ensureActivePatientSpecialistLink(db, {
        organizationId,
        patientUserId,
        specialistId,
        createdVia,
      });
    },
  };
}
