import type { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import type { DoctorWorkspaceAccessContext } from '@/app-layer/guards/requireRole';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';

const FALLBACK_IANA = 'UTC';

export type DoctorPatientExerciseCalendarDay = {
  date: string;
  completedCount: number;
};

/** Local calendar month bounds — matches PatientTabOverview `monthRangeFor`. */
function monthRangeLocal(year: number, month: number): { from: string; to: string } {
  const pad = (n: number) => String(n).padStart(2, '0');
  const last = new Date(year, month, 0);
  return {
    from: `${year}-${pad(month)}-01`,
    to: `${year}-${pad(month)}-${pad(last.getDate())}`,
  };
}

function currentMonthRangeLocal(): { from: string; to: string } {
  const now = new Date();
  return monthRangeLocal(now.getFullYear(), now.getMonth() + 1);
}

function toExclusiveEndDate(toDate: string): string {
  const toExclusive = new Date(toDate);
  toExclusive.setUTCDate(toExclusive.getUTCDate() + 1);
  return toExclusive.toISOString().slice(0, 10);
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
): Promise<DoctorPatientExerciseCalendarDay[]> {
  const { from: fromDate, to: toDate } = range ?? currentMonthRangeLocal();
  const toCompletedAtExclusive = toExclusiveEndDate(toDate);

  const patientIana =
    (await deps.patientCalendarTimezone.getIanaForUser(patientUserId)) ?? FALLBACK_IANA;

  const [sessions, practiceCompletions, programDoneItems] = await withDoctorWorkspacePrincipal(
    workspace,
    () =>
      Promise.all([
        deps.diaries.listLfkSessionsInRange({
          userId: patientUserId,
          organizationId: workspace.organizationId,
          fromCompletedAt: fromDate,
          toCompletedAtExclusive,
        }),
        deps.patientPractice.listByUserInUtcRange(
          patientUserId,
          fromDate,
          toCompletedAtExclusive,
          workspace.organizationId,
        ),
        deps.programActionLog.listDoneItemsByLocalDateInWindowForPatient({
          patientUserId,
          organizationId: workspace.organizationId,
          windowStartUtcIso: fromDate,
          windowEndUtcExclusiveIso: toCompletedAtExclusive,
          displayIana: patientIana,
        }),
      ]),
  );

  const counts = new Map<string, number>();
  for (const session of sessions) {
    const day = session.completedAt.slice(0, 10);
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  for (const completion of practiceCompletions) {
    if (completion.source === 'daily_warmup') continue;
    const day = completion.completedAt.slice(0, 10);
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  for (const item of programDoneItems) {
    counts.set(item.localDate, (counts.get(item.localDate) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([date, completedCount]) => ({ date, completedCount }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function currentPatientExerciseCalendarMonthRange(): { from: string; to: string } {
  return currentMonthRangeLocal();
}

export function patientExerciseCalendarMonthRange(year: number, month: number): {
  from: string;
  to: string;
} {
  return monthRangeLocal(year, month);
}
