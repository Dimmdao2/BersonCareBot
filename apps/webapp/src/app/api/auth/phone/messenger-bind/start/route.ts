import { stampBootstrapPrincipal } from '@/app-layer/principal/bootstrapPrincipal';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ensureAuthModulePortsBound } from '@/app-layer/di/bindAuthModulePorts';
import { ensureSystemSettingsConfigAdapterBound } from '@/app-layer/di/bindSystemSettingsConfigAdapter';
import { getCurrentSession } from '@/modules/auth/service';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import {
  newRegistrationAttemptId,
  recordAuthRegistrationAttempt,
  recordAuthRegistrationFailure,
  recordAuthRegistrationSuccess,
} from '@/app-layer/product-analytics/recordAuthRegistration';
import { formatOtpRetryAfterMessage } from '@/modules/auth/otpConstants';
import {
  isPhoneMessengerBindStartRateLimited,
  PHONE_MESSENGER_BIND_START_RATE_LIMIT_SEC,
} from '@/modules/auth/phoneMessengerBindStartRateLimit';
import { normalizePhone } from '@/modules/auth/phoneNormalize';
import { isValidPhoneE164 } from '@/modules/auth/phoneValidation';
import { getMaxLoginBotNickname } from '@/modules/system-settings/maxLoginBotNickname';
import { getTelegramLoginBotUsername } from '@/modules/system-settings/telegramLoginBotUsername';
import { canAccessPatient } from '@/modules/roles/service';
import { isAuthChannelEnabled } from '@/modules/auth/authChannelPolicy';
import { selectMessengerBindBotIdentity } from '@/modules/auth/messengerBindBotIdentity';
import { readResolvedSurface } from '@/shared/lib/surface/requestSurface';
import { logger } from '@/infra/logging/logger';

const bodySchema = z.object({
  phone: z.string().min(1),
  channelCode: z.enum(['telegram', 'max']),
  purpose: z.enum(['login', 'profile_bind']),
});

export async function POST(request: Request) {
  stampBootstrapPrincipal('api/auth/phone/messenger-bind/start:POST', request);
  ensureAuthModulePortsBound();
  ensureSystemSettingsConfigAdapterBound();

  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'invalid_body', message: 'Укажите телефон, канал и назначение' },
      { status: 400 },
    );
  }

  const phone = normalizePhone(parsed.data.phone);
  if (!isValidPhoneE164(phone)) {
    return NextResponse.json(
      { ok: false, error: 'invalid_phone', message: 'Неверный формат номера' },
      { status: 400 },
    );
  }

  // Patient-only route: pass the fixed 'patient' surface explicitly rather than the Host-derived
  // resolution, so the transitional single-Host TEST deployment (staff and patient share one Host)
  // still evaluates the patient auth-channel toggles instead of falling through to staff's, which
  // would close Telegram/MAX login for patients without opening it on the staff/admin surface.
  if (!(await isAuthChannelEnabled(parsed.data.channelCode, 'patient'))) {
    return NextResponse.json({ ok: false, error: 'auth_channel_disabled' }, { status: 403 });
  }

  let sessionUserId: string | null = null;
  if (parsed.data.purpose === 'profile_bind') {
    const session = await getCurrentSession();
    if (!session || !canAccessPatient(session.user.role)) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
    }
    sessionUserId = session.user.userId;
  }

  const rateKey =
    parsed.data.purpose === 'profile_bind' && sessionUserId ? `${phone}:${sessionUserId}` : phone;
  if (await isPhoneMessengerBindStartRateLimited(rateKey)) {
    return NextResponse.json(
      {
        ok: false,
        error: 'rate_limited',
        retryAfterSeconds: PHONE_MESSENGER_BIND_START_RATE_LIMIT_SEC,
        message: formatOtpRetryAfterMessage(PHONE_MESSENGER_BIND_START_RATE_LIMIT_SEC),
      },
      {
        status: 429,
        headers: { 'Retry-After': String(PHONE_MESSENGER_BIND_START_RATE_LIMIT_SEC) },
      },
    );
  }

  const deps = buildAppDeps();
  // Registration analytics is owner-deferred. A public bind start must not probe whether an
  // arbitrary phone already exists merely to classify an analytics event.
  const isRegistrationIntent = false;

  const [platformBotUsername, platformMaxBotNickname] = await Promise.all([
    getTelegramLoginBotUsername(),
    getMaxLoginBotNickname(),
  ]);

  // The bot identity follows the SURFACE, not the platform default: on a branded patient surface
  // the clinic's own bot proves the phone and delivers the code (owner 20.08). A clinic that
  // declared its bot but whose exact identity is unusable fails closed here — silently handing the
  // person the platform bot would move the clinic's own channel to the platform behind its back.
  const resolvedSurface = readResolvedSurface(request.headers);
  const botIdentity = selectMessengerBindBotIdentity({
    surface: resolvedSurface,
    channelCode: parsed.data.channelCode,
    platformPublicId:
      parsed.data.channelCode === 'telegram' ? platformBotUsername : platformMaxBotNickname,
  });
  if (!botIdentity.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: botIdentity.error,
        message: 'Бот клиники сейчас недоступен. Обратитесь в клинику или войдите другим способом.',
      },
      { status: 503 },
    );
  }
  const botUsername =
    parsed.data.channelCode === 'telegram' ? botIdentity.identity.publicId : platformBotUsername;
  const maxBotNickname =
    parsed.data.channelCode === 'max' ? botIdentity.identity.publicId : platformMaxBotNickname;

  let result: Awaited<ReturnType<typeof deps.phoneMessengerBind.start>>;
  try {
    result = await deps.phoneMessengerBind.start({
      phone,
      channelCode: parsed.data.channelCode,
      purpose: parsed.data.purpose,
      botUsername,
      maxBotNickname,
      sessionUserId,
    });
  } catch (error) {
    logger.error({
      event: 'phone_messenger_bind_start_failed',
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { ok: false, error: 'messenger_bind_unavailable', message: 'Привязка временно недоступна' },
      { status: 503 },
    );
  }

  if (!result.ok) {
    if (isRegistrationIntent) {
      await recordAuthRegistrationFailure({
        attemptId: newRegistrationAttemptId(),
        authMethod: 'messenger_bind',
        stage: 'start',
        entryChannel: 'browser',
        contactType: 'phone',
        contactValue: phone,
        errorCode: result.code,
      });
    }
    return NextResponse.json(
      { ok: false, error: result.code, message: 'Не удалось начать привязку' },
      { status: 400 },
    );
  }

  if (isRegistrationIntent) {
    await recordAuthRegistrationAttempt({
      attemptId: result.setupToken,
      authMethod: 'messenger_bind',
      stage: 'start',
      entryChannel: 'browser',
      contactType: 'phone',
      contactValue: phone,
    });
    await recordAuthRegistrationSuccess({
      attemptId: result.setupToken,
      authMethod: 'messenger_bind',
      stage: 'challenge_sent',
      entryChannel: 'browser',
      contactType: 'phone',
      contactValue: phone,
      isNewAccount: true,
    });
  }

  return NextResponse.json({
    ok: true,
    setupToken: result.setupToken,
    url: result.url,
    expiresAt: result.expiresAtIso,
    ...(result.manualCommand ? { manualCommand: result.manualCommand } : {}),
  });
}
