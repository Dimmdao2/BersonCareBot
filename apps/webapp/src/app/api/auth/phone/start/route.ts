import { stampBootstrapPrincipal } from '@/app-layer/principal/bootstrapPrincipal';
import { NextResponse } from 'next/server';
import { randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import {
  newRegistrationAttemptId,
  recordAuthRegistrationAttempt,
  recordAuthRegistrationFailure,
  recordAuthRegistrationSuccess,
} from '@/app-layer/product-analytics/recordAuthRegistration';
import type { ChannelContext } from '@/modules/auth/channelContext';
import { normalizePhone } from '@/modules/auth/phoneNormalize';
import type { PhoneOtpDelivery } from '@/modules/auth/smsPort';
import { isRuMobile, isValidPhoneE164 } from '@/modules/auth/phoneValidation';
import {
  formatOtpRetryAfterMessage,
  OTP_TOO_MANY_ATTEMPTS_MESSAGE,
} from '@/modules/auth/otpConstants';
import { getCurrentSession } from '@/modules/auth/service';
import { canAccessPatient } from '@/modules/roles/service';
import { getCurrentDbPrincipalOrganizationId } from '@bersoncare/db-principal';
import { isAuthChannelEnabled } from '@/modules/auth/authChannelPolicy';
import { assertPhoneCanStartChallenge, registerPhoneSend } from '@/modules/auth/phoneOtpLimits';

const PUBLIC_LOGIN_START_MIN_RESPONSE_MS = 500;

const bodySchema = z.object({
  phone: z.string().min(1),
  displayName: z.string().optional(),
  channel: z.enum(['web', 'telegram']).optional(),
  chatId: z.string().optional(),
  deliveryChannel: z.enum(['sms', 'telegram', 'max', 'email']).optional(),
  purpose: z.enum(['login', 'profile_bind']).optional(),
});

/**
 * Start phone auth. Для telegram channel/chatId берутся из тела (как на bind-phone);
 * для web при отсутствии chatId подставляется серверный UUID.
 * Для публичного web-login без deliveryChannel сервер сам выбирает SMS → verified email.
 * Явный deliveryChannel сохраняется для messenger/profile-bind контрактов; явный web SMS запрещён.
 */
export async function POST(request: Request) {
  const startedAt = Date.now();
  stampBootstrapPrincipal('api/auth/phone/start:POST', request);
  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'phone_required', message: 'Номер телефона обязателен' },
      { status: 400 },
    );
  }

  const { phone, displayName } = parsed.data;
  const channel = parsed.data.channel ?? 'web';
  const purpose = parsed.data.purpose ?? 'login';
  const publicWebLogin = channel === 'web' && purpose === 'login';
  const automaticPublicLogin = publicWebLogin && parsed.data.deliveryChannel == null;
  let deliveryChannel = parsed.data.deliveryChannel ?? 'sms';

  let context: ChannelContext;

  if (channel === 'telegram') {
    const chatId = parsed.data.chatId?.trim();
    if (!chatId) {
      return NextResponse.json(
        { ok: false, error: 'chat_id_required', message: 'Для Telegram укажите chatId' },
        { status: 400 },
      );
    }
    context = {
      channel: 'telegram',
      chatId,
      displayName: displayName?.trim() || undefined,
    };
  } else {
    const cid = parsed.data.chatId?.trim();
    context = {
      channel: 'web',
      chatId: cid && cid.length > 0 ? cid : randomUUID(),
      displayName: displayName?.trim() || undefined,
    };
  }

  const normalized = normalizePhone(phone);
  if (!isValidPhoneE164(normalized)) {
    return NextResponse.json(
      { ok: false, error: 'invalid_phone', message: 'Неверный формат номера' },
      { status: 400 },
    );
  }

  if (!automaticPublicLogin && !(await isAuthChannelEnabled(deliveryChannel))) {
    return NextResponse.json({ ok: false, error: 'auth_channel_disabled' }, { status: 403 });
  }

  if (!automaticPublicLogin && channel === 'web' && deliveryChannel === 'sms') {
    return NextResponse.json(
      {
        ok: false,
        error: 'sms_disabled_web',
        message: 'SMS для входа с сайта отключён. Используйте код в Telegram или Max.',
      },
      { status: 400 },
    );
  }

  if (deliveryChannel === 'sms' && !isRuMobile(normalized)) {
    return NextResponse.json(
      {
        ok: false,
        error: 'sms_ru_only',
        message: 'SMS доступно только для номеров РФ.',
      },
      { status: 400 },
    );
  }

  const deps = buildAppDeps();
  const user = await deps.userByPhone.findByPhone(normalized);

  let delivery: PhoneOtpDelivery | undefined;
  if (automaticPublicLogin) {
    const gate = await assertPhoneCanStartChallenge(normalized);
    if (gate.ok !== true) {
      return NextResponse.json(
        {
          ok: false,
          error: gate.code,
          retryAfterSeconds: gate.retryAfterSeconds,
          message: errorMessage(gate.code, gate.retryAfterSeconds),
        },
        {
          status: 429,
          ...(gate.retryAfterSeconds != null && {
            headers: { 'Retry-After': String(gate.retryAfterSeconds) },
          }),
        },
      );
    }

    if (isRuMobile(normalized) && (await isAuthChannelEnabled('sms'))) {
      deliveryChannel = 'sms';
      delivery = { channel: 'sms' };
    } else if (user && (await isAuthChannelEnabled('email'))) {
      const email = await deps.userByPhone.getVerifiedEmailForUser(user.userId);
      if (email) {
        deliveryChannel = 'email';
        delivery = { channel: 'email', email };
      }
    }

    if (!delivery) {
      await registerPhoneSend(normalized);
      return publicLoginAccepted(startedAt);
    }
  }

  let profileBindUserId: string | undefined;
  let profileBindOrganizationId: string | undefined;
  if (purpose === 'profile_bind') {
    const session = await getCurrentSession();
    if (!session || !canAccessPatient(session.user.role)) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
    }
    profileBindUserId = session.user.userId;
    profileBindOrganizationId = getCurrentDbPrincipalOrganizationId();
    if (!profileBindOrganizationId) {
      return NextResponse.json(
        { ok: false, error: 'organization_context_required' },
        { status: 409 },
      );
    }
  }
  const isRegistrationIntent = purpose === 'login' && !user;
  const registrationAttemptId = isRegistrationIntent ? newRegistrationAttemptId() : undefined;
  const entryChannel = channel === 'telegram' ? ('telegram' as const) : ('browser' as const);

  if (isRegistrationIntent) {
    await recordAuthRegistrationAttempt({
      attemptId: registrationAttemptId!,
      authMethod: 'phone_otp',
      stage: 'start',
      entryChannel,
      contactType: 'phone',
      contactValue: normalized,
    });
  }

  if (deliveryChannel === 'sms') {
    delivery = { channel: 'sms' };
  } else if (deliveryChannel === 'telegram') {
    const recipientId = user?.bindings?.telegramId;
    if (!recipientId) {
      if (publicWebLogin) {
        return unavailablePublicLoginAccepted(startedAt, normalized, 'telegram');
      }
      return NextResponse.json(
        { ok: false, error: 'channel_unavailable', message: 'Telegram не привязан к этому номеру' },
        { status: 400 },
      );
    }
    delivery = { channel: 'telegram', recipientId };
  } else if (deliveryChannel === 'max') {
    const recipientId = user?.bindings?.maxId;
    if (!recipientId) {
      if (publicWebLogin) {
        return unavailablePublicLoginAccepted(startedAt, normalized, 'max');
      }
      return NextResponse.json(
        { ok: false, error: 'channel_unavailable', message: 'Max не привязан к этому номеру' },
        { status: 400 },
      );
    }
    delivery = { channel: 'max', recipientId };
  } else {
    if (!user) {
      if (publicWebLogin) {
        return unavailablePublicLoginAccepted(startedAt, normalized, 'email');
      }
      return NextResponse.json(
        { ok: false, error: 'channel_unavailable', message: 'Сначала подтвердите email в профиле' },
        { status: 400 },
      );
    }
    const email = await deps.userByPhone.getVerifiedEmailForUser(user.userId);
    if (!email) {
      if (publicWebLogin) {
        return unavailablePublicLoginAccepted(startedAt, normalized, 'email');
      }
      return NextResponse.json(
        { ok: false, error: 'channel_unavailable', message: 'Подтверждённый email не найден' },
        { status: 400 },
      );
    }
    delivery = { channel: 'email', email };
  }

  const result = await deps.auth.startPhoneAuth(normalized, context, {
    delivery,
    ...(registrationAttemptId ? { registrationAttemptId, isRegistrationIntent: true } : {}),
    ...(profileBindUserId ? { profileBindUserId } : {}),
    ...(profileBindOrganizationId ? { profileBindOrganizationId } : {}),
  });

  if (!result.ok) {
    if (isRegistrationIntent && registrationAttemptId) {
      await recordAuthRegistrationFailure({
        attemptId: registrationAttemptId,
        authMethod: 'phone_otp',
        stage: 'start',
        entryChannel,
        contactType: 'phone',
        contactValue: normalized,
        errorCode: result.code,
      });
    }
    if (publicWebLogin && result.code === 'delivery_failed') {
      await registerPhoneSend(normalized);
      return publicLoginAccepted(
        startedAt,
        undefined,
        automaticPublicLogin ? 'automatic' : deliveryChannel,
      );
    }
    const status =
      result.code === 'rate_limited' || result.code === 'too_many_attempts'
        ? 429
        : result.code === 'delivery_failed'
          ? 503
          : 400;
    return NextResponse.json(
      {
        ok: false,
        error: result.code,
        retryAfterSeconds: result.retryAfterSeconds,
        message: errorMessage(result.code, result.retryAfterSeconds),
      },
      {
        status,
        ...(result.retryAfterSeconds != null && {
          headers: { 'Retry-After': String(result.retryAfterSeconds) },
        }),
      },
    );
  }

  if (isRegistrationIntent && registrationAttemptId) {
    await recordAuthRegistrationSuccess({
      attemptId: registrationAttemptId,
      authMethod: 'phone_otp',
      stage: 'challenge_sent',
      entryChannel,
      contactType: 'phone',
      contactValue: normalized,
      challengeId: result.challengeId,
      isNewAccount: true,
    });
  }

  if (publicWebLogin) {
    return publicLoginAccepted(
      startedAt,
      result.challengeId,
      automaticPublicLogin ? 'automatic' : deliveryChannel,
    );
  }

  return NextResponse.json({
    ok: true,
    challengeId: result.challengeId,
    retryAfterSeconds: result.retryAfterSeconds,
    deliveryChannel,
    ...(registrationAttemptId ? { attemptId: registrationAttemptId } : {}),
  });
}

