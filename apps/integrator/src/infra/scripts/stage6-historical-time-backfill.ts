/**
 * Stage 6: targeted backfill for rubitime/appointment/projection booking timestamps (UTC normalization).
 *
 * Usage:
 *   pnpm --dir apps/integrator run timezone:stage6-backfill -- --cutoff-iso=2026-04-04T00:00:00.000Z --dry-run --unresolved-out=/tmp/stage6-unresolved.jsonl
 *   pnpm --dir apps/integrator run timezone:stage6-backfill -- --cutoff-iso=... --apply --unresolved-out=/tmp/stage6-unresolved.jsonl
 *
 * Env:
 *   DATABASE_URL — integrator DB (rubitime_records, integration_data_quality_incidents)
 *   WEBAPP_DATABASE_URL — webapp DB (appointment_records, patient_bookings, branches); defaults to DATABASE_URL
 */
import "../../config/loadEnv.js";
import { writeFile } from "node:fs/promises";
import { Pool, type PoolClient } from "pg";
import {
  classifyHistoricalRubitimeTiming,
  deriveCompatSlotEnd,
  extractIntegratorBranchIdFromPayload,
} from "../../scripts/stage6/historicalTimeBackfillLogic.js";

type Args = {
  cutoffIso: string;
  dryRun: boolean;
  apply: boolean;
  requireUtcMisinterpretationMatch: boolean;
  unresolvedOut: string | null;
  integratorUrl: string;
  webappUrl: string;
};

function parseArgs(argv: string[]): Args {
  let cutoffIso = "";
  let dryRun = true;
  let apply = false;
  let requireUtcMisinterpretationMatch = true;
  let unresolvedOut: string | null = null;
  for (const a of argv) {
    if (a.startsWith("--cutoff-iso=")) cutoffIso = a.slice("--cutoff-iso=".length).trim();
    if (a === "--dry-run") dryRun = true;
    if (a === "--apply") {
      apply = true;
      dryRun = false;
    }
    if (a === "--no-require-utc-match") requireUtcMisinterpretationMatch = false;
    if (a.startsWith("--unresolved-out=")) unresolvedOut = a.slice("--unresolved-out=".length).trim() || null;
  }
  const integratorUrl = process.env.DATABASE_URL?.trim() ?? "";
  const webappUrl = process.env.WEBAPP_DATABASE_URL?.trim() || integratorUrl;
  return {
    cutoffIso,
    dryRun: apply ? false : dryRun,
    apply,
    requireUtcMisinterpretationMatch,
    unresolvedOut,
    integratorUrl,
    webappUrl,
  };
}

type BranchTzMap = Map<string, string>;

async function loadBranchTimezoneMap(client: PoolClient): Promise<BranchTzMap> {
  const res = await client.query<{ integrator_branch_id: number; timezone: string }>(
    "SELECT integrator_branch_id, timezone FROM branches WHERE integrator_branch_id IS NOT NULL",
  );
  const m: BranchTzMap = new Map();
  for (const row of res.rows) {
    m.set(String(row.integrator_branch_id), row.timezone.trim());
  }
  return m;
}

function resolveBranchTimezone(map: BranchTzMap, branchId: string | null): string {
  if (!branchId) return "Europe/Moscow";
  const n = Number(branchId);
  if (!Number.isFinite(n)) return "Europe/Moscow";
  return map.get(String(Math.trunc(n))) ?? "Europe/Moscow";
}

function effectiveAppointmentTimezone(
  joinedTz: string | null | undefined,
  payloadJson: unknown,
  map: BranchTzMap,
): string {
  const j = joinedTz?.trim();
  if (j) return j;
  const bid = extractIntegratorBranchIdFromPayload(payloadJson);
  return resolveBranchTimezone(map, bid);
}

type PlannedRubitime = {
  id: number;
  rubitime_record_id: string;
  oldRecordAt: string | null;
  newRecordAt: string;
  newSlotEnd: string | null;
  kind: "fix_misinterpreted_utc" | "restore_null_record_at";
};

type UnresolvedRow = {
  table: "rubitime_records" | "appointment_records";
  externalId: string;
  rawRecordAt: string;
  branchTimezone: string;
  failureReason: string;
};

function bump(h: Record<string, number>, key: string): void {
  h[key] = (h[key] ?? 0) + 1;
}

