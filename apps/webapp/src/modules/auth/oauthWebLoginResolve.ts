import { env } from '@/config/env';
import { normalizeRuPhoneE164 } from '@/shared/phone/normalizeRuPhoneE164';
import type { OAuthBindingsPort } from '@/modules/auth/oauthBindingsPort';
import type { AccountOutcome } from '@/modules/auth/oauthYandexResolve';
import { requireOAuthUserResolvePort } from '@/modules/auth/oauthUserResolvePort';
import {
  addSparePhoneContactIfFree,
  resolveOAuthContactOwners,
} from '@/modules/auth/oauthContactResolve';
import {
  TrustedPatientPhoneSource,
  trustedPatientPhoneWriteAnchor,
} from '@/modules/platform-access/trustedPhonePolicy';

export type { AccountOutcome };

export type WebOAuthProvider = 'google' | 'apple';

/**
 * `contact_conflict` — IDENTITY_AND_MERGE_SCHEME.md §2a case 6: the provider's phone and email
 * each confirm a DIFFERENT existing account. Distinct from `email_ambiguous` (a data anomaly:
 * more than one active account already owns the same email) — case 6 is two otherwise-consistent
 * accounts, not a duplicate.
 */
export type WebOAuthResolveFailure =
  | 'no_identity'
  | 'email_ambiguous'
  | 'contact_conflict'
  | 'db_error';

/**
 * Резолв пользователя для Google / Apple web login (аналог Yandex по merge / привязке).
 * Если нет email и телефона, но есть стабильный `sub` — создаётся новая учётка только по OAuth (часто Apple).
 */
export async function resolveUserIdForWebOAuthLogin(
  oauthPort: OAuthBindingsPort,
  input: {
    provider: WebOAuthProvider;
    providerUserId: string;
    email: string | null;
    /** Merge по email и `email_verified_at` только если провайдер подтвердил владение email. */
    emailVerified: boolean;
    displayName: string | null;
    phone: string | null;
  },
): Promise<
  | { ok: true; userId: string; accountOutcome: AccountOutcome }
  | { ok: false; reason: WebOAuthResolveFailure }
> {
  const emailRaw = input.email?.trim() || null;
  const emailTrusted = Boolean(emailRaw && input.emailVerified);
  const emailNorm = emailTrusted && emailRaw ? emailRaw.toLowerCase() : null;
  const phoneRaw = input.phone?.trim() || null;
  const phoneNorm = phoneRaw ? normalizeRuPhoneE164(phoneRaw) : null;
  const sub = input.providerUserId.trim();
  if (!sub) {
    return { ok: false, reason: 'no_identity' };
  }

  const byOAuth = await oauthPort.findUserByOAuthId(input.provider, sub);
  if (byOAuth) {
    if (!env.DATABASE_URL?.trim()) {
      return { ok: true, userId: byOAuth.userId, accountOutcome: 'linked_existing' };
    }
    const db = requireOAuthUserResolvePort();
    const canonicalEarly = await db.resolveCanonicalUserId(byOAuth.userId);
    const uidEarly = canonicalEarly ?? byOAuth.userId;
    await db.applyVerifiedOAuthEmail(uidEarly, emailRaw, emailTrusted);
    return { ok: true, userId: uidEarly, accountOutcome: 'linked_existing' };
  }

  if (!env.DATABASE_URL?.trim()) {
    return { ok: false, reason: 'db_error' };
  }

  const db = requireOAuthUserResolvePort();

  try {
    let accountOutcome: AccountOutcome = 'linked_existing';

    // IDENTITY_AND_MERGE_SCHEME.md §2a cases 1-6: who (if anyone) already owns each contact, and
    // whether the two contacts disagree about which account that is (case 6, refused below).
    const owners = await resolveOAuthContactOwners(db, { phoneNorm, emailNorm });
    if (owners.kind === 'ambiguous') {
      return { ok: false, reason: 'email_ambiguous' };
    }
    if (owners.kind === 'conflict') {
      return { ok: false, reason: 'contact_conflict' };
    }

    let userId = owners.userId;

    if (!userId) {
      // Case 2: neither contact is registered anywhere -> new account.
      accountOutcome = 'created';
      // D29 (owner, 31.07): the provider's own profile name is no longer autofilled into the
      // account — the person types their name at registration; fall straight to email/phone/sub.
      const display = (emailRaw || phoneNorm || sub).slice(0, 500);
      const emailVerifiedAt = emailTrusted ? new Date() : null;
      userId = await db.createOAuthPlatformUser({
        phoneNorm,
        display,
        emailRaw,
        emailVerifiedAt,
      });
      if (phoneNorm) {
        trustedPatientPhoneWriteAnchor(TrustedPatientPhoneSource.OAuthWebLoginVerifiedPhone);
      }
    } else {
      // Case 4 ("email matches, phone differs"): add the provider's phone as a spare confirmed
      // contact of the matched account. Case 3/5 (email side) needs no extra call here — it
      // already happens below via applyVerifiedOAuthEmail (primary-if-none) + upsertOAuthBinding
      // (secondary, always).
      await addSparePhoneContactIfFree(db, { userId, phoneNorm, phoneOwner: owners.phoneOwner });
    }

    const bind = await db.upsertOAuthBinding({
      userId,
      provider: input.provider,
      providerUserId: sub,
      emailRaw,
    });
    if (!bind.inserted && bind.existingOwnerUserId) {
      const canonical = await db.resolveCanonicalUserId(bind.existingOwnerUserId);
      const uid = canonical ?? bind.existingOwnerUserId;
      await db.applyVerifiedOAuthEmail(uid, emailRaw, emailTrusted);
      return { ok: true, userId: uid, accountOutcome: 'linked_existing' };
    }

    const canonical = await db.resolveCanonicalUserId(userId);
    const uid = canonical ?? userId;
    await db.applyVerifiedOAuthEmail(uid, emailRaw, emailTrusted);
    return { ok: true, userId: uid, accountOutcome };
  } catch {
    return { ok: false, reason: 'db_error' };
  }
}
