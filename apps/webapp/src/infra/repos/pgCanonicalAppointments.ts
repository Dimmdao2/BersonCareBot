import { runWithDbInfraPrincipal } from '@bersoncare/db-principal';
import { sql } from 'drizzle-orm';
import { getPool } from '@/infra/db/client';
import {
  getWebappSqlDb,
  getWebappSqlFromPgClient,
  runWebappNamedRoot,
  runWebappPgText,
} from '@/infra/db/runWebappSql';
import { withPoolTransaction } from '@/infra/db/withClient';
import { nullableToIsoStringSafe, toIsoStringSafe } from '@/shared/lib/toIsoStringSafe';

export type CanonicalAppointmentRecord = {
  id: string;
  organizationId: string;
  externalRecordId: string;
  phoneNormalized: string | null;
  recordAt: string;
  status: string;
  payloadJson: Record<string, unknown>;
  lastEvent: string;
  branchId: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type CanonicalAppointmentDeleteOptions = {
  cancelReason?: string;
  organizationId?: string;
  purgePatientBookings?: boolean;
};

export type CanonicalAppointmentAccessPort = {
  getByExternalRecordId(externalRecordId: string): Promise<CanonicalAppointmentRecord | null>;
  getByExternalRecordIdForIntegrator(
    externalRecordId: string,
  ): Promise<CanonicalAppointmentRecord | null>;
  listActiveByPhoneNormalized(phoneNormalized: string): Promise<CanonicalAppointmentRecord[]>;
  listActiveByPhoneNormalizedForIntegrator(
    phoneNormalized: string,
  ): Promise<CanonicalAppointmentRecord[]>;
  listHistoryByPhoneNormalized(
    phoneNormalized: string,
    limit?: number,
  ): Promise<CanonicalAppointmentRecord[]>;
  softDeleteByExternalRecordId(
    externalRecordId: string,
    options?: CanonicalAppointmentDeleteOptions,
  ): Promise<boolean>;
  softDeleteById(appointmentId: string, organizationId: string): Promise<boolean>;
  isExternalRecordPurged(externalRecordId: string): Promise<boolean>;
};

type CanonicalAppointmentDbRow = {
  id: string;
  organization_id: string;
  phone_normalized: string | null;
  start_at: Date;
  status: string;
  attribution_json: unknown;
  branch_id: string | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
};

function externalRecordId(appointmentId: string): string {
  return `be:${appointmentId}`;
}

function mapRow(row: CanonicalAppointmentDbRow): CanonicalAppointmentRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    externalRecordId: externalRecordId(row.id),
    phoneNormalized: row.phone_normalized,
    recordAt: toIsoStringSafe(row.start_at),
    status: row.status,
    payloadJson:
      typeof row.attribution_json === 'object' && row.attribution_json !== null
        ? (row.attribution_json as Record<string, unknown>)
        : {},
    lastEvent: row.status,
    branchId: row.branch_id,
    createdAt: toIsoStringSafe(row.created_at),
    updatedAt: toIsoStringSafe(row.updated_at),
    deletedAt: nullableToIsoStringSafe(row.deleted_at),
  };
}

const canonicalSelect = `
  SELECT appointment.id::text AS id,
         appointment.organization_id::text AS organization_id,
         appointment.phone_normalized,
         appointment.start_at,
         appointment.status,
         appointment.attribution_json,
         appointment.branch_id::text AS branch_id,
         appointment.created_at,
         appointment.updated_at,
         appointment.deleted_at
    FROM public.be_appointments appointment`;

async function resolveCanonicalId(
  externalId: string,
  tx?: ReturnType<typeof getWebappSqlFromPgClient>,
): Promise<string | null> {
  const result = await runWebappPgText<{ id: string }>(
    `WITH target AS (
       SELECT direct.id, 0 AS priority
         FROM (SELECT CASE
                        WHEN $1 ~ '^be:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
                        THEN substring($1 FROM 4)::uuid
                      END AS id) direct
        WHERE direct.id IS NOT NULL
       UNION ALL
       SELECT mapping.canonical_id, 1 AS priority
         FROM public.be_external_entity_mappings mapping
        WHERE mapping.entity_type = 'appointment'
          AND mapping.external_system = 'rubitime'
          AND mapping.external_id = $1
     )
     SELECT appointment.id::text AS id
       FROM target
       JOIN public.be_appointments appointment ON appointment.id = target.id
      ORDER BY target.priority
      LIMIT 1`,
    [externalId],
    tx,
  );
  return result.rows[0]?.id ?? null;
}

