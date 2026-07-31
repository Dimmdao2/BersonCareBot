import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requirePatientApiBusinessAccess } from '@/app-layer/guards/requireRole';
import { routePaths } from '@/app-layer/routes/paths';
import { resolvePatientEnrollmentOrganizationId } from '@/app/api/booking/bookingTenant';

const bodySchema = z.object({
  contentPageId: z.string().uuid(),
  ratingValue: z.number().int().min(1).max(3),
  reasonCodes: z.array(z.string()).optional().default([]),
  comment: z.string().nullable().optional(),
});

function settingBoolean(valueJson: unknown): boolean {
  return (
    valueJson !== null &&
    typeof valueJson === 'object' &&
    !Array.isArray(valueJson) &&
    (valueJson as { value?: unknown }).value === true
  );
}

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
  const ratingsEnabled = settingBoolean(
    (await deps.systemSettings.getSetting('material_ratings_enabled', 'admin'))?.valueJson ?? null,
  );
  if (!ratingsEnabled) {
    return NextResponse.json({ ok: false, error: 'material_ratings_disabled' }, { status: 403 });
  }
  const tenant = await resolvePatientEnrollmentOrganizationId(
    { patientOrganization: deps.patientOrganization },
    gate.session.user.userId,
  );
  if (!tenant.ok) return tenant.response;
  const result = await deps.materialRatingFeedback.submitPatientFeedback({
    organizationId: tenant.organizationId,
    userId: gate.session.user.userId,
    contentPageId: parsed.data.contentPageId,
    ratingValue: parsed.data.ratingValue,
    reasonCodes: parsed.data.reasonCodes ?? [],
    comment: parsed.data.comment ?? null,
  });

  if (!result.ok) {
    const status =
      result.code === 'not_daily_warmup'
        ? 403
        : result.code === 'rating_out_of_scope' || result.code === 'empty_feedback'
          ? 400
          : 400;
    return NextResponse.json({ ok: false, error: result.code }, { status });
  }

  return NextResponse.json({ ok: true, id: result.id });
}
