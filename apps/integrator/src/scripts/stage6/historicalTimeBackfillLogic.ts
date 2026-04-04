import { NAIVE_WALL_CLOCK_REGEX, tryNormalizeToUtcInstant } from "../../shared/normalizeToUtcInstant.js";

export function coerceNonEmptyString(value: unknown): string | null {
  if (typeof value === "string" && value.trim().length > 0) return value.trim();
  return null;
}

/** Rubitime `payload_json` (same shape as webhook `data.record` / top-level data). */
export function extractRubitimePayloadWallStart(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  return coerceNonEmptyString(p.record) ?? coerceNonEmptyString(p.datetime);
}

export function extractRubitimePayloadWallEnd(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  return coerceNonEmptyString(p.datetime_end) ?? coerceNonEmptyString(p.date_time_end);
}

export function extractIntegratorBranchIdFromPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  if (p.branch_id == null) return null;
  const asStr = coerceNonEmptyString(p.branch_id);
  if (asStr) return asStr;
  const s = String(p.branch_id).trim();
  return s.length > 0 ? s : null;
}

export function isNaiveWallClockString(raw: string): boolean {
  return NAIVE_WALL_CLOCK_REGEX.test(raw.trim());
}

/** Wall clock interpreted in `Etc/UTC` (matches naive `::timestamptz` under session UTC). */
export function naiveWallAsEtcUtcInstant(raw: string): string | null {
  const r = tryNormalizeToUtcInstant(raw, "Etc/UTC");
  return r.ok ? r.utcIso : null;
}

export type Stage6RowClassification =
  | { kind: "skip"; reason: string }
  | {
      kind: "fix_misinterpreted_utc";
      newRecordAt: string;
      newSlotEnd: string | null;
    }
  | { kind: "restore_null_record_at"; newRecordAt: string; newSlotEnd: string | null }
  | {
      kind: "unresolved";
      rawRecordAt: string;
      branchTimezone: string;
      failureReason: string;
    };

export function classifyHistoricalRubitimeTiming(input: {
  payloadJson: unknown;
  recordAtDb: Date | null;
  branchTimezone: string;
  /** Rows with created_at >= cutoff are out of scope (post-fix ingest). */
  cutoffExclusive: Date;
  rowCreatedAt: Date;
  /** When true, only touch rows whose stored instant matches naive-as-UTC misread. */
  requireUtcMisinterpretationMatch: boolean;
}): Stage6RowClassification {
  const {
    payloadJson,
    recordAtDb,
    branchTimezone,
    cutoffExclusive,
    rowCreatedAt,
    requireUtcMisinterpretationMatch,
  } = input;

  if (rowCreatedAt >= cutoffExclusive) {
    return { kind: "skip", reason: "on_or_after_cutoff" };
  }

  const rawStart = extractRubitimePayloadWallStart(payloadJson);
  if (!rawStart) {
    return { kind: "skip", reason: "no_raw_start_in_payload" };
  }

  if (!isNaiveWallClockString(rawStart)) {
    return { kind: "skip", reason: "raw_start_not_naive_wall_clock" };
  }

  const correct = tryNormalizeToUtcInstant(rawStart, branchTimezone);
  if (!correct.ok) {
    return {
      kind: "unresolved",
      rawRecordAt: rawStart,
      branchTimezone,
      failureReason: correct.reason,
    };
  }

  const wrongUtc = naiveWallAsEtcUtcInstant(rawStart);
  if (!wrongUtc) {
    return {
      kind: "unresolved",
      rawRecordAt: rawStart,
      branchTimezone,
      failureReason: "invalid_datetime",
    };
  }

  const rawEnd = extractRubitimePayloadWallEnd(payloadJson);
  let newSlotEnd: string | null = null;
  if (rawEnd) {
    const endNorm = tryNormalizeToUtcInstant(rawEnd, branchTimezone);
    if (endNorm.ok) {
      newSlotEnd = endNorm.utcIso;
    }
  }

  if (recordAtDb == null) {
    return {
      kind: "restore_null_record_at",
      newRecordAt: correct.utcIso,
      newSlotEnd,
    };
  }

  const storedMs = recordAtDb.getTime();
  const correctMs = Date.parse(correct.utcIso);
  const wrongMs = Date.parse(wrongUtc);
  if (!Number.isFinite(correctMs) || !Number.isFinite(wrongMs)) {
    return { kind: "skip", reason: "non_finite_parse" };
  }

  if (Math.abs(storedMs - correctMs) <= 1000) {
    return { kind: "skip", reason: "already_correct" };
  }

  if (requireUtcMisinterpretationMatch && Math.abs(storedMs - wrongMs) > 1000) {
    return { kind: "skip", reason: "stored_not_matching_naive_as_utc_pattern" };
  }

  return {
    kind: "fix_misinterpreted_utc",
    newRecordAt: correct.utcIso,
    newSlotEnd,
  };
}

/**
 * Preserve slot duration when payload end is missing or failed to normalize.
 */
export function deriveCompatSlotEnd(params: {
  oldSlotStart: Date;
  oldSlotEnd: Date;
  newSlotStartIso: string;
  newSlotEndIso: string | null;
}): string | null {
  const { oldSlotStart, oldSlotEnd, newSlotStartIso, newSlotEndIso } = params;
  if (newSlotEndIso) return newSlotEndIso;
  const dur = oldSlotEnd.getTime() - oldSlotStart.getTime();
  if (!Number.isFinite(dur) || dur <= 0) return null;
  const ns = Date.parse(newSlotStartIso);
  if (!Number.isFinite(ns)) return null;
  return new Date(ns + dur).toISOString();
}
