#!/usr/bin/env tsx
/**
 * Backfill Rubitime history into patient_bookings.
 *
 * Source: appointment_records (webapp DB projection).
 * Target: patient_bookings + platform_users (best-effort creation by phone).
 *
 * Rules:
 * - Dry-run by default; use --commit to write.
 * - Creates missing users by phone_normalized if not found.
 * - For existing users, fills only empty profile fields (first_name, last_name, email, display_name).
 * - Inserts only records absent in patient_bookings by rubitime_id.
 * - Tries to resolve branch/service snapshots and branch_service_id by Rubitime IDs.
 * - Past confirmed/rescheduled rows are stored as completed so they do not violate
 *   patient_bookings_slot_no_overlap (global tstzrange for active statuses).
 * - Future confirmed/rescheduled: skip insert if slot overlaps an existing active row
 *   (or another row in the same dry-run batch).
 */

import "dotenv/config";
import pg from "pg";
import { randomUUID } from "node:crypto";

type AppointmentRow = {
  integrator_record_id: string;
  phone_normalized: string | null;
  record_at: Date | null;
  status: string;
  payload_json: unknown;
  created_at: Date;
  updated_at: Date;
};

type BranchServiceLookup = {
  branch_id: string;
  service_id: string;
  branch_service_id: string;
  city_code: string | null;
  branch_title: string | null;
  service_title: string | null;
  duration_minutes: number | null;
  price_minor: number | null;
  rubitime_cooperator_id: string | null;
};

type ParsedPayload = {
  phone: string | null;
  name: string | null;
  email: string | null;
  slotStart: string | null;
  slotEnd: string | null;
  branchTitle: string | null;
  serviceTitle: string | null;
  rubitimeBranchId: string | null;
  rubitimeServiceId: string | null;
  rubitimeCooperatorId: string | null;
  statusRaw: string | null;
};

type Stats = {
  examined: number;
  existingByRubitimeId: number;
  skippedNoRubitimeId: number;
  skippedNoPhone: number;
  skippedNoSlotStart: number;
  skippedSlotOverlap: number;
  usersCreated: number;
  usersUpdated: number;
  inserted: number;
  unresolvedBranchService: number;
};

const args = process.argv.slice(2);
const isDryRun = !args.includes("--commit");
const limitArg = args.find((a) => a.startsWith("--limit="));
const MAX_LIMIT = 500_000;

function parseLimit(arg: string | undefined): number {
  if (!arg) return 0;
  const n = Number.parseInt(arg.slice(arg.indexOf("=") + 1), 10);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(n, MAX_LIMIT);
}

const limit = parseLimit(limitArg);

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value === "string" && value.trim().length > 0) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(Math.trunc(value));
  return null;
}

function getByPath(root: unknown, path: string): unknown {
  const parts = path.split(".");
  let cur: unknown = root;
  for (const p of parts) {
    const rec = asRecord(cur);
    if (!rec) return undefined;
    cur = rec[p];
  }
  return cur;
}

function pickFirstString(root: unknown, paths: string[]): string | null {
  for (const p of paths) {
    const v = asNonEmptyString(getByPath(root, p));
    if (v) return v;
  }
  return null;
}

function parseNameToFirstLast(name: string | null): { firstName: string | null; lastName: string | null } {
  if (!name) return { firstName: null, lastName: null };
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: null, lastName: null };
  if (parts.length === 1) return { firstName: parts[0] ?? null, lastName: null };
  return { lastName: parts[0] ?? null, firstName: parts.slice(1).join(" ") || null };
}

