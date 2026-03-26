import type { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { routePaths } from "@/app-layer/routes/paths";
import type { MiniStatsProps } from "@/modules/diaries/components/MiniStats";
import { aggregateSymptomEntriesByDay, lfkDotsLast7DaysFromSessions } from "@/modules/diaries/stats/aggregation";
import { statsPeriodWindowUtc } from "@/modules/diaries/stats/periodWindow";

type Deps = ReturnType<typeof buildAppDeps>;

export async function loadMiniStatsProps(
  deps: Deps,
  session: { user: { userId: string; phone?: string } } | null
): Promise<MiniStatsProps> {
  if (!session) return { variant: "guest" };
  if (!session.user.phone?.trim()) return { variant: "no_phone" };

  const uid = session.user.userId;
  const trackings = await deps.diaries.listSymptomTrackings(uid, true);
  const sessions = await deps.diaries.listLfkSessions(uid, 80);
  const lfkDays = lfkDotsLast7DaysFromSessions(sessions);

  const { fromIso, toExclusiveIso } = statsPeriodWindowUtc("month", 0);
  const first = trackings[0];
  const entries = first
    ? await deps.diaries.listSymptomEntriesForTrackingInRange({
        userId: uid,
        trackingId: first.id,
        fromRecordedAt: fromIso,
        toRecordedAtExclusive: toExclusiveIso,
      })
    : [];

  const byDay = aggregateSymptomEntriesByDay(entries);
  const points = byDay.map((p) => ({ t: p.date, v: p.value }));

  if (points.length === 0 && lfkDays.every((d) => d === "none")) {
    return {
      variant: "empty",
      message: "Нет данных дневника за последний месяц. Отметьте симптом или занятие ЛФК.",
    };
  }

  const chartPoints =
    points.length > 0 ? points : [{ t: new Date().toISOString().slice(0, 10), v: 0 }];

  return {
    variant: "data",
    points: chartPoints,
    lfkDays,
    statsLinkHref: routePaths.diary,
  };
}
