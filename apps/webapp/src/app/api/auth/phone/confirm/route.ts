import { stampBootstrapPrincipal } from '@/app-layer/principal/bootstrapPrincipal';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { ensureAuthModulePortsBound } from '@/app-layer/di/bindAuthModulePorts';
import {
  recordAuthRegistrationFailure,
  recordAuthRegistrationSuccess,
} from '@/app-layer/product-analytics/recordAuthRegistration';
import {
  AUTH_CONFIRM_RATE_LIMIT_SEC,
  checkAuthConfirmRateLimit,
} from '@/modules/auth/authConfirmRateLimit';
import {
  formatOtpRetryAfterMessage,
  OTP_TOO_MANY_ATTEMPTS_MESSAGE,
} from '@/modules/auth/otpConstants';
import { enterStaffSecuritySelfPrincipal } from '@/app-layer/principal/staffSecuritySelfPrincipal';
import { isPlatformUserUuid } from '@/shared/platform-user/isPlatformUserUuid';
import { prepareVerifiedPrimaryLogin } from '@/modules/auth/verifiedStaffPrimaryLogin';
import { isAuthChannelEnabled } from '@/modules/auth/authChannelPolicy';
import { notificationText } from '@/shared/notifications/notificationText';
import { isCyrillicFioInput } from '@/shared/lib/fio';
import type { HumanMergeDecision } from '@bersoncare/platform-merge';

const fioSelectionSchema = z.discriminatedUnion('source', [
  z.object({ source: z.literal('target') }),
  z.object({ source: z.literal('duplicate') }),
  z.object({
    source: z.literal('custom'),
    value: z.string().trim().min(1).max(100).refine(isCyrillicFioInput),
  }),
]);

const bodySchema = z.object({
  challengeId: z.string().trim().min(1),
  code: z.string().trim().min(1),
  browserCalendarIana: z.string().max(120).optional(),
  attemptId: z.string().uuid().optional(),
  mergeDecision: z.object({
    accountConfirmed: z.literal(true),
    fio: z.object({
      last_name: fioSelectionSchema.optional(),
      first_name: fioSelectionSchema.optional(),
      patronymic: fioSelectionSchema.optional(),
    }),
  }).optional(),
});

/**
 * Confirm phone code. Channel/chatId/displayName are never read from body;
 * binding uses only the context stored in the challenge at start.
 */
