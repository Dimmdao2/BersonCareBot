import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requirePatientApiBusinessAccess } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { routePaths } from "@/app-layer/routes/paths";

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await requirePatientApiBusinessAccess({ returnPath: routePaths.patientReminders });
  if (!gate.ok) return gate.response;
  const session = gate.session;

  const { id: occurrenceId } = await context.params;
  if (!occurrenceId?.trim()) {
    return NextResponse.json({ ok: false, error: "validation_error" }, { status: 400 });
  }

  let body: Record<string, unknown> = {};
  try {
    const text = await req.text();
    if (text.trim()) body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "validation_error" }, { status: 400 });
  }

  let reason: string | null = null;
  if ("reason" in body) {
    if (body.reason !== null && typeof body.reason !== "string") {
      return NextResponse.json({ ok: false, error: "validation_error" }, { status: 400 });
    }
    reason = body.reason === null || body.reason === undefined ? null : body.reason;
    if (reason && reason.length > 500) {
      return NextResponse.json({ ok: false, error: "validation_error" }, { status: 400 });
    }
  }

  const deps = buildAppDeps();
  const res = await deps.reminders.skipOccurrence(session.user.userId, occurrenceId, reason);
  if (!res.ok) {
    if (res.error === "not_available") {
      return NextResponse.json({ ok: false, error: res.error }, { status: 503 });
    }
    return NextResponse.json({ ok: false, error: res.error }, { status: 404 });
  }
  revalidatePath(routePaths.patientReminders);
  revalidatePath(routePaths.patient);
  return NextResponse.json({
    ok: true,
    occurrenceId: res.data.occurrenceId,
    skippedAt: res.data.skippedAt,
  });
}
