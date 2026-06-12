/**
 * GET /api/doctor/schedule-kpis?period=month|week|day
 *
 * Клиентский endpoint для обновления KPI-строки при смене периода в DoctorScheduleShell.
 * Период по умолчанию — "month" (30 дн).
 */
import { NextResponse } from "next/server";
import { getCurrentSession } from "@/modules/auth/service";
import { canAccessDoctor } from "@/modules/roles/service";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { loadDoctorAnalyticsAudience } from "@/app-layer/analytics/loadAnalyticsAudience";
import { resolveSchedulePeriodPreset, loadDoctorScheduleKpis } from "@/app/app/doctor/schedule/loadDoctorScheduleKpis";

export async function GET(req: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!canAccessDoctor(session.user.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const period = resolveSchedulePeriodPreset(url.searchParams.get("period"));

  const deps = buildAppDeps();
  const audience = await loadDoctorAnalyticsAudience();

  const kpis = await loadDoctorScheduleKpis(deps, period, {
    excludedUserIds: audience?.excludedUserIds ?? [],
  });

  return NextResponse.json({ ok: true, kpis });
}
