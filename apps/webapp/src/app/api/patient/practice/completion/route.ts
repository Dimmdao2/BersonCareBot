import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePatientApiBusinessAccess } from '@/app-layer/guards/requireRole';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { routePaths } from '@/app-layer/routes/paths';
import { advanceDailyWarmupPresentationManually } from '@/modules/patient-home/advanceDailyWarmupPresentationManually';
import { buildDailyWarmupPresentationSyncDeps } from '@/modules/patient-home/buildDailyWarmupPresentationSyncDeps';
import { resolvePatientEnrollmentOrganizationId } from '@/app/api/booking/bookingTenant';
import {
  entitlementMutationRefusalResponse,
  requireEntitlementForMutation,
} from '@/app-layer/guards/requireEntitlement';
import { withPatientOrganizationPrincipal } from '@/app-layer/principal/withOrganizationPrincipal';

const bodySchema = z.object({
  contentPageId: z.string().uuid(),
  source: z.enum(['home', 'reminder', 'section_page', 'daily_warmup']),
  feeling: z.number().int().min(1).max(5).optional().nullable(),
});

export async function POST(req: Request) {
  const gate = await requirePatientApiBusinessAccess({ returnPath: routePaths.patient });
  if (!gate.ok) return gate.response;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'validation_error' }, { status: 400 });
  }

  const deps = buildAppDeps();
  const userId = gate.session.user.userId;
  const tenant = await resolvePatientEnrollmentOrganizationId(
    { patientOrganization: deps.patientOrganization },
    userId,
  );
  if (!tenant.ok) return tenant.response;
  if (parsed.data.source === 'daily_warmup') {
    const entitlement = await requireEntitlementForMutation(
      { organizationId: tenant.organizationId },
      'warmups',
    );
    if (!entitlement.ok) {
      return entitlementMutationRefusalResponse('warmups', 'отметить выполнение разминки');
    }
  }
  const result = await withPatientOrganizationPrincipal(
    {
      organizationId: tenant.organizationId,
      platformUserId: userId,
      source: 'api/patient/practice/completion:POST',
    },
    () =>
      deps.patientPractice.record({
        userId,
        contentPageId: parsed.data.contentPageId,
        source: parsed.data.source,
        feeling: parsed.data.feeling ?? null,
      }),
  );

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  }

  if (parsed.data.source === 'daily_warmup') {
    await advanceDailyWarmupPresentationManually(
      gate.session.user.userId,
      parsed.data.contentPageId,
      buildDailyWarmupPresentationSyncDeps(deps),
    );
  }

  revalidatePath(routePaths.patient);
  return NextResponse.json({ ok: true, id: result.id });
}
