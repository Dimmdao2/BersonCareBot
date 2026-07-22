/**
 * Wave 3 phase 13B — domain SQL via `runWebappPgText`; Rubitime upsert still delegates to
 * `booking-rubitime-sync` with `getPool()` (package owns its SQL).
 */
import { randomUUID } from "node:crypto";
import { nullableToIsoStringSafe, toIsoStringSafe } from "@/shared/lib/toIsoStringSafe";
import { getPool } from "@/infra/db/client";
import { runWebappPgText } from "@/infra/db/runWebappSql";
import {
  closeActivePatientBookingsByRubitimeId,
  findExistingPatientBookingForRubitime,
  shouldSkipNativeReviveUpdate,
  upsertPatientBookingFromRubitime,
  type ExistingPatientBookingRow,
} from "@bersoncare/booking-rubitime-sync";
import { normalizeRuPhoneE164 } from "@/shared/phone/normalizeRuPhoneE164";
import type { PatientBookingsPort, CreatePendingPatientBookingInput } from "@/modules/patient-booking/ports";
import type {
  CanonicalInPersonBookingContext,
  PatientBookingRecord,
  PatientBookingStatus,
} from "@/modules/patient-booking/types";

type Row = {
  id: string;
  platform_user_id: string | null;
  booking_type: string;
  city: string | null;
  category: string;
  slot_start: Date;
  slot_end: Date;
  status: string;
  cancelled_at: Date | null;
  cancel_reason: string | null;
  rubitime_id: string | null;
  gcal_event_id: string | null;
  contact_phone: string;
  contact_email: string | null;
  contact_name: string;
  reminder_24h_sent: boolean;
  reminder_2h_sent: boolean;
  created_at: Date;
  updated_at: Date;
  branch_id?: string | null;
  service_id?: string | null;
  branch_service_id?: string | null;
  city_code_snapshot?: string | null;
  branch_title_snapshot?: string | null;
  service_title_snapshot?: string | null;
  duration_minutes_snapshot?: number | null;
  price_minor_snapshot?: number | null;
  rubitime_branch_id_snapshot?: string | null;
  rubitime_cooperator_id_snapshot?: string | null;
  rubitime_service_id_snapshot?: string | null;
  source?: string | null;
  compat_quality?: string | null;
  provenance_created_by?: string | null;
  provenance_updated_by?: string | null;
  rubitime_manage_url?: string | null;
  canonical_appointment_id?: string | null;
  canonical_in_person_context?: CanonicalInPersonBookingContext | null;
};

function mapRow(row: Row): PatientBookingRecord {
  return {
    id: row.id,
    userId: row.platform_user_id ?? null,
    bookingType: row.booking_type as PatientBookingRecord["bookingType"],
    city: row.city,
    category: row.category as PatientBookingRecord["category"],
    slotStart: toIsoStringSafe(row.slot_start),
    slotEnd: toIsoStringSafe(row.slot_end),
    status: row.status as PatientBookingRecord["status"],
    cancelledAt: nullableToIsoStringSafe(row.cancelled_at),
    cancelReason: row.cancel_reason,
    rubitimeId: row.rubitime_id,
    gcalEventId: row.gcal_event_id,
    contactPhone: row.contact_phone,
    contactEmail: row.contact_email,
    contactName: row.contact_name,
    reminder24hSent: row.reminder_24h_sent,
    reminder2hSent: row.reminder_2h_sent,
    createdAt: toIsoStringSafe(row.created_at),
    updatedAt: toIsoStringSafe(row.updated_at),
    branchServiceId: row.branch_service_id ?? null,
    branchId: row.branch_id ?? null,
    serviceId: row.service_id ?? null,
    cityCodeSnapshot: row.city_code_snapshot ?? null,
    branchTitleSnapshot: row.branch_title_snapshot ?? null,
    serviceTitleSnapshot: row.service_title_snapshot ?? null,
    durationMinutesSnapshot: row.duration_minutes_snapshot ?? null,
    priceMinorSnapshot: row.price_minor_snapshot ?? null,
    rubitimeBranchIdSnapshot: row.rubitime_branch_id_snapshot ?? null,
    rubitimeCooperatorIdSnapshot: row.rubitime_cooperator_id_snapshot ?? null,
    rubitimeServiceIdSnapshot: row.rubitime_service_id_snapshot ?? null,
    rubitimeManageUrl: row.rubitime_manage_url ?? null,
    canonicalAppointmentId: row.canonical_appointment_id ?? null,
    canonicalInPersonContext: row.canonical_in_person_context ?? null,
    bookingSource: (row.source as PatientBookingRecord["bookingSource"]) ?? "native",
    compatQuality: (row.compat_quality as PatientBookingRecord["compatQuality"]) ?? null,
    provenanceCreatedBy: row.provenance_created_by ?? null,
    provenanceUpdatedBy: row.provenance_updated_by ?? null,
  };
}

