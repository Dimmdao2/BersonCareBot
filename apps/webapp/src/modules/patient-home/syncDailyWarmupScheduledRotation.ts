import { applyDailyWarmupScheduledRotations } from "@/modules/patient-home/applyDailyWarmupScheduledRotations";
import { collectDailyWarmupRotationSlotInstants } from "@/modules/patient-home/collectDailyWarmupRotationSlotInstants";
import type { DailyWarmupPresentationState } from "@/modules/patient-home/dailyWarmupPresentationPorts";
import { pickDailyWarmupFromOrderedList } from "@/modules/patient-home/pickDailyWarmupFromOrderedList";
import {
  parsePatientHomeDailyWarmupRotationEnabled,
  parsePatientHomeDailyWarmupRotationTimes,
} from "@/modules/patient-home/patientHomeDailyWarmupRotationSettings";
import type { PatientHomeTodayConfigDeps } from "@/modules/patient-home/todayConfig";
import type { PatientDailyWarmupPresentationPort } from "@/modules/patient-home/dailyWarmupPresentationPorts";
import { resolveCalendarDayIanaForPatient } from "@/modules/system-settings/calendarIana";
import { getAppDisplayTimeZone } from "@/modules/system-settings/appDisplayTimezone";

export type SyncDailyWarmupScheduledRotationDeps = PatientHomeTodayConfigDeps & {
  patientDailyWarmupPresentation: PatientDailyWarmupPresentationPort;
  patientPractice: {
    getLatestDailyWarmupCompletedContentPageId(userId: string): Promise<string | null>;
  };
  patientCalendarTimezone: {
    getIanaForUser(userId: string): Promise<string | null>;
  };
};

function statesEqual(a: DailyWarmupPresentationState, b: DailyWarmupPresentationState): boolean {
  return (
    a.contentPageId === b.contentPageId &&
    a.lastRotationAt === b.lastRotationAt &&
    a.skipNextScheduledRotation === b.skipNextScheduledRotation
  );
}

function buildInitialPresentationState(
  pages: ReadonlyArray<{ contentPageId: string }>,
  lastCompletedContentPageId: string | null,
  nowIso: string,
): DailyWarmupPresentationState | null {
  if (pages.length === 0) return null;
  const anchorIndex =
    lastCompletedContentPageId ?
      pickDailyWarmupFromOrderedList(pages, lastCompletedContentPageId)
    : 0;
  const contentPageId = pages[anchorIndex]?.contentPageId;
  if (!contentPageId) return null;
  return {
    contentPageId,
    lastRotationAt: nowIso,
    skipNextScheduledRotation: false,
  };
}

export async function syncDailyWarmupScheduledRotation(
  userId: string,
  pages: ReadonlyArray<{ contentPageId: string }>,
  deps: SyncDailyWarmupScheduledRotationDeps,
  now: Date = new Date(),
): Promise<DailyWarmupPresentationState | null> {
  if (pages.length === 0) return null;

  const [enabledSetting, timesSetting, existing, lastCompleted, patientIanaRaw, appTz] = await Promise.all([
    deps.systemSettings.getSetting("patient_home_daily_warmup_rotation_enabled", "admin"),
    deps.systemSettings.getSetting("patient_home_daily_warmup_rotation_times", "admin"),
    deps.patientDailyWarmupPresentation.getPresentationState(userId),
    deps.patientPractice.getLatestDailyWarmupCompletedContentPageId(userId),
    deps.patientCalendarTimezone.getIanaForUser(userId),
    getAppDisplayTimeZone(),
  ]);

  const rotationEnabled = parsePatientHomeDailyWarmupRotationEnabled(enabledSetting?.valueJson ?? null);
  const scheduleTimes = parsePatientHomeDailyWarmupRotationTimes(timesSetting?.valueJson ?? null);
  const patientIana = resolveCalendarDayIanaForPatient(patientIanaRaw, appTz);
  const nowIso = now.toISOString();

  let state =
    existing ??
    buildInitialPresentationState(pages, lastCompleted, nowIso);

  if (!state) return null;

  if (!existing) {
    await deps.patientDailyWarmupPresentation.upsertPresentationState(userId, state);
    return state;
  }

  if (!rotationEnabled || scheduleTimes.length === 0) {
    return state;
  }

  const slotInstants = collectDailyWarmupRotationSlotInstants({
    scheduleTimes,
    patientIana,
    lastRotationAt: state.lastRotationAt,
    now,
  });

  if (slotInstants.length === 0) {
    return state;
  }

  const nextState = applyDailyWarmupScheduledRotations({
    pages,
    initialState: state,
    slotInstants,
  });

  if (!statesEqual(state, nextState)) {
    await deps.patientDailyWarmupPresentation.upsertPresentationState(userId, nextState);
  }

  return nextState;
}
