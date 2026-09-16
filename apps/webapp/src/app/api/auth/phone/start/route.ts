import { stampBootstrapPrincipal } from '@/app-layer/principal/bootstrapPrincipal';
import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
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
import { requireResolvedSurface } from '@/shared/lib/surface/requestSurface';
import { notificationText } from '@/shared/notifications/notificationText';

const bodySchema = z.object({
  phone: z.string().min(1),
  displayName: z.string().optional(),
  channel: z.enum(['web', 'telegram']).optional(),
  chatId: z.string().optional(),
  deliveryChannel: z.enum(['sms', 'telegram', 'max', 'email']).optional(),
  purpose: z.enum(['login', 'profile_bind']).optional(),
});

/**
 * Direct OTP is retained only for an authenticated patient binding a phone to the current profile.
 * Login by an entered phone must prove the contact through `phone/messenger-bind/*`.
 */
export async function POST(request: Request) {
  stampBootstrapPrincipal('api/auth/phone/start:POST', request);
  const resolvedSurface = requireResolvedSurface(request.headers);
  if (!resolvedSurface.authPolicy.availableMethods.includes('phone_bot')) {
    return NextResponse.json({ ok: false, error: 'auth_method_disabled' }, { status: 403 });
  }

  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'phone_required', message: notificationText.authPhoneRequired },
      { status: 400 },
    );
  }

  const { phone, displayName } = parsed.data;
  const clinicRequiredOrganizationId =
    resolvedSurface.surface === 'patient_branded' ? resolvedSurface.organizationId : undefined;
  const channel = parsed.data.channel ?? 'web';
  const purpose = parsed.data.purpose ?? 'login';
  const deliveryChannel = parsed.data.deliveryChannel;

  if (purpose === 'login') {
    return NextResponse.json({ ok: false, error: 'direct_phone_login_disabled' }, { status: 403 });
  }

  if (!deliveryChannel) {
    return NextResponse.json({ ok: false, error: 'delivery_channel_required' }, { status: 400 });
  }

  let context: ChannelContext;

  if (channel === 'telegram') {
    const chatId = parsed.data.chatId?.trim();
    if (!chatId) {
      return NextResponse.json(
        { ok: false, error: 'chat_id_required', message: notificationText.authTelegramChatUnknown },
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
      { ok: false, error: 'invalid_phone', message: notificationText.authPhoneInvalidFormat },
      { status: 400 },
    );
  }

  if (!(await isAuthChannelEnabled(deliveryChannel, 'patient'))) {
    return NextResponse.json({ ok: false, error: 'auth_channel_disabled' }, { status: 403 });
  }

  if (deliveryChannel === 'sms' && !isRuMobile(normalized)) {
    return NextResponse.json(
      {
        ok: false,
        error: 'sms_ru_only',
        message: notificationText.authSmsRussianNumbersOnly,
      },
      { status: 400 },
    );
  }

  // Дверь стоит ДО чтения по введённому номеру: иначе неавторизованный запрос успевает выполнить
  // поиск пользователя по произвольному номеру и получает отказ уже после обращения к базе.
  const session = await getCurrentSession();
  if (!session || !canAccessPatient(session.user.role)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  const profileBindUserId = session.user.userId;
  const profileBindOrganizationId = getCurrentDbPrincipalOrganizationId();
  if (!profileBindOrganizationId) {
    return NextResponse.json(
      { ok: false, error: 'organization_context_required' },
      { status: 409 },
    );
  }

  const deps = buildAppDeps();
  const user = await deps.userByPhone.findByPhone(normalized);

  let delivery: PhoneOtpDelivery | undefined;

  if (deliveryChannel === 'sms') {
    delivery = { channel: 'sms' };
  } else if (deliveryChannel === 'telegram') {
    const recipientId = user?.bindings?.telegramId;
    if (!recipientId) {
      return NextResponse.json(
        {
          ok: false,
          error: 'channel_unavailable',
          message: notificationText.authTelegramNotLinkedToPhone,
        },
        { status: 400 },
      );
    } else {
      delivery = {
        channel: 'telegram',
        recipientId,
        ...(clinicRequiredOrganizationId ? { clinicRequiredOrganizationId } : {}),
      };
    }
  } else if (deliveryChannel === 'max') {
    const recipientId = user?.bindings?.maxId;
    if (!recipientId) {
      return NextResponse.json(
        {
          ok: false,
          error: 'channel_unavailable',
          message: notificationText.authMaxNotLinkedToPhone,
        },
        { status: 400 },
      );
    } else {
      delivery = {
        channel: 'max',
        recipientId,
        ...(clinicRequiredOrganizationId ? { clinicRequiredOrganizationId } : {}),
      };
    }
  } else {
    const emailContact = user?.contacts?.find(
      (contact) => contact.kind === 'email' && contact.isPrimary && contact.confirmedAt,
    );
    const email = emailContact?.value;
    if (!user || !email) {
      return NextResponse.json(
        {
          ok: false,
          error: 'channel_unavailable',
          message: notificationText.authConfirmEmailInProfileFirst,
        },
        { status: 400 },
      );
    }
    delivery = { channel: 'email', email };
  }

  const result = await deps.auth.startPhoneAuth(normalized, context, {
    delivery,
    profileBindUserId,
    profileBindOrganizationId,
  });

  if (!result.ok) {
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

  return NextResponse.json({
    ok: true,
    challengeId: result.challengeId,
    retryAfterSeconds: result.retryAfterSeconds,
    deliveryChannel,
  });
}

function errorMessage(code: string, retryAfterSeconds?: number): string {
  switch (code) {
    case 'sms_ru_only':
      return notificationText.authSmsRussianNumbersOnly;
    case 'invalid_phone':
      return notificationText.authPhoneInvalidFormat;
    case 'delivery_failed':
      return 'Не удалось отправить код. Попробуйте позже.';
    case 'rate_limited':
      return retryAfterSeconds != null
        ? formatOtpRetryAfterMessage(retryAfterSeconds)
        : notificationText.authTooManyAttempts;
    case 'too_many_attempts':
      return OTP_TOO_MANY_ATTEMPTS_MESSAGE;
    default:
      return 'Ошибка отправки кода.';
  }
}
