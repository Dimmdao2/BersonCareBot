import { NextResponse } from 'next/server';
import { z } from 'zod';

import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { loadDoctorAnalyticsAudience } from '@/app-layer/analytics/loadAnalyticsAudience';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import { requireEntitlementForRead } from '@/app-layer/guards/requireEntitlement';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';
import { parseAdminStatsTimePreset } from '@/modules/admin-platform-stats/parseAdminStatsTimePreset';
import { resolveAppointmentStatsBounds } from '@/modules/doctor-appointments/resolveAppointmentStatsBounds';
import { getAppDisplayTimeZone } from '@/modules/system-settings/appDisplayTimezone';
import type { FinanceAnalyticsBucket } from '@/modules/doctor-finance-analytics/ports';

export async function GET(req: Request) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;

  const entitlement = await requireEntitlementForRead(
    { organizationId: gate.ctx.organizationId },
    'doctor_statistics',
  );
  if (!entitlement.ok) return entitlement.response;

  if (!gate.ctx.canManageAllSpecialists && !gate.ctx.specialistId) {
    return NextResponse.json({ ok: false, error: 'specialist_not_configured' }, { status: 409 });
  }

  const url = new URL(req.url);
  const preset = parseAdminStatsTimePreset(url.searchParams.get('preset'));
  const fromRaw = url.searchParams.get('from') ?? undefined;
  const toRaw = url.searchParams.get('to') ?? undefined;
  const branchRaw = url.searchParams.get('branchId');
  const onlineOnly = url.searchParams.get('location') === 'online';
  const branchId = branchRaw && z.string().uuid().safeParse(branchRaw).success ? branchRaw : null;
  const bucketRaw = url.searchParams.get('bucket');
  const bucket: FinanceAnalyticsBucket = bucketRaw === 'month' ? 'month' : 'week';
  if (branchRaw && !branchId) {
    return NextResponse.json({ ok: false, error: 'invalid_branch' }, { status: 400 });
  }
  if (bucketRaw && bucketRaw !== 'week' && bucketRaw !== 'month') {
    return NextResponse.json({ ok: false, error: 'invalid_bucket' }, { status: 400 });
  }
  if (preset !== 'custom' && (fromRaw || toRaw)) {
    return NextResponse.json({ ok: false, error: 'unexpected_from_to' }, { status: 400 });
  }

  const displayIana = await getAppDisplayTimeZone();
  try {
    const bounds = resolveAppointmentStatsBounds(
      { kind: 'preset', preset, customFrom: fromRaw, customTo: toRaw },
      displayIana,
    );
    const audience = await loadDoctorAnalyticsAudience();
    const deps = buildAppDeps();
    const analytics = await withDoctorWorkspacePrincipal(
      gate.ctx,
      'doctor-statistics.analytics-finance.read',
      () =>
        deps.doctorFinanceAnalytics.getFinanceAnalytics(
          {
            from: bounds.from,
            toExclusive: bounds.toExclusive,
            displayIana,
            bucket,
          },
          {
            organizationId: gate.ctx.organizationId,
            specialistId: gate.ctx.specialistId,
            staffUserId: gate.ctx.session.user.userId,
            canManageAllSpecialists: gate.ctx.canManageAllSpecialists,
            excludedUserIds: audience.excludedUserIds,
            branchId,
            onlineOnly,
          },
        ),
    );

    return NextResponse.json({
      ok: true as const,
      fromDay: bounds.fromDay,
      toDay: bounds.toDay,
      analytics,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'custom_range_required')
      return NextResponse.json({ ok: false, error: 'custom_range_required' }, { status: 400 });
    if (error instanceof Error && error.message === 'range_inverted')
      return NextResponse.json({ ok: false, error: 'range_inverted' }, { status: 400 });
    if (error instanceof Error && error.message === 'range_too_long')
      return NextResponse.json({ ok: false, error: 'range_too_long' }, { status: 400 });
    if (error instanceof Error && error.message === 'range_too_short')
      return NextResponse.json({ ok: false, error: 'range_too_short' }, { status: 400 });
    if (error instanceof Error && error.message === 'invalid_date')
      return NextResponse.json({ ok: false, error: 'invalid_date' }, { status: 400 });
    throw error;
  }
}
