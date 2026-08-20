/** Wave 3 phase 13B — domain SQL via `runWebappPgText`. */
import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { getCurrentDbPrincipal } from '@bersoncare/db-principal';
import { getDrizzle } from '@/app-layer/db/drizzle';
import { patientBookings as patientBookingsTable } from '../../../db/schema/schema';
import { nullableToIsoStringSafe, toIsoStringSafe } from '@/shared/lib/toIsoStringSafe';
import {
  getWebappSqlDb,
  runWebappNamedRoot,
  runWebappPgText,
} from '@/infra/db/runWebappSql';
import type {
  PatientBookingsPort,
  CreatePendingPatientBookingInput,
} from '@/modules/patient-booking/ports';
import type {
  CanonicalInPersonBookingContext,
  PatientBookingRecord,
  PatientBookingStatus,
} from '@/modules/patient-booking/types';

type Row = {
  id: string;
  organization_id: string | null;
  platform_user_id: string | null;
  booking_type: string;
  city: string | null;
  category: string;
  slot_start: Date | string;
  slot_end: Date | string;
  status: string;
  cancelled_at: Date | string | null;
  cancel_reason: string | null;
  gcal_event_id: string | null;
  contact_phone: string;
  contact_email: string | null;
  contact_name: string;
  reminder_24h_sent: boolean;
  reminder_2h_sent: boolean;
  created_at: Date | string;
  updated_at: Date | string;
  branch_id?: string | null;
  service_id?: string | null;
  branch_service_id?: string | null;
  city_code_snapshot?: string | null;
  branch_title_snapshot?: string | null;
  service_title_snapshot?: string | null;
  duration_minutes_snapshot?: number | null;
  price_minor_snapshot?: number | null;
  provenance_created_by?: string | null;
  provenance_updated_by?: string | null;
  canonical_appointment_id?: string | null;
  canonical_in_person_context?: CanonicalInPersonBookingContext | null;
};

function isCurrentPatientPrincipal(): boolean {
  return getCurrentDbPrincipal()?.kind === 'patient';
}

async function mutateCurrentPatientBooking(
  bookingId: string,
  action: string,
  payload: Record<string, unknown> = {},
): Promise<PatientBookingRecord | null> {
  const result = await runWebappNamedRoot<{ booking: Row | null }>(
    getWebappSqlDb(),
    'app.mutate_current_patient_booking(uuid,text,text)',
    [bookingId, action, JSON.stringify(payload)],
    sql`SELECT app.mutate_current_patient_booking(
      ${bookingId}::uuid,
      ${action}::text,
      ${JSON.stringify(payload)}::text
    ) AS booking`,
  );
  const row = result.rows[0]?.booking;
  return row ? mapRow(row) : null;
}

async function readCurrentPatientBookingRow(
  id: string,
  kind: 'booking' | 'appointment',
): Promise<PatientBookingRecord | null> {
  const result = await runWebappNamedRoot<{ booking: Row | null }>(
    getWebappSqlDb(),
    'app.read_current_patient_booking_row(uuid,text)',
    [id, kind],
    sql`SELECT app.read_current_patient_booking_row(${id}::uuid, ${kind}::text) AS booking`,
  );
  const row = result.rows[0]?.booking;
  return row ? mapRow(row) : null;
}

/**
 * Schema-derived row shape for direct reads of the `patient_bookings` table (Drizzle query
 * builder, not `SELECT *`): renaming/dropping a column here is a compile error, not a silent
 * `undefined` at runtime — see census finding 0.2 in
 * `docs/_TODO/TEXT_SQL_TO_BUILDER_PLAN_2026-08-19.md`. `canonicalInPersonContext` is
 * deliberately absent: it is never a real column (see the doc comment on
 * `listCurrentPatientBookingRows` below), only a field the RPC capability's jsonb payload adds —
 * `mapRow` below leaves it `null` for table rows, exactly as the hand-written `Row` type already
 * did for the same three call sites.
 */
type PatientBookingsTableRow = typeof patientBookingsTable.$inferSelect;

function mapTableRow(row: PatientBookingsTableRow): PatientBookingRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    userId: row.platformUserId ?? null,
    bookingType: row.bookingType as PatientBookingRecord['bookingType'],
    city: row.city,
    category: row.category as PatientBookingRecord['category'],
    slotStart: toIsoStringSafe(row.slotStart),
    slotEnd: toIsoStringSafe(row.slotEnd),
    status: row.status as PatientBookingRecord['status'],
    cancelledAt: nullableToIsoStringSafe(row.cancelledAt),
    cancelReason: row.cancelReason,
    gcalEventId: row.gcalEventId,
    contactPhone: row.contactPhone,
    contactEmail: row.contactEmail,
    contactName: row.contactName,
    reminder24hSent: row.reminder24HSent,
    reminder2hSent: row.reminder2HSent,
    createdAt: toIsoStringSafe(row.createdAt),
    updatedAt: toIsoStringSafe(row.updatedAt),
    branchServiceId: row.branchServiceId ?? null,
    branchId: row.branchId ?? null,
    serviceId: row.serviceId ?? null,
    cityCodeSnapshot: row.cityCodeSnapshot ?? null,
    branchTitleSnapshot: row.branchTitleSnapshot ?? null,
    serviceTitleSnapshot: row.serviceTitleSnapshot ?? null,
    durationMinutesSnapshot: row.durationMinutesSnapshot ?? null,
    priceMinorSnapshot: row.priceMinorSnapshot ?? null,
    canonicalAppointmentId: row.canonicalAppointmentId ?? null,
    canonicalInPersonContext: null,
    provenanceCreatedBy: row.provenanceCreatedBy ?? null,
    provenanceUpdatedBy: row.provenanceUpdatedBy ?? null,
  };
}