export function createPgCanonicalAppointmentAccessPort(): CanonicalAppointmentAccessPort {
  const getByExternalRecordIdForIntegrator: CanonicalAppointmentAccessPort['getByExternalRecordIdForIntegrator'] =
    async (externalId) =>
      runWithDbInfraPrincipal({ source: 'api/integrator/appointments:GET' }, async () => {
        const result = await runWebappNamedRoot<CanonicalAppointmentDbRow>(
          getWebappSqlDb(),
          'app.read_canonical_appointment_by_external_id(text)',
          [externalId],
          sql`SELECT * FROM app.read_canonical_appointment_by_external_id(${externalId})`,
        );
        const row = result.rows[0];
        return row ? mapRow(row) : null;
      });

  const listActiveByPhoneNormalizedForIntegrator: CanonicalAppointmentAccessPort['listActiveByPhoneNormalizedForIntegrator'] =
    async (phoneNormalized) =>
      runWithDbInfraPrincipal({ source: 'api/integrator/appointments:GET' }, async () => {
        const result = await runWebappNamedRoot<CanonicalAppointmentDbRow>(
          getWebappSqlDb(),
          'app.list_active_canonical_appointments_by_phone(text)',
          [phoneNormalized],
          sql`SELECT * FROM app.list_active_canonical_appointments_by_phone(${phoneNormalized})`,
        );
        return result.rows.map(mapRow);
      });

  const softDeleteByExternalRecordId: CanonicalAppointmentAccessPort['softDeleteByExternalRecordId'] =
    async (externalId, options = {}) => {
      const pool = getPool();
      return withPoolTransaction(pool, async (client) => {
        const tx = getWebappSqlFromPgClient(client);
        const canonicalId = await resolveCanonicalId(externalId, tx);
        if (!canonicalId) return false;
        const target = await runWebappPgText<{ organization_id: string; deleted_at: Date | null }>(
          `SELECT organization_id::text AS organization_id, deleted_at
             FROM public.be_appointments
            WHERE id = $1::uuid
            FOR UPDATE`,
          [canonicalId],
          tx,
        );
        const row = target.rows[0];
        if (!row || (options.organizationId && row.organization_id !== options.organizationId)) {
          return false;
        }
        await runWebappPgText(
          `UPDATE public.be_appointments
              SET deleted_at = COALESCE(deleted_at, now()), updated_at = now()
            WHERE id = $1::uuid`,
          [canonicalId],
          tx,
        );
        if (options.purgePatientBookings) {
          await runWebappPgText(
            `DELETE FROM public.patient_bookings WHERE canonical_appointment_id = $1::uuid`,
            [canonicalId],
            tx,
          );
        } else if (!row.deleted_at) {
          await runWebappPgText(
            `UPDATE public.patient_bookings
                SET status = 'cancelled',
                    cancelled_at = COALESCE(cancelled_at, now()),
                    cancel_reason = CASE
                      WHEN cancel_reason IS NULL OR TRIM(cancel_reason) = '' THEN $2
                      ELSE cancel_reason
                    END,
                    updated_at = now()
              WHERE canonical_appointment_id = $1::uuid
                AND status IN (
                  'creating', 'confirmed', 'rescheduled', 'cancelling',
                  'cancel_failed', 'failed_sync'
                )`,
            [canonicalId, options.cancelReason ?? 'admin_soft_delete'],
            tx,
          );
        }
        return true;
      });
    };

  return {
    async getByExternalRecordId(externalId) {
      const canonicalId = await resolveCanonicalId(externalId);
      if (!canonicalId) return null;
      const result = await runWebappPgText<CanonicalAppointmentDbRow>(
        `${canonicalSelect} WHERE appointment.id = $1::uuid LIMIT 1`,
        [canonicalId],
      );
      const row = result.rows[0];
      return row ? mapRow(row) : null;
    },

    getByExternalRecordIdForIntegrator,

    async listActiveByPhoneNormalized(phoneNormalized) {
      const result = await runWebappPgText<CanonicalAppointmentDbRow>(
        `${canonicalSelect}
          WHERE appointment.phone_normalized = $1
            AND appointment.deleted_at IS NULL
            AND appointment.start_at >= now()
            AND appointment.status IN (
              'created', 'awaiting_payment', 'paid', 'confirmed', 'rescheduled',
              'visit_confirmed', 'charged_to_package', 'manual_review_required'
            )
          ORDER BY appointment.start_at ASC`,
        [phoneNormalized],
      );
      return result.rows.map(mapRow);
    },

    listActiveByPhoneNormalizedForIntegrator,

    async listHistoryByPhoneNormalized(phoneNormalized, limit = 50) {
      const result = await runWebappPgText<CanonicalAppointmentDbRow>(
        `${canonicalSelect}
          WHERE appointment.phone_normalized = $1
            AND appointment.deleted_at IS NULL
          ORDER BY appointment.start_at DESC, appointment.updated_at DESC
          LIMIT $2`,
        [phoneNormalized, limit],
      );
      return result.rows.map(mapRow);
    },

    softDeleteByExternalRecordId,

    async softDeleteById(appointmentId, organizationId) {
      return softDeleteByExternalRecordId(externalRecordId(appointmentId), {
        organizationId,
        purgePatientBookings: true,
        cancelReason: 'staff_delete',
      });
    },

    async isExternalRecordPurged(externalId) {
      const canonicalId = await resolveCanonicalId(externalId);
      if (!canonicalId) return false;
      const result = await runWebappPgText<{ deleted_at: Date | null }>(
        `SELECT deleted_at FROM public.be_appointments WHERE id = $1::uuid LIMIT 1`,
        [canonicalId],
      );
      return result.rows[0]?.deleted_at != null;
    },
  };
}