/**
 * The security-definer capability decides which patient-booking rows belong to
 * the signed tenant/patient. This outer read only enriches an already-admitted
 * linked canonical row. In particular, `patient_bookings.branch_id`,
 * `service_id`, `branch_service_id`, and snapshots are never used as canonical
 * navigation or display inputs.
 */
async function listCurrentPatientBookingRows(
  kind: "upcoming" | "history",
  nowIso: string,
): Promise<PatientBookingRecord[]> {
  const result = await runWebappPgText<{ booking: Row }>(
    `WITH patient_rows AS MATERIALIZED (
       SELECT booking
       FROM app.read_current_patient_booking_rows('${kind}', $1::timestamptz)
     ), enriched AS (
       SELECT
         patient_rows.booking,
         CASE
           WHEN patient_rows.booking->>'booking_type' = 'in_person'
             AND appointment.id IS NOT NULL
             AND branch.id IS NOT NULL
             AND service.id IS NOT NULL
             AND branch.is_active = TRUE
             AND service.is_active = TRUE
             AND service.public_widget_visible = TRUE
             AND service.admin_manual_only = FALSE
             AND EXISTS (
               SELECT 1
               FROM be_specialist_service_availability availability
               JOIN be_specialists specialist
                 ON specialist.id = availability.specialist_id
                AND specialist.organization_id = availability.organization_id
                AND specialist.is_active = TRUE
               WHERE availability.organization_id = appointment.organization_id
                 AND availability.specialist_id = appointment.specialist_id
                 AND availability.branch_id = appointment.branch_id
                 AND availability.service_id = appointment.service_id
                 AND availability.is_active = TRUE
             )
           THEN jsonb_build_object(
             'branchId', appointment.branch_id,
             'serviceId', appointment.service_id,
             'cityCode', branch.city_code,
             'branchTitle', branch.title,
             'serviceTitle', service.title,
             'durationMinutes', appointment.duration_minutes,
             'priceMinor', service.price_minor
           )
           ELSE NULL
         END AS canonical_in_person_context
       FROM patient_rows
       LEFT JOIN be_appointments appointment
         ON appointment.id = (patient_rows.booking->>'canonical_appointment_id')::uuid
       LEFT JOIN be_branches branch
         ON branch.id = appointment.branch_id
        AND branch.organization_id = appointment.organization_id
       LEFT JOIN be_clinic_services service
         ON service.id = appointment.service_id
        AND service.organization_id = appointment.organization_id
     )
     SELECT booking || jsonb_build_object(
       'canonical_in_person_context', canonical_in_person_context
     ) AS booking
     FROM enriched`,
    [nowIso],
  );
  return result.rows.map((row) => mapRow(row.booking));
}

