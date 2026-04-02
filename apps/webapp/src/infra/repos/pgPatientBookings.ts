import { randomUUID } from "node:crypto";
import { getPool } from "@/infra/db/client";
import { lookupBranchServiceByRubitimeIds } from "@/infra/repos/rubitimeBranchServiceLookup";
import { normalizeRuPhoneE164 } from "@/shared/phone/normalizeRuPhoneE164";
import type { PatientBookingsPort, CreatePendingPatientBookingInput } from "@/modules/patient-booking/ports";
import { computeCompatSyncQuality } from "@/modules/patient-booking/compatSyncQuality";
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
};

function mapRow(row: Row): PatientBookingRecord {
  return {
    id: row.id,
    userId: row.platform_user_id ?? null,
    bookingType: row.booking_type as PatientBookingRecord["bookingType"],
    city: row.city,
    category: row.category as PatientBookingRecord["category"],
    slotStart: row.slot_start.toISOString(),
    slotEnd: row.slot_end.toISOString(),
    status: row.status as PatientBookingRecord["status"],
    cancelledAt: row.cancelled_at ? row.cancelled_at.toISOString() : null,
    cancelReason: row.cancel_reason,
    rubitimeId: row.rubitime_id,
    gcalEventId: row.gcal_event_id,
    contactPhone: row.contact_phone,
    contactEmail: row.contact_email,
    contactName: row.contact_name,
    reminder24hSent: row.reminder_24h_sent,
    reminder2hSent: row.reminder_2h_sent,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
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
    bookingSource: (row.source as PatientBookingRecord["bookingSource"]) ?? "native",
    compatQuality: (row.compat_quality as PatientBookingRecord["compatQuality"]) ?? null,
    provenanceCreatedBy: row.provenance_created_by ?? null,
    provenanceUpdatedBy: row.provenance_updated_by ?? null,
  };
}

