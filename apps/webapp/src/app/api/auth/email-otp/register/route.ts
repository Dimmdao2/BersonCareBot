import { stampBootstrapPrincipal } from '@/app-layer/principal/bootstrapPrincipal';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ensureAuthModulePortsBound } from '@/app-layer/di/bindAuthModulePorts';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { isEmailOtpStartRateLimitedByKey } from '@/modules/auth/authRateLimits';
import {
  AUTH_CHANNEL_DISABLED_ERROR,
  isAuthChannelEnabled,
} from '@/modules/auth/authChannelPolicy';
import { startPublicEmailOtpRegistration } from '@/modules/auth/emailOtpPublic';
import { formatOtpRetryAfterMessage } from '@/modules/auth/otpConstants';
import { resolveRealIpRateLimitClientKey } from '@/modules/auth/realIpRateLimitClientKey';
import {
  FIO_LATIN_REJECTED_MESSAGE,
  isCyrillicFioInput,
  isCyrillicFioInputOrEmpty,
} from '@/shared/lib/fio';

const bodySchema = z.object({
  email: z.string().min(1),
  lastName: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .refine(isCyrillicFioInput, { message: FIO_LATIN_REJECTED_MESSAGE }),
  firstName: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .refine(isCyrillicFioInput, { message: FIO_LATIN_REJECTED_MESSAGE }),
  patronymic: z
    .string()
    .trim()
    .max(100)
    .refine(isCyrillicFioInputOrEmpty, { message: FIO_LATIN_REJECTED_MESSAGE })
    .optional(),
});

const EMAIL_OTP_REGISTER_FALLBACK_CLIENT_KEY = 'email_otp_register:missing_x_real_ip';

/** Public structured patient registration. It creates no organization or clinical relationship. */
export async function POST(request: Request) {
  stampBootstrapPrincipal('api/auth/email-otp/register:POST', request);
  if (!(await isAuthChannelEnabled('email'))) {
    return NextResponse.json({ ok: false, error: AUTH_CHANNEL_DISABLED_ERROR }, { status: 503 });
  }
  ensureAuthModulePortsBound();

  const identity = resolveRealIpRateLimitClientKey(request, {
    scope: 'auth.email_otp_register',
    logPrefix: 'email_otp_register',
    fallbackKey: EMAIL_OTP_REGISTER_FALLBACK_CLIENT_KEY,
  });
  if (!identity.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: 'proxy_configuration',
        message: 'Запрос должен проходить через reverse proxy с заголовком X-Real-IP.',
      },
      { status: 503 },
    );
  }
  if (await isEmailOtpStartRateLimitedByKey(identity.key)) {
    return NextResponse.json(
      {
        ok: false,
        error: 'rate_limited',
        retryAfterSeconds: 60,
        message: formatOtpRetryAfterMessage(60),
      },
      { status: 429, headers: { 'Retry-After': '60' } },
    );
  }

  const parsed = bodySchema.safeParse((await request.json().catch(() => null)) as unknown);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'invalid_fio', message: 'Укажите фамилию и имя' },
      { status: 400 },
    );
  }

  const result = await startPublicEmailOtpRegistration(
    parsed.data,
    buildAppDeps().emailOtpPublicDb,
  );
  if (result.ok) {
    return NextResponse.json({
      ok: true,
      challengeId: result.challengeId,
      retryAfterSeconds: result.retryAfterSeconds ?? 60,
    });
  }
  if (result.code === 'duplicate_email') {
    return NextResponse.json(
      { ok: false, error: 'duplicate_email', message: 'Аккаунт с этой почтой уже существует.' },
      { status: 409 },
    );
  }
  if (result.code === 'invalid_fio') {
    return NextResponse.json(
      { ok: false, error: 'invalid_fio', message: 'Укажите фамилию и имя' },
      { status: 400 },
    );
  }
  if (result.code === 'invalid_email') {
    return NextResponse.json(
      { ok: false, error: 'invalid_email', message: 'Неверный формат email' },
      { status: 400 },
    );
  }
  if (result.code === 'rate_limited') {
    const retryAfterSeconds = result.retryAfterSeconds ?? 60;
    return NextResponse.json(
      {
        ok: false,
        error: 'rate_limited',
        retryAfterSeconds,
        message: formatOtpRetryAfterMessage(retryAfterSeconds),
      },
      { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } },
    );
  }
  return NextResponse.json(
    {
      ok: false,
      error: 'email_send_failed',
      message: 'Не удалось отправить код. Попробуйте позже.',
    },
    { status: 503 },
  );
}