function mapRow(row: Row): PatientBookingRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    userId: row.platform_user_id ?? null,
    bookingType: row.booking_type as PatientBookingRecord['bookingType'],
    city: row.city,
    category: row.category as PatientBookingRecord['category'],
    slotStart: toIsoStringSafe(row.slot_start),
    slotEnd: toIsoStringSafe(row.slot_end),
    status: row.status as PatientBookingRecord['status'],
    cancelledAt: nullableToIsoStringSafe(row.cancelled_at),
    cancelReason: row.cancel_reason,
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
    canonicalAppointmentId: row.canonical_appointment_id ?? null,
    canonicalInPersonContext: row.canonical_in_person_context ?? null,
    provenanceCreatedBy: row.provenance_created_by ?? null,
    provenanceUpdatedBy: row.provenance_updated_by ?? null,
  };
}

/**
 * The security-definer capability decides which patient-booking rows belong to
 * the signed tenant/patient, AND enriches each row's canonical branch/service
 * display fields internally (app.read_current_patient_booking_rows, migration
 * 0251) — it already runs as app_owner with SELECT on be_appointments/
 * be_branches/be_clinic_services/be_specialist_service_availability/
 * be_specialists. This webapp connection runs as app_patient, which
 * deploy/postgres/public-booking-bootstrap-resolver.sql deliberately denies
 * direct SELECT on be_branches/be_clinic_services/be_specialist_service_availability
 * (taskdb #1046) — so this read must never re-join those tables itself; the
 * capability's own jsonb payload already carries `canonical_in_person_context`.
 * `patient_bookings.branch_id`, `service_id`, `branch_service_id`, and
 * snapshots are never used as canonical navigation or display inputs.
 */
async function listCurrentPatientBookingRows(
  kind: 'upcoming' | 'history',
  nowIso: string,
): Promise<PatientBookingRecord[]> {
  const patientRowsCapabilitySql = (() => {
    switch (kind) {
      case 'upcoming':
        return `SELECT booking
                FROM app.read_current_patient_booking_rows('upcoming', $1::timestamptz)`;
      case 'history':
        return `SELECT booking
                FROM app.read_current_patient_booking_rows('history', $1::timestamptz)`;
      default:
        throw new Error('Unsupported patient booking row kind');
    }
  })();
  const result = await runWebappPgText<{ booking: Row }>(patientRowsCapabilitySql, [nowIso]);
  return result.rows.map((row) => mapRow(row.booking));
}

