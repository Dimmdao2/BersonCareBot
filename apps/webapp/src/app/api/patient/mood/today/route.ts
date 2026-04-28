import { NextResponse } from "next/server";
import { requirePatientApiBusinessAccess } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { routePaths } from "@/app-layer/routes/paths";
import { getAppDisplayTimeZone } from "@/modules/system-settings/appDisplayTimezone";

export async function GET() {
  const gate = await requirePatientApiBusinessAccess({ returnPath: routePaths.patient });
  if (!gate.ok) return gate.response;

  const deps = buildAppDeps();
  const tz = await getAppDisplayTimeZone();
  const mood = await deps.patientMood.getToday(gate.session.user.userId, tz);
  return NextResponse.json({ ok: true, mood });
}
