import { randomUUID } from "node:crypto";
import { computeCompatSyncQuality } from "./compatSyncQuality.js";
import type { RubitimeMappedPatientBookingStatus } from "./mapRubitimeStatus.js";
import { lookupBranchServiceByRubitimeIds } from "./lookupBranchServiceByRubitimeIds.js";
import type { SqlExecutor } from "./sql.js";

const DEFAULT_COMPAT_SLOT_DURATION_MINUTES = 60;

function computeFallbackSlotEnd(slotStart: string): string {
  const start = new Date(slotStart);
  if (Number.isNaN(start.getTime())) return slotStart;
  return new Date(start.getTime() + DEFAULT_COMPAT_SLOT_DURATION_MINUTES * 60_000).toISOString();
}

export type RubitimePatientBookingUpsertInput = {
  rubitimeId: string;
  status: RubitimeMappedPatientBookingStatus;
  slotStart?: string | null;
  slotEnd?: string | null;
  userId?: string | null;
  contactPhone?: string | null;
  contactName?: string | null;
  branchTitle?: string | null;
  serviceTitle?: string | null;
  rubitimeBranchId?: string | null;
  rubitimeServiceId?: string | null;
  rubitimeCooperatorId?: string | null;
  rubitimeManageUrl?: string | null;
};

type MergeCompatInput = RubitimePatientBookingUpsertInput;

async function mergeCompatProjectionFields(
  db: SqlExecutor,
  input: MergeCompatInput,
  slotStartIso: string,
  logCompat: (msg: string, meta: Record<string, unknown>) => void,
) {
  const rb = input.rubitimeBranchId?.trim() || null;
  const rs = input.rubitimeServiceId?.trim() || null;
  const rcRaw = input.rubitimeCooperatorId?.trim() || null;
  let lookup: Awaited<ReturnType<typeof lookupBranchServiceByRubitimeIds>>["result"] = null;
  if (rb && rs) {
    const r = await lookupBranchServiceByRubitimeIds(db, rb, rs, rcRaw);
    if (r.ambiguous) {
      logCompat("branch_service_lookup_ambiguous", {
        rubitimeBranchId: rb,
        rubitimeServiceId: rs,
        rubitimeCooperatorId: rcRaw,
      });
    } else if (!r.result) {
      logCompat("branch_service_lookup_miss", {
        rubitimeBranchId: rb,
        rubitimeServiceId: rs,
        rubitimeCooperatorId: rcRaw,
      });
    }
    lookup = r.result;
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

export type UpsertPatientBookingFromRubitimeOptions = {
  /** E.164 normalization (same as webapp `normalizeRuPhoneE164`). */
  normalizeRuPhoneE164: (raw: string) => string;
  /** Optional: defaults to console.warn for ambiguous lookup. */
  logCompat?: (msg: string, meta: Record<string, unknown>) => void;
};

/**
 * Single implementation for Rubitime → `patient_bookings` (webapp + integrator direct SQL).
 * Mirrors `pgPatientBookingsPort.upsertFromRubitime`.
 */
export async function upsertPatientBookingFromRubitime(
  db: SqlExecutor,
  normalizeRuPhoneE164: (raw: string) => string,
  input: RubitimePatientBookingUpsertInput,
  options?: Pick<UpsertPatientBookingFromRubitimeOptions, "logCompat">,
): Promise<void> {
  const logCompat =
    options?.logCompat ??
    ((msg: string, meta: Record<string, unknown>) => {
      console.warn(`[rubitime-patient-booking] ${msg}`, meta);
    });

  const existing = await db.query<{ id: string; source: string; slot_start: Date }>(
    `SELECT id, source, slot_start FROM public.patient_bookings WHERE rubitime_id = $1 LIMIT 1`,
    [input.rubitimeId],
  );
  let existingRow = existing.rows[0];

  if (!existingRow) {
    const phoneRaw = input.contactPhone?.trim() ?? "";
    const slotStartIso = input.slotStart?.trim() ?? "";
    if (phoneRaw && slotStartIso) {
      const phoneNorm = normalizeRuPhoneE164(phoneRaw);
      const fallback = await db.query<{ id: string; source: string; slot_start: Date }>(
        `SELECT id, source, slot_start FROM public.patient_bookings
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
        await db.query(`UPDATE public.patient_bookings SET rubitime_id = $1, updated_at = now() WHERE id = $2`, [
          input.rubitimeId,
          fb.id,
        ]);
        existingRow = fb;
      }
    }
  }

  if (existingRow) {
    if (existingRow.source === "rubitime_projection" && input.status === "cancelled") {
      await db.query(`DELETE FROM public.patient_bookings
           WHERE id = $1 AND source = 'rubitime_projection'`, [existingRow.id]);
      return;
    }
    const slotStartIso = input.slotStart ?? existingRow.slot_start.toISOString();
    const merge = await mergeCompatProjectionFields(db, input, slotStartIso, logCompat);
    await db.query(
        `UPDATE public.patient_bookings
         SET status = $2::text,
             slot_start = CASE
               WHEN source = 'rubitime_projection' THEN COALESCE($3::timestamptz, slot_start)
               ELSE slot_start
             END,
             slot_end   = CASE
               WHEN source = 'rubitime_projection' THEN COALESCE($4::timestamptz, slot_end)
               ELSE slot_end
             END,
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
             duration_minutes_snapshot = CASE WHEN source = 'rubitime_projection' AND $14::integer IS NOT NULL THEN $14::integer ELSE duration_minutes_snapshot END,
             price_minor_snapshot = CASE WHEN source = 'rubitime_projection' AND $15::integer IS NOT NULL THEN $15::integer ELSE price_minor_snapshot END,
             compat_quality = CASE WHEN source = 'rubitime_projection' THEN $9::text ELSE compat_quality END,
             rubitime_manage_url = CASE WHEN $17::text IS NOT NULL THEN $17::text ELSE rubitime_manage_url END,
             provenance_updated_by = CASE WHEN source = 'rubitime_projection' THEN 'rubitime_external' ELSE provenance_updated_by END,
             platform_user_id = CASE
               WHEN $18::uuid IS NOT NULL THEN COALESCE(platform_user_id, $18::uuid)
               ELSE platform_user_id
             END,
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
        input.userId ?? null,
      ],
    );
    return;
  }

  if (input.status === "cancelled") return;
  if (!input.slotStart) return;

  const merge = await mergeCompatProjectionFields(db, input, input.slotStart, logCompat);
  const userId = input.userId ?? null;
  const id = randomUUID();

  await db.query(
    `INSERT INTO public.patient_bookings (
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
}
