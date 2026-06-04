import { DateTime } from "luxon";

import { resolveAdminStatsLocalRange } from "@/modules/admin-platform-stats/registrationTimeRange";
import type { DoctorAppointmentStatsFilter } from "@/modules/doctor-appointments/ports";
import { localDayRangeBoundsIso } from "@/shared/datetime/localDayRangeBounds";

/** UTC-границы для SQL: `gte(col, from)` и `lt(col, toExclusive)`. */
export type AppointmentStatsUtcBounds = {
  from: string;
  toExclusive: string;
  fromDay: string;
  toDay: string;
};

export function resolveAppointmentStatsBounds(
  filter: DoctorAppointmentStatsFilter,
  iana: string,
): AppointmentStatsUtcBounds {
  if (filter.kind === "preset") {
    const resolved = resolveAdminStatsLocalRange(iana, filter.preset, filter.customFrom, filter.customTo);
    return {
      from: resolved.startUtcIso,
      toExclusive: resolved.endExclusiveUtcIso,
      fromDay: resolved.fromDay,
      toDay: resolved.toDay,
    };
  }

  if (filter.range === "week") {
    return resolveAppointmentStatsBounds({ kind: "preset", preset: "week" }, iana);
  }

  const now = DateTime.now().setZone(iana);
  const today = now.startOf("day");
  let fromDay: string;
  let toDay: string;
  if (filter.range === "today") {
    fromDay = today.toFormat("yyyy-LL-dd");
    toDay = fromDay;
  } else {
    const t = today.plus({ days: 1 });
    fromDay = t.toFormat("yyyy-LL-dd");
    toDay = fromDay;
  }

  const { from, to } = localDayRangeBoundsIso(filter.range, iana);
  const endLocal = DateTime.fromISO(to, { zone: "utc" }).setZone(iana);
  const toExclusive = endLocal.plus({ days: 1 }).startOf("day").toUTC().toISO()!;

  return { from, toExclusive, fromDay, toDay };
}
