import { NextResponse } from "next/server";
import { requirePatientApiBusinessAccess } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { routePaths } from "@/app-layer/routes/paths";
import { getAppDisplayTimeZone } from "@/modules/system-settings/appDisplayTimezone";
import { resolveCalendarDayIanaForPatient } from "@/modules/system-settings/calendarIana";

export async function GET() {
  const gate = await requirePatientApiBusinessAccess({ returnPath: routePaths.patient });
  if (!gate.ok) return gate.response;

  const deps = buildAppDeps();
  const [appDefault, personalIana] = await Promise.all([
    getAppDisplayTimeZone(),
    deps.patientCalendarTimezone.getIanaForUser(gate.session.user.userId),
  ]);
  const tz = resolveCalendarDayIanaForPatient(personalIana, appDefault);
  const days = await deps.patientMood.getWeekSparkline(gate.session.user.userId, tz);
  return NextResponse.json({ ok: true, days });
}
