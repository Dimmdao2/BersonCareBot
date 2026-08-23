import { NextResponse } from 'next/server';
import { beginSelfPasskeyRegistration } from '@/app-layer/auth/passkeyRuntime';
import { requireAuthenticatedIdentitySelfApiSession } from '@/app-layer/guards/requireRole';
import { routePaths } from '@/app-layer/routes/paths';
import { isAuthMechanicEnabled } from '@/modules/auth/authDeliveryGate';

export async function POST() {
  const gate = await requireAuthenticatedIdentitySelfApiSession();
  if (!gate.ok) return gate.response;
  if (!(await isAuthMechanicEnabled('passkey'))) {
    return NextResponse.json(
      { ok: false, error: 'auth_method_disabled', message: 'Вход по ключу доступа отключён' },
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
        message: 'Не удалось начать добавление ключа доступа',
        redirectTo: routePaths.profile,
      },
      { status: 503 },
    );
  }
}
