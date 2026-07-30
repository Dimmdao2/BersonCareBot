import { NextResponse } from 'next/server';
import { beginPatientPasskeyRegistration } from '@/app-layer/auth/passkeyRuntime';
import { requirePatientApiSession } from '@/app-layer/guards/requireRole';
import { routePaths } from '@/app-layer/routes/paths';
import { isIndependentAuthMethodEnabled } from '@/modules/auth/authChannelPolicy';

export async function POST() {
  const gate = await requirePatientApiSession();
  if (!gate.ok) return gate.response;
  if (!(await isIndependentAuthMethodEnabled('passkey'))) {
    return NextResponse.json(
      { ok: false, error: 'auth_method_disabled', message: 'Вход по ключу доступа отключён' },
      { status: 403 },
    );
  }

  try {
    const result = await beginPatientPasskeyRegistration(gate.session.user.userId);
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
