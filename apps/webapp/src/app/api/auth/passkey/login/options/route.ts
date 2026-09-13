import { stampBootstrapPrincipal } from '@/app-layer/principal/bootstrapPrincipal';
import { NextResponse } from 'next/server';
import { beginPatientPasskeyAuthentication } from '@/app-layer/auth/passkeyRuntime';
import { isIndependentAuthMethodEnabled } from '@/modules/auth/authChannelPolicy';
import {
  isOAuthStartRateLimitedByKey,
  resolveOAuthStartRateLimitClientKey,
} from '@/modules/auth/oauthStartRateLimit';
import { notificationText } from '@/shared/notifications/notificationText';

export async function POST(request: Request) {
  stampBootstrapPrincipal('api/auth/passkey/login/options:POST', request);
  if (!(await isIndependentAuthMethodEnabled('passkey'))) {
    return NextResponse.json(
      { ok: false, error: 'auth_method_disabled', message: notificationText.authPasskeyDisabled },
      { status: 403 },
    );
  }

  const identity = resolveOAuthStartRateLimitClientKey(request);
  if (!identity.ok) {
    return NextResponse.json({ ok: false, error: 'proxy_configuration' }, { status: 503 });
  }
  if (await isOAuthStartRateLimitedByKey(identity.key)) {
    return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 });
  }

  try {
    const result = await beginPatientPasskeyAuthentication();
    return NextResponse.json({ ok: true, ...result });
  } catch {
    return NextResponse.json({ ok: false, error: 'passkey_login_unavailable' }, { status: 503 });
  }
}
