/**
 * Appointment records projection (Stage 9).
 * Wave 3 phase 13B — domain SQL via `runWebappPgText`; Class C TX transport on soft-delete.
 */

import { getPool } from "@/infra/db/client";
import { nullableToIsoStringSafe, toIsoStringSafe } from "@/shared/lib/toIsoStringSafe";
import { getWebappSqlFromPgClient, runWebappPgText } from "@/infra/db/runWebappSql";
import { withPoolTransaction } from "@/infra/db/withClient";
import { nativeIntegratorRecordId } from "@/modules/patient-booking/projectCanonicalAppointment";

export type SoftDeleteByIntegratorIdOpts = {
  cancelReason?: string;
  canonicalAppointmentId?: string;
  /** Staff delete: DELETE patient_bookings (not only UPDATE active). */
  purgePatientBookings?: boolean;
  /**
   * Caller's resolved admin/doctor workspace organization. `appointment_records` and
   * `patient_bookings` are compatibility projections with no `organization_id`
   * column. When provided, and the target record resolves to a canonical
   * `be_appointments` organization via a `be:<uuid>` integrator id, the delete is refused unless that
   * canonical organization matches.
   */
  organizationId?: string;
};

class AppointmentProjectionOrganizationMismatchError extends Error {
  constructor() {
    super("appointment_projection_organization_mismatch");
    this.name = "AppointmentProjectionOrganizationMismatchError";
  }
}

/**
 * Resolves the canonical `be_appointments.organization_id` for a `be:<uuid>` projection id.
 */
async function resolveLegacyAppointmentCanonicalTarget(
  integratorRecordId: string,
  tx: ReturnType<typeof getWebappSqlFromPgClient>,
): Promise<{ id: string; organizationId: string } | null> {
  const result = await runWebappPgText<{ id: string; organization_id: string }>(
    `SELECT bea.id::text AS id, bea.organization_id AS organization_id
       FROM be_appointments bea
      WHERE $1 ~ '^be:[0-9a-fA-F-]{36}$'
        AND bea.id = (SUBSTRING($1 FROM 4))::uuid
     LIMIT 1`,
    [integratorRecordId],
    tx,
  );
  const row = result.rows[0];
  return row ? { id: row.id, organizationId: row.organization_id } : null;
}

async function resolveCanonicalAppointmentTargetById(
  appointmentId: string,
  tx: ReturnType<typeof getWebappSqlFromPgClient>,
): Promise<{ id: string; organizationId: string } | null> {
  const result = await runWebappPgText<{ id: string; organization_id: string }>(
    `SELECT id::text AS id, organization_id
       FROM be_appointments
      WHERE id = $1::uuid
      LIMIT 1`,
    [appointmentId],
    tx,
  );
  const row = result.rows[0];
  return row ? { id: row.id, organizationId: row.organization_id } : null;
}

export type AppointmentRecordRow = {
  id: string;
  integratorRecordId: string;
  phoneNormalized: string | null;
  recordAt: string | null;
  status: string;
  payloadJson: Record<string, unknown>;
  lastEvent: string;
  branchId: string | null;
  createdAt: string;
  updatedAt: string;
  /** Этап 9: soft-delete (только админ). */
  deletedAt: string | null;
};

class AppointmentProjectionRecordNotFoundError extends Error {
  constructor() {
    super("appointment_projection_record_not_found");
    this.name = "AppointmentProjectionRecordNotFoundError";
  }
}

export type AppointmentProjectionPort = {
  upsertRecordFromProjection(params: {
    integratorRecordId: string;
    phoneNormalized: string | null;
    recordAt: string | null;
    status: string;
    payloadJson: Record<string, unknown>;
    lastEvent: string;
    updatedAt: string;
    branchId?: string | null;
  }): Promise<void>;
  getRecordByIntegratorId(integratorRecordId: string): Promise<AppointmentRecordRow | null>;
  /** Активные предстоящие: статус created/updated, слот в будущем или без времени, не soft-delete. */
  listActiveByPhoneNormalized(phoneNormalized: string): Promise<AppointmentRecordRow[]>;
  /** Все записи по телефону для истории (исключая soft-delete). */
  listHistoryByPhoneNormalized(phoneNormalized: string, limit?: number): Promise<AppointmentRecordRow[]>;
  /** Админ / staff: пометить запись удалённой. */
  softDeleteByIntegratorId(
    integratorRecordId: string,
    opts?: SoftDeleteByIntegratorIdOpts,
  ): Promise<boolean>;
  softDeleteByCanonicalAppointmentId(appointmentId: string): Promise<boolean>;
  isIntegratorRecordPurged(integratorRecordId: string): Promise<boolean>;
};

