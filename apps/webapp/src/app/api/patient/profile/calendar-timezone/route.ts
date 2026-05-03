import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requirePatientApiBusinessAccess } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { isAcceptableIanaTimezone } from "@/modules/system-settings/calendarIana";

const patchBodySchema = z.object({
  calendarTimezone: z.union([z.string().max(120), z.null()]),
});

export async function GET() {
  const gate = await requirePatientApiBusinessAccess({ returnPath: routePaths.profile });
  if (!gate.ok) return gate.response;

  const deps = buildAppDeps();
  const calendarTimezone = await deps.patientCalendarTimezone.getIanaForUser(gate.session.user.userId);
  return NextResponse.json({ ok: true, calendarTimezone });
}

export async function PATCH(request: Request) {
  const gate = await requirePatientApiBusinessAccess({ returnPath: routePaths.profile });
  if (!gate.ok) return gate.response;

  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = patchBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const v = parsed.data.calendarTimezone;
  if (v !== null && !isAcceptableIanaTimezone(v)) {
    return NextResponse.json({ ok: false, error: "invalid_timezone" }, { status: 400 });
  }

  const deps = buildAppDeps();
  const ok = await deps.patientCalendarTimezone.setIanaForPatient(
    gate.session.user.userId,
    v === null ? null : v.trim(),
  );
  if (!ok) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
