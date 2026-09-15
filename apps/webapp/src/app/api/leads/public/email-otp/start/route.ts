import { NextResponse } from 'next/server';
import { z } from 'zod';
import { stampBootstrapPrincipal } from '@/app-layer/principal/bootstrapPrincipal';
import { ensureAuthModulePortsBound } from '@/app-layer/di/bindAuthModulePorts';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { isEmailOtpStartRateLimitedByKey } from '@/modules/auth/authRateLimits';
import {
  AUTH_CHANNEL_DISABLED_ERROR,
  isAuthChannelEnabled,
} from '@/modules/auth/authChannelPolicy';
import { startPublicLeadEmailVerification } from '@/modules/auth/emailOtpPublic';
import { formatOtpRetryAfterMessage } from '@/modules/auth/otpConstants';
import { resolveRealIpRateLimitClientKey } from '@/modules/auth/realIpRateLimitClientKey';
import { mailProfileForResolvedSurface } from '@/modules/auth/mailProfile';
import { requireResolvedSurface } from '@/shared/lib/surface/requestSurface';
import { authPolicyNameForRequestSurface } from '@/modules/auth/surfaceAuthSettings';
import {
  FIO_LATIN_REJECTED_MESSAGE,
  FIO_LATIN_REJECTED_TEXT,
  isCyrillicFioInputOrEmpty,
  isFioLatinRejection,
} from '@/shared/lib/fio';
import { notificationText } from '@/shared/notifications/notificationText';

/**
 * Подтверждение почты для публичной ЗАЯВКИ.
 *
 * Отдельная дверь, а не `/api/auth/email-otp/register`, ровно по одной причине: у той двери ФИО
 * ОБЯЗАТЕЛЬНЫ, а в заявке их состав задаёт клиника (план §11). Клиника, выключившая ФИО, получала
 * от неё 400 `invalid_fio` и не могла принять ни одной заявки. Движок при этом общий — тот же
 * `startEmailChallenge`, тот же потолок частоты, тот же почтовый профиль поверхности; здесь стоит
 * только контракт поверхности заявки.
 *
 * ФИО остаются НЕОБЯЗАТЕЛЬНЫМИ, но если они пришли, проверяются так же: кириллица, до 100 знаков.
 */
const bodySchema = z.object({
  email: z.string().min(1),
  lastName: z
    .string()
    .trim()
    .max(100)
    .refine(isCyrillicFioInputOrEmpty, { message: FIO_LATIN_REJECTED_MESSAGE })
    .optional(),
  firstName: z
    .string()
    .trim()
    .max(100)
    .refine(isCyrillicFioInputOrEmpty, { message: FIO_LATIN_REJECTED_MESSAGE })
    .optional(),
  patronymic: z
    .string()
    .trim()
    .max(100)
    .refine(isCyrillicFioInputOrEmpty, { message: FIO_LATIN_REJECTED_MESSAGE })
    .optional(),
});

const LEAD_EMAIL_OTP_FALLBACK_CLIENT_KEY = 'lead_email_otp_start:missing_x_real_ip';

export async function POST(request: Request) {
  stampBootstrapPrincipal('api/leads/public/email-otp/start:POST', request);
  const resolvedSurface = requireResolvedSurface(request.headers);
  if (
    !(await isAuthChannelEnabled('email', authPolicyNameForRequestSurface(resolvedSurface.surface)))
  ) {
    return NextResponse.json({ ok: false, error: AUTH_CHANNEL_DISABLED_ERROR }, { status: 503 });
  }
  ensureAuthModulePortsBound();

  const identity = resolveRealIpRateLimitClientKey(request, {
    scope: 'auth.email_otp_register',
    logPrefix: 'lead_email_otp_start',
    fallbackKey: LEAD_EMAIL_OTP_FALLBACK_CLIENT_KEY,
  });
  if (!identity.ok) {
    return NextResponse.json(
      { ok: false, error: 'proxy_configuration', message: notificationText.authProxyConfiguration },
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
      {
        ok: false,
        error: 'invalid_fio',
        message: isFioLatinRejection(parsed)
          ? FIO_LATIN_REJECTED_TEXT
          : notificationText.commonSpecifyNameSurname,
      },
      { status: 400 },
    );
  }

  const result = await startPublicLeadEmailVerification(
    parsed.data,
    buildAppDeps().emailOtpPublicDb,
    mailProfileForResolvedSurface(resolvedSurface),
  );
  if (result.ok) {
    return NextResponse.json({
      ok: true,
      challengeId: result.challengeId,
      retryAfterSeconds: result.retryAfterSeconds ?? 60,
    });
  }
  if (result.code === 'invalid_fio') {
    return NextResponse.json(
      { ok: false, error: 'invalid_fio', message: notificationText.commonSpecifyNameSurname },
      { status: 400 },
    );
  }
  if (result.code === 'invalid_email') {
    return NextResponse.json(
      { ok: false, error: 'invalid_email', message: notificationText.authInvalidEmailFormat },
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
    { ok: false, error: 'email_send_failed', message: notificationText.authCodeSendFailed },
    { status: 503 },
  );
}
