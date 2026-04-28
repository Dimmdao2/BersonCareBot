import { NextResponse } from "next/server";
import { requirePatientApiBusinessAccess } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { routePaths } from "@/app-layer/routes/paths";
import { parsePatientHomeDailyPracticeTarget } from "@/modules/patient-home/todayConfig";
import { getAppDisplayTimeZone } from "@/modules/system-settings/appDisplayTimezone";

export async function GET() {
  const gate = await requirePatientApiBusinessAccess({ returnPath: routePaths.patient });
  if (!gate.ok) return gate.response;

  const deps = buildAppDeps();
  const [tz, setting] = await Promise.all([
    getAppDisplayTimeZone(),
    deps.systemSettings.getSetting("patient_home_daily_practice_target", "admin"),
  ]);
  const todayTarget = parsePatientHomeDailyPracticeTarget(setting?.valueJson ?? null);
  const progress = await deps.patientPractice.getProgress(gate.session.user.userId, tz, todayTarget);
  return NextResponse.json(progress);
}
