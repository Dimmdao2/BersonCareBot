/**
 * GET /api/doctor/patients/[userId]/exercise-calendar?from=YYYY-MM-DD&to=YYYY-MM-DD
 * → { ok: true, days: [{ date: "YYYY-MM-DD", completedCount: number }] }
 *
 * Exercise-completion calendar for the «Обзор» tab of the Patient card.
 * Defaults to the first..last day of the current calendar month when from/to
 * are absent. Aggregates LFK sessions per local calendar date.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireDoctorApiSession } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

function currentMonthRange(): { from: string; to: string } {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth(); // 0-indexed
  const firstDay = new Date(Date.UTC(year, month, 1));
  const lastDay = new Date(Date.UTC(year, month + 1, 0));
  return {
    from: firstDay.toISOString().slice(0, 10),
    to: lastDay.toISOString().slice(0, 10),
  };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const auth = await requireDoctorApiSession();
  if (!auth.ok) return auth.response;

  const { userId } = await params;
  if (!z.string().uuid().safeParse(userId).success) {
    return NextResponse.json({ ok: false, error: "invalid_user_id" }, { status: 400 });
  }

  const url = new URL(request.url);
  const rawFrom = url.searchParams.get("from");
  const rawTo = url.searchParams.get("to");

  let fromDate: string;
  let toDate: string;

  if (rawFrom || rawTo) {
    const fromResult = dateSchema.safeParse(rawFrom);
    const toResult = dateSchema.safeParse(rawTo);
    if (!fromResult.success || !toResult.success) {
      return NextResponse.json(
        { ok: false, error: "invalid_date_params", detail: "expected from=YYYY-MM-DD&to=YYYY-MM-DD" },
        { status: 400 },
      );
    }
    fromDate = fromResult.data;
    toDate = toResult.data;
  } else {
    const range = currentMonthRange();
    fromDate = range.from;
    toDate = range.to;
  }

  // listSessionsInRange uses [fromCompletedAt, toCompletedAtExclusive)
  // so we add 1 day to toDate to make it inclusive on the last day.
  const toExclusive = new Date(toDate);
  toExclusive.setUTCDate(toExclusive.getUTCDate() + 1);
  const toCompletedAtExclusive = toExclusive.toISOString().slice(0, 10);

  const deps = buildAppDeps();
  const sessions = await deps.diaries.listLfkSessionsInRange({
    userId,
    fromCompletedAt: fromDate,
    toCompletedAtExclusive,
  });

  // Aggregate: count sessions per local calendar day (completedAt is a date string YYYY-MM-DD or ISO timestamp)
  const counts = new Map<string, number>();
  for (const session of sessions) {
    // completedAt may be "YYYY-MM-DD" or "YYYY-MM-DDTHH:mm:ss..."
    const day = session.completedAt.slice(0, 10);
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }

  const days = Array.from(counts.entries())
    .map(([date, completedCount]) => ({ date, completedCount }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return NextResponse.json({ ok: true, days });
}
