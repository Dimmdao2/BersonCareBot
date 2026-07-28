/**
 * Integrator M2M GET — VAPID keypair for web-push delivery.
 *
 * PLAN S13 Model β: integrator reads VAPID keys from webapp at send time.
 * N3 sub-decision: VAPID private key crossing M2M is acceptable — it already
 * lives server-side in `system_settings` and the boundary is server↔server
 * (HMAC-signed, not browser-exposed).
 *
 * Auth: standard integrator GET HMAC signature (assertIntegratorGetRequest).
 *
 * GET /api/integrator/web-push/vapid
 * Response: { ok: true, vapid: { publicKey, privateKey, subject } }
 *   where `subject` is the centralized VAPID subject (see vapidSubject.ts)
 */
import { NextResponse } from 'next/server';
import { assertIntegratorGetRequest } from '@/app-layer/integrator/assertIntegratorGetRequest';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { getWebPushVapidKeyPair } from '@/modules/system-settings/webPushVapidRuntime';
import { deriveVapidSubject } from '@/modules/web-push/vapidSubject';
import { enterVerifiedIntegratorOrganizationPrincipal } from '@/app-layer/principal/integratorOrganizationPrincipal';

export async function GET(request: Request) {
  const authError = assertIntegratorGetRequest(request);
  if (authError) return authError;
  const organizationId = new URL(request.url).searchParams.get('organizationId')?.trim() ?? '';
  if (!enterVerifiedIntegratorOrganizationPrincipal(organizationId, 'integrator-web-push-vapid')) {
    return NextResponse.json(
      { ok: false, error: 'valid organizationId required' },
      { status: 400 },
    );
  }

  const deps = buildAppDeps();

  const [vapid, subject] = await Promise.all([
    getWebPushVapidKeyPair(deps.systemSettings),
    deriveVapidSubject(deps.systemSettings),
  ]);

  if (!vapid || !subject) {
    return NextResponse.json(
      { ok: false, error: 'web_push_vapid or contact not configured' },
      { status: 503 },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      vapid: {
        publicKey: vapid.publicKey,
        privateKey: vapid.privateKey,
        subject,
      },
    },
    { status: 200 },
  );
}