export const pgPatientBookingsPort: PatientBookingsPort = {
  async createPending(input: CreatePendingPatientBookingInput) {
    const id = randomUUID();
    if (isCurrentPatientPrincipal()) {
      const payload = { id, ...input };
      const result = await runWebappNamedRoot<{ booking: Row | null }>(
        getWebappSqlDb(),
        'app.create_current_patient_booking_pending(text)',
        [JSON.stringify(payload)],
        sql`SELECT app.create_current_patient_booking_pending(
          ${JSON.stringify(payload)}::text
        ) AS booking`,
      );
      const row = result.rows[0]?.booking;
      if (!row) throw new Error('create_pending_failed');
      return mapRow(row);
    }
    // Abandoned placeholders without a canonical link must not block retries or other patients.
    await runWebappPgText(
      `UPDATE patient_bookings
       SET status = 'failed_sync', updated_at = now()
       WHERE status = 'creating'
         AND organization_id = $4::uuid
         AND canonical_appointment_id IS NULL
         AND (
           (
             platform_user_id = $1::uuid
             AND tstzrange(slot_start, slot_end, '[)') && tstzrange($2::timestamptz, $3::timestamptz, '[)')
           )
           OR created_at < now() - interval '15 minutes'
         )`,
      [input.userId, input.slotStart, input.slotEnd, input.organizationId],
    );
    // Stale cancel in-flight rows must not block rebooking.
    await runWebappPgText(
      `UPDATE patient_bookings
       SET status = 'cancelled',
           cancelled_at = now(),
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
              AND canonical_appointment_id IS NULL
            )
            AND tstzrange(slot_start, slot_end, '[)') && tstzrange($6::timestamptz, $7::timestamptz, '[)')
             AND platform_user_id = $2
          LIMIT 1
       )
       INSERT INTO patient_bookings (
         id, organization_id, platform_user_id, booking_type, city, category, slot_start, slot_end, status,
         contact_phone, contact_email, contact_name,
         branch_id, service_id, branch_service_id,
         city_code_snapshot, branch_title_snapshot, service_title_snapshot,
         duration_minutes_snapshot, price_minor_snapshot
       )
       SELECT
         $1, $19::uuid, $2, $3, $4, $5, $6::timestamptz, $7::timestamptz, 'creating',
         $8, $9, $10,
         $11, $12, $13,
         $14, $15, $16,
         $17, $18
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
        input.organizationId,
      ],
    );
    const row = result.rows[0];
    if (!row) {
      throw new Error('slot_overlap');
    }
    return mapRow(row);
  },

  async markAwaitingPayment(bookingId, canonicalAppointmentId) {
    if (isCurrentPatientPrincipal()) {
      return mutateCurrentPatientBooking(bookingId, 'await_payment', { canonicalAppointmentId });
    }
    const result = await runWebappPgText<Row>(
      `UPDATE patient_bookings
       SET status = 'awaiting_payment',
           canonical_appointment_id = $2::uuid,
           updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [bookingId, canonicalAppointmentId],
    );
    const row = result.rows[0];
    return row ? mapRow(row) : null;
  },

  async markConfirmedByCanonicalAppointment(canonicalAppointmentId) {
    const result = await runWebappPgText<Row>(
      `UPDATE patient_bookings
       SET status = 'confirmed',
           updated_at = now()
       WHERE canonical_appointment_id = $1::uuid
         AND status = 'awaiting_payment'
       RETURNING *`,
      [canonicalAppointmentId],
    );
    const row = result.rows[0];
    return row ? mapRow(row) : null;
  },

  async markConfirmed(bookingId, options) {
    const canonicalId = options?.canonicalAppointmentId?.trim() || null;
    if (isCurrentPatientPrincipal()) {
      return mutateCurrentPatientBooking(bookingId, 'confirm', {
        canonicalAppointmentId: canonicalId,
      });
    }
    const result = await runWebappPgText<Row>(
      `UPDATE patient_bookings
       SET status = 'confirmed',
           canonical_appointment_id = COALESCE($2::uuid, canonical_appointment_id),
           updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [bookingId, canonicalId],
    );
    const row = result.rows[0];
    return row ? mapRow(row) : null;
  },

  async markFailedSync(bookingId) {
    if (isCurrentPatientPrincipal()) {
      await mutateCurrentPatientBooking(bookingId, 'failed_sync');
      return;
    }
    await runWebappPgText(
      `UPDATE patient_bookings
       SET status = 'failed_sync', updated_at = now()
       WHERE id = $1`,
      [bookingId],
    );
  },

  async markCancelling(bookingId) {
    if (isCurrentPatientPrincipal()) {
      return mutateCurrentPatientBooking(bookingId, 'cancelling');
    }
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
    const status = input.status ?? 'cancelled';
    if (isCurrentPatientPrincipal()) {
      return mutateCurrentPatientBooking(input.bookingId, 'cancel', {
        status,
        reason: input.reason ?? null,
      });
    }
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
    const status = input.status ?? 'confirmed';
    if (isCurrentPatientPrincipal()) {
      return mutateCurrentPatientBooking(input.bookingId, 'reschedule', {
        slotStart: input.slotStart,
        slotEnd: input.slotEnd,
        status,
      });
    }
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
    if (isCurrentPatientPrincipal()) {
      void userId;
      return readCurrentPatientBookingRow(bookingId, 'booking');
    }
    const [row] = await getDrizzle()
      .select()
      .from(patientBookingsTable)
      .where(
        and(
          eq(patientBookingsTable.id, bookingId),
          eq(patientBookingsTable.platformUserId, userId),
        ),
      )
      .limit(1);
    return row ? mapTableRow(row) : null;
  },

  async getById(bookingId) {
    if (isCurrentPatientPrincipal()) {
      return readCurrentPatientBookingRow(bookingId, 'booking');
    }
    const [row] = await getDrizzle()
      .select()
      .from(patientBookingsTable)
      .where(eq(patientBookingsTable.id, bookingId))
      .limit(1);
    return row ? mapTableRow(row) : null;
  },

  async getByCanonicalAppointmentId(canonicalAppointmentId) {
    if (isCurrentPatientPrincipal()) {
      return readCurrentPatientBookingRow(canonicalAppointmentId, 'appointment');
    }
    const [row] = await getDrizzle()
      .select()
      .from(patientBookingsTable)
      .where(eq(patientBookingsTable.canonicalAppointmentId, canonicalAppointmentId))
      .limit(1);
    return row ? mapTableRow(row) : null;
  },

  async listUpcomingByUser(userId, nowIso) {
    void userId;
    return listCurrentPatientBookingRows('upcoming', nowIso);
  },

  async listHistoryByUser(userId, nowIso) {
    void userId;
    return listCurrentPatientBookingRows('history', nowIso);
  },
};