async function publicLoginAccepted(
  startedAt: number,
  challengeId = randomBytes(16).toString('base64url'),
  deliveryChannel: 'automatic' | 'sms' | 'telegram' | 'max' | 'email' = 'automatic',
): Promise<NextResponse> {
  const remainingMs = PUBLIC_LOGIN_START_MIN_RESPONSE_MS - (Date.now() - startedAt);
  if (remainingMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, remainingMs));
  }
  return NextResponse.json({
    ok: true,
    challengeId,
    retryAfterSeconds: 60,
    deliveryChannel,
  });
}

async function unavailablePublicLoginAccepted(
  startedAt: number,
  phone: string,
  deliveryChannel: 'telegram' | 'max' | 'email',
): Promise<NextResponse> {
  const gate = await assertPhoneCanStartChallenge(phone);
  if (gate.ok !== true) {
    return NextResponse.json(
      {
        ok: false,
        error: gate.code,
        retryAfterSeconds: gate.retryAfterSeconds,
        message: errorMessage(gate.code, gate.retryAfterSeconds),
      },
      {
        status: 429,
        ...(gate.retryAfterSeconds != null && {
          headers: { 'Retry-After': String(gate.retryAfterSeconds) },
        }),
      },
    );
  }
  await registerPhoneSend(phone);
  return publicLoginAccepted(startedAt, undefined, deliveryChannel);
}

function errorMessage(code: string, retryAfterSeconds?: number): string {
  switch (code) {
    case 'sms_disabled_web':
      return 'SMS для входа с сайта отключён. Используйте код в Telegram или Max.';
    case 'sms_ru_only':
      return 'SMS доступно только для номеров РФ.';
    case 'invalid_phone':
      return 'Неверный формат номера';
    case 'delivery_failed':
      return 'Не удалось отправить код. Попробуйте позже.';
    case 'rate_limited':
      return retryAfterSeconds != null
        ? formatOtpRetryAfterMessage(retryAfterSeconds)
        : 'Слишком много запросов. Попробуйте позже.';
    case 'too_many_attempts':
      return OTP_TOO_MANY_ATTEMPTS_MESSAGE;
    default:
      return 'Ошибка отправки кода.';
  }
}
