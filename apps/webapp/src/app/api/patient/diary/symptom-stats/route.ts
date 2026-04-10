/**
 * GET /api/patient/diary/symptom-stats — агрегированные точки симптома для графика (только владелец tracking).
 * Query: trackingId (обяз.), period=week|month|all, offset (целое ≥0).
 * Ответ points: по дню даты `instant` и `daily` (0–10 или null) — отдельные максимумы по типу записи.
 * Ответы: 401 — нет сессии; 403 — не роль пациента; 404 — нет tracking у пользователя; 400 — query.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { aggregateSymptomEntriesByDaySplit } from "@/modules/diaries/stats/aggregation";
import { statsPeriodWindowUtc } from "@/modules/diaries/stats/periodWindow";
import { requirePatientApiBusinessAccess } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";

const querySchema = z.object({
  trackingId: z.string().min(1),
  period: z.enum(["week", "month", "all"]).default("week"),
  offset: z.coerce.number().int().min(0).max(520).default(0),
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

  const { trackingId, period, offset } = parsed.data;
  const deps = buildAppDeps();
  const userId = session.user.userId;

  const tracking = await deps.diaries.getSymptomTrackingForUser({ userId, trackingId });
  if (!tracking) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const earliestIso =
    period === "all"
      ? await deps.diaries.minRecordedAtForSymptomTracking({ userId, trackingId })
      : null;
  const { fromIso, toExclusiveIso } = statsPeriodWindowUtc(period, offset, { earliestIso });
  const entries = await deps.diaries.listSymptomEntriesForTrackingInRange({
    userId,
    trackingId,
    fromRecordedAt: fromIso,
    toRecordedAtExclusive: toExclusiveIso,
  });

  const points = aggregateSymptomEntriesByDaySplit(entries);

  return NextResponse.json({
    ok: true,
    points: points.map((p) => ({
      date: p.date,
      instant: p.instant,
      daily: p.daily,
    })),
    period,
    offset,
    window: { from: fromIso, toExclusive: toExclusiveIso },
    trackingId: tracking.id,
  });
}
