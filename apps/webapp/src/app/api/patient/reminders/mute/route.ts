import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requirePatientApiBusinessAccess } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { routePaths } from "@/app-layer/routes/paths";

export async function POST(req: Request) {
  const gate = await requirePatientApiBusinessAccess({ returnPath: routePaths.patientReminders });
  if (!gate.ok) return gate.response;
  const session = gate.session;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "validation_error" }, { status: 400 });
  }

  let mutedUntilIso: string | null = null;
  if ("mutedUntilIso" in body) {
    const v = body.mutedUntilIso;
    if (v !== null && typeof v !== "string") {
      return NextResponse.json({ ok: false, error: "validation_error" }, { status: 400 });
    }
    mutedUntilIso = v === null || v === undefined ? null : String(v).trim() || null;
  } else if ("presetMinutes" in body && typeof body.presetMinutes === "number") {
    const m = Math.trunc(body.presetMinutes);
    if (!Number.isFinite(m) || m < 1 || m > 1440) {
      return NextResponse.json({ ok: false, error: "validation_error" }, { status: 400 });
    }
    mutedUntilIso = new Date(Date.now() + m * 60_000).toISOString();
  } else {
    return NextResponse.json({ ok: false, error: "validation_error" }, { status: 400 });
  }

  const deps = buildAppDeps();
  await deps.reminders.setReminderMutedUntil(session.user.userId, mutedUntilIso);
  revalidatePath(routePaths.patientReminders);
  revalidatePath(routePaths.patient);
  return NextResponse.json({ ok: true, mutedUntilIso });
}