function mapRow(r: {
  id: string;
  integrator_record_id: string;
  phone_normalized: string | null;
  record_at: Date | null;
  status: string;
  payload_json: unknown;
  last_event: string;
  branch_id: string | null;
  created_at: Date;
  updated_at: Date;
  deleted_at?: Date | null;
}): AppointmentRecordRow {
  return {
    id: r.id,
    integratorRecordId: r.integrator_record_id,
    phoneNormalized: r.phone_normalized,
    recordAt: nullableToIsoStringSafe(r.record_at),
    status: r.status,
    payloadJson:
      typeof r.payload_json === "object" && r.payload_json !== null
        ? (r.payload_json as Record<string, unknown>)
        : {},
    lastEvent: r.last_event ?? "",
    branchId: r.branch_id ?? null,
    createdAt: toIsoStringSafe(r.created_at),
    updatedAt: toIsoStringSafe(r.updated_at),
    deletedAt: nullableToIsoStringSafe(r.deleted_at),
  };
}

/** Staff delete when cancel left no projection row — tombstone + DELETE patient_bookings. */
async function purgeCanonicalStaffDeleteTombstone(
  appointmentId: string,
): Promise<boolean> {
  const pool = getPool();
  const tombstoneId = nativeIntegratorRecordId(appointmentId);
  await withPoolTransaction(pool, async (client) => {
    const tx = getWebappSqlFromPgClient(client);
    await runWebappPgText(
      `INSERT INTO appointment_records (
        integrator_record_id, phone_normalized, record_at, status, payload_json, last_event, updated_at, deleted_at
      ) VALUES ($1, NULL, NULL, 'canceled', '{}'::jsonb, 'staff_delete', now(), now())
      ON CONFLICT (integrator_record_id) DO UPDATE SET
        deleted_at = COALESCE(appointment_records.deleted_at, now()),
        updated_at = now()`,
      [tombstoneId],
      tx,
    );
    await runWebappPgText(
      `UPDATE be_appointments
          SET deleted_at = now(), updated_at = now()
        WHERE id = $1::uuid
          AND deleted_at IS NULL`,
      [appointmentId],
      tx,
    );
    await runWebappPgText(
      `DELETE FROM patient_bookings WHERE canonical_appointment_id = $1::uuid`,
      [appointmentId],
      tx,
    );
  });
  return true;
}

