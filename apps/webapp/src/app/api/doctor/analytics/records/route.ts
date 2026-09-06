/**
 * GET /api/doctor/analytics/records?preset=day|week|month|custom[&from=YYYY-MM-DD&to=YYYY-MM-DD]
 *
 * Tenant/visibility-scoped KPI row + daily series for the doctor «Аналитика → Записи» tab.
 * Reuses `DoctorAppointmentsPort` exactly as `/api/doctor/schedule-kpis` does — same bounds
 * resolver (`resolveAppointmentStatsBounds`), same specialist scoping — so the KPI row and the
 * chart below it are provably the same scope (AN-REC-03).
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

export async function GET(req: Request) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;

  const entitlement = await requireEntitlementForRead(
    { organizationId: gate.ctx.organizationId },
    'doctor_statistics',
  );
  if (!entitlement.ok) return entitlement.response;

  // AN-SCOPE-02: ordinary specialist is always forced to their own bound specialistId; a clinic
  // admin without a personal binding sees the whole clinic. No scope selector in this first stage
  // (owner decision pending — see docs/_TODO/DOCTOR_ANALYTICS_REBUILD_2026-09-06.md §"Нужны решения
  // владельца"); this default mirrors `resolveDoctorScheduleScope`'s own no-input default exactly.
  if (!gate.ctx.canManageAllSpecialists && !gate.ctx.specialistId) {
    return NextResponse.json({ ok: false, error: 'specialist_not_configured' }, { status: 409 });
  }
  const specialistId = gate.ctx.specialistId ?? null;

  const url = new URL(req.url);
  const preset = parseAdminStatsTimePreset(url.searchParams.get('preset'));
  const fromRaw = url.searchParams.get('from') ?? undefined;
  const toRaw = url.searchParams.get('to') ?? undefined;
  if (preset !== 'custom' && (fromRaw || toRaw)) {
    return NextResponse.json({ ok: false, error: 'unexpected_from_to' }, { status: 400 });
  }

  const iana = await getAppDisplayTimeZone();
  const filter = { kind: 'preset' as const, preset, customFrom: fromRaw, customTo: toRaw };

  try {
    const bounds = resolveAppointmentStatsBounds(filter, iana);
    const audience = await loadDoctorAnalyticsAudience();
    const deps = buildAppDeps();

    const [kpis, { daySeries, branchSeries }] = await withDoctorWorkspacePrincipal(
      gate.ctx,
      'doctor-statistics.analytics-records.read',
      () =>
        Promise.all([
          deps.doctorAppointments.getScheduleKpis(
            { from: bounds.from, to: bounds.toExclusive, specialistId },
            { organizationId: gate.ctx.organizationId, excludedUserIds: audience.excludedUserIds },
          ),
          deps.doctorAppointments.getAppointmentDailySeries(filter, {
            organizationId: gate.ctx.organizationId,
            visibilityActor: gate.ctx,
            excludedUserIds: audience.excludedUserIds,
          }),
        ]),
    );

    return NextResponse.json({
      ok: true as const,
      fromDay: bounds.fromDay,
      toDay: bounds.toDay,
      kpis,
      daySeries,
      branchSeries,
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
