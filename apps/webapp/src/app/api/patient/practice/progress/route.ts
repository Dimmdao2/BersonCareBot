import { NextResponse } from "next/server";
import { requirePatientApiBusinessAccess } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { routePaths } from "@/app-layer/routes/paths";
import { loadPatientHomeProgressMetrics } from "@/modules/patient-home/loadPatientHomeProgressMetrics";
import { getAppDisplayTimeZone } from "@/modules/system-settings/appDisplayTimezone";

export async function GET() {
  const gate = await requirePatientApiBusinessAccess({ returnPath: routePaths.patient });
  if (!gate.ok) return gate.response;

  const deps = buildAppDeps();
  const appTz = await getAppDisplayTimeZone();
  const metrics = await loadPatientHomeProgressMetrics(deps, gate.session.user.userId, appTz);
  return NextResponse.json({
    todayDone: metrics.doneTotal,
    todayTarget: metrics.plannedTotal,
    streak: metrics.streakDays,
    warmupPlanned: metrics.warmupPlanned,
    warmupDone: metrics.warmupDone,
    trainingPlanned: metrics.trainingPlanned,
    trainingDone: metrics.trainingDone,
  });
}
