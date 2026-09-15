import { claimVerifiedEmail } from '@/infra/repos/pgEmailAuth';
import { findTrustedCanonicalUserIdByPhoneFromPool } from '@/infra/repos/pgCanonicalPlatformUser';
import { normalizePhone } from '@/modules/auth/phoneNormalize';
import { isValidPhoneE164 } from '@/modules/auth/phoneValidation';
import type { VerifiedLeadApplicant } from '@/modules/leads/types';

type ResolveVerifiedLeadApplicantDeps = {
  findTrustedPhoneOwner: typeof findTrustedCanonicalUserIdByPhoneFromPool;
  claimEmail: typeof claimVerifiedEmail;
};

/**
 * Continues the existing public email-OTP seam after `confirmPublicEmailOtpChallenge` returned the
 * verified account. If the submitted, unverified phone already belongs to another canonical
 * account as a confirmed contact, the existing email-bind merger makes that phone account the
 * canonical identity and moves the newly verified email onto it.
 */
export async function resolveVerifiedLeadApplicant(
  input: {
    organizationId: string;
    verifiedEmailUserId: string;
    emailNormalized: string;
    submittedPhone?: string | null;
    proof?: VerifiedLeadApplicant['proof'];
  },
  dependencies?: ResolveVerifiedLeadApplicantDeps,
): Promise<VerifiedLeadApplicant> {
  const deps =
    dependencies ??
    ({
      findTrustedPhoneOwner: findTrustedCanonicalUserIdByPhoneFromPool,
      claimEmail: claimVerifiedEmail,
    } satisfies ResolveVerifiedLeadApplicantDeps);
  const phone = input.submittedPhone ? normalizePhone(input.submittedPhone) : null;
  if (phone && !isValidPhoneE164(phone)) throw new Error('invalid_lead_phone');
  if (!phone) {
    return {
      platformUserId: input.verifiedEmailUserId,
      emailNormalized: input.emailNormalized,
      proof: input.proof ?? 'email_otp',
    } as VerifiedLeadApplicant;
  }

  const phoneOwnerId = await deps.findTrustedPhoneOwner(phone);
  if (!phoneOwnerId || phoneOwnerId === input.verifiedEmailUserId) {
    return {
      platformUserId: input.verifiedEmailUserId,
      emailNormalized: input.emailNormalized,
      proof: input.proof ?? 'email_otp',
    } as VerifiedLeadApplicant;
  }
  const claimed = await deps.claimEmail(phoneOwnerId, input.emailNormalized, {
    profileBindOrganizationId: input.organizationId,
  });
  if (!claimed.ok) throw new Error('lead_identity_merge_conflict');
  return {
    platformUserId: phoneOwnerId,
    emailNormalized: input.emailNormalized,
    proof: input.proof ?? 'email_otp',
  } as VerifiedLeadApplicant;
}
