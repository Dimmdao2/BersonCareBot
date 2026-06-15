/**
 * GET /api/doctor/clients/:userId/program-day-activity
 *
 * Возвращает per-day активность выполнения программы (сколько назначено / сколько выполнено).
 * Стратегия MVP: читает снимки дневника (`patient_diary_day_snapshots`) за окно,
 * а «выполнено» считает через маску `plan_done_mask` из снимка.
 *
 * Query params:
 *   instanceId  — UUID экземпляра программы
 *   windowDays  — 7 | 30 (default 7)
 *   startDate   — YYYY-MM-DD (default: windowDays дней назад по UTC)
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getCurrentSession } from "@/modules/auth/service";
import { canAccessDoctor } from "@/modules/roles/service";

const querySchema = z.object({
  instanceId: z.string().uuid(),
  windowDays: z
    .enum(["7", "30"])
    .optional()
    .transform((v) => (v === "30" ? 30 : 7)),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export async function GET(
  request: Request,
  context: { params: Promise<{ userId: string }> },
) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!canAccessDoctor(session.user.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { userId } = await context.params;
  if (!z.string().uuid().safeParse(userId).success) {
    return NextResponse.json({ ok: false, error: "invalid_user" }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({
    instanceId: searchParams.get("instanceId"),
    windowDays: searchParams.get("windowDays") ?? undefined,
    startDate: searchParams.get("startDate") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_query" }, { status: 400 });
  }

  const { instanceId, windowDays } = parsed.data;

  // Determine the local date range (UTC calendar dates as proxy — good enough for MVP)
  const now = new Date();
  const toLocalDate = now.toISOString().slice(0, 10); // YYYY-MM-DD UTC today
  const fromDate = parsed.data.startDate
    ? parsed.data.startDate
    : (() => {
        const d = new Date(now);
        d.setUTCDate(d.getUTCDate() - windowDays + 1);
        return d.toISOString().slice(0, 10);
      })();

  try {
    const deps = buildAppDeps();

    // Verify the user exists
    const identity = await deps.doctorClientsPort.getClientIdentity(userId);
    if (!identity) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }

    // Read diary snapshots for the user in the date range
    const snapshots = await deps.patientDiarySnapshots.listForUserDateRange(
      userId,
      fromDate,
      toLocalDate,
    );

    // Build a map of date → { assignedCount, doneCount } from snapshots
    // A snapshot is relevant only if it matches the requested instanceId
    const dayMap = new Map<string, { assignedCount: number; doneCount: number }>();

    for (const snap of snapshots) {
      // Only count days where the snapshot is for this instance
      if (snap.planInstanceId !== instanceId) continue;

      const assignedCount = snap.planItemIds.length;
      const doneCount = snap.planDoneMask.filter(Boolean).length;
      dayMap.set(snap.localDate, { assignedCount, doneCount });
    }

    // Fill every date in range (days with no snapshot get 0/0)
    const days: Array<{ localDate: string; assignedCount: number; doneCount: number }> = [];
    const cursor = new Date(fromDate + "T00:00:00Z");
    const end = new Date(toLocalDate + "T00:00:00Z");

    while (cursor <= end) {
      const localDate = cursor.toISOString().slice(0, 10);
      const entry = dayMap.get(localDate);
      days.push({
        localDate,
        assignedCount: entry?.assignedCount ?? 0,
        doneCount: entry?.doneCount ?? 0,
      });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    return NextResponse.json({ ok: true, days });
  } catch {
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
