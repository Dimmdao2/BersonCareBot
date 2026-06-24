import { env } from "@/config/env";
import { normalizeRuPhoneE164 } from "@/shared/phone/normalizeRuPhoneE164";
import type { OAuthBindingsPort } from "@/modules/auth/oauthBindingsPort";
import type { AccountOutcome } from "@/modules/auth/oauthYandexResolve";
import { requireOAuthUserResolvePort } from "@/modules/auth/oauthUserResolvePort";
import {
  TrustedPatientPhoneSource,
  trustedPatientPhoneWriteAnchor,
} from "@/modules/platform-access/trustedPhonePolicy";

export type { AccountOutcome };

export type WebOAuthProvider = "google" | "apple";

export type WebOAuthResolveFailure = "no_identity" | "email_ambiguous" | "db_error";

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
  { ok: true; userId: string; accountOutcome: AccountOutcome } | { ok: false; reason: WebOAuthResolveFailure }
> {
  const emailRaw = input.email?.trim() || null;
  const emailTrusted = Boolean(emailRaw && input.emailVerified);
  const emailNorm = emailTrusted && emailRaw ? emailRaw.toLowerCase() : null;
  const phoneRaw = input.phone?.trim() || null;
  const phoneNorm = phoneRaw ? normalizeRuPhoneE164(phoneRaw) : null;
  const sub = input.providerUserId.trim();
  if (!sub) {
    return { ok: false, reason: "no_identity" };
  }

  const byOAuth = await oauthPort.findUserByOAuthId(input.provider, sub);
  if (byOAuth) {
    if (!env.DATABASE_URL?.trim()) {
      return { ok: true, userId: byOAuth.userId, accountOutcome: "linked_existing" };
    }
    const db = requireOAuthUserResolvePort();
    const canonicalEarly = await db.resolveCanonicalUserId(byOAuth.userId);
    const uidEarly = canonicalEarly ?? byOAuth.userId;
    await db.applyVerifiedOAuthEmail(uidEarly, emailRaw, emailTrusted);
    return { ok: true, userId: uidEarly, accountOutcome: "linked_existing" };
  }

  if (!env.DATABASE_URL?.trim()) {
    return { ok: false, reason: "db_error" };
  }

  const db = requireOAuthUserResolvePort();

  try {
    let userId: string | null = null;
    let accountOutcome: AccountOutcome = "linked_existing";

    if (phoneNorm) {
      userId = await db.findCanonicalUserIdByPhone(phoneNorm);
    }

    if (!userId && emailNorm) {
      const byEmail = await db.findUserIdsByVerifiedEmail(emailNorm);
      if (byEmail.length > 1) {
        return { ok: false, reason: "email_ambiguous" };
      }
      if (byEmail.length === 1) {
        userId = byEmail[0]!;
      }
    }

    // The OAuth email is verified (emailNorm is only set when emailTrusted), but the active account
    // that already owns this email_normalized may have it UNVERIFIED (e.g. created via phone/booking).
    // `uq_platform_users_email_normalized_active` covers it regardless of verification, so link to
    // that account instead of INSERTing a duplicate (the prod crash: db_error / unique violation).
    if (!userId && emailNorm) {
      const byAnyEmail = await db.findActiveUserIdsByEmail(emailNorm);
      if (byAnyEmail.length > 1) {
        return { ok: false, reason: "email_ambiguous" };
      }
      if (byAnyEmail.length === 1) {
        userId = byAnyEmail[0]!;
      }
    }

    if (!userId) {
      accountOutcome = "created";
      const display = (input.displayName?.trim() || emailRaw || phoneNorm || sub).slice(0, 500);
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
      return { ok: true, userId: uid, accountOutcome: "linked_existing" };
    }

    const canonical = await db.resolveCanonicalUserId(userId);
    const uid = canonical ?? userId;
    await db.applyVerifiedOAuthEmail(uid, emailRaw, emailTrusted);
    return { ok: true, userId: uid, accountOutcome };
  } catch {
    return { ok: false, reason: "db_error" };
  }
}
