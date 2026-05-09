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

  const deps = buildAppDeps();
  const res = await deps.reminders.doneOccurrence(session.user.userId, occurrenceId.trim());
  if (!res.ok) {
    if (res.error === "not_available") {
      return NextResponse.json({ ok: false, error: res.error }, { status: 503 });
    }
    if (res.error === "conflict") {
      return NextResponse.json({ ok: false, error: res.error }, { status: 409 });
    }
    return NextResponse.json({ ok: false, error: res.error }, { status: 404 });
  }
  revalidatePath(routePaths.patientReminders);
  revalidatePath(routePaths.patient);
  return NextResponse.json({
    ok: true,
    occurrenceId: res.data.occurrenceId,
    doneAt: res.data.doneAt,
  });
}
