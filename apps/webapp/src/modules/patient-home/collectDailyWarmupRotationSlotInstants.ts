import { DateTime } from "luxon";
import { normalizeDailyWarmupRotationTime } from "@/modules/patient-home/patientHomeDailyWarmupRotationSettings";

/**
 * Слоты расписания (patient IANA) строго после `lastRotationAt` и не позже `now`.
 * Без `lastRotationAt` — пустой список (инициализация без ретро — отдельно).
 */
export function collectDailyWarmupRotationSlotInstants(params: {
  scheduleTimes: readonly string[];
  patientIana: string;
  lastRotationAt: string | null;
  now: Date;
}): string[] {
  const times = params.scheduleTimes
    .map((t) => normalizeDailyWarmupRotationTime(t))
    .filter((t): t is string => t !== null)
    .sort();
  if (times.length === 0) return [];

  const nowDt = DateTime.fromJSDate(params.now, { zone: params.patientIana });
  if (!nowDt.isValid) return [];

  if (!params.lastRotationAt) return [];

  const anchor = DateTime.fromISO(params.lastRotationAt, { zone: params.patientIana });
  if (!anchor.isValid) return [];

  const slots: string[] = [];
  let day = anchor.startOf("day");
  const endDay = nowDt.startOf("day");

  while (day <= endDay) {
    for (const time of times) {
      const [hs, ms] = time.split(":");
      const slot = day.set({
        hour: Number.parseInt(hs!, 10),
        minute: Number.parseInt(ms!, 10),
        second: 0,
        millisecond: 0,
      });
      if (!slot.isValid) continue;
      if (slot > anchor && slot <= nowDt) {
        const iso = slot.toUTC().toISO();
        if (iso) slots.push(iso);
      }
    }
    day = day.plus({ days: 1 });
  }

  return slots.sort();
}
