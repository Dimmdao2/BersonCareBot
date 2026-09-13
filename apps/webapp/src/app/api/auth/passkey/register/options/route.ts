import { NextResponse } from 'next/server';
import { beginSelfPasskeyRegistration } from '@/app-layer/auth/passkeyRuntime';
import { requireAuthenticatedIdentitySelfApiSession } from '@/app-layer/guards/requireRole';
import { routePaths } from '@/app-layer/routes/paths';
import { isIndependentAuthMethodEnabled } from '@/modules/auth/authChannelPolicy';
import { notificationText } from '@/shared/notifications/notificationText';

export async function POST() {
  const gate = await requireAuthenticatedIdentitySelfApiSession();
  if (!gate.ok) return gate.response;
  if (!(await isIndependentAuthMethodEnabled('passkey'))) {
    return NextResponse.json(
      { ok: false, error: 'auth_method_disabled', message: notificationText.authPasskeyDisabled },
      { status: 403 },
    );
  }

  try {
    const result = await beginSelfPasskeyRegistration(
      gate.session.user.userId,
      gate.session.user.displayName,
    );
    return NextResponse.json({ ok: true, ...result });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: 'passkey_registration_unavailable',
        message: notificationText.authPasskeyAddFailed,
        redirectTo: routePaths.profile,
      },
      { status: 503 },
    );
  }
}
