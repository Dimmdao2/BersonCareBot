import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requirePatientApiBusinessAccess } from '@/app-layer/guards/requireRole';
import { withPatientOrganizationPrincipal } from '@/app-layer/principal/withOrganizationPrincipal';
import { routePaths } from '@/app-layer/routes/paths';
import type { InPersonServiceListItem } from '@/modules/patient-booking/inPersonServicesCatalog';
import { resolvePatientEnrollmentOrganizationId } from '../bookingTenant';

const QuerySchema = z.object({
  branchId: z.string().uuid(),
});

/**
 * Организация берётся из активной записи пациента (`resolveActiveOrganizationForPatient`), а не из
 * присланного `branchId`: до организационного контекста филиал читать нечем и незачем. Каталог
 * приходит объявленным корнем `app.read_current_patient_booking_catalog()` — тем же, которым живёт
 * мастер записи, — и уже он ограничен активной записью пациента. Прежняя редакция читала
 * `be_branches` под `app_patient` ДО контекста (отказ 42501) и вдобавок ставила принципал ЛЮБОЙ
 * организации, чей `branchId` прислали. Резолвер — общий для маршрутов записи
 * (`resolvePatientEnrollmentOrganizationId`), нового узора не заводится.
 */
export async function GET(request: Request) {
  const gate = await requirePatientApiBusinessAccess({ returnPath: routePaths.patientBooking });
  if (!gate.ok) return gate.response;

  const url = new URL(request.url);
  const parsed = QuerySchema.safeParse({ branchId: url.searchParams.get('branchId') });
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_query' }, { status: 400 });
  }

  const deps = buildAppDeps();
  const platformUserId = gate.session.user.userId;
  const tenant = await resolvePatientEnrollmentOrganizationId(deps, platformUserId);
  if (!tenant.ok) return tenant.response;

  const rows = await withPatientOrganizationPrincipal(
    {
      organizationId: tenant.organizationId,
      platformUserId,
      source: 'api/booking/in-person-services:GET',
    },
    () => deps.patientBookingCatalog.listCurrentPatientCatalog(),
  );

  const branchRows = rows.filter((row) => row.branchId === parsed.data.branchId);
  const branchRow = branchRows[0];
  if (!branchRow) {
    return NextResponse.json({ ok: false, error: 'branch_not_found' }, { status: 404 });
  }

  const byServiceId = new Map<string, (typeof branchRows)[number]>();
  for (const row of branchRows) byServiceId.set(row.serviceId, row);
  const services: InPersonServiceListItem[] = [...byServiceId.values()]
    .sort(
      (a, b) =>
        a.serviceSortOrder - b.serviceSortOrder ||
        a.serviceTitle.localeCompare(b.serviceTitle, 'ru'),
    )
    .map((row) => ({
      id: row.serviceId,
      title: row.serviceTitle,
      description: row.serviceDescription,
      durationMinutes: row.durationMinutes,
      priceMinor: row.priceMinor,
    }));

  return NextResponse.json({
    ok: true,
    branch: {
      id: branchRow.branchId,
      title: branchRow.branchTitle,
      cityCode: branchRow.cityCode,
    },
    services,
  });
}
