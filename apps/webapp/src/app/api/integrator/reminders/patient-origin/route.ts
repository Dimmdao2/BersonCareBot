import { NextResponse } from 'next/server';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { assertIntegratorGetRequest } from '@/app-layer/integrator/assertIntegratorGetRequest';
import { enterVerifiedIntegratorOrganizationPrincipal } from '@/app-layer/principal/integratorOrganizationPrincipal';
import { isPlatformUserUuid } from '@/shared/platform-user/isPlatformUserUuid';

/**
 * Signed integrator adapter for the single webapp-owned patient-origin resolver.
 * Both identifiers are rechecked against canonical enrollment; callback/browser input never selects an org.
 */
export async function GET(request: Request) {
  const authError = assertIntegratorGetRequest(request);
  if (authError) return authError;

  const url = new URL(request.url);
  const platformUserId = url.searchParams.get('platformUserId')?.trim();
  const organizationId = url.searchParams.get('organizationId')?.trim();
  if (!platformUserId || !isPlatformUserUuid(platformUserId) || !organizationId) {
    return NextResponse.json(
      { ok: false, error: 'platformUserId and organizationId required' },
      { status: 400 },
    );
  }
  if (!enterVerifiedIntegratorOrganizationPrincipal(organizationId, 'integrator-reminder-patient-origin')) {
    return NextResponse.json({ ok: false, error: 'valid organizationId required' }, { status: 400 });
  }

  const deps = buildAppDeps();
  if (!deps.patientOrganization || !deps.customDomainBinding) {
    return NextResponse.json(
      { ok: false, error: 'patient public origin unavailable' },
      { status: 503 },
    );
  }
  if (!(await deps.patientOrganization.hasActiveEnrollment(platformUserId, organizationId))) {
    return NextResponse.json({ ok: false, error: 'user is outside organization' }, { status: 403 });
  }
  try {
    const patientPublicOrigin = await deps.customDomainBinding.resolvePatientPublicOrigin(organizationId);
    return NextResponse.json({ ok: true, patientPublicOrigin });
  } catch {
    return NextResponse.json(
      { ok: false, error: 'patient public origin unavailable' },
      { status: 503 },
    );
  }
}
