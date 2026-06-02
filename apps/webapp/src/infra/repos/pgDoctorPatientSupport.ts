import { eq } from "drizzle-orm";
import { getDrizzle } from "@/app-layer/db/drizzle";
import type { ClientSupportProfile } from "@/modules/doctor-clients/supportPolicy";
import { doctorPatientSupport } from "../../../db/schema/doctorPatientSupport";

function mapRow(row: typeof doctorPatientSupport.$inferSelect): ClientSupportProfile {
  return {
    patientUserId: row.patientUserId,
    onSupport: row.onSupport,
    commentsEnabled: row.commentsEnabled,
    mediaEnabled: row.mediaEnabled,
    updatedAt: row.updatedAt,
    updatedBy: row.updatedBy,
  };
}

export async function getClientSupportProfile(patientUserId: string): Promise<ClientSupportProfile | null> {
  const db = getDrizzle();
  const rows = await db
    .select()
    .from(doctorPatientSupport)
    .where(eq(doctorPatientSupport.patientUserId, patientUserId))
    .limit(1);
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function upsertClientSupportProfile(params: {
  patientUserId: string;
  onSupport?: boolean;
  commentsEnabled?: boolean | null;
  mediaEnabled?: boolean | null;
  updatedBy: string;
}): Promise<ClientSupportProfile> {
  const db = getDrizzle();
  const now = new Date().toISOString();
  const existing = await getClientSupportProfile(params.patientUserId);

  if (!existing) {
    const inserted = await db
      .insert(doctorPatientSupport)
      .values({
        patientUserId: params.patientUserId,
        onSupport: params.onSupport ?? false,
        commentsEnabled: params.commentsEnabled ?? null,
        mediaEnabled: params.mediaEnabled ?? null,
        updatedAt: now,
        updatedBy: params.updatedBy,
      })
      .returning();
    const row = inserted[0];
    if (!row) throw new Error("doctor_patient_support insert failed");
    return mapRow(row);
  }

  const patch: Partial<typeof doctorPatientSupport.$inferInsert> = {
    updatedAt: now,
    updatedBy: params.updatedBy,
  };
  if (params.onSupport !== undefined) patch.onSupport = params.onSupport;
  if (params.commentsEnabled !== undefined) patch.commentsEnabled = params.commentsEnabled;
  if (params.mediaEnabled !== undefined) patch.mediaEnabled = params.mediaEnabled;

  const updated = await db
    .update(doctorPatientSupport)
    .set(patch)
    .where(eq(doctorPatientSupport.patientUserId, params.patientUserId))
    .returning();
  const row = updated[0];
  if (!row) throw new Error("doctor_patient_support update failed");
  return mapRow(row);
}

export async function listOnSupportPatientUserIds(): Promise<Set<string>> {
  const db = getDrizzle();
  const rows = await db
    .select({ patientUserId: doctorPatientSupport.patientUserId })
    .from(doctorPatientSupport)
    .where(eq(doctorPatientSupport.onSupport, true));
  return new Set(rows.map((r) => r.patientUserId));
}
