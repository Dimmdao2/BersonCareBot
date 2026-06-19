import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requirePatientApiBusinessAccess } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { routePaths } from "@/app-layer/routes/paths";
import { z } from "zod";

/**
 * POST /api/patient/reminders/occurrences/[id]/snooze
 *
 * Called from the service worker (sw.js) when the patient taps "Позже" on a
 * web-push notification action button. Snoozes the occurrence by 30 minutes
 * (no request body required — the snooze duration is fixed for push actions).
 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await requirePatientApiBusinessAccess({ returnPath: routePaths.patientReminders });
  if (!gate.ok) return gate.response;

  const { id: occurrenceId } = await context.params;
  if (!z.string().min(1).max(200).safeParse(occurrenceId).success) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  const deps = buildAppDeps();
  const res = await deps.reminders.snoozeOccurrence(gate.session.user.userId, occurrenceId, 30);
  if (!res.ok) {
    if (res.error === "not_available") {
      return NextResponse.json({ ok: false, error: res.error }, { status: 503 });
    }
    return NextResponse.json({ ok: false, error: res.error }, { status: 404 });
  }
  revalidatePath(routePaths.patientReminders);
  revalidatePath(routePaths.patient);
  return NextResponse.json({ ok: true, snoozedUntil: res.data.snoozedUntil });
}
