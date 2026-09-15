import { stampBootstrapPrincipal } from '@/app-layer/principal/bootstrapPrincipal';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { normalizeEmail } from '@/modules/auth/emailAuth';
import {
  AUTH_CHANNEL_DISABLED_ERROR,
  isAuthChannelEnabled,
} from '@/modules/auth/authChannelPolicy';
import {
  PASSWORD_RECOVERY_REQUEST_ACCEPTED,
  requestPasswordRecoveryChallenge,
} from '@/app-layer/auth/passwordRecovery';

const bodySchema = z.object({
  email: z.string().email(),
});

/**
 * Запрос сброса пароля: код на почту (тот же контур `email_challenges`, что и верификация регистрации).
 * Ответ **одинаковый** для любого состояния адреса — без `challengeId` и без признака setup/reset.
 * Выбор reset/setup происходит только после проверки одноразового кода в `POST …/reset`.
 */
export async function POST(request: Request) {
  stampBootstrapPrincipal('api/auth/email-password/forgot:POST', request);
  if (!(await isAuthChannelEnabled('email', undefined, 'transactional'))) {
    return NextResponse.json({ ok: false, error: AUTH_CHANNEL_DISABLED_ERROR }, { status: 503 });
  }
  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }

  const emailNorm = normalizeEmail(parsed.data.email);
  await requestPasswordRecoveryChallenge(emailNorm);
  return NextResponse.json(PASSWORD_RECOVERY_REQUEST_ACCEPTED);
}
