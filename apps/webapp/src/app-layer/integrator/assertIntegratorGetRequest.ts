import { NextResponse } from 'next/server';
import { stampBootstrapPrincipal } from '@/app-layer/principal/bootstrapPrincipal';
import { verifyIntegratorGetSignature } from '@/infra/webhooks/verifyIntegratorSignature';

/**
 * Validates integrator GET webhook headers and HMAC signature (canonical string `GET {pathname}{search}`).
 * @returns JSON error `NextResponse` with status 400 or 401, or `null` when the handler may proceed.
 */
export function assertIntegratorGetRequest(request: Request): NextResponse | null {
  stampBootstrapPrincipal('api/integrator:GET', request);
  const timestamp = request.headers.get('x-bersoncare-timestamp');
  const signature = request.headers.get('x-bersoncare-signature');
  if (!timestamp || !signature) {
    return NextResponse.json({ ok: false, error: 'missing webhook headers' }, { status: 400 });
  }

  const url = new URL(request.url);
  const canonicalGet = `GET ${url.pathname}${url.search}`;
  if (!verifyIntegratorGetSignature(timestamp, canonicalGet, signature)) {
    return NextResponse.json({ ok: false, error: 'invalid signature' }, { status: 401 });
  }

  return null;
}