async function upsertBackfillUnresolvedIncident(
  client: PoolClient,
  externalId: string,
  rawValue: string,
  timezoneUsed: string,
  _failureReason: string,
): Promise<void> {
  await client.query(
    `INSERT INTO integration_data_quality_incidents (
      integration, entity, external_id, field, raw_value, timezone_used, error_reason,
      status, first_seen_at, last_seen_at, occurrences
    ) VALUES (
      'rubitime', 'record', $1, 'recordAt', $2, $3, 'backfill_unresolvable',
      'unresolved', NOW(), NOW(), 1
    )
    ON CONFLICT (integration, entity, external_id, field, error_reason)
    DO UPDATE SET
      last_seen_at = NOW(),
      occurrences = integration_data_quality_incidents.occurrences + 1,
      status = 'unresolved',
      raw_value = COALESCE(EXCLUDED.raw_value, integration_data_quality_incidents.raw_value),
      timezone_used = COALESCE(EXCLUDED.timezone_used, integration_data_quality_incidents.timezone_used)`,
    [externalId, rawValue, timezoneUsed],
  );
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    console.log(`stage6-historical-time-backfill

Required:
  --cutoff-iso=<ISO>   Rows with created_at >= this instant are never updated (post-fix boundary).

Modes:
  --dry-run            BEGIN → UPDATE → counts → ROLLBACK (default)
  --apply              COMMIT (integrator then webapp; run only in maintenance window)

Safety:
  By default, only rows whose stored instant matches the naive-as-UTC misread pattern are fixed.
  --no-require-utc-match  Disable that check (wider net, riskier); use only with extra SQL review.

Output:
  --unresolved-out=path   JSONL of unresolved rows (recommended for dry-run and apply).

Env: DATABASE_URL, optional WEBAPP_DATABASE_URL`);
    process.exit(0);
  }

  if (!args.cutoffIso) {
    console.error("Missing --cutoff-iso=...");
    process.exit(2);
  }
  const cutoffExclusive = new Date(args.cutoffIso);
  if (!Number.isFinite(cutoffExclusive.getTime())) {
    console.error("Invalid --cutoff-iso (not a valid date)");
    process.exit(2);
  }
  if (!args.integratorUrl) {
    console.error("DATABASE_URL is required");
    process.exit(2);
  }

  const integratorPool = new Pool({ connectionString: args.integratorUrl, max: 4 });
  const webappPool = new Pool({ connectionString: args.webappUrl, max: 4 });

  const skipHist: Record<string, number> = {};
  const unresolved: UnresolvedRow[] = [];
  const plannedRubitime: PlannedRubitime[] = [];

  try {
    const webClient = await webappPool.connect();
    let branchMap: BranchTzMap;
    try {
      branchMap = await loadBranchTimezoneMap(webClient);
    } finally {
      webClient.release();
    }

    const rubRes = await integratorPool.query<{
      id: number;
      rubitime_record_id: string;
      record_at: Date | null;
      payload_json: unknown;
      created_at: Date;
    }>(
      `SELECT id, rubitime_record_id, record_at, payload_json, created_at
       FROM rubitime_records
       WHERE created_at < $1::timestamptz
       ORDER BY id ASC`,
      [args.cutoffIso],
    );

    for (const row of rubRes.rows) {
      const bid = extractIntegratorBranchIdFromPayload(row.payload_json);
      const tz = resolveBranchTimezone(branchMap, bid);
      const c = classifyHistoricalRubitimeTiming({
        payloadJson: row.payload_json,
        recordAtDb: row.record_at,
        branchTimezone: tz,
        cutoffExclusive,
        rowCreatedAt: row.created_at,
        requireUtcMisinterpretationMatch: args.requireUtcMisinterpretationMatch,
      });
      if (c.kind === "skip") {
        bump(skipHist, `rubitime:${c.reason}`);
        continue;
      }
      if (c.kind === "unresolved") {
        bump(skipHist, "rubitime:unresolved");
        unresolved.push({
          table: "rubitime_records",
          externalId: row.rubitime_record_id,
          rawRecordAt: c.rawRecordAt,
          branchTimezone: c.branchTimezone,
          failureReason: c.failureReason,
        });
        continue;
      }
      plannedRubitime.push({
        id: row.id,
        rubitime_record_id: row.rubitime_record_id,
        oldRecordAt: row.record_at ? row.record_at.toISOString() : null,
        newRecordAt: c.newRecordAt,
        newSlotEnd: c.newSlotEnd,
        kind: c.kind,
      });
    }

    const apRes = await webappPool.query<{
      id: string;
      integrator_record_id: string;
      record_at: Date | null;
      payload_json: unknown;
      created_at: Date;
      branch_timezone_resolved: string | null;
    }>(
      `SELECT ar.id, ar.integrator_record_id, ar.record_at, ar.payload_json, ar.created_at,
              b.timezone AS branch_timezone_resolved
       FROM appointment_records ar
       LEFT JOIN branches b ON b.id = ar.branch_id
       WHERE ar.created_at < $1::timestamptz`,
      [args.cutoffIso],
    );

    const plannedAppointment: Array<{
      id: string;
      integrator_record_id: string;
      oldRecordAt: string | null;
      newRecordAt: string;
      newSlotEnd: string | null;
      kind: "fix_misinterpreted_utc" | "restore_null_record_at";
    }> = [];

    for (const row of apRes.rows) {
      const tz = effectiveAppointmentTimezone(row.branch_timezone_resolved, row.payload_json, branchMap);
      const c = classifyHistoricalRubitimeTiming({
        payloadJson: row.payload_json,
        recordAtDb: row.record_at,
        branchTimezone: tz,
        cutoffExclusive,
        rowCreatedAt: row.created_at,
        requireUtcMisinterpretationMatch: args.requireUtcMisinterpretationMatch,
      });
      if (c.kind === "skip") {
        bump(skipHist, `appointment:${c.reason}`);
        continue;
      }
      if (c.kind === "unresolved") {
        bump(skipHist, "appointment:unresolved");
        unresolved.push({
          table: "appointment_records",
          externalId: row.integrator_record_id,
          rawRecordAt: c.rawRecordAt,
          branchTimezone: c.branchTimezone,
          failureReason: c.failureReason,
        });
        continue;
      }
      plannedAppointment.push({
        id: row.id,
        integrator_record_id: row.integrator_record_id,
        oldRecordAt: row.record_at ? row.record_at.toISOString() : null,
        newRecordAt: c.newRecordAt,
        newSlotEnd: c.newSlotEnd,
        kind: c.kind,
      });
    }

    const bookingRes = await webappPool.query<{
      id: string;
      rubitime_id: string | null;
      slot_start: Date;
      slot_end: Date;
      created_at: Date;
    }>(
      `SELECT id, rubitime_id, slot_start, slot_end, created_at
       FROM patient_bookings
       WHERE source = 'rubitime_projection'
         AND rubitime_id IS NOT NULL
         AND created_at < $1::timestamptz`,
      [args.cutoffIso],
    );

    const recordTimingByRubitimeId = new Map<
      string,
      { newRecordAt: string; newSlotEnd: string | null }
    >();
    for (const p of plannedRubitime) {
      recordTimingByRubitimeId.set(p.rubitime_record_id, {
        newRecordAt: p.newRecordAt,
        newSlotEnd: p.newSlotEnd,
      });
    }
    for (const p of plannedAppointment) {
      recordTimingByRubitimeId.set(p.integrator_record_id, {
        newRecordAt: p.newRecordAt,
        newSlotEnd: p.newSlotEnd,
      });
    }

    const plannedBookings: Array<{
      id: string;
      rubitime_id: string;
      oldSlotStart: string;
      oldSlotEnd: string;
      newSlotStart: string;
      newSlotEnd: string;
    }> = [];

    for (const b of bookingRes.rows) {
      const rid = b.rubitime_id;
      if (!rid) continue;
      const p = recordTimingByRubitimeId.get(rid);
      if (!p) {
        bump(skipHist, "booking:no_matching_record_plan");
        continue;
      }
      const newEnd =
        deriveCompatSlotEnd({
          oldSlotStart: b.slot_start,
          oldSlotEnd: b.slot_end,
          newSlotStartIso: p.newRecordAt,
          newSlotEndIso: p.newSlotEnd,
        }) ?? b.slot_end.toISOString();
      const newStartMs = Date.parse(p.newRecordAt);
      const newEndMs = Date.parse(newEnd);
      if (!Number.isFinite(newStartMs) || !Number.isFinite(newEndMs) || newEndMs <= newStartMs) {
        bump(skipHist, "booking:invalid_slot_pair");
        continue;
      }
      if (
        Math.abs(b.slot_start.getTime() - newStartMs) <= 1000
        && Math.abs(b.slot_end.getTime() - newEndMs) <= 1000
      ) {
        bump(skipHist, "booking:already_aligned");
        continue;
      }
      plannedBookings.push({
        id: b.id,
        rubitime_id: rid,
        oldSlotStart: b.slot_start.toISOString(),
        oldSlotEnd: b.slot_end.toISOString(),
        newSlotStart: p.newRecordAt,
        newSlotEnd: newEnd,
      });
    }

    const report = {
      mode: args.dryRun ? "dry-run" : "apply",
      cutoffExclusive: args.cutoffIso,
      requireUtcMisinterpretationMatch: args.requireUtcMisinterpretationMatch,
      counts: {
        rubitime_records_scanned: rubRes.rows.length,
        rubitime_records_to_update: plannedRubitime.length,
        appointment_records_to_update: plannedAppointment.length,
        patient_bookings_to_update: plannedBookings.length,
        unresolved_candidates: unresolved.length,
      },
      skipHistogram: skipHist,
      samples: {
        rubitime_records: plannedRubitime.slice(0, 25),
        appointment_records: plannedAppointment.slice(0, 25),
        patient_bookings: plannedBookings.slice(0, 25),
      },
    };

    console.log(JSON.stringify(report, null, 2));

    const iClient = await integratorPool.connect();
    const wClient = await webappPool.connect();
    try {
      await iClient.query("BEGIN");
      await wClient.query("BEGIN");

      let rubUpdated = 0;
      for (const p of plannedRubitime) {
        const u = await iClient.query(
          `UPDATE rubitime_records
           SET record_at = $1::timestamptz, updated_at = NOW()
           WHERE id = $2
             AND (record_at IS DISTINCT FROM $1::timestamptz)`,
          [p.newRecordAt, p.id],
        );
        rubUpdated += u.rowCount ?? 0;
      }

      let apUpdated = 0;
      for (const p of plannedAppointment) {
        const u = await wClient.query(
          `UPDATE appointment_records
           SET record_at = $1::timestamptz, updated_at = NOW()
           WHERE id = $2::uuid
             AND (record_at IS DISTINCT FROM $1::timestamptz)`,
          [p.newRecordAt, p.id],
        );
        apUpdated += u.rowCount ?? 0;
      }

      let pbUpdated = 0;
      for (const p of plannedBookings) {
        const u = await wClient.query(
          `UPDATE patient_bookings
           SET slot_start = $1::timestamptz, slot_end = $2::timestamptz, updated_at = NOW()
           WHERE id = $3::uuid
             AND source = 'rubitime_projection'
             AND (
               slot_start IS DISTINCT FROM $1::timestamptz
               OR slot_end IS DISTINCT FROM $2::timestamptz
             )`,
          [p.newSlotStart, p.newSlotEnd, p.id],
        );
        pbUpdated += u.rowCount ?? 0;
      }

      if (args.apply && unresolved.length > 0) {
        for (const u of unresolved) {
          await upsertBackfillUnresolvedIncident(
            iClient,
            u.externalId,
            u.rawRecordAt,
            u.branchTimezone,
            u.failureReason,
          );
        }
      }

      const txReport = {
        transaction: args.dryRun ? "ROLLBACK" : "COMMIT",
        rowsTouched: {
          rubitime_records_update_returning_rowcount: rubUpdated,
          appointment_records_update_returning_rowcount: apUpdated,
          patient_bookings_update_returning_rowcount: pbUpdated,
        },
      };
      console.log(JSON.stringify({ dryRunTransaction: txReport }, null, 2));

      if (args.dryRun) {
        await iClient.query("ROLLBACK");
        await wClient.query("ROLLBACK");
      } else {
        await iClient.query("COMMIT");
        await wClient.query("COMMIT");
      }
    } catch (err) {
      await iClient.query("ROLLBACK");
      await wClient.query("ROLLBACK");
      throw err;
    } finally {
      iClient.release();
      wClient.release();
    }

    const jsonl = unresolved.map((r) => JSON.stringify(r)).join("\n");
    if (args.unresolvedOut) {
      await writeFile(args.unresolvedOut, jsonl ? `${jsonl}\n` : "", "utf8");
    }
  } finally {
    await integratorPool.end();
    await webappPool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
