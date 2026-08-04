import { stampBootstrapPrincipal } from '@/app-layer/principal/bootstrapPrincipal';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import {
  AUTH_CHANNEL_DISABLED_ERROR,
  isAuthChannelEnabled,
} from '@/modules/auth/authChannelPolicy';
import { normalizeEmail, startEmailChallenge } from '@/modules/auth/emailAuth';
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
  organizationTitle: z.string().trim().min(1).max(200),
  organizationSlug: z.string().max(512),
});

function isSlugUnavailableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.message.includes('slug_unavailable');
}

export async function POST(request: Request) {
  stampBootstrapPrincipal('api/auth/specialist-signup/start:POST', request);
  if (!(await isAuthChannelEnabled('email'))) {
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
  const organizationTitle = parsed.data.organizationTitle.trim();
  const organizationSlug = validateOrganizationSlugCandidate(parsed.data.organizationSlug);
  if (!lastName || !firstName) {
    return jsonError('invalid_body', {}, { status: 400 });
  }
  if (!organizationSlug.ok) {
    return jsonError(organizationSlug.code, {}, { status: 400 });
  }
  const specialistFullName = formatDoctorFio({ lastName, firstName, patronymic });
  const deps = buildAppDeps();
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
      return jsonError('duplicate_email', {}, { status: 409 });
    }
    const challenge = await startEmailChallenge(resend.userId, emailNorm, 'specialist_signup');
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

  const challenge = await startEmailChallenge(reg.userId, emailNorm, 'specialist_signup');
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
