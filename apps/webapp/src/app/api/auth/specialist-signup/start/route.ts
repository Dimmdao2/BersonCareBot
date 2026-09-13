import { stampBootstrapPrincipal } from '@/app-layer/principal/bootstrapPrincipal';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import {
  AUTH_CHANNEL_DISABLED_ERROR,
  isAuthChannelEnabled,
} from '@/modules/auth/authChannelPolicy';
import { randomUUID } from 'node:crypto';
import { env } from '@/config/env';
import { sendEmailSetupLinkViaIntegrator } from '@/infra/integrations/email/integratorEmailAdapter';
import { normalizeEmail, startEmailChallenge } from '@/modules/auth/emailAuth';
import { OTP_RESEND_COOLDOWN_SEC } from '@/modules/auth/otpConstants';
import { sendSpecialistSignupDuplicateNotice } from '@/modules/auth/specialistSignupDuplicateNotice';
import { isSignupStartRateLimitedByEmail } from '@/modules/auth/authRateLimits';
import { hashPin } from '@/modules/auth/pinHash';
import { getSpecialistSignupEnabled } from '@/modules/auth/specialistSignupRollout';
import { enterStaffSecuritySelfPrincipal } from '@/app-layer/principal/staffSecuritySelfPrincipal';
import {
  FIO_LATIN_REJECTED_MESSAGE,
  FIO_LATIN_REJECTED_TEXT,
  formatDoctorFio,
  isCyrillicFioInput,
  isCyrillicFioInputOrEmpty,
  isFioLatinRejection,
  normalizeFioPart,
} from '@/shared/lib/fio';
import { jsonError, jsonOk } from '@/shared/http/apiResponse';
import { validateOrganizationSlugCandidate } from '@/modules/clinic-directory/organizationSlug';
import { platformMailProfileForRecipientRole } from '@/modules/auth/mailProfile';
import { validateOrganizationName } from '@/shared/lib/organizationName';

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
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
  organizationTitle: z.string().trim().min(1),
  organizationSlug: z.string().max(512),
});

function isSlugUnavailableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.message.includes('slug_unavailable');
}

