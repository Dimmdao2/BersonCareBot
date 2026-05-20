import { DateTime } from "luxon";
import { resolveCalendarDayIanaForPatient } from "@/modules/system-settings/calendarIana";
import { captureDiaryDaySnapshot, type CaptureDiaryDaySnapshotDeps } from "@/modules/patient-diary/captureDiaryDaySnapshot";
import type { PatientDiarySnapshotsPort } from "@/modules/patient-diary/ports";

export type SnapshotPromoDaysBeforeRefreshDeps = CaptureDiaryDaySnapshotDeps & {
  diarySnapshots: PatientDiarySnapshotsPort;
  getAppDefaultTimezoneIana: () => Promise<string>;
  getPatientCalendarTimezoneIana: (platformUserId: string) => Promise<string | null>;
};

/**
 * Перед закрытием promo-инстанса: лениво зафиксировать прошлые дни текущей недели
 * по закрываемому instance (чтобы refresh не «обнулял» дневник).
 */
export async function snapshotPromoDaysBeforeRefresh(
  deps: SnapshotPromoDaysBeforeRefreshDeps,
  input: { patientUserId: string; closingInstanceId: string },
): Promise<void> {
  const appDefault = await deps.getAppDefaultTimezoneIana();
  const personal = await deps.getPatientCalendarTimezoneIana(input.patientUserId);
  const iana = resolveCalendarDayIanaForPatient(personal, appDefault);
  const now = DateTime.now().setZone(iana);
  if (!now.isValid) return;

  const todayYmd = now.toISODate();
  if (!todayYmd) return;

  const weekStart = now.startOf("week");
  const firstYmd = weekStart.toISODate();
  if (!firstYmd) return;

  const yesterday = now.minus({ days: 1 }).toISODate();
  if (!yesterday || yesterday < firstYmd) return;

  const [rules, instances, existing] = await Promise.all([
    deps.reminders.listRulesByUser(input.patientUserId),
    deps.treatmentProgramInstance.listInstancesForPatient(input.patientUserId),
    deps.diarySnapshots.listForUserDateRange(input.patientUserId, firstYmd, yesterday),
  ]);
  const have = new Set(existing.map((r) => r.localDate));

  for (let i = 0; i < 7; i += 1) {
    const ymd = weekStart.plus({ days: i }).toISODate();
    if (!ymd || ymd >= todayYmd || have.has(ymd)) continue;

    const row = await captureDiaryDaySnapshot(deps, {
      userId: input.patientUserId,
      localYmd: ymd,
      iana,
      rules,
      instances,
      preferInstanceId: input.closingInstanceId,
    });
    await deps.diarySnapshots.insertIfMissing(row);
  }
}