export async function POST(request: Request) {
  stampBootstrapPrincipal('api/auth/phone/confirm:POST', request);

  ensureAuthModulePortsBound();
  const rateLimit = await checkAuthConfirmRateLimit(request, 'phone_confirm');
  if (rateLimit.limited) {
    if (rateLimit.reason === 'proxy_configuration') {
      return NextResponse.json({ ok: false, error: 'proxy_configuration' }, { status: 503 });
    }
    // Same shape this route already returns for its own internal `rate_limited` code below
    // (ASVS 6.3.8): a rate-limited response must not differ in shape from an ordinary failure.
    return NextResponse.json(
      {
        ok: false,
        error: 'rate_limited',
        retryAfterSeconds: AUTH_CONFIRM_RATE_LIMIT_SEC,
        message: errorMessage('rate_limited', AUTH_CONFIRM_RATE_LIMIT_SEC),
      },
      { status: 429, headers: { 'Retry-After': String(AUTH_CONFIRM_RATE_LIMIT_SEC) } },
    );
  }

  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: 'challenge_id_and_code_required',
        message: notificationText.authEnterCode,
      },
      { status: 400 },
    );
  }
  const { challengeId, code, browserCalendarIana } = parsed.data;

  const deps = buildAppDeps();
  const challenge = await deps.auth.getPhoneChallenge(challengeId);
  const deliveryChannel = challenge?.deliveryChannel ?? 'sms';
  if (challenge && !(await isAuthChannelEnabled(deliveryChannel))) {
    return NextResponse.json({ ok: false, error: 'auth_channel_disabled' }, { status: 403 });
  }
  const attemptId =
    parsed.data.attemptId?.trim() || challenge?.registrationAttemptId?.trim() || challengeId;
  const isRegistrationIntent = challenge?.isRegistrationIntent === true;
  const entryChannel =
    challenge?.channelContext?.channel === 'telegram'
      ? ('telegram' as const)
      : challenge?.channelContext?.channel === 'max'
        ? ('max' as const)
        : ('browser' as const);

  let humanMergeDecision: HumanMergeDecision | undefined;
  if (parsed.data.mergeDecision) {
    if (!challenge?.mergePrompt) {
      return NextResponse.json({ ok: false, error: 'merge_prompt_missing' }, { status: 409 });
    }
    humanMergeDecision = {
      accountConfirmed: true,
      targetId: challenge.mergePrompt.target.id,
      duplicateId: challenge.mergePrompt.duplicate.id,
      recognizedAccountId: challenge.mergePrompt.foundAccountId,
      fio: parsed.data.mergeDecision.fio,
    };
  }
  const result = await deps.auth.confirmPhoneAuth(challengeId, code, humanMergeDecision);

  if (!result.ok) {
    if (isRegistrationIntent) {
      await recordAuthRegistrationFailure({
        attemptId,
        authMethod: 'phone_otp',
        stage: 'confirm',
        entryChannel,
        contactType: 'phone',
        contactValue: challenge?.phone ?? null,
        challengeId,
        errorCode: result.code,
      });
    }
    const publicCode =
      result.code === 'invalid_code' || result.code === 'expired_code'
        ? 'invalid_code'
        : result.code;
    const status = publicCode === 'too_many_attempts' || publicCode === 'rate_limited' ? 429 : 400;
    return NextResponse.json(
      {
        ok: false,
        error: publicCode,
        retryAfterSeconds: result.retryAfterSeconds,
        message: errorMessage(publicCode, result.retryAfterSeconds),
      },
      {
        status,
        ...(result.retryAfterSeconds != null && {
          headers: { 'Retry-After': String(result.retryAfterSeconds) },
        }),
      },
    );
  }

  if ('mergeRequired' in result && result.mergeRequired) {
    return NextResponse.json({ ok: true, mergeRequired: true, prompt: result.prompt });
  }

  if (isPlatformUserUuid(result.user.userId)) {
    enterStaffSecuritySelfPrincipal(result.user.userId, 'api/auth/phone/confirm:otp-verified-self');
  }
  const sessionUser = await deps.userByPhone.findByUserId(result.user.userId);
  if (!sessionUser) {
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 });
  }
  if (result.mergedAccountId) {
    await deps.accountMergeNotifications.enqueue(sessionUser, result.mergedAccountId);
  }
  const postLoginHints = { phoneOtpChannel: result.deliveryChannel ?? deliveryChannel } as const;

  const tz = browserCalendarIana?.trim();
  if (tz) {
    await deps.patientCalendarTimezone.syncFromDevice(sessionUser.userId, tz);
  }

  if (isRegistrationIntent && result.wasCreated) {
    await recordAuthRegistrationSuccess({
      attemptId,
      authMethod: 'phone_otp',
      stage: 'session_set',
      entryChannel,
      contactType: 'phone',
      contactValue: sessionUser.phone ?? challenge?.phone ?? null,
      userId: sessionUser.userId,
      challengeId,
      isNewAccount: true,
    });
  }

  if (challenge?.profileBindUserId) {
    return NextResponse.json({
      ok: true,
      redirectTo: result.redirectTo,
      role: sessionUser.role,
    });
  }

  const prepared = await prepareVerifiedPrimaryLogin({
    user: sessionUser,
    staffSecurity: deps.staffSecurity,
    postLoginHints,
  });
  if (prepared.factorRequired) {
    return NextResponse.json({ ok: true, factorRequired: true });
  }

  await deps.auth.setSessionFromUser(sessionUser, 'phone_otp', prepared.sessionOptions);

  return NextResponse.json({
    ok: true,
    redirectTo: result.redirectTo,
    role: sessionUser.role,
  });
}

function errorMessage(code: string, retryAfterSeconds?: number): string {
  switch (code) {
    case 'invalid_code':
      return 'Неверный или просроченный код';
    case 'too_many_attempts':
      return OTP_TOO_MANY_ATTEMPTS_MESSAGE;
    case 'rate_limited':
      return retryAfterSeconds != null
        ? formatOtpRetryAfterMessage(retryAfterSeconds)
        : notificationText.authTooManyAttempts;
    default:
      return notificationText.authConfirmationFailed;
  }
}