export async function POST(request: Request) {
  stampBootstrapPrincipal('api/auth/specialist-signup/start:POST', request);
  if (!(await isAuthChannelEnabled('email', undefined, 'transactional'))) {
    return jsonError(AUTH_CHANNEL_DISABLED_ERROR, {}, { status: 503 });
  }
  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError(
      'invalid_body',
      isFioLatinRejection(parsed) ? { message: FIO_LATIN_REJECTED_TEXT } : {},
      { status: 400 },
    );
  }

  const specialistSignupEnabled = await getSpecialistSignupEnabled();
  if (!specialistSignupEnabled) {
    return jsonError('specialist_signup_disabled', {}, { status: 423 });
  }

  const emailNorm = normalizeEmail(parsed.data.email);
  const lastName = normalizeFioPart(parsed.data.lastName);
  const firstName = normalizeFioPart(parsed.data.firstName);
  const patronymic = normalizeFioPart(parsed.data.patronymic);
  const organizationTitleResult = validateOrganizationName(parsed.data.organizationTitle);
  if (!organizationTitleResult.ok) {
    return jsonError(
      organizationTitleResult.code,
      { message: organizationTitleResult.message },
      { status: 400 },
    );
  }
  const organizationTitle = organizationTitleResult.value;
  const organizationSlug = validateOrganizationSlugCandidate(parsed.data.organizationSlug);
  if (!lastName || !firstName) {
    return jsonError('invalid_body', {}, { status: 400 });
  }
  if (!organizationSlug.ok) {
    return jsonError(organizationSlug.code, {}, { status: 400 });
  }
  const specialistFullName = formatDoctorFio({ lastName, firstName, patronymic });
  const deps = buildAppDeps();

  // Один старт на адрес в минуту — ДО любой проверки аккаунта. Четвёртый адверсарный аудит
  // показал: без этого двойная отправка внутри минуты отвечала по-разному на свободном адресе
  // (429 от кулдауна письма) и на занятом (нейтральный 200), то есть сама разница ответов
  // сообщала, есть ли аккаунт. Теперь вторая отправка одинакова для обоих.
  if (await isSignupStartRateLimitedByEmail(emailNorm)) {
    return jsonError('rate_limited', { retryAfterSeconds: OTP_RESEND_COOLDOWN_SEC }, { status: 429 });
  }

  // Занятость публичного адреса проверяется ЗДЕСЬ, до ветки «есть ли такой аккаунт». Раньше
  // занятый адрес почты отвечал успехом ещё до этой проверки, а свободный доходил до неё и мог
  // получить 409 slug_unavailable — по паре «занятый слаг + чужая почта» ответ различался и
  // выдавал наличие аккаунта (блокирующая находка четвёртого аудита).
  const directory = deps.clinicDirectory;
  if (directory) {
    const slugState = await directory.checkSlugAvailability(organizationSlug.slug);
    if (!slugState.ok) {
      return jsonError(slugState.code, {}, { status: slugState.code === 'slug_unavailable' ? 409 : 400 });
    }
  }

  const passwordHash = await hashPin(parsed.data.password);

  const reg = await deps.userPasswordCredentials.registerPendingSpecialistVerification({
    emailNormalized: emailNorm,
    passwordHash,
    lastName,
    firstName,
    patronymic,
  });

  if (!reg.ok) {
    const resend = await deps.userPasswordCredentials.tryResendRegistrationChallenge({
      emailNormalized: emailNorm,
      plainPassword: parsed.data.password,
    });
    if (!resend.ok) {
      // Решение владельца 13.09: «форма всегда отвечает "мы отправили код"». Раньше здесь стоял
      // 409 duplicate_email — по нему любой желающий проверял, заведён ли на адрес аккаунт, просто
      // подставляя чужие почты в форму регистрации. Теперь ответ не отличается от успешного
      // старта, а настоящему владельцу адреса уходит письмо о попытке со ссылкой восстановления.
      // Кода при этом не создаётся: challengeId случайный, подтвердить по нему нечего.
      await sendSpecialistSignupDuplicateNotice(
        emailNorm,
        env.APP_BASE_URL,
        sendEmailSetupLinkViaIntegrator,
      );
      return jsonOk({
        challengeId: randomUUID(),
        retryAfterSeconds: OTP_RESEND_COOLDOWN_SEC,
      });
    }
    const challenge = await startEmailChallenge(
      resend.userId,
      emailNorm,
      'specialist_signup',
      platformMailProfileForRecipientRole('doctor'),
    );
    if (!challenge.ok) {
      return jsonError(
        challenge.code,
        { retryAfterSeconds: challenge.retryAfterSeconds },
        { status: challenge.code === 'rate_limited' ? 429 : 400 },
      );
    }
    enterStaffSecuritySelfPrincipal(resend.userId, 'api/auth/specialist-signup/start:resend-self');
    let replaced: boolean;
    try {
      replaced = await deps.organizationProvisioning.replacePendingSpecialistSignupChallenge({
        challengeId: challenge.challengeId,
        organizationSlug: organizationSlug.slug,
      });
    } catch (error) {
      if (isSlugUnavailableError(error)) {
        return jsonError('slug_unavailable', {}, { status: 409 });
      }
      throw error;
    }
    if (!replaced) {
      return jsonError('signup_recovery_required', {}, { status: 409 });
    }
    return jsonOk({
      challengeId: challenge.challengeId,
      retryAfterSeconds: challenge.retryAfterSeconds,
    });
  }

  const challenge = await startEmailChallenge(
    reg.userId,
    emailNorm,
    'specialist_signup',
    platformMailProfileForRecipientRole('doctor'),
  );
  if (!challenge.ok) {
    await deps.userPasswordCredentials.deleteUnverifiedEmailPasswordRegistration(reg.userId);
    return jsonError(
      challenge.code,
      { retryAfterSeconds: challenge.retryAfterSeconds },
      { status: challenge.code === 'rate_limited' ? 429 : 400 },
    );
  }

  try {
    enterStaffSecuritySelfPrincipal(reg.userId, 'api/auth/specialist-signup/start:new-self');
    await deps.organizationProvisioning.createSpecialistSignupIntent({
      challengeId: challenge.challengeId,
      emailNormalized: emailNorm,
      organizationTitle,
      organizationSlug: organizationSlug.slug,
      specialistFullName,
    });
  } catch (error) {
    await deps.userPasswordCredentials.deleteUnverifiedEmailPasswordRegistration(reg.userId);
    if (isSlugUnavailableError(error)) {
      return jsonError('slug_unavailable', {}, { status: 409 });
    }
    return jsonError('server_error', {}, { status: 500 });
  }

  return jsonOk({
    challengeId: challenge.challengeId,
    retryAfterSeconds: challenge.retryAfterSeconds,
  });
}
