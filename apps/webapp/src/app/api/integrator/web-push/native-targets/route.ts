import { NextResponse } from 'next/server';
import { assertIntegratorGetRequest } from '@/app-layer/integrator/assertIntegratorGetRequest';
import { enterVerifiedIntegratorOrganizationPrincipal } from '@/app-layer/principal/integratorOrganizationPrincipal';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { createNativePushTokenCipherFromEnv } from '@/modules/web-push/nativePush';
import { createPgNativePushTargetsPort } from '@/infra/repos/pgNativePushTargets';
export async function GET(request: Request) {
  const auth = assertIntegratorGetRequest(request); if (auth) return auth;
  const url = new URL(request.url); const userId = url.searchParams.get('userId')?.trim() ?? ''; const organizationId = url.searchParams.get('organizationId')?.trim() ?? '';
  if (!userId || !enterVerifiedIntegratorOrganizationPrincipal(organizationId, 'integrator-native-push-targets')) return NextResponse.json({ ok: false, error: 'invalid_target_scope' }, { status: 400 });
  const deps = buildAppDeps(); const [patient, staff] = await Promise.all([deps.patientOrganization?.hasActiveEnrollment(userId, organizationId) ?? false, deps.organizationMembership?.hasActiveMembership(userId, organizationId) ?? false]);
  if (!patient && !staff) return NextResponse.json({ ok: false, error: 'target_outside_organization' }, { status: 403 });
  const targets = await createPgNativePushTargetsPort(createNativePushTokenCipherFromEnv()).listActive(userId);
  return NextResponse.json({ ok: true, targets });
}
