/**
 * GET /api/doctor/analytics/activity/drilldown?preset=...&limit=&offset=[&from&to]
 *
 * Patients with treatment-program activity in the selected period, tenant/visibility-scoped —
 * drill-down target for the «Активность» KPI row (AN-ACT-04). Each row links into the existing
 * patient card / exercise calendar, not a new modal.
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
import type {
  DoctorProgramActivityPeriod,
  ProgramActivityPatientRow,
} from '@/modules/doctor-program-activity/ports';
import type { DoctorAnalyticsMetricAccountItem } from '@/modules/doctor-analytics-metric-accounts/ports';

function mapRow(row: ProgramActivityPatientRow): DoctorAnalyticsMetricAccountItem {
  return {
    userId: row.patientUserId,
    displayName: row.displayName,
    phone: null,
    eventAt: row.lastDoneAtIso,
    eventLabel: `Отметок за период: ${row.doneCountInPeriod}`,
  };
}

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
  const limit = Number.parseInt(url.searchParams.get('limit') ?? '20', 10);
  const offset = Number.parseInt(url.searchParams.get('offset') ?? '0', 10);
  if (!Number.isFinite(limit) || limit < 1 || limit > 100) {
    return NextResponse.json({ ok: false, error: 'invalid_limit' }, { status: 400 });
  }
  if (!Number.isFinite(offset) || offset < 0) {
    return NextResponse.json({ ok: false, error: 'invalid_offset' }, { status: 400 });
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

    const result = await withDoctorWorkspacePrincipal(
      gate.ctx,
      'doctor-statistics.analytics-activity-drilldown.read',
      () =>
        deps.doctorProgramActivity.listPatientsWithActivity(
          period,
          {
            organizationId: gate.ctx.organizationId,
            visibilityActor: gate.ctx,
            excludedUserIds: audience.excludedUserIds,
          },
          limit,
          offset,
        ),
    );

    return NextResponse.json({
      ok: true as const,
      items: result.items.map(mapRow),
      hasMore: result.hasMore,
      nextOffset: result.hasMore ? offset + limit : null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'error';
    if (
      msg === 'custom_range_required' ||
      msg === 'range_inverted' ||
      msg === 'range_too_long' ||
      msg === 'range_too_short' ||
      msg === 'invalid_date'
    ) {
      return NextResponse.json({ ok: false, error: msg }, { status: 400 });
    }
    throw e;
  }
}
