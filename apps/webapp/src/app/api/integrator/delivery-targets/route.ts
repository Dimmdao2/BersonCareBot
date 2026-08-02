import { NextResponse } from 'next/server';
import { assertIntegratorGetRequest } from '@/app-layer/integrator/assertIntegratorGetRequest';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { enterVerifiedIntegratorOrganizationPrincipal } from '@/app-layer/principal/integratorOrganizationPrincipal';
import { DeliveryTargetsTenantDeniedError } from '@/modules/integrator/deliveryTargetsApi';

export async function GET(request: Request) {
  const authError = assertIntegratorGetRequest(request);
  if (authError) return authError;

  const url = new URL(request.url);
  const phone = url.searchParams.get('phone')?.trim();
  const telegramId = url.searchParams.get('telegramId')?.trim();
  const maxId = url.searchParams.get('maxId')?.trim();
  const platformUserId = url.searchParams.get('platformUserId')?.trim();
  const organizationId = url.searchParams.get('organizationId')?.trim();
  if (!phone && !telegramId && !maxId && !platformUserId) {
    return NextResponse.json(
      { ok: false, error: 'one of phone, telegramId, maxId, platformUserId is required' },
      { status: 400 },
    );
  }
  if (
    !organizationId ||
    !enterVerifiedIntegratorOrganizationPrincipal(organizationId, 'integrator-delivery-targets')
  ) {
    return NextResponse.json(
      { ok: false, error: 'valid organizationId required' },
      { status: 400 },
    );
  }

  const deps = buildAppDeps();
  const topic = url.searchParams.get('topic')?.trim();
  const integratorUserId = url.searchParams.get('integratorUserId')?.trim();
  let result: Awaited<ReturnType<typeof deps.deliveryTargetsApi.getTargets>>;
  try {
    result = await deps.deliveryTargetsApi.getTargets({
      organizationId,
      ...(phone ? { phone } : {}),
      ...(telegramId ? { telegramId } : {}),
      ...(maxId ? { maxId } : {}),
      ...(platformUserId ? { platformUserId } : {}),
      ...(topic ? { topic } : {}),
      ...(integratorUserId ? { integratorUserId } : {}),
    });
  } catch (error) {
    if (error instanceof DeliveryTargetsTenantDeniedError) {
      return NextResponse.json(
        { ok: false, error: 'delivery target is outside organization' },
        { status: 403 },
      );
    }
    throw error;
  }
  if (!result) {
    return NextResponse.json({ ok: false, error: 'delivery target not found' }, { status: 404 });
  }
  return NextResponse.json(
    {
      ok: true,
      channelBindings: result.channelBindings,
      ...(result.resolution ? { resolution: result.resolution } : {}),
      ...(result.emailRecipient ? { emailRecipient: result.emailRecipient } : {}),
    },
    { status: 200 },
  );
}
