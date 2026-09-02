import { sql } from 'drizzle-orm';
import { getWebappSqlDb, runWebappSql } from '@/infra/db/runWebappSql';

/** Canonical appointment ids soft-deleted by staff/admin delete. */
export async function loadPurgedCanonicalAppointmentIds(
  organizationId: string,
  appointmentIds: string[],
): Promise<Set<string>> {
  if (appointmentIds.length === 0) return new Set();
  const result = await runWebappSql<{ id: string }>(
    getWebappSqlDb(),
    sql`SELECT id::text AS id
       FROM be_appointments
      WHERE organization_id = ${organizationId}::uuid
        AND id = ANY(${sql.param(appointmentIds)}::uuid[])
        AND deleted_at IS NOT NULL`,
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

/** SQL fragment: alias `a` = `be_appointments` row; exclude staff/admin deleted rows. */
export const PURGED_CANONICAL_APPOINTMENT_NOT_EXISTS_SQL = `a.deleted_at IS NULL`;

/** Same filter for drizzle/raw queries without table alias (bare `be_appointments`). */
export const PURGED_CANONICAL_BE_APPOINTMENTS_NOT_EXISTS_SQL = `be_appointments.deleted_at IS NULL`;