export const pgPatientBookingsPort: PatientBookingsPort = {
  async createPending(input: CreatePendingPatientBookingInput) {
    const id = randomUUID();
    // Abandoned native placeholders (no rubitime / canonical link) must not block retries or other patients.
    await runWebappPgText(
      `UPDATE patient_bookings
       SET status = 'failed_sync', updated_at = now()
       WHERE status = 'creating'
         AND rubitime_id IS NULL
         AND canonical_appointment_id IS NULL
         AND source = 'native'
         AND (
           (
             platform_user_id = $1::uuid
             AND tstzrange(slot_start, slot_end, '[)') && tstzrange($2::timestamptz, $3::timestamptz, '[)')
           )
           OR created_at < now() - interval '15 minutes'
         )`,
      [input.userId, input.slotStart, input.slotEnd],
    );
    // Stale cancel in-flight rows must not block rebook on a freed Rubitime slot.
    await runWebappPgText(
      `UPDATE patient_bookings
       SET status = 'cancelled',
           cancelled_at = now(),
           rubitime_manage_url = NULL,
           updated_at = now()
       WHERE status = 'cancelling'
         AND updated_at < now() - interval '15 minutes'`,
      [],
    );
    await runWebappPgText(
      `UPDATE patient_bookings
       SET status = 'failed_sync', updated_at = now()
       WHERE status = 'cancel_failed'
         AND updated_at < now() - interval '15 minutes'`,
      [],
    );
    const result = await runWebappPgText<Row>(
      `WITH overlap AS (
         SELECT 1
           FROM patient_bookings
          WHERE status IN ('creating', 'awaiting_payment', 'confirmed', 'rescheduled', 'cancelling', 'cancel_failed')
            AND NOT (
              status = 'creating'
              AND rubitime_id IS NULL
              AND canonical_appointment_id IS NULL
            )
            AND tstzrange(slot_start, slot_end, '[)') && tstzrange($6::timestamptz, $7::timestamptz, '[)')
             AND (
               ($20::text IS NOT NULL AND rubitime_cooperator_id_snapshot = $20::text)
               OR ($20::text IS NULL AND platform_user_id = $2)
             )
          LIMIT 1
       )
       INSERT INTO patient_bookings (
         id, platform_user_id, booking_type, city, category, slot_start, slot_end, status,
         contact_phone, contact_email, contact_name,
         branch_id, service_id, branch_service_id,
         city_code_snapshot, branch_title_snapshot, service_title_snapshot,
         duration_minutes_snapshot, price_minor_snapshot,
         rubitime_branch_id_snapshot, rubitime_cooperator_id_snapshot, rubitime_service_id_snapshot
       )
       SELECT
         $1, $2, $3, $4, $5, $6::timestamptz, $7::timestamptz, 'creating',
         $8, $9, $10,
         $11, $12, $13,
         $14, $15, $16,
         $17, $18,
         $19, $20, $21
       WHERE NOT EXISTS (SELECT 1 FROM overlap)
       RETURNING *`,
      [
        id,
        input.userId,
        input.bookingType,
        input.city,
        input.category,
        input.slotStart,
        input.slotEnd,
        input.contactPhone,
        input.contactEmail,
        input.contactName,
        input.branchId,
        input.serviceId,
        input.branchServiceId,
        input.cityCodeSnapshot,
        input.branchTitleSnapshot,
        input.serviceTitleSnapshot,
        input.durationMinutesSnapshot,
        input.priceMinorSnapshot,
        input.rubitimeBranchIdSnapshot,
        input.rubitimeCooperatorIdSnapshot,
        input.rubitimeServiceIdSnapshot,
      ],
    );
    const row = result.rows[0];
    if (!row) {
      throw new Error("slot_overlap");
    }
    return mapRow(row);
  },

  async markAwaitingPayment(bookingId, canonicalAppointmentId, options) {
    const rubitimeId = options?.rubitimeId?.trim() || null;
    const manageUrl = options?.rubitimeManageUrl?.trim() || null;
    const result = await runWebappPgText<Row>(
      `UPDATE patient_bookings
       SET status = 'awaiting_payment',
           canonical_appointment_id = $2::uuid,
           rubitime_id = COALESCE($3, rubitime_id),
           rubitime_manage_url = COALESCE($4::text, rubitime_manage_url),
           updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [bookingId, canonicalAppointmentId, rubitimeId, manageUrl],
    );
    const row = result.rows[0];
    return row ? mapRow(row) : null;
  },

  async markConfirmedByCanonicalAppointment(canonicalAppointmentId, rubitimeId = null) {
    const result = await runWebappPgText<Row>(
      `UPDATE patient_bookings
       SET status = 'confirmed',
           rubitime_id = COALESCE($2, rubitime_id),
           updated_at = now()
       WHERE canonical_appointment_id = $1::uuid
         AND status = 'awaiting_payment'
       RETURNING *`,
      [canonicalAppointmentId, rubitimeId],
    );
    const row = result.rows[0];
    return row ? mapRow(row) : null;
  },

  async markConfirmed(bookingId, rubitimeId, options) {
    const manageUrl = options?.rubitimeManageUrl?.trim() || null;
    const canonicalId = options?.canonicalAppointmentId?.trim() || null;
    const result = await runWebappPgText<Row>(
      `UPDATE patient_bookings
       SET status = 'confirmed',
           rubitime_id = COALESCE($2, rubitime_id),
           rubitime_manage_url = COALESCE($3::text, rubitime_manage_url),
           canonical_appointment_id = COALESCE($4::uuid, canonical_appointment_id),
           updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [bookingId, rubitimeId, manageUrl, canonicalId],
    );
    const row = result.rows[0];
    return row ? mapRow(row) : null;
  },

  async markFailedSync(bookingId) {
    await runWebappPgText(
      `UPDATE patient_bookings
       SET status = 'failed_sync', updated_at = now()
       WHERE id = $1`,
      [bookingId],
    );
  },

  async markCancelling(bookingId) {
    const result = await runWebappPgText<Row>(
      `UPDATE patient_bookings
       SET status = 'cancelling', updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [bookingId],
    );
    const row = result.rows[0];
    return row ? mapRow(row) : null;
  },

  async markCancelled(input) {
    const status = input.status ?? "cancelled";
    const result = await runWebappPgText<Row>(
      `UPDATE patient_bookings
       SET status = $2,
           cancelled_at = now(),
           cancel_reason = COALESCE($3, cancel_reason),
           rubitime_manage_url = NULL,
           updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [input.bookingId, status, input.reason ?? null],
    );
    const row = result.rows[0];
    if (row?.rubitime_id) {
      await closeActivePatientBookingsByRubitimeId(getPool(), row.rubitime_id, input.bookingId);
    }
    return row ? mapRow(row) : null;
  },

  async updateSlotsAfterReschedule(input) {
    const status = input.status ?? "confirmed";
    const result = await runWebappPgText<Row>(
      `UPDATE patient_bookings
       SET slot_start = $2::timestamptz,
           slot_end = $3::timestamptz,
           status = $4,
           updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [input.bookingId, input.slotStart, input.slotEnd, status],
    );
    const row = result.rows[0];
    return row ? mapRow(row) : null;
  },

  async getByIdForUser(bookingId, userId) {
    const result = await runWebappPgText<Row>(
      `SELECT * FROM patient_bookings WHERE id = $1 AND platform_user_id = $2 LIMIT 1`,
      [bookingId, userId],
    );
    const row = result.rows[0];
    return row ? mapRow(row) : null;
  },

  async getByRubitimeId(rubitimeId) {
    const result = await runWebappPgText<Row>(
      `SELECT * FROM patient_bookings WHERE rubitime_id = $1 LIMIT 1`,
      [rubitimeId],
    );
    const row = result.rows[0];
    return row ? mapRow(row) : null;
  },

  /**
   * Sync from Rubitime projections / webhooks (shared package + webapp-native revive guard).
   */
  async upsertFromRubitime(input) {
    const pool = getPool();
    const existingRow = await findExistingPatientBookingForRubitime(pool, normalizeRuPhoneE164, input);
    if (existingRow && (await shouldSkipNativeReviveUpdate(pool, existingRow, input))) {
      return;
    }
    await upsertPatientBookingFromRubitime(pool, normalizeRuPhoneE164, input, {
      existingRow,
      logCompat: (msg, meta) => {
        console.warn(`[compat-sync] ${msg}`, meta);
      },
    });
  },

  async getById(bookingId) {
    const result = await runWebappPgText<Row>(`SELECT * FROM patient_bookings WHERE id = $1`, [bookingId]);
    const row = result.rows[0];
    return row ? mapRow(row) : null;
  },

  async getByCanonicalAppointmentId(canonicalAppointmentId) {
    const result = await runWebappPgText<Row>(
      `SELECT * FROM patient_bookings WHERE canonical_appointment_id = $1::uuid LIMIT 1`,
      [canonicalAppointmentId],
    );
    const row = result.rows[0];
    return row ? mapRow(row) : null;
  },

  async listUpcomingByUser(userId, nowIso) {
    void userId;
    return listCurrentPatientBookingRows("upcoming", nowIso);
  },

  async listHistoryByUser(userId, nowIso) {
    void userId;
    return listCurrentPatientBookingRows("history", nowIso);
  },
};

export {
  mapRubitimeStatusToPatientBookingStatus,
} from "@bersoncare/booking-rubitime-sync";
