import { stampBootstrapPrincipal } from '@/app-layer/principal/bootstrapPrincipal';
import { after, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import {
  newRegistrationAttemptId,
  recordAuthRegistrationAttempt,
  recordAuthRegistrationFailure,
  recordAuthRegistrationSuccess,
} from '@/app-layer/product-analytics/recordAuthRegistration';
import type { ChannelContext } from '@/modules/auth/channelContext';
import type { SessionUser } from '@/shared/types/session';
import { normalizePhone } from '@/modules/auth/phoneNormalize';
import type { PhoneOtpDelivery, SendCodeResult } from '@/modules/auth/smsPort';
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

const PUBLIC_LOGIN_START_MIN_RESPONSE_MS = 500;
/**
 * D15b/6: `user` here always comes from `deps.userByPhone.findByPhone(normalized)` above, which
 * (after the D15b/6 repair) already carries the full `contacts` array in one pre-session door
 * call. `deps.userByPhone.isPhoneTrustedForUser`/`getVerifiedEmailForUser` derive the identical
 * answer (primary contact of this kind, confirmed) from a SEPARATE relation read keyed by user id
 * — a door bootstrap/pre-session has no capability for (see `pgUserByPhone.ts`). Reading the same
 * fact off the payload already fetched needs no second door. A missing `user` remains zero extra
 * contact-relation reads, preserving the public response symmetry.
 */
function primaryConfirmedContactValue(
  user: SessionUser | null,
  kind: 'phone' | 'email',
): string | null {
  const contact = user?.contacts?.find((c) => c.kind === kind && c.isPrimary);
  return contact?.confirmedAt ? contact.value : null;
}

const bodySchema = z.object({
  phone: z.string().min(1),
  displayName: z.string().optional(),
  channel: z.enum(['web', 'telegram']).optional(),
  chatId: z.string().optional(),
  deliveryChannel: z.enum(['sms', 'telegram', 'max', 'email']).optional(),
  purpose: z.enum(['login', 'profile_bind']).optional(),
});

/**
 * Start phone auth for an explicitly selected delivery channel. Unauthenticated login always
 * receives web context; a caller cannot make its body trusted by claiming `channel: telegram`.
 * The public automatic channel resolver and its SMS bootstrap no longer exist: browser login by
 * phone first proves the contact through `phone/messenger-bind/*`.
 */
export async function POST(request: Request) {
  const startedAt = Date.now();
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
  const publicLogin = purpose === 'login';
  const deliveryChannel = parsed.data.deliveryChannel;

  if (!deliveryChannel) {
    return NextResponse.json({ ok: false, error: 'delivery_channel_required' }, { status: 400 });
  }

  let context: ChannelContext;

  if (!publicLogin && channel === 'telegram') {
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

  // Вход ПО НОМЕРУ доставляет код только туда, что привязано к самому номеру, — в бота Telegram или
  // MAX. Почта сюда не входит, и вот почему (владелец 16.09.2026): «если я выбираю „другой способ
  // ввода“ — я ввожу данные другого канала… если я случайно ошибся в номере и такой аккаунт уже
  // есть, а я думаю, что это проблема с телеграм, я хочу поменять способ входа — но не могу ввести
  // правильный имейл». Прежнее поведение брало адрес у аккаунта, найденного ПО ВВЕДЁННОМУ НОМЕРУ:
  // при опечатке код молча уходил постороннему, а человек ждал письмо, которого ему никто не слал.
  // Почтовый вход — отдельная дверь, где адрес вводит сам человек; отказ здесь ничего не сообщает
  // о номере, потому что не зависит от него.
  if (publicLogin && deliveryChannel === 'email') {
    return NextResponse.json(
      {
        ok: false,
        error: 'channel_unavailable',
        message: notificationText.authEmailCodeGoesThroughEmailDoor,
      },
      { status: 400 },
    );
  }

  if (publicLogin && deliveryChannel === 'sms') {
    return NextResponse.json(
      {
        ok: false,
        error: 'sms_disabled_web',
        message: notificationText.authSmsDisabledOnWeb,
      },
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

  const deps = buildAppDeps();
  const user = await deps.userByPhone.findByPhone(normalized);

  let delivery: PhoneOtpDelivery | undefined;

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
  const entryChannel =
    context.channel === 'telegram' ? ('telegram' as const) : ('browser' as const);
  let deferredRegistrationAttempt: (() => Promise<void>) | undefined;

  if (isRegistrationIntent) {
    const recordAttempt = () =>
      recordAuthRegistrationAttempt({
        attemptId: registrationAttemptId!,
        authMethod: 'phone_otp',
        stage: 'start',
        entryChannel,
        contactType: 'phone',
        contactValue: normalized,
      });
    if (publicLogin) {
      deferredRegistrationAttempt = recordAttempt;
    } else {
      await recordAttempt();
    }
  }
  const recordDeferredDeliveryResult =
    publicLogin && isRegistrationIntent && registrationAttemptId
      ? async (deliveryResult: SendCodeResult): Promise<void> => {
          await deferredRegistrationAttempt?.();
          if (deliveryResult.ok) {
            await recordAuthRegistrationSuccess({
              attemptId: registrationAttemptId,
              authMethod: 'phone_otp',
              stage: 'challenge_sent',
              entryChannel,
              contactType: 'phone',
              contactValue: normalized,
              challengeId: deliveryResult.challengeId,
              isNewAccount: true,
            });
            return;
          }
          await recordAuthRegistrationFailure({
            attemptId: registrationAttemptId,
            authMethod: 'phone_otp',
            stage: 'start',
            entryChannel,
            contactType: 'phone',
            contactValue: normalized,
            errorCode: deliveryResult.code,
          });
        }
      : undefined;

  if (deliveryChannel === 'sms') {
    delivery = { channel: 'sms' };
  } else if (deliveryChannel === 'telegram') {
    const recipientId = user?.bindings?.telegramId;
    if (!recipientId) {
      if (!publicLogin) {
        return NextResponse.json(
          {
            ok: false,
            error: 'channel_unavailable',
            message: notificationText.authTelegramNotLinkedToPhone,
          },
          { status: 400 },
        );
      }
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
      if (!publicLogin) {
        return NextResponse.json(
          {
            ok: false,
            error: 'channel_unavailable',
            message: notificationText.authMaxNotLinkedToPhone,
          },
          { status: 400 },
        );
      }
    } else {
      delivery = {
        channel: 'max',
        recipientId,
        ...(clinicRequiredOrganizationId ? { clinicRequiredOrganizationId } : {}),
      };
    }
  } else {
    const email = user || publicLogin ? primaryConfirmedContactValue(user, 'email') : null;
    if (!user) {
      if (!publicLogin) {
        return NextResponse.json(
          {
            ok: false,
            error: 'channel_unavailable',
            message: notificationText.authConfirmEmailInProfileFirst,
          },
          { status: 400 },
        );
      }
    } else if (!email) {
      if (!publicLogin) {
        return NextResponse.json(
          {
            ok: false,
            error: 'channel_unavailable',
            message: notificationText.authConfirmEmailInProfileFirst,
          },
          { status: 400 },
        );
      }
    } else {
      delivery = { channel: 'email', email };
    }
  }

  const result = await deps.auth.startPhoneAuth(normalized, context, {
    delivery,
    ...(publicLogin
      ? {
          deferredDelivery: {
            schedule: after,
            ...(delivery ? {} : { suppressDelivery: true }),
            ...(delivery ? {} : { challengeDeliveryChannel: deliveryChannel }),
            ...(recordDeferredDeliveryResult
              ? { onDeliveryResult: recordDeferredDeliveryResult }
              : {}),
          },
        }
      : {}),
    ...(registrationAttemptId ? { registrationAttemptId, isRegistrationIntent: true } : {}),
    ...(profileBindUserId ? { profileBindUserId } : {}),
    ...(profileBindOrganizationId ? { profileBindOrganizationId } : {}),
  });

  if (!result.ok) {
    if (isRegistrationIntent && registrationAttemptId) {
      const recordFailure = () =>
        recordAuthRegistrationFailure({
          attemptId: registrationAttemptId,
          authMethod: 'phone_otp',
          stage: 'start',
          entryChannel,
          contactType: 'phone',
          contactValue: normalized,
          errorCode: result.code,
        });
      if (publicLogin) {
        after(async () => {
          await deferredRegistrationAttempt?.();
          await recordFailure();
        });
      } else {
        await recordFailure();
      }
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

  if (!publicLogin && isRegistrationIntent && registrationAttemptId) {
    const recordSuccess = () =>
      recordAuthRegistrationSuccess({
        attemptId: registrationAttemptId,
        authMethod: 'phone_otp',
        stage: 'challenge_sent',
        entryChannel,
        contactType: 'phone',
        contactValue: normalized,
        challengeId: result.challengeId,
        isNewAccount: true,
      });
    await recordSuccess();
  }

  if (publicLogin) {
    return publicLoginAccepted(startedAt, result.challengeId, deliveryChannel);
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
  challengeId: string,
  deliveryChannel: 'sms' | 'telegram' | 'max' | 'email',
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

function errorMessage(code: string, retryAfterSeconds?: number): string {
  switch (code) {
    case 'sms_disabled_web':
      return 'SMS для входа с сайта отключён. Используйте код в Telegram или Max.';
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
