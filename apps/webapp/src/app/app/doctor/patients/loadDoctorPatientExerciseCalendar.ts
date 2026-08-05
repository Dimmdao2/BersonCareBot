import { DateTime } from 'luxon';
import type { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import type { DoctorWorkspaceAccessContext } from '@/app-layer/guards/requireRole';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';

const FALLBACK_IANA = 'UTC';

export type DoctorPatientExerciseCalendarDay = {
  date: string;
  completedCount: number;
};

export type DoctorPatientExerciseCalendarSnapshot = {
  iana: string;
  from: string;
  to: string;
  days: DoctorPatientExerciseCalendarDay[];
};

/** Calendar month bounds in the patient's IANA zone. */
export function patientExerciseCalendarMonthRangeInIana(
  iana: string,
  year: number,
  month: number,
): { from: string; to: string } {
  const start = DateTime.fromObject({ year, month, day: 1 }, { zone: iana });
  const end = start.endOf('month');
  return {
    from: start.toISODate()!,
    to: end.toISODate()!,
  };
}

export function currentPatientExerciseCalendarMonthRangeInIana(iana: string): {
  from: string;
  to: string;
} {
  const now = DateTime.now().setZone(iana);
  return patientExerciseCalendarMonthRangeInIana(iana, now.year, now.month);
}

/** @deprecated Use patientExerciseCalendarMonthRangeInIana with patient IANA. */
export function patientExerciseCalendarMonthRange(year: number, month: number): {
  from: string;
  to: string;
} {
  return patientExerciseCalendarMonthRangeInIana(FALLBACK_IANA, year, month);
}

/** @deprecated Use currentPatientExerciseCalendarMonthRangeInIana with patient IANA. */
export function currentPatientExerciseCalendarMonthRange(): { from: string; to: string } {
  return currentPatientExerciseCalendarMonthRangeInIana(FALLBACK_IANA);
}

function utcWindowForLocalDateRange(
  iana: string,
  fromDate: string,
  toDate: string,
): { fromCompletedAt: string; toCompletedAtExclusive: string } {
  const fromStart = DateTime.fromISO(fromDate, { zone: iana }).startOf('day');
  const toEndExclusive = DateTime.fromISO(toDate, { zone: iana }).plus({ days: 1 }).startOf('day');
  return {
    fromCompletedAt: fromStart.toUTC().toISO()!,
    toCompletedAtExclusive: toEndExclusive.toUTC().toISO()!,
  };
}

export function bucketCompletedAtToPatientLocalDate(
  completedAtIso: string,
  iana: string,
): string | null {
  const local = DateTime.fromISO(completedAtIso, { setZone: true }).setZone(iana).toISODate();
  return local;
}

type Deps = ReturnType<typeof buildAppDeps>;

/**
 * Shared loader for patient exercise-completion calendar. Used by RSC bootstrap and
 * GET /api/doctor/patients/[userId]/exercise-calendar.
 */
export async function loadDoctorPatientExerciseCalendar(
  deps: Deps,
  workspace: DoctorWorkspaceAccessContext,
  patientUserId: string,
  range?: { from: string; to: string },
): Promise<DoctorPatientExerciseCalendarSnapshot> {
  const patientIana =
    (await deps.patientCalendarTimezone.getIanaForUser(patientUserId)) ?? FALLBACK_IANA;
  const { from: fromDate, to: toDate } =
    range ?? currentPatientExerciseCalendarMonthRangeInIana(patientIana);
  const { fromCompletedAt, toCompletedAtExclusive } = utcWindowForLocalDateRange(
    patientIana,
    fromDate,
    toDate,
  );

  const [sessions, practiceCompletions, programDoneItems] = await withDoctorWorkspacePrincipal(
    workspace,
    () =>
      Promise.all([
        deps.diaries.listLfkSessionsInRange({
          userId: patientUserId,
          organizationId: workspace.organizationId,
          fromCompletedAt,
          toCompletedAtExclusive,
        }),
        deps.patientPractice.listByUserInUtcRange(
          patientUserId,
          fromCompletedAt,
          toCompletedAtExclusive,
          workspace.organizationId,
        ),
        deps.programActionLog.listDoneItemsByLocalDateInWindowForPatient({
          patientUserId,
          organizationId: workspace.organizationId,
          windowStartUtcIso: fromCompletedAt,
          windowEndUtcExclusiveIso: toCompletedAtExclusive,
          displayIana: patientIana,
        }),
      ]),
  );

  const counts = new Map<string, number>();
  for (const session of sessions) {
    const day = bucketCompletedAtToPatientLocalDate(session.completedAt, patientIana);
    if (!day || day < fromDate || day > toDate) continue;
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  for (const completion of practiceCompletions) {
    if (completion.source === 'daily_warmup') continue;
    const day = bucketCompletedAtToPatientLocalDate(completion.completedAt, patientIana);
    if (!day || day < fromDate || day > toDate) continue;
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  for (const item of programDoneItems) {
    if (item.localDate < fromDate || item.localDate > toDate) continue;
    counts.set(item.localDate, (counts.get(item.localDate) ?? 0) + 1);
  }

  const days = Array.from(counts.entries())
    .map(([date, completedCount]) => ({ date, completedCount }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return { iana: patientIana, from: fromDate, to: toDate, days };
}
