import type { DbPort, DispatchPort } from "../../kernel/contracts/index.js";
import type { IntegrationDataQualityErrorReason } from "../../shared/integrationDataQuality/types.js";
import { db } from "./client.js";
import { recordDataQualityIncidentAndMaybeTelegram } from "./dataQualityIncidentAlert.js";
import { logger } from "../observability/logger.js";

const FALLBACK_TZ = "Europe/Moscow";
const TTL_MS = 60_000;

type CacheEntry = { tz: string; expiresAt: number };
const cache = new Map<string, CacheEntry>();

function normalizeBranchIdKey(branchId: number | string): string {
  return String(branchId).trim();
}

function parseIntegratorBranchId(branchId: number | string): number | null {
  if (typeof branchId === "number" && Number.isFinite(branchId)) return Math.trunc(branchId);
  const s = typeof branchId === "string" ? branchId.trim() : String(branchId);
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

function isValidIanaTimeZone(tz: string): boolean {
  const t = tz.trim();
  if (!t) return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: t });
    return true;
  } catch {
    return false;
  }
}

type BranchTzResolve =
  | { kind: "valid"; timezone: string }
  | {
      kind: "fallback";
      timezone: string;
      reason: IntegrationDataQualityErrorReason;
      rawValue: string | null;
    };

async function resolveBranchTimezone(branchId: number | string): Promise<BranchTzResolve> {
  const key = normalizeBranchIdKey(branchId);
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expiresAt > now) {
    return { kind: "valid", timezone: hit.tz };
  }

  const id = parseIntegratorBranchId(branchId);
  if (id === null) {
    logger.warn({ branchId: key, reason: "invalid_branch_id" }, "[branchTimezone] fallback");
    cache.set(key, { tz: FALLBACK_TZ, expiresAt: now + TTL_MS });
    return {
      kind: "fallback",
      timezone: FALLBACK_TZ,
      reason: "invalid_branch_id",
      rawValue: null,
    };
  }

  let raw: string | null;
  try {
    /**
     * Unified Postgres: canonical timezone for slots/ingest comes from webapp admin
     * «Каталог записи» — `public.booking_branches`, with `public.branches` as secondary
     * (synced on PATCH). Do not read `integrator.rubitime_branches.timezone` (duplicate).
     */
    const res = await db.query<{ timezone: string | null }>(
      `SELECT COALESCE(
         NULLIF(TRIM(COALESCE(bb.timezone::text, '')), ''),
         NULLIF(TRIM(COALESCE(b.timezone::text, '')), '')
       ) AS timezone
       FROM (SELECT $1::bigint AS rid) AS x
       LEFT JOIN public.booking_branches bb ON bb.rubitime_branch_id = trim(both from x.rid::text)
       LEFT JOIN public.branches b ON b.integrator_branch_id = x.rid
       LIMIT 1`,
      [id],
    );
    raw = res.rows[0]?.timezone ?? null;
  } catch (err) {
    logger.warn({ err, branchId: id, reason: "query_failed" }, "[branchTimezone] fallback");
    cache.set(key, { tz: FALLBACK_TZ, expiresAt: now + TTL_MS });
    return {
      kind: "fallback",
      timezone: FALLBACK_TZ,
      reason: "query_failed",
      rawValue: null,
    };
  }

  const trimmed = raw?.trim() ?? "";
  if (!trimmed || !isValidIanaTimeZone(trimmed)) {
    const reason: IntegrationDataQualityErrorReason =
      raw == null || trimmed === "" ? "missing_or_empty" : "invalid_iana";
    logger.warn(
      {
        branchId: id,
        reason: raw == null || trimmed === "" ? "missing_or_empty" : "invalid_iana",
        raw: raw == null ? null : raw,
      },
      "[branchTimezone] fallback",
    );
    cache.set(key, { tz: FALLBACK_TZ, expiresAt: now + TTL_MS });
    return {
      kind: "fallback",
      timezone: FALLBACK_TZ,
      reason,
      rawValue: raw == null ? null : raw,
    };
  }

  cache.set(key, { tz: trimmed, expiresAt: now + TTL_MS });
  return { kind: "valid", timezone: trimmed };
}

/** Clears branch timezone TTL cache (e.g. after booking catalog / branches timezone update). */
export function invalidateBranchTimezoneCache(): void {
  cache.clear();
}

/** @deprecated Используйте {@link invalidateBranchTimezoneCache}. */
export function resetBranchTimezoneCacheForTests(): void {
  invalidateBranchTimezoneCache();
}

/**
 * IANA timezone for numeric Rubitime branch id, with 60s in-memory TTL.
 * Reads `public.booking_branches` then `public.branches` (unified DB; admin catalog).
 * Missing / empty / invalid → {@link FALLBACK_TZ} (warn on DB path, once per TTL miss).
 */
export async function getBranchTimezone(branchId: number | string): Promise<string> {
  const r = await resolveBranchTimezone(branchId);
  return r.timezone;
}

/**
 * Same resolution as {@link getBranchTimezone}, plus data-quality incident + Telegram (deduped) on each fallback kind.
 * Use for Rubitime ingest; tests and non-alert paths can keep using {@link getBranchTimezone}.
 */
export function createGetBranchTimezoneWithDataQuality(input: {
  db: DbPort;
  dispatchPort: DispatchPort;
}): (branchId: string | undefined) => Promise<string> {
  return async (branchId) => {
    const r = await resolveBranchTimezone(branchId ?? "0");
    if (r.kind !== "fallback") {
      return r.timezone;
    }

    const externalId = normalizeBranchIdKey(branchId ?? "0");
    await recordDataQualityIncidentAndMaybeTelegram({
      db: input.db,
      dispatchPort: input.dispatchPort,
      incident: {
        integration: "rubitime",
        entity: "branch",
        externalId,
        field: "branch_timezone",
        rawValue: r.rawValue,
        timezoneUsed: FALLBACK_TZ,
        errorReason: r.reason,
      },
      alertLines: [
        "⚠️ Rubitime branch timezone fallback",
        `branchId: ${externalId}`,
        `reason: ${r.reason}`,
        ...(r.rawValue != null && r.rawValue !== "" ? [`raw DB timezone: ${r.rawValue}`] : []),
        `fallback used: ${FALLBACK_TZ}`,
      ],
    });

    return r.timezone;
  };
}
