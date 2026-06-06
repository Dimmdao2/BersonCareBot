/**
 * Wave 3 phase 13B — domain SQL via `runWebappPgText`; Rubitime upsert still delegates to
 * `booking-rubitime-sync` with `getPool()` (package owns its SQL).
 */
import { randomUUID } from "node:crypto";
import { nullableToIsoStringSafe, toIsoStringSafe } from "@/shared/lib/toIsoStringSafe";
import { getPool } from "@/infra/db/client";
import { runWebappPgText } from "@/infra/db/runWebappSql";
import {
  findExistingPatientBookingForRubitime,
  shouldSkipNativeReviveUpdate,
  upsertPatientBookingFromRubitime,
  type ExistingPatientBookingRow,
} from "@bersoncare/booking-rubitime-sync";
import { normalizeRuPhoneE164 } from "@/shared/phone/normalizeRuPhoneE164";
import type { PatientBookingsPort, CreatePendingPatientBookingInput } from "@/modules/patient-booking/ports";
import type { PatientBookingRecord, PatientBookingStatus } from "@/modules/patient-booking/types";

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
    bookingSource: (row.source as PatientBookingRecord["bookingSource"]) ?? "native",
    compatQuality: (row.compat_quality as PatientBookingRecord["compatQuality"]) ?? null,
    provenanceCreatedBy: row.provenance_created_by ?? null,
    provenanceUpdatedBy: row.provenance_updated_by ?? null,
  };
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
           updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [input.bookingId, status, input.reason ?? null],
    );
    const row = result.rows[0];
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
    const result = await runWebappPgText<Row>(
      `SELECT * FROM patient_bookings
       WHERE platform_user_id = $1
         AND status IN ('creating', 'awaiting_payment', 'confirmed', 'rescheduled', 'cancelling', 'cancel_failed')
         AND slot_start >= $2::timestamptz
         AND NOT (
           status = 'creating'
           AND rubitime_id IS NULL
           AND canonical_appointment_id IS NULL
         )
         AND NOT (
           status = 'creating'
           AND EXISTS (
             SELECT 1
             FROM patient_bookings newer
             WHERE newer.platform_user_id = patient_bookings.platform_user_id
               AND newer.id <> patient_bookings.id
               AND newer.status IN ('awaiting_payment', 'confirmed', 'rescheduled', 'cancelling', 'cancel_failed')
               AND newer.slot_start = patient_bookings.slot_start
               AND newer.slot_end = patient_bookings.slot_end
               AND COALESCE(newer.branch_service_id::text, '') = COALESCE(patient_bookings.branch_service_id::text, '')
               AND COALESCE(newer.booking_type, '') = COALESCE(patient_bookings.booking_type, '')
               AND COALESCE(newer.category, '') = COALESCE(patient_bookings.category, '')
           )
         )
       ORDER BY slot_start ASC, created_at DESC`,
      [userId, nowIso],
    );
    return result.rows.map(mapRow);
  },

  async listHistoryByUser(userId, nowIso) {
    const result = await runWebappPgText<Row>(
      `SELECT * FROM patient_bookings
       WHERE platform_user_id = $1
         AND (
           slot_start < $2::timestamptz
           OR status IN ('cancelled', 'completed', 'no_show', 'failed_sync')
         )
       ORDER BY slot_start DESC
       LIMIT 100`,
      [userId, nowIso],
    );
    return result.rows.map(mapRow);
  },
};

export {
  mapRubitimeStatusToPatientBookingStatus,
} from "@bersoncare/booking-rubitime-sync";
