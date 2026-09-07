import { NextResponse } from 'next/server';
import { assertIntegratorGetRequest } from '@/app-layer/integrator/assertIntegratorGetRequest';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { enterVerifiedIntegratorOrganizationPrincipal } from '@/app-layer/principal/integratorOrganizationPrincipal';
import { isPlatformUserUuid } from '@/shared/platform-user/isPlatformUserUuid';

export async function GET(request: Request) {
  const authError = assertIntegratorGetRequest(request);
  if (authError) return authError;

  const url = new URL(request.url);
  // Track D (#987): keyed by canonical `platform_users.id`; the retired numeric param is gone.
  const platformUserId = url.searchParams.get('platformUserId')?.trim();
  const category = url.searchParams.get('category')?.trim();
  const organizationId = url.searchParams.get('organizationId')?.trim();
  if (!platformUserId || !isPlatformUserUuid(platformUserId) || !category || !organizationId) {
    return NextResponse.json(
      { ok: false, error: 'platformUserId, category and organizationId required' },
      { status: 400 },
    );
  }
  if (!enterVerifiedIntegratorOrganizationPrincipal(organizationId, 'integrator-reminder-rule')) {
    return NextResponse.json({ ok: false, error: 'valid organizationId required' }, { status: 400 });
  }

  const deps = buildAppDeps();
  if (!deps.patientOrganization) {
    return NextResponse.json(
      { ok: false, error: 'patient organization service unavailable' },
      { status: 503 },
    );
  }
  if (!(await deps.patientOrganization.hasActiveEnrollment(platformUserId, organizationId))) {
    return NextResponse.json({ ok: false, error: 'user is outside organization' }, { status: 403 });
  }
  if (!deps.reminderProjection) {
    return NextResponse.json(
      { ok: false, error: 'reminder projection not available' },
      { status: 503 },
    );
  }
  if (!deps.customDomainBinding) {
    return NextResponse.json(
      { ok: false, error: 'patient public origin unavailable' },
      { status: 503 },
    );
  }
  let patientPublicOrigin: string;
  try {
    patientPublicOrigin = await deps.customDomainBinding.resolvePatientPublicOrigin(organizationId);
  } catch {
    return NextResponse.json(
      { ok: false, error: 'patient public origin unavailable' },
      { status: 503 },
    );
  }
  const rule = await deps.reminderProjection.getRuleByPlatformUserIdAndCategory(
    platformUserId,
    category,
    patientPublicOrigin,
  );
  return NextResponse.json({ ok: true, rule: rule ?? null }, { status: 200 });
}
