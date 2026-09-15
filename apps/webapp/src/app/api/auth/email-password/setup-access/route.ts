import { stampBootstrapPrincipal } from '@/app-layer/principal/bootstrapPrincipal';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  AUTH_CHANNEL_DISABLED_ERROR,
  isAuthChannelEnabled,
} from '@/modules/auth/authChannelPolicy';
import { normalizeEmail } from '@/modules/auth/emailAuth';
import {
  PASSWORD_RECOVERY_REQUEST_ACCEPTED,
  requestPasswordRecoveryChallenge,
} from '@/app-layer/auth/passwordRecovery';

const bodySchema = z.object({
  email: z.string().email(),
});

/** Повторная отправка setup-кода для contact-only / verified без пароля (явный запрос UI). */
export async function POST(request: Request) {
  stampBootstrapPrincipal('api/auth/email-password/setup-access:POST', request);
  if (!(await isAuthChannelEnabled('email', undefined, 'transactional'))) {
    return NextResponse.json({ ok: false, error: AUTH_CHANNEL_DISABLED_ERROR }, { status: 503 });
  }
  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }

  const emailNorm = normalizeEmail(parsed.data.email);
  await requestPasswordRecoveryChallenge(emailNorm, 'setup_resend');
  return NextResponse.json(PASSWORD_RECOVERY_REQUEST_ACCEPTED);
}
