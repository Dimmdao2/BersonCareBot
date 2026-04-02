import { NextResponse } from "next/server";
import { requirePatientAccess } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";

const ALLOWED = new Set([30, 60, 120]);

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requirePatientAccess().catch(() => null);
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const { id: occurrenceId } = await context.params;
  if (!occurrenceId?.trim()) {
    return NextResponse.json({ ok: false, error: "validation_error" }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "validation_error" }, { status: 400 });
  }

  const minutes = body.minutes;
  if (typeof minutes !== "number" || !ALLOWED.has(minutes)) {
    return NextResponse.json({ ok: false, error: "validation_error" }, { status: 400 });
  }
  const minutesAllowed = minutes as 30 | 60 | 120;

  const deps = buildAppDeps();
  const res = await deps.reminders.snoozeOccurrence(session.user.userId, occurrenceId, minutesAllowed);
  if (!res.ok) {
    if (res.error === "not_available") {
      return NextResponse.json({ ok: false, error: res.error }, { status: 503 });
    }
    return NextResponse.json({ ok: false, error: res.error }, { status: 404 });
  }
  return NextResponse.json({
    ok: true,
    occurrenceId: res.data.occurrenceId,
    snoozedUntil: res.data.snoozedUntil,
  });
}
