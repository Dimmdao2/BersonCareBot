import { runWebappPgText } from "@/infra/db/runWebappSql";
import { nativeIntegratorRecordId } from "@/modules/patient-booking/projectCanonicalAppointment";

export function integratorKeysForCanonicalAppointment(
  appointmentId: string,
  rubitimeId?: string | null,
): string[] {
  const keys = [nativeIntegratorRecordId(appointmentId)];
  const rt = rubitimeId?.trim();
  if (rt) keys.push(rt);
  return keys;
}

export function isAppointmentIntegratorPurged(
  appointmentId: string,
  rubitimeId: string | null | undefined,
  purgedIntegratorIds: Set<string>,
): boolean {
  return integratorKeysForCanonicalAppointment(appointmentId, rubitimeId).some((k) =>
    purgedIntegratorIds.has(k),
  );
}

/** Canonical appointment ids with purged projection (staff delete). */
export async function loadPurgedCanonicalAppointmentIds(
  organizationId: string,
  appointmentIds: string[],
): Promise<Set<string>> {
  if (appointmentIds.length === 0) return new Set();
  const result = await runWebappPgText<{ id: string }>(
    `SELECT DISTINCT a.id::text AS id
     FROM unnest($2::uuid[]) AS a(id)
     WHERE EXISTS (
       SELECT 1 FROM appointment_records ar
       WHERE ar.deleted_at IS NOT NULL
       AND (
         ar.integrator_record_id = ('be:' || a.id::text)
         OR ar.integrator_record_id IN (
           SELECT bem.external_id
           FROM be_external_entity_mappings bem
           WHERE bem.organization_id = $1::uuid
             AND bem.entity_type = 'appointment'
             AND bem.external_system = 'rubitime'
             AND bem.canonical_id = a.id
         )
       )
     )`,
    [organizationId, appointmentIds],
  );
  return new Set(result.rows.map((r) => r.id));
}

export async function filterCanonicalRowsNotPurged<T extends { id: string }>(
  organizationId: string,
  rows: T[],
): Promise<T[]> {
  const purged = await loadPurgedCanonicalAppointmentIds(
    organizationId,
    rows.map((r) => r.id),
  );
  if (purged.size === 0) return rows;
  return rows.filter((r) => !purged.has(r.id));
}

/** SQL fragment: alias `a` = `be_appointments` row; exclude staff-purged projection. */
export const PURGED_CANONICAL_APPOINTMENT_NOT_EXISTS_SQL = `NOT EXISTS (
  SELECT 1 FROM appointment_records ar
  WHERE ar.deleted_at IS NOT NULL
  AND (
    ar.integrator_record_id = ('be:' || a.id::text)
    OR ar.integrator_record_id IN (
      SELECT bem.external_id
      FROM be_external_entity_mappings bem
      WHERE bem.organization_id = a.organization_id
        AND bem.entity_type = 'appointment'
        AND bem.external_system = 'rubitime'
        AND bem.canonical_id = a.id
    )
  )
)`;

/** Same filter for drizzle/raw queries without table alias (bare `be_appointments`). */
export const PURGED_CANONICAL_BE_APPOINTMENTS_NOT_EXISTS_SQL = `NOT EXISTS (
  SELECT 1 FROM appointment_records ar
  WHERE ar.deleted_at IS NOT NULL
  AND (
    ar.integrator_record_id = ('be:' || be_appointments.id::text)
    OR ar.integrator_record_id IN (
      SELECT bem.external_id
      FROM be_external_entity_mappings bem
      WHERE bem.organization_id = be_appointments.organization_id
        AND bem.entity_type = 'appointment'
        AND bem.external_system = 'rubitime'
        AND bem.canonical_id = be_appointments.id
    )
  )
)`;
