/**
 * Rubitime UI «Местное время» offset (hours vs Moscow) → IANA zone.
 * @see docs/TIMEZONE_UTC_NORMALIZATION/MASTER_PLAN.md
 *
 * When this is stored on `branches.meta_json`, use key {@link RUBITIME_LOCAL_TIME_OFFSET_META_KEY}.
 */
export const RUBITIME_LOCAL_TIME_OFFSET_META_KEY = "rubitime_local_time_offset" as const;

/** Rubitime offset -1..+9 → canonical IANA for Russian coverage. */
export const RUBITIME_LOCAL_TIME_OFFSET_TO_IANA: Readonly<Record<number, string>> = {
  [-1]: "Europe/Kaliningrad",
  0: "Europe/Moscow",
  1: "Europe/Samara",
  2: "Asia/Yekaterinburg",
  3: "Asia/Omsk",
  4: "Asia/Krasnoyarsk",
  5: "Asia/Irkutsk",
  6: "Asia/Yakutsk",
  7: "Asia/Vladivostok",
  8: "Asia/Magadan",
  9: "Asia/Kamchatka",
} as const;

export function ianaForRubitimeLocalTimeOffset(offsetHours: number): string | null {
  if (!Number.isInteger(offsetHours)) return null;
  const map = RUBITIME_LOCAL_TIME_OFFSET_TO_IANA as Record<number, string | undefined>;
  return map[offsetHours] ?? null;
}
