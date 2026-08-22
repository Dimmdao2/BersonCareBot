import { stampBootstrapPrincipal } from '@/app-layer/principal/bootstrapPrincipal';
import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import {
  AUTH_CHANNEL_DISABLED_ERROR,
  isAuthChannelEnabled,
} from '@/modules/auth/authChannelPolicy';
import {
  recordAuthRegistrationFailure,
  recordAuthRegistrationSuccess,
} from '@/app-layer/product-analytics/recordAuthRegistration';
import { confirmEmailChallenge } from '@/modules/auth/emailAuth';
import { reconcileDbRoleWithEnvRole, resolveRoleFromEnv } from '@/modules/auth/envRole';
import { getRedirectPathForRole } from '@/modules/auth/redirectPolicy';
import { setSessionFromUser } from '@/modules/auth/service';
import {
  enterStaffSecuritySelfPrincipal,
  runWithStaffSecuritySelfPrincipal,
} from '@/app-layer/principal/staffSecuritySelfPrincipal';
import { isPlatformUserUuid } from '@/shared/platform-user/isPlatformUserUuid';

const bodySchema = z.object({
  challengeId: z.string().uuid(),
  code: z.string().min(4).max(12),
  attemptId: z.string().uuid().optional(),
});

const LOG_BASE = {
  authMethod: 'email_password' as const,
  entryChannel: 'browser' as const,
  contactType: 'email' as const,
  stage: 'confirm' as const,
};

/** Публичное подтверждение email после `POST .../email-password/register` (без сессии до успеха). */
export async function POST(request: Request) {
  stampBootstrapPrincipal('api/auth/email-password/register/confirm:POST', request);
  if (!(await isAuthChannelEnabled('email'))) {
    return NextResponse.json({ ok: false, error: AUTH_CHANNEL_DISABLED_ERROR }, { status: 503 });
  }
  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    await recordAuthRegistrationFailure({
      ...LOG_BASE,
      attemptId: randomUUID(),
      contactValue: null,
      errorCode: 'invalid_body',
    });
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }

  const attemptId = parsed.data.attemptId?.trim() || parsed.data.challengeId;

  const deps = buildAppDeps();
  const userId = await deps.userPasswordCredentials.findUserIdByEmailChallengeId(
    parsed.data.challengeId,
  );
  if (!userId) {
    await recordAuthRegistrationFailure({
      ...LOG_BASE,
      attemptId,
      contactValue: null,
      challengeId: parsed.data.challengeId,
      errorCode: 'expired_code',
    });
    return NextResponse.json(
      { ok: false, error: 'expired_code', message: 'Код недействителен' },
      { status: 400 },
    );
  }

  // Почта человека читается под ЕГО идентичностью-себя, а не под предсессионным принципалом, под
  // которым исполняется маршрут (`stampBootstrapPrincipal` выше): у `app_pre_session` нет гранта на
  // `public.user_contacts` — после цутовера `20260821T040000` этот вызов отказывает `42501`, а
  // подтверждение регистрации падает 500 ещё до проверки кода. Субъект тот же, что и у самого
  // подтверждения: человек читает СВОЮ почту (`platform_user_id = app.current_patient_user_id()`).
  // Неканонический id идентичности-себя не получает (та же проверка, что ниже на строке успеха):
  // тогда почта в поле журнала остаётся пустой, а не роняет подтверждение.
  const profileEmail = isPlatformUserUuid(userId)
    ? (
        await runWithStaffSecuritySelfPrincipal(
          userId,
          'api/auth/email-password/register/confirm:profile-email-self',
          () => deps.userProjection.getProfileEmailFields(userId),
        )
      ).email ?? null
    : null;

  const result = await confirmEmailChallenge(
    userId,
    parsed.data.challengeId,
    parsed.data.code,
    'password_register',
  );
  if (!result.ok) {
    const status = result.code === 'too_many_attempts' ? 429 : 400;
    await recordAuthRegistrationFailure({
      ...LOG_BASE,
      attemptId,
      contactValue: profileEmail,
      userId,
      challengeId: parsed.data.challengeId,
      errorCode: result.code,
    });
    return NextResponse.json(
      {
        ok: false,
        error: result.code,
        retryAfterSeconds: result.retryAfterSeconds,
        message: errMsg(result.code),
      },
      {
        status,
        ...(result.retryAfterSeconds != null && {
          headers: { 'Retry-After': String(result.retryAfterSeconds) },
        }),
      },
    );
  }

  if (isPlatformUserUuid(userId)) {
    enterStaffSecuritySelfPrincipal(
      userId,
      'api/auth/email-password/register/confirm:email-verified-self',
    );
  }
  let sessionUser = await deps.userByPhone.findByUserId(userId);
  if (!sessionUser) {
    await recordAuthRegistrationFailure({
      ...LOG_BASE,
      attemptId,
      contactValue: profileEmail,
      userId,
      challengeId: parsed.data.challengeId,
      errorCode: 'server_error',
    });
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 });
  }

  // C-4 (2026-07-26): the messenger/phone allowlists never grant role anymore (envRole.ts);
  // reconciled so a resolver that only ever says "client" cannot demote an existing staff role.
  const envRole = resolveRoleFromEnv({
    phone: sessionUser.phone,
    telegramId: sessionUser.bindings.telegramId,
    maxId: sessionUser.bindings.maxId,
  });
  const reconciledRole = reconcileDbRoleWithEnvRole(sessionUser.role, envRole);
  if (sessionUser.role !== reconciledRole) {
    await deps.userProjection.updateRole(sessionUser.userId, reconciledRole);
    sessionUser = { ...sessionUser, role: reconciledRole };
  }

  await setSessionFromUser(sessionUser);

  await recordAuthRegistrationSuccess({
    ...LOG_BASE,
    attemptId,
    contactValue: profileEmail,
    userId: sessionUser.userId,
    challengeId: parsed.data.challengeId,
    isNewAccount: true,
  });

  return NextResponse.json({
    ok: true,
    redirectTo: getRedirectPathForRole(sessionUser.role),
  });
}

function errMsg(code: string): string {
  switch (code) {
    case 'invalid_code':
      return 'Неверный код';
    case 'expired_code':
      return 'Код истёк. Запросите новый.';
    case 'too_many_attempts':
      return 'Превышено число попыток.';
    default:
      return 'Ошибка подтверждения';
  }
}
