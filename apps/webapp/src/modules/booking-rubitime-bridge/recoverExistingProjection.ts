import { sql, type SQL } from "drizzle-orm";

export type RecoverableAppointmentLookup = {
  organizationId: string;
  specialistId: string | null;
  startAt: string;
  endAtIso: string;
  phoneNormalized: string | null;
};

/** Strict: specialist + slot + phone (when phone known). */
export function recoverableAppointmentStrictQuery(
  params: RecoverableAppointmentLookup,
): SQL {
  return sql`
    SELECT id
    FROM be_appointments
    WHERE organization_id = ${params.organizationId}::uuid
      AND source = 'rubitime_projection'
      AND specialist_id IS NOT DISTINCT FROM ${params.specialistId}::uuid
      AND start_at = ${params.startAt}::timestamptz
      AND end_at = ${params.endAtIso}::timestamptz
      AND (
        ${params.phoneNormalized}::text IS NULL
        OR phone_normalized IS NOT DISTINCT FROM ${params.phoneNormalized}::text
      )
    ORDER BY updated_at DESC
    LIMIT 1
  `;
}

/** Fallback when specialist mapping was missing at first projection (specialist_id null in refs). */
export function recoverableAppointmentSlotPhoneQuery(
  params: RecoverableAppointmentLookup,
): SQL {
  return sql`
    SELECT id
    FROM be_appointments
    WHERE organization_id = ${params.organizationId}::uuid
      AND source = 'rubitime_projection'
      AND start_at = ${params.startAt}::timestamptz
      AND end_at = ${params.endAtIso}::timestamptz
      AND (
        ${params.phoneNormalized}::text IS NULL
        OR phone_normalized IS NOT DISTINCT FROM ${params.phoneNormalized}::text
      )
    ORDER BY updated_at DESC
    LIMIT 1
  `;
}
