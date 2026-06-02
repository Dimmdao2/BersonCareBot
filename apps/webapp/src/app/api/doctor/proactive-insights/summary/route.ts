/**
 * GET /api/doctor/proactive-insights/summary — число проактивных сигналов для бейджа «Сегодня».
 */
import { NextResponse } from "next/server";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getCurrentSession } from "@/modules/auth/service";
import { canAccessDoctor } from "@/modules/roles/service";
import { getAppDisplayTimeZone } from "@/modules/system-settings/appDisplayTimezone";

export async function GET(_request: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!canAccessDoctor(session.user.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const displayIana = await getAppDisplayTimeZone();
  const deps = buildAppDeps();
  const { totalCount } = await deps.doctorProactiveInsights.queryInsights({
    limit: 1,
    displayIana,
  });
  return NextResponse.json({ ok: true, count: totalCount });
}
