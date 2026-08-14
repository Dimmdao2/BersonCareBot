import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePatientApiBusinessAccess } from '@/app-layer/guards/requireRole';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { routePaths } from '@/app-layer/routes/paths';
import { resolvePatientEnrollmentOrganizationId } from '@/app/api/booking/bookingTenant';
import { withPatientOrganizationPrincipal } from '@/app-layer/principal/withOrganizationPrincipal';

/** Та же шкала 1–5, что чек-ин на главной и `POST /api/patient/practice/completion` (симптом `warmup_feeling`). */
const bodySchema = z.object({
  feeling: z.number().int().min(1).max(5),
});

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await requirePatientApiBusinessAccess({ returnPath: routePaths.patient });
  if (!gate.ok) return gate.response;

  const { id: completionId } = await context.params;
  if (!completionId || !z.string().uuid().safeParse(completionId).success) {
    return NextResponse.json({ ok: false, error: 'validation_error' }, { status: 400 });
  }

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

  const feeling = parsed.data.feeling;
  const userId = gate.session.user.userId;

  const deps = buildAppDeps();
  const tenant = await resolvePatientEnrollmentOrganizationId(
    { patientOrganization: deps.patientOrganization },
    userId,
  );
  if (!tenant.ok) return tenant.response;
  const completion = await withPatientOrganizationPrincipal(
    {
      organizationId: tenant.organizationId,
      platformUserId: userId,
      source: 'api/patient/practice/completion/[id]/feeling:PATCH:read',
    },
    () => deps.patientPractice.getCompletionByIdForUser(completionId, userId),
  );
  if (!completion) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }
  if (completion.source !== 'daily_warmup') {
    return NextResponse.json({ ok: false, error: 'not_daily_warmup' }, { status: 403 });
  }

  if (completion.feeling !== null) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  const items = await withPatientOrganizationPrincipal(
    {
      organizationId: tenant.organizationId,
      platformUserId: userId,
      source: 'api/patient/practice/completion/[id]/feeling:PATCH:references',
    },
    () => deps.references.listActiveItemsByCategoryCode('symptom_type'),
  );
  const warmupRef = items.find((i) => i.code === 'warmup_feeling');
  if (!warmupRef) {
    return NextResponse.json(
      { ok: false, error: 'warmup_feeling_reference_missing' },
      { status: 500 },
    );
  }
  const generalRef = items.find((i) => i.code === 'general_wellbeing');

  const result = await withPatientOrganizationPrincipal(
    {
      organizationId: tenant.organizationId,
      platformUserId: userId,
      source: 'api/patient/practice/completion/[id]/feeling:PATCH:write',
    },
    () =>
      deps.warmupFeelingCompletion.applyDailyWarmupFeeling({
        userId,
        completionId,
        feeling,
        completedAtIso: completion.completedAt,
        symptomTypeRefId: warmupRef.id,
        symptomTitle: warmupRef.title,
        ...(generalRef
          ? {
              generalWellbeingSymptomTypeRefId: generalRef.id,
              generalWellbeingSymptomTitle: generalRef.title?.trim() || 'Общее самочувствие',
            }
          : {}),
      }),
  );

  revalidatePath(routePaths.patient);
  return NextResponse.json(result.duplicate ? { ok: true, duplicate: true } : { ok: true });
}
