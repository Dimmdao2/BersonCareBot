import { NextResponse } from "next/server";
import { requirePatientApiBusinessAccess } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { routePaths } from "@/app-layer/routes/paths";
import { parsePatientHomeDailyPracticeTarget } from "@/modules/patient-home/todayConfig";
import { loadPatientHomeProgressForUser } from "@/modules/patient-home/patientHomeProgressResolver";
import { getAppDisplayTimeZone } from "@/modules/system-settings/appDisplayTimezone";

export async function GET() {
  const gate = await requirePatientApiBusinessAccess({ returnPath: routePaths.patient });
  if (!gate.ok) return gate.response;

  const deps = buildAppDeps();
  const userId = gate.session.user.userId;
  const [appTz, setting] = await Promise.all([
    getAppDisplayTimeZone(),
    deps.systemSettings.getSetting("patient_home_daily_practice_target", "admin"),
  ]);
  const adminPracticeTarget = parsePatientHomeDailyPracticeTarget(setting?.valueJson ?? null);
  const snapshot = await loadPatientHomeProgressForUser(deps, userId, appTz, adminPracticeTarget);
  return NextResponse.json({
    todayDone: snapshot.todayDone,
    todayTarget: snapshot.todayTarget,
    streak: snapshot.streak,
  });
}
