import { DateTime } from "luxon";

import type { AdminStatsTimePreset } from "@/modules/admin-platform-stats/types";

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** Минимум календарных дней для custom в API «Регистрации и слияния». */
export const MIN_REGISTRATION_STATS_INCLUSIVE_DAYS = 7;

export type ResolvedRegistrationLocalRange = {
  fromDay: string;
  toDay: string;
  startUtcIso: string;
  endExclusiveUtcIso: string;
  dayKeys: string[];
};

export type ResolveAdminStatsRangeOpts = {
  /** Для `preset === "custom"`: ошибка `range_too_short`, если число календарных дней [from..to] меньше этого значения. */
  enforceMinInclusiveDays?: number;
};

function parseDayInZone(iana: string, ymd: string): DateTime {
  const dt = DateTime.fromISO(ymd, { zone: iana });
  if (!dt.isValid) throw new Error("invalid_date");
  return dt.startOf("day");
}

/** Перечисление календарных дней [fromDay..toDay] в зоне `iana` (строки YYYY-MM-DD). */
export function enumerateLocalDayKeysInclusive(iana: string, fromDay: string, toDay: string): string[] {
  let cur = parseDayInZone(iana, fromDay);
  const end = parseDayInZone(iana, toDay);
  if (cur > end) throw new Error("range_inverted");
  const keys: string[] = [];
  while (cur <= end) {
    keys.push(cur.toFormat("yyyy-LL-dd"));
    cur = cur.plus({ days: 1 });
  }
  return keys;
}

const MAX_CUSTOM_SPAN_DAYS = 400;

/**
 * Границы в UTC для полуинтервала [startUtc, endExclusiveUtc) по локальным суткам `iana`.
 */
export function resolveAdminStatsLocalRange(
  iana: string,
  preset: AdminStatsTimePreset,
  customFrom: string | undefined,
  customTo: string | undefined,
  opts?: ResolveAdminStatsRangeOpts,
): ResolvedRegistrationLocalRange {
  const now = DateTime.now().setZone(iana);
  const todayStart = now.startOf("day");

  let fromStart: DateTime;
  let toEndInclusiveStart: DateTime;

  if (preset === "day") {
    fromStart = todayStart;
    toEndInclusiveStart = todayStart;
  } else if (preset === "week") {
    fromStart = todayStart.minus({ days: 6 });
    toEndInclusiveStart = todayStart;
  } else if (preset === "month") {
    fromStart = todayStart.minus({ days: 29 });
    toEndInclusiveStart = todayStart;
  } else {
    const f = (customFrom ?? "").trim();
    const t = (customTo ?? "").trim();
    if (!DAY_KEY.test(f) || !DAY_KEY.test(t)) {
      throw new Error("custom_range_required");
    }
    fromStart = parseDayInZone(iana, f);
    toEndInclusiveStart = parseDayInZone(iana, t);
    const span = toEndInclusiveStart.diff(fromStart, "days").days;
    if (span < 0) throw new Error("range_inverted");
    const inclusiveDays = span + 1;
    if (inclusiveDays > MAX_CUSTOM_SPAN_DAYS) throw new Error("range_too_long");
    const min = opts?.enforceMinInclusiveDays;
    if (min !== undefined && inclusiveDays < min) {
      throw new Error("range_too_short");
    }
  }

  const fromDay = fromStart.toFormat("yyyy-LL-dd");
  const toDay = toEndInclusiveStart.toFormat("yyyy-LL-dd");
  const dayKeys = enumerateLocalDayKeysInclusive(iana, fromDay, toDay);

  const startUtcIso = fromStart.toUTC().toISO()!;
  const endExclusiveUtcIso = toEndInclusiveStart.plus({ days: 1 }).toUTC().toISO()!;

  return { fromDay, toDay, startUtcIso, endExclusiveUtcIso, dayKeys };
}
