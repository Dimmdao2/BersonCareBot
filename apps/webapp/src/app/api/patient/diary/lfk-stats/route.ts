/**
 * GET /api/patient/diary/lfk-stats — статистика ЛФК за период.
 * Без `complexId`: обзорная матрица «день × комплекс».
 * С `complexId`: детальная таблица сессий (пагинация), только владелец комплекса.
 * Query: period=week|month|all, offset, complexId?, page?, pageSize?
 * Ответы: 401 — нет сессии; 403 — не роль пациента; 404 — чужой complexId; 400 — query.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { buildLfkOverviewMatrix } from "@/modules/diaries/stats/aggregation";
import { enumerateUtcDayKeysInWindow, statsPeriodWindowUtc } from "@/modules/diaries/stats/periodWindow";
import { getCurrentSession } from "@/modules/auth/service";
import { canAccessPatient } from "@/modules/roles/service";

const querySchema = z.object({
  period: z.enum(["week", "month", "all"]).default("week"),
  offset: z.coerce.number().int().min(0).max(520).default(0),
  complexId: z.string().min(1).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(5).max(100).default(20),
});

export async function GET(request: Request) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!canAccessPatient(session.user.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams.entries()));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_query" }, { status: 400 });
  }

  const { period, offset, complexId, page, pageSize } = parsed.data;
  const deps = buildAppDeps();
  const userId = session.user.userId;

  const { fromIso, toExclusiveIso } = statsPeriodWindowUtc(period, offset);
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
    const total = sessions.length;
    const start = (page - 1) * pageSize;
    const pageRows = sessions.slice(start, start + pageSize);

    return NextResponse.json({
      ok: true,
      period,
      offset,
      window: { from: fromIso, toExclusive: toExclusiveIso },
      complexes: complexList,
      overview: null,
      detail: {
        complex: { id: complex.id, title: complex.title },
        sessions: pageRows,
        page,
        pageSize,
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
