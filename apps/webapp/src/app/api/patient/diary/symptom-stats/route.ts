/**
 * GET /api/patient/diary/symptom-stats — агрегированные точки симптома для графика (только владелец tracking).
 * Query: trackingId (обяз.), period=week|month|all, offset (целое ≥0).
 * Ответы: 401 — нет сессии; 403 — не роль пациента; 404 — нет tracking у пользователя; 400 — query.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { aggregateSymptomEntriesByDay } from "@/modules/diaries/stats/aggregation";
import { statsPeriodWindowUtc } from "@/modules/diaries/stats/periodWindow";
import { getCurrentSession } from "@/modules/auth/service";
import { canAccessPatient } from "@/modules/roles/service";

const querySchema = z.object({
  trackingId: z.string().min(1),
  period: z.enum(["week", "month", "all"]).default("week"),
  offset: z.coerce.number().int().min(0).max(520).default(0),
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

  const { trackingId, period, offset } = parsed.data;
  const deps = buildAppDeps();
  const userId = session.user.userId;

  const tracking = await deps.diaries.getSymptomTrackingForUser({ userId, trackingId });
  if (!tracking) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const { fromIso, toExclusiveIso } = statsPeriodWindowUtc(period, offset);
  const entries = await deps.diaries.listSymptomEntriesForTrackingInRange({
    userId,
    trackingId,
    fromRecordedAt: fromIso,
    toRecordedAtExclusive: toExclusiveIso,
  });

  const points = aggregateSymptomEntriesByDay(entries);

  return NextResponse.json({
    ok: true,
    points: points.map((p) => ({
      date: p.date,
      value: p.value,
      entryType: p.entryType,
    })),
    period,
    offset,
    window: { from: fromIso, toExclusive: toExclusiveIso },
    trackingId: tracking.id,
  });
}
