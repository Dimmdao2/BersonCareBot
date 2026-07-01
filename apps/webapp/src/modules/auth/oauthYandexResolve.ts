import { env } from "@/config/env";
import { normalizeRuPhoneE164 } from "@/shared/phone/normalizeRuPhoneE164";
import type { OAuthBindingsPort } from "@/modules/auth/oauthBindingsPort";
import { requireOAuthUserResolvePort } from "@/modules/auth/oauthUserResolvePort";
import {
  TrustedPatientPhoneSource,
  trustedPatientPhoneWriteAnchor,
} from "@/modules/platform-access/trustedPhonePolicy";

export type AccountOutcome = "created" | "linked_existing";

export type YandexOAuthResolveFailure =
  | "no_identity"
  | "email_ambiguous"
  | "db_error";

/**
 * Резолвит пользователя для Yandex OAuth:
 * 1. Существующая OAuth-привязка по yandexId
 * 2. Merge по phone_normalized (если Яндекс вернул телефон)
 * 3. Fallback merge по verified email
 * 4. Создание нового пользователя
 * Если нет ни телефона, ни email — возвращает `no_identity`.
 */
export async function resolveUserIdForYandexOAuth(
  oauthPort: OAuthBindingsPort,
  input: { yandexId: string; email: string | null; displayName: string | null; phone: string | null },
): Promise<
  { ok: true; userId: string; accountOutcome: AccountOutcome } | { ok: false; reason: YandexOAuthResolveFailure }
> {
  const emailRaw = input.email?.trim() || null;
  const emailNorm = emailRaw ? emailRaw.toLowerCase() : null;
  const phoneRaw = input.phone?.trim() || null;
  const phoneNorm = phoneRaw ? normalizeRuPhoneE164(phoneRaw) : null;

  if (!phoneNorm && !emailNorm) {
    return { ok: false, reason: "no_identity" };
  }

  const byOAuth = await oauthPort.findUserByOAuthId("yandex", input.yandexId);
  if (byOAuth) {
    if (!env.DATABASE_URL?.trim()) {
      return { ok: true, userId: byOAuth.userId, accountOutcome: "linked_existing" };
    }
    const db = requireOAuthUserResolvePort();
    const canonicalEarly = await db.resolveCanonicalUserId(byOAuth.userId);
    const uidEarly = canonicalEarly ?? byOAuth.userId;
    await db.applyVerifiedOAuthEmail(uidEarly, emailRaw, Boolean(emailRaw));
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

    // Yandex treats its account email as verified, so the INSERT sets email_normalized. An existing
    // active account owning this email_normalized but with it UNVERIFIED (phone/booking-created) is
    // missed by findUserIdsByVerifiedEmail → INSERT duplicate-key crash. Link to it instead.
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
      const display = (input.displayName?.trim() || emailRaw || phoneNorm || "").slice(0, 500);
      const emailVerifiedAt = emailRaw ? new Date() : null;
      userId = await db.createOAuthPlatformUser({
        phoneNorm,
        display,
        emailRaw,
        emailVerifiedAt,
      });
      if (phoneNorm) {
        trustedPatientPhoneWriteAnchor(TrustedPatientPhoneSource.OAuthYandexVerifiedPhone);
      }
    }

    const bind = await db.upsertOAuthBinding({
      userId,
      provider: "yandex",
      providerUserId: input.yandexId,
      emailRaw,
    });
    if (!bind.inserted && bind.existingOwnerUserId) {
      const canonical = await db.resolveCanonicalUserId(bind.existingOwnerUserId);
      const uid = canonical ?? bind.existingOwnerUserId;
      await db.applyVerifiedOAuthEmail(uid, emailRaw, Boolean(emailRaw));
      return { ok: true, userId: uid, accountOutcome: "linked_existing" };
    }

    const canonical = await db.resolveCanonicalUserId(userId);
    const uid = canonical ?? userId;
    await db.applyVerifiedOAuthEmail(uid, emailRaw, Boolean(emailRaw));
    return { ok: true, userId: uid, accountOutcome };
  } catch {
    return { ok: false, reason: "db_error" };
  }
}
