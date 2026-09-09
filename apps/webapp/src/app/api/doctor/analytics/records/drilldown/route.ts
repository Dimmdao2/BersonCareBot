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
import { resolveAppointmentStatsBounds } from '@/modules/doctor-appointments/resolveAppointmentStatsBounds';
import { getAppDisplayTimeZone } from '@/modules/system-settings/appDisplayTimezone';
import type { AppointmentRow } from '@/modules/doctor-appointments/ports';
import type { DoctorAnalyticsMetricAccountItem } from '@/modules/doctor-analytics-metric-accounts/ports';
import { z } from 'zod';

const viewSchema = z.enum([
  'all',
  'past',
  'future',
  'unique',
  'first',
  'repeat',
  'cancelled',
  'rescheduled',
  'subscription',
]);

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
  const viewResult = viewSchema.safeParse(url.searchParams.get('view') ?? 'all');
  if (!viewResult.success) {
    return NextResponse.json({ ok: false, error: 'invalid_view' }, { status: 400 });
  }
  const view = viewResult.data;
  const onlyCancelled = view === 'cancelled';
  const branchRaw = url.searchParams.get('branchId');
  const onlineOnly = url.searchParams.get('location') === 'online';
  const branchId = branchRaw && z.string().uuid().safeParse(branchRaw).success ? branchRaw : null;
  if (branchRaw && !branchId) {
    return NextResponse.json({ ok: false, error: 'invalid_branch' }, { status: 400 });
  }
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
    const result = await withDoctorWorkspacePrincipal(
      gate.ctx,
      'doctor-statistics.analytics-records-drilldown.read',
      async () => {
        const period = { kind: 'preset' as const, preset, customFrom: fromRaw, customTo: toRaw };
        const rows = await deps.doctorAppointments.listAppointmentsForSpecialist(
          { kind: 'periodRange', period, onlyCancelled },
          {
            organizationId: gate.ctx.organizationId,
            visibilityActor: gate.ctx,
            excludedUserIds: audience.excludedUserIds,
            branchId,
            onlineOnly,
          },
        );
        if (onlyCancelled || view === 'all') return rows;

        const now = Date.now();
        if (view === 'past') {
          return rows.filter((row) => row.recordAtIso && Date.parse(row.recordAtIso) < now);
        }
        if (view === 'future') {
          return rows.filter((row) => row.recordAtIso && Date.parse(row.recordAtIso) >= now);
        }
        if (view === 'rescheduled') return rows.filter((row) => row.rescheduleCount > 0);
        if (view === 'subscription') return rows.filter((row) => row.packageUsageRef !== null);
        if (view === 'unique') {
          return [...new Map(rows.map((row) => [row.clientUserId || row.id, row])).values()];
        }

        const iana = await getAppDisplayTimeZone();
        const bounds = resolveAppointmentStatsBounds(period, iana);
        const specialistId = gate.ctx.canManageAllSpecialists ? null : gate.ctx.specialistId;
        const kpis = await deps.doctorAppointments.getScheduleKpis(
          {
            from: bounds.from,
            to: bounds.toExclusive,
            specialistId,
            branchId,
            deliveryFormat: onlineOnly ? 'online' : null,
          },
          { organizationId: gate.ctx.organizationId, excludedUserIds: audience.excludedUserIds },
        );
        const firstIds = new Set(kpis.firstVisitIds);
        return rows.filter((row) =>
          view === 'first' ? firstIds.has(row.id) : !firstIds.has(row.id),
        );
      },
    );
    const rows = result;
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
