import { resolveOrCreateUserByPhone } from '@/app-layer/platform-user/resolveOrCreateUserByPhone';
import { normalizeEmail } from '@/modules/auth/emailNormalize';
import { canAccessPatient } from '@/modules/roles/service';
import type { UserRole } from '@/shared/types/session';

type PublicBookingIdentityDeps = {
  auth: { getCurrentSession: () => Promise<{ user: { userId: string; role: UserRole } } | null> };
  userByPhone: { getVerifiedEmailForUser: (userId: string) => Promise<string | null> };
};

export type PublicBookingPayerProof =
  | { kind: 'session' }
  | { kind: 'verified_email_session'; submittedEmail: string | undefined }
  | { kind: 'sms'; contactPhone: string; contactName: string };

/** The single identity boundary before a public booking may reach the payment door. */
export async function identifyPublicBookingPayer(
  deps: PublicBookingIdentityDeps,
  proof: PublicBookingPayerProof,
): Promise<
  | { ok: true; platformUserId: string }
  | { ok: false; error: 'not_authenticated' | 'email_mismatch' | 'user_resolve_failed' | 'invalid_phone' }
> {
  if (proof.kind === 'sms') {
    const resolved = await resolveOrCreateUserByPhone(proof.contactPhone, proof.contactName, true);
    if (!resolved.ok) {
      return { ok: false, error: resolved.error === 'invalid_phone' ? 'invalid_phone' : 'user_resolve_failed' };
    }
    return { ok: true, platformUserId: resolved.userId };
  }

  const session = await deps.auth.getCurrentSession().catch(() => null);
  if (!session || !canAccessPatient(session.user.role)) return { ok: false, error: 'not_authenticated' };
  if (proof.kind === 'verified_email_session') {
    const submittedEmail = normalizeEmail(proof.submittedEmail ?? '');
    const verifiedEmail = await deps.userByPhone.getVerifiedEmailForUser(session.user.userId);
    if (!submittedEmail || !verifiedEmail || normalizeEmail(verifiedEmail) !== submittedEmail) {
      return { ok: false, error: 'email_mismatch' };
    }
  }
  return { ok: true, platformUserId: session.user.userId };
}
