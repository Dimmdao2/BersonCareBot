import { and, eq } from 'drizzle-orm';
import { getCurrentDbPrincipalOrganizationId } from '@bersoncare/db-principal';
import { getDrizzle } from '@/app-layer/db/drizzle';
import { runDrizzleMutationTransaction } from '@/infra/db/drizzleMutationTx';
import type { ClientSupportProfile } from '@/modules/doctor-clients/supportPolicy';
import { doctorPatientSupport } from '../../../db/schema/doctorPatientSupport';
import { platformUsers } from '../../../db/schema/schema';

export type PatientClinicalDemographics = {
  birthDate: string | null;
  gender: 'male' | 'female' | null;
  heightCm: number | null;
  weightKg: number | null;
};

function mapRow(row: typeof doctorPatientSupport.$inferSelect): ClientSupportProfile {
  return {
    organizationId: row.organizationId ?? null,
    patientUserId: row.patientUserId,
    onSupport: row.onSupport,
    supportStartedAt: row.supportStartedAt,
    commentsEnabled: row.commentsEnabled,
    mediaEnabled: row.mediaEnabled,
    updatedAt: row.updatedAt,
    updatedBy: row.updatedBy,
  };
}

function currentWriteOrganizationId(...fallbacks: (string | null | undefined)[]): string | null {
  const principalOrganizationId = getCurrentDbPrincipalOrganizationId();
  const fallbackOrganizationIds = fallbacks.filter((x): x is string => Boolean(x));
  const fallbackOrganizationId = fallbackOrganizationIds[0] ?? null;
  const hasFallbackMismatch = fallbackOrganizationIds.some((id) => id !== fallbackOrganizationId);
  if (
    hasFallbackMismatch ||
    (principalOrganizationId &&
      fallbackOrganizationId &&
      principalOrganizationId !== fallbackOrganizationId)
  ) {
    throw new Error('organization_principal_mismatch');
  }
  return principalOrganizationId ?? fallbackOrganizationId;
}

export async function getClientSupportProfile(
  patientUserId: string,
): Promise<ClientSupportProfile | null> {
  const db = getDrizzle();
  const rows = await db
    .select()
    .from(doctorPatientSupport)
    .where(eq(doctorPatientSupport.patientUserId, patientUserId))
    .limit(1);
  return rows[0] ? mapRow(rows[0]) : null;
}

/** Reads patient-subject demographics through the same tenant wall as the support profile. */
export async function getPatientClinicalDemographics(
  patientUserId: string,
): Promise<PatientClinicalDemographics | null> {
  const db = getDrizzle();
  const rows = await db
    .select({
      birthDate: doctorPatientSupport.birthDate,
      gender: doctorPatientSupport.gender,
      heightCm: doctorPatientSupport.heightCm,
      weightKg: doctorPatientSupport.weightKg,
    })
    .from(platformUsers)
    .leftJoin(doctorPatientSupport, eq(doctorPatientSupport.patientUserId, platformUsers.id))
    .where(and(eq(platformUsers.id, patientUserId), eq(platformUsers.role, 'client')))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    birthDate: row.birthDate ?? null,
    gender: row.gender === 'male' || row.gender === 'female' ? row.gender : null,
    heightCm: row.heightCm ?? null,
    weightKg: row.weightKg ?? null,
  };
}

/** Writes patient-subject demographics without moving or weakening the existing profile tenant key. */
export async function updatePatientClinicalDemographics(
  patientUserId: string,
  values: {
    birthDate?: string | null;
    gender?: 'male' | 'female' | null;
    heightCm?: number | null;
    weightKg?: number | null;
  },
): Promise<void> {
  const patch: Partial<typeof doctorPatientSupport.$inferInsert> = {
    updatedAt: new Date().toISOString(),
  };
  if (values.birthDate !== undefined) patch.birthDate = values.birthDate;
  if (values.gender !== undefined) patch.gender = values.gender;
  if (values.heightCm !== undefined) patch.heightCm = values.heightCm;
  if (values.weightKg !== undefined) patch.weightKg = values.weightKg;
  if (Object.keys(patch).length === 1) return;

  await runDrizzleMutationTransaction(async (tx) => {
    const patientRows = await tx
      .select({ id: platformUsers.id })
      .from(platformUsers)
      .where(and(eq(platformUsers.id, patientUserId), eq(platformUsers.role, 'client')))
      .limit(1);
    if (!patientRows[0]) return;

    await tx
      .insert(doctorPatientSupport)
      .values({
        organizationId: currentWriteOrganizationId(),
        patientUserId,
        ...patch,
      })
      .onConflictDoUpdate({
        target: doctorPatientSupport.patientUserId,
        set: patch,
      });
  });
}

export async function upsertClientSupportProfile(params: {
  patientUserId: string;
  onSupport?: boolean;
  commentsEnabled?: boolean | null;
  mediaEnabled?: boolean | null;
  updatedBy: string;
}): Promise<ClientSupportProfile> {
  const now = new Date().toISOString();
  const existing = await getClientSupportProfile(params.patientUserId);

  if (!existing) {
    const startingOnSupport = params.onSupport ?? false;
    return runDrizzleMutationTransaction(async (tx) => {
      const inserted = await tx
        .insert(doctorPatientSupport)
        .values({
          organizationId: currentWriteOrganizationId(),
          patientUserId: params.patientUserId,
          onSupport: startingOnSupport,
          // Дата начала сопровождения фиксируется при первом включении on_support.
          supportStartedAt: startingOnSupport ? now : null,
          commentsEnabled: params.commentsEnabled ?? null,
          mediaEnabled: params.mediaEnabled ?? null,
          updatedAt: now,
          updatedBy: params.updatedBy,
        })
        .returning();
      const row = inserted[0];
      if (!row) throw new Error('doctor_patient_support insert failed');
      return mapRow(row);
    });
  }

  const patch: Partial<typeof doctorPatientSupport.$inferInsert> = {
    updatedAt: now,
    updatedBy: params.updatedBy,
  };
  if (params.onSupport !== undefined) {
    patch.onSupport = params.onSupport;
    // Включаем сопровождение → проставляем дату начала, если её ещё нет.
    // Выключаем → сбрасываем дату начала.
    if (params.onSupport && !existing.supportStartedAt) {
      patch.supportStartedAt = now;
    } else if (!params.onSupport) {
      patch.supportStartedAt = null;
    }
  }
  if (params.commentsEnabled !== undefined) patch.commentsEnabled = params.commentsEnabled;
  if (params.mediaEnabled !== undefined) patch.mediaEnabled = params.mediaEnabled;

  return runDrizzleMutationTransaction(async (tx) => {
    const updated = await tx
      .update(doctorPatientSupport)
      .set({
        ...patch,
        organizationId: currentWriteOrganizationId(existing.organizationId),
      })
      .where(eq(doctorPatientSupport.patientUserId, params.patientUserId))
      .returning();
    const row = updated[0];
    if (!row) throw new Error('doctor_patient_support update failed');
    return mapRow(row);
  });
}

export async function listOnSupportPatientUserIds(organizationId?: string): Promise<Set<string>> {
  const db = getDrizzle();
  const rows = await db
    .select({ patientUserId: doctorPatientSupport.patientUserId })
    .from(doctorPatientSupport)
    .where(
      organizationId
        ? and(
            eq(doctorPatientSupport.onSupport, true),
            eq(doctorPatientSupport.organizationId, organizationId),
          )
        : eq(doctorPatientSupport.onSupport, true),
    );
  return new Set(rows.map((r) => r.patientUserId));
}
