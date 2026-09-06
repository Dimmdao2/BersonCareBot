/**
 * GET /api/doctor/analytics/records/drilldown?preset=...&limit=&offset=[&onlyCancelled=1&from&to]
 *
 * Drill-down list for the «Записи» KPI row / chart: same period bounds as
 * `/api/doctor/analytics/records`, same `DoctorAppointmentsPort` scope
 * (`{ kind: 'periodRange' }`), so the list always matches what the KPI/chart counted (AN-REC-03).
 * Response shape matches `DoctorAnalyticsMetricAccountItem` — reuses the existing
 * `MetricAccountsDialog` primitive instead of a second drill-down UI.
 */
import { NextResponse } from 'next/server';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';
import { requireEntitlementForRead } from '@/app-layer/guards/requireEntitlement';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import { loadDoctorAnalyticsAudience } from '@/app-layer/analytics/loadAnalyticsAudience';
import { parseAdminStatsTimePreset } from '@/modules/admin-platform-stats/parseAdminStatsTimePreset';
import type { AppointmentRow } from '@/modules/doctor-appointments/ports';
import type { DoctorAnalyticsMetricAccountItem } from '@/modules/doctor-analytics-metric-accounts/ports';

function mapRow(row: AppointmentRow, onlyCancelled: boolean): DoctorAnalyticsMetricAccountItem {
  return {
    userId: row.clientUserId,
    displayName: row.clientLabel,
    phone: null,
    eventAt: row.recordAtIso,
    eventLabel: onlyCancelled ? 'Отмена' : 'Запись',
    appointmentAt: row.recordAtIso,
    appointmentService: row.type,
    appointmentBranch: row.branchName,
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
  const onlyCancelled = url.searchParams.get('onlyCancelled') === '1';
  const limit = Number.parseInt(url.searchParams.get('limit') ?? '30', 10);
  const offset = Number.parseInt(url.searchParams.get('offset') ?? '0', 10);
  if (!Number.isFinite(limit) || limit < 1 || limit > 100) {
    return NextResponse.json({ ok: false, error: 'invalid_limit' }, { status: 400 });
  }
  if (!Number.isFinite(offset) || offset < 0) {
    return NextResponse.json({ ok: false, error: 'invalid_offset' }, { status: 400 });
  }

  try {
    const audience = await loadDoctorAnalyticsAudience();
    const deps = buildAppDeps();
    const rows = await withDoctorWorkspacePrincipal(
      gate.ctx,
      'doctor-statistics.analytics-records-drilldown.read',
      () =>
        deps.doctorAppointments.listAppointmentsForSpecialist(
          {
            kind: 'periodRange',
            period: { kind: 'preset', preset, customFrom: fromRaw, customTo: toRaw },
            onlyCancelled,
          },
          {
            organizationId: gate.ctx.organizationId,
            visibilityActor: gate.ctx,
            excludedUserIds: audience.excludedUserIds,
          },
        ),
    );
    const pageEnd = offset + limit + 1;
    const pageRows = rows.slice(offset, pageEnd);
    const hasMore = pageRows.length > limit;
    const sliced = hasMore ? pageRows.slice(0, limit) : pageRows;
    return NextResponse.json({
      ok: true as const,
      items: sliced.map((row) => mapRow(row, onlyCancelled)),
      hasMore,
      nextOffset: hasMore ? offset + limit : null,
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
