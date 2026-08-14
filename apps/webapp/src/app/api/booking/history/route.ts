import { NextResponse } from 'next/server';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requirePatientApiBusinessAccess } from '@/app-layer/guards/requireRole';
import { withPatientOrganizationPrincipal } from '@/app-layer/principal/withOrganizationPrincipal';
import { routePaths } from '@/app-layer/routes/paths';
import { resolvePatientEnrollmentOrganizationId } from '../bookingTenant';
import type { ClientVisitHistoryRow } from '@/modules/client-history/types';
import type { PatientMaintenanceAppointment } from '@/modules/patient-booking/maintenanceHistory';

function toVisitHistoryRow(
  row: PatientMaintenanceAppointment,
): ClientVisitHistoryRow {
  const durationMinutes = Math.max(
    0,
    Math.round((new Date(row.endAt).getTime() - new Date(row.startAt).getTime()) / 60_000),
  );
  return {
    appointmentId: row.id,
    startAt: row.startAt,
    endAt: row.endAt,
    durationMinutes,
    status: row.status,
    specialistName: row.specialistName,
    branchTitle: row.branchTitle,
    roomTitle: row.roomTitle,
    serviceTitle: row.serviceTitle,
    wasViaPackage: false,
    packageUsageSummary: null,
    prepaymentAmountMinor: null,
    prepaymentCurrency: null,
    finalPaymentAmountMinor: null,
    finalPaymentCurrency: null,
    staffComment: null,
  };
}

export async function GET() {
  const gate = await requirePatientApiBusinessAccess({ returnPath: routePaths.profile });
  if (!gate.ok) return gate.response;

  const deps = buildAppDeps();
  const userId = gate.session.user.userId;
  const resolvedOrg = await resolvePatientEnrollmentOrganizationId(deps, userId);
  if (!resolvedOrg.ok) return resolvedOrg.response;
  const orgId = resolvedOrg.organizationId;
  const [timeline, payments, visits] = await withPatientOrganizationPrincipal(
    { organizationId: orgId, platformUserId: userId, source: 'api/booking/history:GET' },
    () =>
      Promise.all([
        deps.clientHistory.listPatientTimeline(orgId, userId, 50),
        deps.clientHistory.listPatientPaymentHistory(orgId, userId, 50),
        deps.patientMaintenanceHistory
          .listCurrentPatientHistory()
          .then((rows) => rows.slice(0, 50).map(toVisitHistoryRow)),
      ]),
  );

  return NextResponse.json({ ok: true, timeline, payments, visits });
}