export const pgPatientBookingsPort: PatientBookingsPort = {
  async createPending(input: CreatePendingPatientBookingInput) {
    const pool = getPool();
    const id = randomUUID();
    const result = await pool.query<Row>(
      `WITH overlap AS (
         SELECT 1
           FROM patient_bookings
          WHERE status IN ('creating', 'confirmed', 'rescheduled', 'cancelling', 'cancel_failed')
            AND tstzrange(slot_start, slot_end, '[)') && tstzrange($6::timestamptz, $7::timestamptz, '[)')
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

  async markConfirmed(bookingId, rubitimeId, options) {
    const pool = getPool();
    const manageUrl = options?.rubitimeManageUrl?.trim() || null;
    const result = await pool.query<Row>(
      `UPDATE patient_bookings
       SET status = 'confirmed',
           rubitime_id = COALESCE($2, rubitime_id),
           rubitime_manage_url = COALESCE($3::text, rubitime_manage_url),
           updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [bookingId, rubitimeId, manageUrl],
    );
    const row = result.rows[0];
    return row ? mapRow(row) : null;
  },

  async markFailedSync(bookingId) {
    const pool = getPool();
    await pool.query(
      `UPDATE patient_bookings
       SET status = 'failed_sync', updated_at = now()
       WHERE id = $1`,
      [bookingId],
    );
  },

  async markCancelling(bookingId) {
    const pool = getPool();
    const result = await pool.query<Row>(
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
    const pool = getPool();
    const status = input.status ?? "cancelled";
    const result = await pool.query<Row>(
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

  async getByIdForUser(bookingId, userId) {
    const pool = getPool();
    const result = await pool.query<Row>(
      `SELECT * FROM patient_bookings WHERE id = $1 AND platform_user_id = $2 LIMIT 1`,
      [bookingId, userId],
    );
    const row = result.rows[0];
    return row ? mapRow(row) : null;
  },

  async getByRubitimeId(rubitimeId) {
    const pool = getPool();
    const result = await pool.query<Row>(
      `SELECT * FROM patient_bookings WHERE rubitime_id = $1 LIMIT 1`,
      [rubitimeId],
    );
    const row = result.rows[0];
    return row ? mapRow(row) : null;
  },

  /**
   * Sync from Rubitime projections / webhooks.
   * - If row exists by `rubitime_id`: update status/slots (snapshot columns preserved for native rows).
   * - If row not found: create compat-row with source='rubitime_projection' and best-effort fields.
   * Dedup: second call with same rubitime_id always hits UPDATE path (no duplicate INSERT).
   */
  async upsertFromRubitime(input) {
    const pool = getPool();
    const existing = await pool.query<{ id: string; source: string; slot_start: Date }>(
      `SELECT id, source, slot_start FROM patient_bookings WHERE rubitime_id = $1 LIMIT 1`,
      [input.rubitimeId],
    );
    let existingRow = existing.rows[0];

    if (!existingRow) {
      const phoneRaw = input.contactPhone?.trim() ?? "";
      const slotStartIso = input.slotStart?.trim() ?? "";
      if (phoneRaw && slotStartIso) {
        const phoneNorm = normalizeRuPhoneE164(phoneRaw);
        const fallback = await pool.query<{ id: string; source: string; slot_start: Date }>(
          `SELECT id, source, slot_start FROM patient_bookings
           WHERE rubitime_id IS NULL
             AND source = 'native'
             AND status IN ('creating', 'confirmed', 'failed_sync')
             AND contact_phone = $1
             AND slot_start = $2::timestamptz
           ORDER BY created_at DESC
           LIMIT 1`,
          [phoneNorm, slotStartIso],
        );
        const fb = fallback.rows?.[0];
        if (fb) {
          await pool.query(
            `UPDATE patient_bookings SET rubitime_id = $1, updated_at = now() WHERE id = $2`,
            [input.rubitimeId, fb.id],
          );
          existingRow = fb;
        }
      }
    }

    if (existingRow) {
      const slotStartIso = input.slotStart ?? existingRow.slot_start.toISOString();
      const merge = await mergeCompatProjectionFields(input, slotStartIso);
      // UPDATE path: update status and slot times; do not overwrite snapshots for native rows.
      await pool.query(
        `UPDATE patient_bookings
         SET status = $2::text,
             slot_start = COALESCE($3::timestamptz, slot_start),
             slot_end   = COALESCE($4::timestamptz, slot_end),
             cancelled_at = CASE
               WHEN $2::text = 'cancelled' THEN now()
               WHEN $2::text = 'rescheduled' THEN NULL
               ELSE cancelled_at
             END,
             branch_title_snapshot   = CASE WHEN source = 'rubitime_projection' AND $5::text IS NOT NULL THEN $5::text ELSE branch_title_snapshot END,
             service_title_snapshot  = CASE WHEN source = 'rubitime_projection' AND $6::text IS NOT NULL THEN $6::text ELSE service_title_snapshot END,
             rubitime_branch_id_snapshot   = CASE WHEN source = 'rubitime_projection' AND $7::text IS NOT NULL THEN $7::text ELSE rubitime_branch_id_snapshot END,
             rubitime_service_id_snapshot  = CASE WHEN source = 'rubitime_projection' AND $8::text IS NOT NULL THEN $8::text ELSE rubitime_service_id_snapshot END,
             rubitime_cooperator_id_snapshot = CASE WHEN source = 'rubitime_projection' AND $16::text IS NOT NULL THEN $16::text ELSE rubitime_cooperator_id_snapshot END,
             city_code_snapshot = CASE WHEN source = 'rubitime_projection' AND $13::text IS NOT NULL THEN $13::text ELSE city_code_snapshot END,
             branch_id = CASE WHEN source = 'rubitime_projection' AND $11::uuid IS NOT NULL THEN $11::uuid ELSE branch_id END,
             service_id = CASE WHEN source = 'rubitime_projection' AND $12::uuid IS NOT NULL THEN $12::uuid ELSE service_id END,
             branch_service_id = CASE WHEN source = 'rubitime_projection' AND $10::uuid IS NOT NULL THEN $10::uuid ELSE branch_service_id END,
             duration_minutes_snapshot = CASE WHEN source = 'rubitime_projection' AND $14 IS NOT NULL THEN $14::integer ELSE duration_minutes_snapshot END,
             price_minor_snapshot = CASE WHEN source = 'rubitime_projection' AND $15 IS NOT NULL THEN $15::integer ELSE price_minor_snapshot END,
             compat_quality = CASE WHEN source = 'rubitime_projection' THEN $9::text ELSE compat_quality END,
             rubitime_manage_url = CASE WHEN $17::text IS NOT NULL THEN $17::text ELSE rubitime_manage_url END,
             provenance_updated_by = CASE WHEN source = 'rubitime_projection' THEN 'rubitime_external' ELSE provenance_updated_by END,
             updated_at = now()
         WHERE id = $1`,
        [
          existingRow.id,
          input.status,
          input.slotStart ?? null,
          merge.slotEndIso,
          merge.effectiveBranchTitle,
          merge.effectiveServiceTitle,
          merge.rubitimeBranchId,
          merge.rubitimeServiceId,
          merge.compatQuality,
          merge.lookup?.branchServiceId ?? null,
          merge.lookup?.branchId ?? null,
          merge.lookup?.serviceId ?? null,
          merge.effectiveCityCode,
          merge.lookup?.durationMinutes ?? null,
          merge.lookup?.priceMinor ?? null,
          merge.effectiveRubitimeCooperatorId,
          input.rubitimeManageUrl?.trim() || null,
        ],
      );
      return;
    }

    // CREATE compat-row path: external Rubitime record without a native booking row.
    if (!input.slotStart) return; // Cannot create a meaningful row without start time.

    const merge = await mergeCompatProjectionFields(input, input.slotStart);
    const userId = input.userId ?? null;
    const id = randomUUID();

    await pool.query(
      `INSERT INTO patient_bookings (
         id, platform_user_id, booking_type, city, category,
         slot_start, slot_end, status,
         rubitime_id,
         contact_phone, contact_email, contact_name,
         branch_title_snapshot, service_title_snapshot,
         rubitime_branch_id_snapshot, rubitime_service_id_snapshot, rubitime_cooperator_id_snapshot,
         city_code_snapshot,
         branch_id, service_id, branch_service_id,
         duration_minutes_snapshot, price_minor_snapshot,
         rubitime_manage_url,
         source, compat_quality,
         provenance_created_by,
         created_at, updated_at
       ) VALUES (
         $1, $2, 'in_person', NULL, 'general',
         $3::timestamptz, $4::timestamptz, $5,
         $6,
         $7, NULL, $8,
         $9, $10,
         $11, $12, $13,
         $14,
         $15, $16, $17,
         $18, $19,
         $20::text,
         'rubitime_projection', $21,
         'rubitime_external',
         now(), now()
       )
       ON CONFLICT (rubitime_id) DO NOTHING`,
      [
        id,
        userId,
        input.slotStart,
        merge.slotEndIso,
        input.status,
        input.rubitimeId,
        input.contactPhone ?? "",
        input.contactName ?? "",
        merge.effectiveBranchTitle,
        merge.effectiveServiceTitle,
        merge.rubitimeBranchId,
        merge.rubitimeServiceId,
        merge.effectiveRubitimeCooperatorId,
        merge.effectiveCityCode,
        merge.lookup?.branchId ?? null,
        merge.lookup?.serviceId ?? null,
        merge.lookup?.branchServiceId ?? null,
        merge.lookup?.durationMinutes ?? null,
        merge.lookup?.priceMinor ?? null,
        input.rubitimeManageUrl?.trim() || null,
        merge.compatQuality,
      ],
    );
  },

  async listUpcomingByUser(userId, nowIso) {
    const pool = getPool();
    const result = await pool.query<Row>(
      `SELECT * FROM patient_bookings
       WHERE platform_user_id = $1
         AND status IN ('creating', 'confirmed', 'rescheduled', 'cancelling', 'cancel_failed')
         AND slot_start >= $2::timestamptz
       ORDER BY slot_start ASC`,
      [userId, nowIso],
    );
    return result.rows.map(mapRow);
  },

  async listHistoryByUser(userId, nowIso) {
    const pool = getPool();
    const result = await pool.query<Row>(
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

/** Default slot duration for compat-rows when slotEnd is not available from webhook. */
const DEFAULT_COMPAT_SLOT_DURATION_MINUTES = 60;

function computeFallbackSlotEnd(slotStart: string): string {
  const start = new Date(slotStart);
  if (Number.isNaN(start.getTime())) return slotStart;
  return new Date(start.getTime() + DEFAULT_COMPAT_SLOT_DURATION_MINUTES * 60_000).toISOString();
}

type MergeCompatInput = Parameters<PatientBookingsPort["upsertFromRubitime"]>[0];

async function mergeCompatProjectionFields(input: MergeCompatInput, slotStartIso: string) {
  const rb = input.rubitimeBranchId?.trim() || null;
  const rs = input.rubitimeServiceId?.trim() || null;
  const rcRaw = input.rubitimeCooperatorId?.trim() || null;
  let lookup: Awaited<ReturnType<typeof lookupBranchServiceByRubitimeIds>>["result"] = null;
  if (rb && rs) {
    const { result, ambiguous } = await lookupBranchServiceByRubitimeIds(rb, rs, rcRaw);
    if (ambiguous) {
      console.warn("[compat-sync] branch_service_lookup_ambiguous", {
        rubitimeBranchId: rb,
        rubitimeServiceId: rs,
        rubitimeCooperatorId: rcRaw,
      });
    } else if (!result) {
      console.warn("[compat-sync] branch_service_lookup_miss", {
        rubitimeBranchId: rb,
        rubitimeServiceId: rs,
        rubitimeCooperatorId: rcRaw,
      });
    }
    lookup = result;
  }
  const effectiveRubitimeCooperatorId = lookup?.rubitimeCooperatorId ?? rcRaw ?? null;
  const effectiveBranchTitle = input.branchTitle ?? lookup?.branchTitle ?? null;
  const effectiveServiceTitle = input.serviceTitle ?? lookup?.serviceTitle ?? null;
  const effectiveCityCode = lookup?.cityCode ?? null;
  const explicitSlotEnd = input.slotEnd != null && String(input.slotEnd).trim() !== "";
  let slotEndIso: string;
  let slotEndExplicitFromWebhook: boolean;
  let slotEndFromCatalogDuration: boolean;
  if (explicitSlotEnd) {
    slotEndIso = input.slotEnd as string;
    slotEndExplicitFromWebhook = true;
    slotEndFromCatalogDuration = false;
  } else if (lookup) {
    const start = new Date(slotStartIso);
    slotEndIso = new Date(start.getTime() + lookup.durationMinutes * 60_000).toISOString();
    slotEndExplicitFromWebhook = false;
    slotEndFromCatalogDuration = true;
  } else {
    slotEndIso = computeFallbackSlotEnd(slotStartIso);
    slotEndExplicitFromWebhook = false;
    slotEndFromCatalogDuration = false;
  }
  const compatQuality = computeCompatSyncQuality({
    branchServiceId: lookup?.branchServiceId ?? null,
    cityCodeSnapshot: effectiveCityCode,
    serviceTitleSnapshot: effectiveServiceTitle,
    branchTitleSnapshot: effectiveBranchTitle,
    rubitimeBranchId: rb,
    rubitimeServiceId: rs,
    slotEndExplicitFromWebhook,
    slotEndFromCatalogDuration,
  });
  return {
    lookup,
    effectiveBranchTitle,
    effectiveServiceTitle,
    effectiveCityCode,
    rubitimeBranchId: rb,
    rubitimeServiceId: rs,
    effectiveRubitimeCooperatorId,
    slotEndIso,
    compatQuality,
  };
}

export function mapRubitimeStatusToPatientBookingStatus(rawStatus: string): PatientBookingStatus {
  const x = rawStatus.toLowerCase();
  if (x.includes("cancel")) return "cancelled";
  if (x.includes("resched")) return "rescheduled";
  if (x.includes("complete")) return "completed";
  if (x.includes("no_show")) return "no_show";
  return "confirmed";
}
