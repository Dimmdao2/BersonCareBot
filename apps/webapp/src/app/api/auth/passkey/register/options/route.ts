import { NextResponse } from 'next/server';
import { requirePatientApiSession } from '@/app-layer/guards/requireRole';
import { routePaths } from '@/app-layer/routes/paths';
import { pgPasskeyStore } from '@/infra/repos/pgPasskeyStore';
import { isIndependentAuthMethodEnabled } from '@/modules/auth/authChannelPolicy';
import { beginPasskeyRegistration } from '@/modules/auth/passkeyAuth';

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
    const result = await beginPasskeyRegistration(gate.session.user.userId, pgPasskeyStore);
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
