/**
 * GET /api/patient/diary/lfk-stats — статистика ЛФК за период.
 * Без `complexId`: обзорная матрица «день × комплекс».
 * С `complexId`: график по дням (`chartPoints`) и счётчик записей, только владелец комплекса.
 * Query: period=week|month|all, offset, complexId? (page/pageSize устарели, игнорируются).
 * Ответы: 401 — нет сессии; 403 — не роль пациента; 404 — чужой complexId; 400 — query.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { aggregateLfkSessionsMetricByDay, buildLfkOverviewMatrix } from "@/modules/diaries/stats/aggregation";
import { enumerateUtcDayKeysInWindow, statsPeriodWindowUtc } from "@/modules/diaries/stats/periodWindow";
import { requirePatientApiBusinessAccess } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";

const querySchema = z.object({
  period: z.enum(["week", "month", "all"]).default("week"),
  offset: z.coerce.number().int().min(0).max(520).default(0),
  complexId: z.string().min(1).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(5).max(100).default(20),
});

export async function GET(request: Request) {
  const gate = await requirePatientApiBusinessAccess({ returnPath: routePaths.diary });
  if (!gate.ok) return gate.response;
  const session = gate.session;

  const url = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams.entries()));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_query" }, { status: 400 });
  }

  const { period, offset, complexId } = parsed.data;
  const deps = buildAppDeps();
  const userId = session.user.userId;

  const earliestIso = period === "all" ? await deps.diaries.minCompletedAtForLfkUser(userId) : null;
  const { fromIso, toExclusiveIso } = statsPeriodWindowUtc(period, offset, { earliestIso });
  const complexes = await deps.diaries.listLfkComplexes(userId, true);
  const complexList = complexes.map((c) => ({ id: c.id, title: c.title }));

  if (complexId) {
    const complex = await deps.diaries.getLfkComplexForUser({ userId, complexId });
    if (!complex) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }

    const sessions = await deps.diaries.listLfkSessionsInRange({
      userId,
      fromCompletedAt: fromIso,
      toCompletedAtExclusive: toExclusiveIso,
      complexId,
      limit: 5000,
    });
    const chartPoints = aggregateLfkSessionsMetricByDay(sessions);
    const total = sessions.length;

    return NextResponse.json({
      ok: true,
      period,
      offset,
      window: { from: fromIso, toExclusive: toExclusiveIso },
      complexes: complexList,
      overview: null,
      detail: {
        complex: { id: complex.id, title: complex.title },
        chartPoints,
        total,
      },
    });
  }

  const sessions = await deps.diaries.listLfkSessionsInRange({
    userId,
    fromCompletedAt: fromIso,
    toCompletedAtExclusive: toExclusiveIso,
    limit: 5000,
  });

  const dayKeys = enumerateUtcDayKeysInWindow(fromIso, toExclusiveIso);
  /** Новые дни сверху (было: от старых к новым). */
  dayKeys.reverse();
  const ids = complexes.map((c) => c.id);
  const matrix = buildLfkOverviewMatrix(dayKeys, ids, sessions);

  return NextResponse.json({
    ok: true,
    period,
    offset,
    window: { from: fromIso, toExclusive: toExclusiveIso },
    complexes: complexList,
    overview: { days: dayKeys, matrix },
    detail: null,
  });
}
