import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requirePatientApiBusinessAccess } from '@/app-layer/guards/requireRole';
import { recordDailyWarmupVideoView } from '@/modules/patient-home/recordDailyWarmupVideoView';
import { routePaths } from '@/app-layer/routes/paths';
import { resolvePatientEnrollmentOrganizationId } from '@/app/api/booking/bookingTenant';
import {
  entitlementMutationRefusalResponse,
  requireEntitlementForMutation,
} from '@/app-layer/guards/requireEntitlement';
import { withPatientOrganizationPrincipal } from '@/app-layer/principal/withOrganizationPrincipal';

const bodySchema = z.object({
  contentPageId: z.string().uuid(),
});

/** POST — зафиксировать просмотр видео разминки дня и сдвинуть ротацию на главной / в push. */
export async function POST(request: Request) {
  const gate = await requirePatientApiBusinessAccess({ returnPath: routePaths.patient });
  if (!gate.ok) return gate.response;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }

  const deps = buildAppDeps();
  const tenant = await resolvePatientEnrollmentOrganizationId(
    { patientOrganization: deps.patientOrganization },
    gate.session.user.userId,
  );
  if (!tenant.ok) return tenant.response;
  const entitlement = await requireEntitlementForMutation(
    { organizationId: tenant.organizationId },
    'warmups',
  );
  if (!entitlement.ok) {
    return entitlementMutationRefusalResponse('warmups', 'зафиксировать просмотр разминки');
  }
  const result = await withPatientOrganizationPrincipal(
    {
      organizationId: tenant.organizationId,
      platformUserId: gate.session.user.userId,
      source: 'api/patient/daily-warmup/video-viewed:POST',
    },
    () =>
      recordDailyWarmupVideoView(
        gate.session.user.userId,
        parsed.data.contentPageId,
        {
          patientHomeBlocks: deps.patientHomeBlocks,
          contentPages: deps.contentPages,
          contentSections: deps.contentSections,
          systemSettings: deps.systemSettings,
          patientDailyWarmupPresentation: deps.patientDailyWarmupPresentation,
          patientDailyWarmupVideoViews: deps.patientDailyWarmupVideoViews,
          patientPractice: deps.patientPractice,
          patientCalendarTimezone: deps.patientCalendarTimezone,
        },
      ),
  );

  if (!result.ok) {
    return NextResponse.json(result, { status: 403 });
  }

  revalidatePath(routePaths.patient);
  return NextResponse.json({ ok: true });
}
