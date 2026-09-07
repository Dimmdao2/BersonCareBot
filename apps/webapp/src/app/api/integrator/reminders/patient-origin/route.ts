import { NextResponse } from 'next/server';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { assertIntegratorGetRequest } from '@/app-layer/integrator/assertIntegratorGetRequest';
import { isVerifiedIntegratorOrganizationId } from '@/app-layer/principal/integratorOrganizationPrincipal';

/**
 * Signed integrator adapter for the single webapp-owned patient-origin resolver.
 * The organization id is produced by the preceding canonical reminder capability and the complete query is
 * authenticated by the M2M signature. The returned projection is anonymous-safe, so this route deliberately
 * keeps the bootstrap principal installed by `assertIntegratorGetRequest` instead of opening tenant table access.
 */
export async function GET(request: Request) {
  const authError = assertIntegratorGetRequest(request);
  if (authError) return authError;

  const url = new URL(request.url);
  const organizationId = url.searchParams.get('organizationId')?.trim();
  if (!organizationId || !isVerifiedIntegratorOrganizationId(organizationId)) {
    return NextResponse.json(
      { ok: false, error: 'valid organizationId required' },
      { status: 400 },
    );
  }

  const deps = buildAppDeps();
  if (!deps.customDomainBinding) {
    return NextResponse.json(
      { ok: false, error: 'patient public origin unavailable' },
      { status: 503 },
    );
  }
  try {
    const patientPublicOrigin =
      await deps.customDomainBinding.resolvePatientPublicOrigin(organizationId);
    return NextResponse.json({ ok: true, patientPublicOrigin });
  } catch {
    return NextResponse.json(
      { ok: false, error: 'patient public origin unavailable' },
      { status: 503 },
    );
  }
}
