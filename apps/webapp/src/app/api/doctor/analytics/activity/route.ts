/**
 * GET /api/doctor/analytics/activity?preset=day|week|month|custom[&from&to]
 *
 * Tenant/visibility-scoped KPI row + daily series for the doctor «Аналитика → Активность» tab:
 * actual treatment-program execution (`program_action_log`, action `done`) across the specialist's
 * visible patients. No fabricated adherence percentage — see AN-ACT-03.
 */
import { NextResponse } from 'next/server';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';
import { requireEntitlementForRead } from '@/app-layer/guards/requireEntitlement';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import { loadDoctorAnalyticsAudience } from '@/app-layer/analytics/loadAnalyticsAudience';
import { resolveAppointmentStatsBounds } from '@/modules/doctor-appointments/resolveAppointmentStatsBounds';
import { getAppDisplayTimeZone } from '@/modules/system-settings/appDisplayTimezone';
import { parseAdminStatsTimePreset } from '@/modules/admin-platform-stats/parseAdminStatsTimePreset';
import type { DoctorProgramActivityPeriod } from '@/modules/doctor-program-activity/ports';

export async function GET(req: Request) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;

  const entitlement = await requireEntitlementForRead(
    { organizationId: gate.ctx.organizationId },
    'doctor_statistics',
  );
  if (!entitlement.ok) return entitlement.response;

  const url = new URL(req.url);
  const preset = parseAdminStatsTimePreset(url.searchParams.get('preset'));
  const fromRaw = url.searchParams.get('from') ?? undefined;
  const toRaw = url.searchParams.get('to') ?? undefined;
  if (preset !== 'custom' && (fromRaw || toRaw)) {
    return NextResponse.json({ ok: false, error: 'unexpected_from_to' }, { status: 400 });
  }

  const iana = await getAppDisplayTimeZone();

  try {
    const bounds = resolveAppointmentStatsBounds(
      { kind: 'preset', preset, customFrom: fromRaw, customTo: toRaw },
      iana,
    );
    const period: DoctorProgramActivityPeriod = {
      from: bounds.from,
      toExclusive: bounds.toExclusive,
      fromDay: bounds.fromDay,
      toDay: bounds.toDay,
      displayIana: iana,
    };
    const audience = await loadDoctorAnalyticsAudience();
    const deps = buildAppDeps();
    const activityAudience = {
      organizationId: gate.ctx.organizationId,
      visibilityActor: gate.ctx,
      excludedUserIds: audience.excludedUserIds,
    };

    const [kpis, daySeries] = await withDoctorWorkspacePrincipal(
      gate.ctx,
      'doctor-statistics.analytics-activity.read',
      () =>
        Promise.all([
          deps.doctorProgramActivity.getActivityKpis(period, activityAudience),
          deps.doctorProgramActivity.getActivityDailySeries(period, activityAudience),
        ]),
    );

    return NextResponse.json({
      ok: true as const,
      fromDay: bounds.fromDay,
      toDay: bounds.toDay,
      kpis,
      daySeries,
    });
  } catch (e) {
    if (e instanceof Error && e.message === 'custom_range_required')
      return NextResponse.json({ ok: false, error: 'custom_range_required' }, { status: 400 });
    if (e instanceof Error && e.message === 'range_inverted')
      return NextResponse.json({ ok: false, error: 'range_inverted' }, { status: 400 });
    if (e instanceof Error && e.message === 'range_too_long')
      return NextResponse.json({ ok: false, error: 'range_too_long' }, { status: 400 });
    if (e instanceof Error && e.message === 'range_too_short')
      return NextResponse.json({ ok: false, error: 'range_too_short' }, { status: 400 });
    if (e instanceof Error && e.message === 'invalid_date')
      return NextResponse.json({ ok: false, error: 'invalid_date' }, { status: 400 });
    throw e;
  }
}