function toIsoIfValid(value: string | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function computeFallbackSlotEnd(slotStartIso: string): string {
  const s = new Date(slotStartIso);
  if (Number.isNaN(s.getTime())) return slotStartIso;
  return new Date(s.getTime() + 60 * 60_000).toISOString();
}

function mapStatus(rowStatus: string, payloadStatus: string | null): {
  status: "confirmed" | "cancelled" | "rescheduled" | "completed" | "no_show";
  cancelledAt: Date | null;
} {
  const src = (payloadStatus ?? rowStatus ?? "").toLowerCase();
  if (src.includes("cancel")) return { status: "cancelled", cancelledAt: new Date() };
  if (src.includes("resched") || src.includes("moved")) return { status: "rescheduled", cancelledAt: null };
  if (src.includes("complete")) return { status: "completed", cancelledAt: null };
  if (src.includes("no_show") || src.includes("noshow")) return { status: "no_show", cancelledAt: null };
  return { status: "confirmed", cancelledAt: null };
}

/** Active statuses participate in patient_bookings_slot_no_overlap (see migration 041). */
function isActiveBookingStatus(
  s: "confirmed" | "cancelled" | "rescheduled" | "completed" | "no_show",
): s is "confirmed" | "rescheduled" {
  return s === "confirmed" || s === "rescheduled";
}

/**
 * Archive past visits as completed so multiple historical rows can overlap in time
 * without tripping the global exclusion constraint on (slot_start, slot_end).
 */
function resolveBackfillStatus(
  mapped: { status: "confirmed" | "cancelled" | "rescheduled" | "completed" | "no_show"; cancelledAt: Date | null },
  slotEndIso: string,
): { status: "confirmed" | "cancelled" | "rescheduled" | "completed" | "no_show"; cancelledAt: Date | null } {
  const end = new Date(slotEndIso).getTime();
  if (Number.isNaN(end)) return mapped;
  if (end >= Date.now()) return mapped;
  if (!isActiveBookingStatus(mapped.status)) return mapped;
  return { status: "completed", cancelledAt: null };
}

function rangesOverlapIso(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  const as = new Date(aStart).getTime();
  const ae = new Date(aEnd).getTime();
  const bs = new Date(bStart).getTime();
  const be = new Date(bEnd).getTime();
  if ([as, ae, bs, be].some((n) => Number.isNaN(n))) return false;
  return as < be && bs < ae;
}

const PHONE_PATHS = ["phone", "phoneNormalized", "record.phone", "data.record.phone"];
const NAME_PATHS = ["name", "patientName", "record.name", "data.record.name"];
const EMAIL_PATHS = ["email", "patientEmail", "record.email", "data.record.email"];
const SLOT_START_PATHS = ["record", "datetime", "record.record", "record.datetime", "data.record.record", "data.record.datetime"];
const SLOT_END_PATHS = ["datetime_end", "date_time_end", "record.datetime_end", "record.date_time_end", "data.record.datetime_end", "data.record.date_time_end"];
const BRANCH_TITLE_PATHS = ["branch_name", "branch_title", "branchName", "record.branch_name", "record.branch_title", "record.branchName", "data.record.branch_name", "data.record.branch_title", "data.record.branchName"];
const SERVICE_TITLE_PATHS = ["service_name", "service_title", "serviceName", "record.service_name", "record.service_title", "record.serviceName", "data.record.service_name", "data.record.service_title", "data.record.serviceName"];
const BRANCH_ID_PATHS = ["branch_id", "branchId", "integratorBranchId", "record.branch_id", "record.branchId", "data.record.branch_id", "data.record.branchId"];
const SERVICE_ID_PATHS = ["service_id", "serviceId", "integratorServiceId", "record.service_id", "record.serviceId", "data.record.service_id", "data.record.serviceId"];
const COOPERATOR_ID_PATHS = ["cooperator_id", "cooperatorId", "rubitimeCooperatorId", "record.cooperator_id", "record.cooperatorId", "data.record.cooperator_id", "data.record.cooperatorId"];
const STATUS_PATHS = ["status", "status_name", "record.status", "record.status_name", "data.record.status", "data.record.status_name"];

function parsePayload(payload: unknown): ParsedPayload {
  const phone = pickFirstString(payload, PHONE_PATHS);
  const name = pickFirstString(payload, NAME_PATHS);
  const email = pickFirstString(payload, EMAIL_PATHS);
  const slotStart = toIsoIfValid(pickFirstString(payload, SLOT_START_PATHS));
  const slotEnd = toIsoIfValid(pickFirstString(payload, SLOT_END_PATHS));
  const branchTitle = pickFirstString(payload, BRANCH_TITLE_PATHS);
  const serviceTitle = pickFirstString(payload, SERVICE_TITLE_PATHS);
  const rubitimeBranchId = pickFirstString(payload, BRANCH_ID_PATHS);
  const rubitimeServiceId = pickFirstString(payload, SERVICE_ID_PATHS);
  const rubitimeCooperatorId = pickFirstString(payload, COOPERATOR_ID_PATHS);
  const statusRaw = pickFirstString(payload, STATUS_PATHS);
  return {
    phone,
    name,
    email,
    slotStart,
    slotEnd,
    branchTitle,
    serviceTitle,
    rubitimeBranchId,
    rubitimeServiceId,
    rubitimeCooperatorId,
    statusRaw,
  };
}

function computeCompatQuality(input: {
  slotEnd: string | null;
  branchTitle: string | null;
  serviceTitle: string | null;
  rubitimeBranchId: string | null;
  rubitimeServiceId: string | null;
  branchServiceId: string | null;
}): "full" | "partial" | "minimal" {
  const hasSlotEnd = !!input.slotEnd;
  const hasBranch = !!(input.branchTitle ?? input.rubitimeBranchId);
  const hasService = !!(input.serviceTitle ?? input.rubitimeServiceId);
  if (hasSlotEnd && hasBranch && hasService && !!input.branchServiceId) return "full";
  if (hasBranch || hasService) return "partial";
  return "minimal";
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString: databaseUrl, max: 4 });

  const stats: Stats = {
    examined: 0,
    existingByRubitimeId: 0,
    skippedNoRubitimeId: 0,
    skippedNoPhone: 0,
    skippedNoSlotStart: 0,
    skippedSlotOverlap: 0,
    usersCreated: 0,
    usersUpdated: 0,
    inserted: 0,
    unresolvedBranchService: 0,
  };

  /** Dry-run only: would-be active slots in this batch (DB not updated yet). */
  const dryRunActiveSlots: Array<{ slot_start: string; slot_end: string }> = [];

  try {
    console.log("=== Backfill: Rubitime history -> patient_bookings ===");
    console.log(`Mode: ${isDryRun ? "DRY-RUN" : "COMMIT"}`);
    if (limit > 0) console.log(`Limit: ${limit}`);

    const existingRes = await pool.query<{ rubitime_id: string }>(
      `SELECT rubitime_id FROM patient_bookings WHERE rubitime_id IS NOT NULL`,
    );
    const existingIds = new Set(existingRes.rows.map((r) => r.rubitime_id));

    const rowsRes = await pool.query<AppointmentRow>(
      `SELECT integrator_record_id, phone_normalized, record_at, status, payload_json, created_at, updated_at
       FROM appointment_records
       WHERE deleted_at IS NULL
       ORDER BY updated_at ASC
       ${limit > 0 ? `LIMIT ${limit}` : ""}`,
    );

    for (const row of rowsRes.rows) {
      stats.examined += 1;

      const rubitimeId = asNonEmptyString(row.integrator_record_id);
      if (!rubitimeId) {
        stats.skippedNoRubitimeId += 1;
        continue;
      }
      if (existingIds.has(rubitimeId)) {
        stats.existingByRubitimeId += 1;
        continue;
      }

      const parsed = parsePayload(row.payload_json);
      const phone = asNonEmptyString(row.phone_normalized) ?? parsed.phone;
      if (!phone) {
        stats.skippedNoPhone += 1;
        continue;
      }

      const slotStart =
        (row.record_at ? row.record_at.toISOString() : null) ??
        parsed.slotStart;
      if (!slotStart) {
        stats.skippedNoSlotStart += 1;
        continue;
      }
      const slotEnd = parsed.slotEnd ?? computeFallbackSlotEnd(slotStart);

      const { firstName, lastName } = parseNameToFirstLast(parsed.name);
      const displayName = parsed.name ?? ([lastName, firstName].filter(Boolean).join(" ").trim() || null);
      const email = parsed.email;

      let platformUserId: string | null = null;
      const userRes = await pool.query<{ id: string }>(
        `SELECT id FROM platform_users WHERE phone_normalized = $1 LIMIT 1`,
        [phone],
      );
      if (userRes.rows[0]) {
        platformUserId = userRes.rows[0].id;
        if (!isDryRun) {
          const upd = await pool.query(
            `UPDATE platform_users
             SET
               first_name = CASE WHEN first_name IS NULL OR btrim(first_name) = '' THEN $2 ELSE first_name END,
               last_name = CASE WHEN last_name IS NULL OR btrim(last_name) = '' THEN $3 ELSE last_name END,
               email = CASE WHEN email IS NULL OR btrim(email) = '' THEN $4 ELSE email END,
               display_name = CASE WHEN display_name IS NULL OR btrim(display_name) = '' THEN COALESCE($5, display_name, '') ELSE display_name END,
               updated_at = now()
             WHERE id = $1`,
            [platformUserId, firstName, lastName, email, displayName],
          );
          if ((upd.rowCount ?? 0) > 0) stats.usersUpdated += 1;
        } else {
          stats.usersUpdated += 1;
        }
      } else {
        if (!isDryRun) {
          const ins = await pool.query<{ id: string }>(
            `INSERT INTO platform_users (phone_normalized, display_name, first_name, last_name, email, patient_phone_trust_at)
             VALUES ($1, $2, $3, $4, $5, now())
             RETURNING id`,
            [phone, displayName ?? "", firstName, lastName, email],
          );
          platformUserId = ins.rows[0]?.id ?? null;
        } else {
          platformUserId = randomUUID();
        }
        stats.usersCreated += 1;
      }

      if (!platformUserId) continue;

      let lookup: BranchServiceLookup | null = null;
      if (parsed.rubitimeBranchId && parsed.rubitimeServiceId) {
        const l = await pool.query<BranchServiceLookup>(
          `SELECT
             b.id AS branch_id,
             bs.service_id,
             bs.id AS branch_service_id,
             c.code AS city_code,
             b.title AS branch_title,
             s.title AS service_title,
             s.duration_minutes,
             s.price_minor,
             sp.rubitime_cooperator_id
           FROM booking_branches b
           JOIN booking_cities c ON c.id = b.city_id
           JOIN booking_branch_services bs ON bs.branch_id = b.id
           JOIN booking_services s ON s.id = bs.service_id
           LEFT JOIN booking_specialists sp ON sp.id = bs.specialist_id
           WHERE b.rubitime_branch_id = $1
             AND bs.rubitime_service_id = $2
           ORDER BY bs.updated_at DESC
           LIMIT 1`,
          [parsed.rubitimeBranchId, parsed.rubitimeServiceId],
        );
        lookup = l.rows[0] ?? null;
      }
      if (!lookup && parsed.rubitimeBranchId) {
        const l = await pool.query<{ city_code: string | null; branch_title: string | null }>(
          `SELECT c.code AS city_code, b.title AS branch_title
           FROM booking_branches b
           JOIN booking_cities c ON c.id = b.city_id
           WHERE b.rubitime_branch_id = $1
           ORDER BY b.updated_at DESC
           LIMIT 1`,
          [parsed.rubitimeBranchId],
        );
        if (l.rows[0]) {
          lookup = {
            branch_id: null as unknown as string,
            service_id: null as unknown as string,
            branch_service_id: null as unknown as string,
            city_code: l.rows[0].city_code,
            branch_title: l.rows[0].branch_title,
            service_title: null,
            duration_minutes: null,
            price_minor: null,
            rubitime_cooperator_id: null,
          };
        }
      }

      const branchServiceId = lookup?.branch_service_id ?? null;
      if (!branchServiceId) stats.unresolvedBranchService += 1;
      const branchId = lookup?.branch_id ?? null;
      const serviceId = lookup?.service_id ?? null;
      const cityCodeSnapshot = lookup?.city_code ?? null;
      const branchTitleSnapshot = parsed.branchTitle ?? lookup?.branch_title ?? null;
      const serviceTitleSnapshot = parsed.serviceTitle ?? lookup?.service_title ?? null;
      const durationMinutesSnapshot = lookup?.duration_minutes ?? null;
      const priceMinorSnapshot = lookup?.price_minor ?? null;
      const rubitimeCooperatorIdSnapshot = parsed.rubitimeCooperatorId ?? lookup?.rubitime_cooperator_id ?? null;

      const mapped = mapStatus(row.status, parsed.statusRaw);
      const effective = resolveBackfillStatus(mapped, slotEnd);

      if (isActiveBookingStatus(effective.status)) {
        const dbOverlap = await pool.query<{ x: boolean }>(
          `SELECT EXISTS (
            SELECT 1 FROM patient_bookings
            WHERE status IN ('confirmed', 'rescheduled')
              AND tstzrange(slot_start, slot_end, '[)') && tstzrange($1::timestamptz, $2::timestamptz, '[)')
          ) AS x`,
          [slotStart, slotEnd],
        );
        let overlap = dbOverlap.rows[0]?.x === true;
        if (isDryRun && !overlap) {
          overlap = dryRunActiveSlots.some((p) => rangesOverlapIso(slotStart, slotEnd, p.slot_start, p.slot_end));
        }
        if (overlap) {
          stats.skippedSlotOverlap += 1;
          continue;
        }
      }

      const compatQuality = computeCompatQuality({
        slotEnd,
        branchTitle: branchTitleSnapshot,
        serviceTitle: serviceTitleSnapshot,
        rubitimeBranchId: parsed.rubitimeBranchId,
        rubitimeServiceId: parsed.rubitimeServiceId,
        branchServiceId,
      });

      const contactName = parsed.name ?? displayName ?? "Пациент";

      if (!isDryRun) {
        const ins = await pool.query(
          `INSERT INTO patient_bookings (
             id, platform_user_id, booking_type, city, category,
             slot_start, slot_end, status, cancelled_at, cancel_reason,
             rubitime_id, gcal_event_id,
             contact_phone, contact_email, contact_name,
             reminder_24h_sent, reminder_2h_sent,
             created_at, updated_at,
             branch_id, service_id, branch_service_id,
             city_code_snapshot, branch_title_snapshot, service_title_snapshot,
             duration_minutes_snapshot, price_minor_snapshot,
             rubitime_branch_id_snapshot, rubitime_cooperator_id_snapshot, rubitime_service_id_snapshot,
             source, compat_quality
           ) VALUES (
             $1, $2, 'in_person', NULL, 'general',
             $3::timestamptz, $4::timestamptz, $5, $6::timestamptz, NULL,
             $7, NULL,
             $8, $9, $10,
             FALSE, FALSE,
             $11::timestamptz, $12::timestamptz,
             $13::uuid, $14::uuid, $15::uuid,
             $16, $17, $18,
             $19, $20,
             $21, $22, $23,
             'rubitime_projection', $24
           )
           ON CONFLICT (rubitime_id) DO NOTHING`,
          [
            randomUUID(),
            platformUserId,
            slotStart,
            slotEnd,
            effective.status,
            effective.cancelledAt,
            rubitimeId,
            phone,
            email,
            contactName,
            row.created_at.toISOString(),
            row.updated_at.toISOString(),
            branchId,
            serviceId,
            branchServiceId,
            cityCodeSnapshot,
            branchTitleSnapshot,
            serviceTitleSnapshot,
            durationMinutesSnapshot,
            priceMinorSnapshot,
            parsed.rubitimeBranchId,
            rubitimeCooperatorIdSnapshot,
            parsed.rubitimeServiceId,
            compatQuality,
          ],
        );
        if ((ins.rowCount ?? 0) > 0) {
          stats.inserted += 1;
          existingIds.add(rubitimeId);
        }
      } else {
        stats.inserted += 1;
        existingIds.add(rubitimeId);
        if (isActiveBookingStatus(effective.status)) {
          dryRunActiveSlots.push({ slot_start: slotStart, slot_end: slotEnd });
        }
      }
    }

    console.log("\n=== Report ===");
    console.log(JSON.stringify(stats, null, 2));
    if (isDryRun) {
      console.log("\nDry-run complete. Re-run with --commit to apply.");
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});

