import { NextResponse } from 'next/server';
import { assertIntegratorGetRequest } from '@/app-layer/integrator/assertIntegratorGetRequest';
import { enterVerifiedIntegratorOrganizationPrincipal } from '@/app-layer/principal/integratorOrganizationPrincipal';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
export async function GET(request: Request) {
  const auth = assertIntegratorGetRequest(request); if (auth) return auth;
  const url = new URL(request.url); const userId = url.searchParams.get('userId')?.trim() ?? ''; const organizationId = url.searchParams.get('organizationId')?.trim() ?? ''; const appId = url.searchParams.get('appId');
  if (!userId || (appId !== 'therapygo' && appId !== 'therapysto') || !enterVerifiedIntegratorOrganizationPrincipal(organizationId, 'integrator-native-push-targets')) return NextResponse.json({ ok: false, error: 'invalid_target_scope' }, { status: 400 });
  const targets = await buildAppDeps().integratorWebPushDelivery.listAuthorizedNativeTargets(organizationId, userId, appId);
  if (targets === null) return NextResponse.json({ ok: false, error: 'target_outside_organization' }, { status: 403 });
  return NextResponse.json({ ok: true, targets });
}