export function createPgAppointmentProjectionPort(): AppointmentProjectionPort {
  return {
    async upsertRecordFromProjection(params) {
      await runWebappPgText(
        `INSERT INTO appointment_records (
          integrator_record_id, phone_normalized, record_at, status, payload_json, last_event, updated_at, branch_id,
          platform_user_id
        )
        SELECT $1, $2, $3::timestamptz, $4, $5::jsonb, $6, $7::timestamptz, $8::uuid,
          COALESCE(
            (
              SELECT owner_id
              FROM (
                SELECT h.platform_user_id AS owner_id, COUNT(*) OVER () AS owner_count
                FROM user_phone_history h
                WHERE h.phone_normalized = $2
                  AND h.valid_from <= COALESCE($3::timestamptz, now())
                  AND (h.valid_to IS NULL OR h.valid_to > COALESCE($3::timestamptz, now()))
              ) phone_owner
              WHERE owner_count = 1
            ),
            (
              SELECT pu.id
              FROM platform_users pu
              WHERE pu.merged_into_id IS NULL
                AND pu.phone_normalized = $2
                AND NOT EXISTS (
                  SELECT 1
                  FROM user_phone_history h_other_claim
                  WHERE h_other_claim.phone_normalized = $2
                    AND h_other_claim.platform_user_id <> pu.id
                    AND h_other_claim.valid_from <= COALESCE($3::timestamptz, now())
                    AND (h_other_claim.valid_to IS NULL OR h_other_claim.valid_to > COALESCE($3::timestamptz, now()))
                )
              LIMIT 1
            )
          )
        ON CONFLICT (integrator_record_id) DO UPDATE SET
          phone_normalized = COALESCE(appointment_records.phone_normalized, EXCLUDED.phone_normalized),
          record_at = EXCLUDED.record_at,
          status = EXCLUDED.status,
          payload_json = EXCLUDED.payload_json,
          last_event = EXCLUDED.last_event,
          updated_at = EXCLUDED.updated_at,
          branch_id = COALESCE(EXCLUDED.branch_id, appointment_records.branch_id),
          platform_user_id = CASE
            WHEN EXCLUDED.platform_user_id IS NOT NULL THEN EXCLUDED.platform_user_id
            WHEN EXCLUDED.phone_normalized IS NOT NULL AND EXCLUDED.record_at IS NOT NULL THEN NULL
            ELSE appointment_records.platform_user_id
          END`,
        [
          params.integratorRecordId,
          params.phoneNormalized,
          params.recordAt,
          params.status,
          JSON.stringify(params.payloadJson),
          params.lastEvent,
          params.updatedAt,
          params.branchId ?? null,
        ],
      );
    },

    async getRecordByIntegratorId(integratorRecordId: string): Promise<AppointmentRecordRow | null> {
      const result = await runWebappPgText<{
        id: string;
        integrator_record_id: string;
        phone_normalized: string | null;
        record_at: Date | null;
        status: string;
        payload_json: unknown;
        last_event: string;
        branch_id: string | null;
        created_at: Date;
        updated_at: Date;
        deleted_at: Date | null;
      }>(
        `SELECT id, integrator_record_id, phone_normalized, record_at, status, payload_json, last_event, branch_id, created_at, updated_at, deleted_at
         FROM appointment_records WHERE integrator_record_id = $1 LIMIT 1`,
        [integratorRecordId]
      );
      const row = result.rows[0];
      return row ? mapRow(row) : null;
    },

    async listActiveByPhoneNormalized(phoneNormalized: string): Promise<AppointmentRecordRow[]> {
      const result = await runWebappPgText<{
        id: string;
        integrator_record_id: string;
        phone_normalized: string | null;
        record_at: Date | null;
        status: string;
        payload_json: unknown;
        last_event: string;
        branch_id: string | null;
        created_at: Date;
        updated_at: Date;
        deleted_at: Date | null;
      }>(
        `SELECT id, integrator_record_id, phone_normalized, record_at, status, payload_json, last_event, branch_id, created_at, updated_at, deleted_at
         FROM appointment_records
         WHERE phone_normalized = $1 AND status IN ('created', 'updated')
           AND deleted_at IS NULL
           AND (record_at IS NULL OR record_at >= now())
         ORDER BY record_at ASC NULLS LAST`,
        [phoneNormalized]
      );
      return result.rows.map(mapRow);
    },

    async listHistoryByPhoneNormalized(phoneNormalized: string, limit = 50): Promise<AppointmentRecordRow[]> {
      const result = await runWebappPgText<{
        id: string;
        integrator_record_id: string;
        phone_normalized: string | null;
        record_at: Date | null;
        status: string;
        payload_json: unknown;
        last_event: string;
        branch_id: string | null;
        created_at: Date;
        updated_at: Date;
        deleted_at: Date | null;
      }>(
        `SELECT id, integrator_record_id, phone_normalized, record_at, status, payload_json, last_event, branch_id, created_at, updated_at, deleted_at
         FROM appointment_records
         WHERE phone_normalized = $1 AND deleted_at IS NULL
         ORDER BY record_at DESC NULLS LAST, updated_at DESC
         LIMIT $2`,
        [phoneNormalized, limit]
      );
      return result.rows.map(mapRow);
    },

    async softDeleteByIntegratorId(
      integratorRecordId: string,
      opts?: SoftDeleteByIntegratorIdOpts,
    ): Promise<boolean> {
      const pool = getPool();
      const cancelReason = opts?.cancelReason ?? "admin_soft_delete";
      const purgePatientBookings = opts?.purgePatientBookings === true;
      const organizationId = opts?.organizationId;
      try {
        await withPoolTransaction(pool, async (client) => {
          const tx = getWebappSqlFromPgClient(client);
          const existing = await runWebappPgText<{ deleted_at: Date | null }>(
            `SELECT deleted_at FROM appointment_records WHERE integrator_record_id = $1 LIMIT 1`,
            [integratorRecordId],
            tx,
          );
          const row = existing.rows[0];
          if (!row) {
            throw new AppointmentProjectionRecordNotFoundError();
          }

          let canonicalAppointmentId = opts?.canonicalAppointmentId?.trim() || null;
          if (organizationId) {
            const target =
              (await resolveLegacyAppointmentCanonicalTarget(integratorRecordId, tx)) ??
              (canonicalAppointmentId
                ? await resolveCanonicalAppointmentTargetById(canonicalAppointmentId, tx)
                : null);
            if (target?.organizationId && target.organizationId !== organizationId) {
              throw new AppointmentProjectionOrganizationMismatchError();
            }
            if (!canonicalAppointmentId && target?.id) {
              canonicalAppointmentId = target.id;
            }
          }

          if (!row.deleted_at) {
            await runWebappPgText(
              `UPDATE appointment_records SET deleted_at = now(), updated_at = now()
               WHERE integrator_record_id = $1 AND deleted_at IS NULL`,
              [integratorRecordId],
              tx,
            );
          }

          if (canonicalAppointmentId) {
            await runWebappPgText(
              `UPDATE be_appointments
                  SET deleted_at = now(), updated_at = now()
                WHERE id = $1::uuid
                  AND deleted_at IS NULL`,
              [canonicalAppointmentId],
              tx,
            );
          }

          if (purgePatientBookings) {
            if (canonicalAppointmentId) {
              await runWebappPgText(
                `DELETE FROM patient_bookings WHERE canonical_appointment_id = $1::uuid`,
                [canonicalAppointmentId],
                tx,
              );
            }
          } else if (!row.deleted_at && canonicalAppointmentId) {
            await runWebappPgText(
              `UPDATE patient_bookings
               SET status = 'cancelled',
                   cancelled_at = COALESCE(cancelled_at, now()),
                   cancel_reason = CASE
                     WHEN cancel_reason IS NULL OR TRIM(cancel_reason) = '' THEN $2
                     ELSE cancel_reason
                   END,
                   updated_at = now()
               WHERE canonical_appointment_id = $1::uuid
                 AND status IN (
                   'creating',
                   'confirmed',
                   'rescheduled',
                   'cancelling',
                   'cancel_failed',
                   'failed_sync'
                 )`,
              [canonicalAppointmentId, cancelReason],
              tx,
            );
          }
        });
        return true;
      } catch (err) {
        if (
          err instanceof AppointmentProjectionRecordNotFoundError ||
          err instanceof AppointmentProjectionOrganizationMismatchError
        ) {
          return false;
        }
        throw err;
      }
    },

    async softDeleteByCanonicalAppointmentId(appointmentId: string): Promise<boolean> {
      const purgeOpts = {
        canonicalAppointmentId: appointmentId,
        purgePatientBookings: true as const,
        cancelReason: "staff_delete",
      };
      const primaryId = nativeIntegratorRecordId(appointmentId);
      const ok = await this.softDeleteByIntegratorId(primaryId, purgeOpts);
      if (ok) return true;
      return purgeCanonicalStaffDeleteTombstone(appointmentId);
    },

    async isIntegratorRecordPurged(integratorRecordId: string): Promise<boolean> {
      const result = await runWebappPgText<{ deleted_at: Date | null }>(
        `SELECT deleted_at FROM appointment_records WHERE integrator_record_id = $1 LIMIT 1`,
        [integratorRecordId],
      );
      const row = result.rows[0];
      return row?.deleted_at != null;
    },
  };
}
