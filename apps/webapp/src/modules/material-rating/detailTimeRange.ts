import { DateTime } from "luxon";

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

function parseDayInZone(iana: string, ymd: string): DateTime {
  const dt = DateTime.fromISO(ymd, { zone: iana });
  if (!dt.isValid) throw new Error("invalid_date");
  return dt.startOf("day");
}

/** Перечисление календарных дней [fromDay..toDay] в зоне `iana` (строки YYYY-MM-DD). */
function enumerateLocalDayKeysInclusive(iana: string, fromDay: string, toDay: string): string[] {
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

/** Пресеты периода детализации оценок (максимум 31 календарный день). */
export type MaterialRatingDetailPreset = "week" | "month" | "custom";

export type ResolvedMaterialRatingDetailLocalRange = {
  fromDay: string;
  toDay: string;
  startUtcIso: string;
  endExclusiveUtcIso: string;
  dayKeys: string[];
};

const MAX_SPAN_DAYS = 31;

/**
 * Локальный диапазон дней в `iana` для doctor material-ratings detail.
 * `week` — 7 дней включая сегодня; `month` — 30 дней включая сегодня (как на сводке регистраций).
 */
export function resolveMaterialRatingDetailLocalRange(
  iana: string,
  preset: MaterialRatingDetailPreset,
  customFrom: string | undefined,
  customTo: string | undefined,
): ResolvedMaterialRatingDetailLocalRange {
  const now = DateTime.now().setZone(iana);
  const todayStart = now.startOf("day");

  let fromStart: DateTime;
  let toEndInclusiveStart: DateTime;

  if (preset === "week") {
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
    if (span + 1 > MAX_SPAN_DAYS) throw new Error("range_too_long");
  }

  const fromDay = fromStart.toFormat("yyyy-LL-dd");
  const toDay = toEndInclusiveStart.toFormat("yyyy-LL-dd");
  const dayKeys = enumerateLocalDayKeysInclusive(iana, fromDay, toDay);

  const startUtcIso = fromStart.toUTC().toISO()!;
  const endExclusiveUtcIso = toEndInclusiveStart.plus({ days: 1 }).toUTC().toISO()!;

  return { fromDay, toDay, startUtcIso, endExclusiveUtcIso, dayKeys };
}
