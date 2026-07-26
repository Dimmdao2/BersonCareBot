import { createHash, randomInt, randomUUID } from "node:crypto";
import { env, integratorWebhookSecret } from "@/config/env";
import { OTP_LOCK_DURATION_SEC, OTP_MAX_VERIFY_ATTEMPTS, OTP_RESEND_COOLDOWN_SEC } from "@/modules/auth/otpConstants";
import type { EmailAuthDbPort } from "@/modules/auth/emailAuthPort";
import { sendEmailAuthCode } from "@/modules/auth/emailSendPort";

const CHALLENGE_TTL_SEC = 600; // 10 min

let emailAuthDbPort: EmailAuthDbPort | undefined;

/** Composition root: bind DB port once (see `ensureAuthModulePortsBound`). */
export function bindEmailAuthDbPort(port: EmailAuthDbPort): void {
  emailAuthDbPort = port;
}

function requireEmailAuthDb(): EmailAuthDbPort {
  if (!emailAuthDbPort) {
    throw new Error("EmailAuthDbPort is not bound. Call ensureAuthModulePortsBound() from buildAppDeps.");
  }
  return emailAuthDbPort;
}

/** Без БД (тесты): хранение челленджей в памяти процесса. */
const memEmailChallenges = new Map<
  string,
  { userId: string; email: string; code: string; expiresAt: number; attempts: number }
>();

/** In-memory владельцы email (только без DATABASE_URL). */
const memEmailOwnerByNormalized = new Map<string, string>();

/** Сброс in-memory состояния между тестами. */
export function resetEmailAuthMemStateForTests(): void {
  memEmailChallenges.clear();
  memEmailOwnerByNormalized.clear();
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function emailCodePepper(): string {
  return integratorWebhookSecret() || env.SESSION_COOKIE_SECRET || "test-email-pepper";
}

/** Shared hash contract for every email challenge caller; raw OTPs never enter SQL. */
export function hashEmailChallengeCode(code: string): string {
  return createHash("sha256").update(`${code}:${emailCodePepper()}`).digest("hex");
}

function generateEmailCode(): string {
  // CSPRNG: Math.random() is predictable and unsuitable for auth codes.
  return String(randomInt(100000, 1000000));
}

/**
 * Opt-in local-dev aid: log OTP codes + tolerate send failure.
 * DOUBLE-gated: requires DEV_EMAIL_OTP_DEBUG=true AND NODE_ENV=development,
 * so it can never activate on test/prod hosts even if the flag leaks there.
 */
function isEmailOtpDebugEnabled(): boolean {
  return env.DEV_EMAIL_OTP_DEBUG && env.NODE_ENV === "development";
}

export type PendingEmailChallenge = { email: string; expiresAt: string } | null;

/**
 * Returns the latest unexpired pending email challenge for a user (for display in admin UI).
 * Returns null if none exists.
 */
export async function getPendingEmailChallenge(userId: string): Promise<PendingEmailChallenge> {
  if (!env.DATABASE_URL) {
    const now = Math.floor(Date.now() / 1000);
    let best: { email: string; expiresAt: number } | null = null;
    for (const row of memEmailChallenges.values()) {
      if (row.userId !== userId) continue;
      if (row.expiresAt <= now) continue;
      if (!best || row.expiresAt > best.expiresAt) {
        best = { email: row.email, expiresAt: row.expiresAt };
      }
    }
    if (!best) return null;
    return { email: best.email, expiresAt: new Date(best.expiresAt * 1000).toISOString() };
  }

  const db = requireEmailAuthDb();
  const now = Math.floor(Date.now() / 1000);
  const row = await db.findLatestPendingEmailChallengeForUser(userId, now);
  if (!row) return null;
  return { email: row.email, expiresAt: new Date(Number(row.expires_at) * 1000).toISOString() };
}

export type EmailStartResult =
  | { ok: true; challengeId: string; retryAfterSeconds?: number }
  | { ok: false; code: "invalid_email" | "rate_limited" | "too_many_attempts" | "email_send_failed"; retryAfterSeconds?: number };

export type EmailConfirmResult =
  | { ok: true }
  | {
      ok: false;
      code: "invalid_code" | "expired_code" | "too_many_attempts" | "email_conflict";
      retryAfterSeconds?: number;
    };

export type ConfirmEmailOptions = {
  /** Server-resolved organization scope; enables safe merge with an existing client account. */
  profileBindOrganizationId?: string;
};

async function verifyChallengeCodeRow(params: {
  userId: string;
  challengeId: string;
  code: string;
  row: { id: string; code_hash: string; expires_at: string; attempts: string };
  onSuccess: () => Promise<EmailConfirmResult>;
}): Promise<EmailConfirmResult> {
  const now = Math.floor(Date.now() / 1000);
  const db = requireEmailAuthDb();
  const expiresAt = Number(params.row.expires_at);
  if (expiresAt <= now) {
    await db.deleteEmailChallengeById(params.challengeId);
    return { ok: false, code: "expired_code" };
  }

  const attempts = Number(params.row.attempts);
  if (attempts >= OTP_MAX_VERIFY_ATTEMPTS) {
    return { ok: false, code: "too_many_attempts", retryAfterSeconds: OTP_LOCK_DURATION_SEC };
  }

  const expectedHash = hashEmailChallengeCode(params.code);
  if (expectedHash !== params.row.code_hash) {
    // Atomic: the database computes `attempts + 1` itself inside a row-locked SECURITY DEFINER
    // function (0247), never the caller. Two concurrent wrong-code confirms against the SAME
    // challenge each get their own correctly-incremented count -- Postgres serializes UPDATEs to
    // the same row, so the second writer's `+ 1` always applies to the first writer's already
    // -committed value, never to a value read before it. (Pattern: 0232_email_otp_atomic_consume.sql.)
    const next = await db.incrementEmailChallengeAttempts(params.challengeId);
    if (next == null) {
      // The challenge vanished between the earlier read and this increment (e.g. a concurrent
      // resend or expiry cleanup) -- treat exactly like "no such challenge", never "invalid code"
      // against a challenge that no longer exists.
      return { ok: false, code: "expired_code" };
    }
    if (next >= OTP_MAX_VERIFY_ATTEMPTS) {
      await db.deleteEmailChallengeById(params.challengeId);
      return { ok: false, code: "too_many_attempts", retryAfterSeconds: OTP_LOCK_DURATION_SEC };
    }
    return { ok: false, code: "invalid_code" };
  }

  return params.onSuccess();
}

export async function startEmailChallenge(userId: string, emailRaw: string): Promise<EmailStartResult> {
  const email = normalizeEmail(emailRaw);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, code: "invalid_email" };
  }

  if (!env.DATABASE_URL) {
    const code = generateEmailCode();
    const challengeId = randomUUID();
    const expiresAt = Math.floor(Date.now() / 1000) + CHALLENGE_TTL_SEC;
    memEmailChallenges.set(challengeId, { userId, email, code, expiresAt, attempts: 0 });
    const sent = await sendEmailAuthCode(email, code);
    if (!sent.ok) {
      memEmailChallenges.delete(challengeId);
      return { ok: false, code: "email_send_failed" };
    }
    return { ok: true, challengeId, retryAfterSeconds: OTP_RESEND_COOLDOWN_SEC };
  }

  const db = requireEmailAuthDb();
  const now = Date.now();
  const lastSent = await db.findEmailSendCooldown(userId, email);
  if (lastSent) {
    const delta = Math.floor((now - new Date(lastSent).getTime()) / 1000);
    if (delta < OTP_RESEND_COOLDOWN_SEC) {
      return {
        ok: false,
        code: "rate_limited",
        retryAfterSeconds: OTP_RESEND_COOLDOWN_SEC - delta,
      };
    }
  }

  await db.deleteEmailChallengesForUser(userId);

  const code = generateEmailCode();
  const codeHash = hashEmailChallengeCode(code);
  const expiresAt = Math.floor(Date.now() / 1000) + CHALLENGE_TTL_SEC;

  // Opt-in dev aid (DEV_EMAIL_OTP_DEBUG=true AND NODE_ENV=development only):
  // log the OTP code to server console for local testing without the integrator.
  if (isEmailOtpDebugEnabled()) {
    console.log(`[DEV] Email OTP code for ${email}: ${code}`);
  }

  const challengeId = await db.insertEmailChallenge({ userId, email, codeHash, expiresAt });
  const sent = await sendEmailAuthCode(email, code);
  if (!sent.ok) {
    if (isEmailOtpDebugEnabled()) {
      // Opt-in dev aid: tolerate send failure (no integrator running). Code was logged above.
      console.warn(`[DEV] Email send failed for ${email}: ${sent.error}. Use the code from the log.`);
    } else {
      await db.deleteEmailChallengeById(challengeId);
      return { ok: false, code: "email_send_failed" };
    }
  }
  await db.upsertEmailSendCooldown(userId, email);

  return { ok: true, challengeId, retryAfterSeconds: OTP_RESEND_COOLDOWN_SEC };
}

export async function confirmEmailChallenge(
  userId: string,
  challengeId: string,
  codeRaw: string,
  options?: ConfirmEmailOptions,
): Promise<EmailConfirmResult> {
  const code = codeRaw.trim();
  if (!code) {
    return { ok: false, code: "invalid_code" };
  }

  if (!env.DATABASE_URL) {
    const row = memEmailChallenges.get(challengeId);
    if (!row || row.userId !== userId) {
      return { ok: false, code: "expired_code" };
    }
    if (row.expiresAt <= Math.floor(Date.now() / 1000)) {
      memEmailChallenges.delete(challengeId);
      return { ok: false, code: "expired_code" };
    }
    if (row.code !== code) {
      row.attempts += 1;
      if (row.attempts >= OTP_MAX_VERIFY_ATTEMPTS) {
        memEmailChallenges.delete(challengeId);
        return { ok: false, code: "too_many_attempts", retryAfterSeconds: OTP_LOCK_DURATION_SEC };
      }
      return { ok: false, code: "invalid_code" };
    }
    const normalized = normalizeEmail(row.email);
    const owner = memEmailOwnerByNormalized.get(normalized);
    if (owner && owner !== userId) {
      memEmailChallenges.delete(challengeId);
      return { ok: false, code: "email_conflict" };
    }
    for (const [emailNorm, uid] of memEmailOwnerByNormalized) {
      if (uid === userId) memEmailOwnerByNormalized.delete(emailNorm);
    }
    memEmailOwnerByNormalized.set(normalized, userId);
    memEmailChallenges.delete(challengeId);
    return { ok: true };
  }

  const db = requireEmailAuthDb();
  const row = await db.findEmailChallengeForConfirm(challengeId, userId);
  if (!row) {
    return { ok: false, code: "expired_code" };
  }

  return verifyChallengeCodeRow({
    userId,
    challengeId,
    code,
    row,
    onSuccess: async () => {
      try {
        const claimed = await db.claimVerifiedEmail(userId, row.email, options);
        if (!claimed.ok) {
          await db.deleteEmailChallengesForUser(userId);
          return { ok: false, code: "email_conflict" };
        }
      } catch (err: unknown) {
        const pgCode = typeof err === "object" && err !== null ? String((err as { code?: unknown }).code ?? "") : "";
        if (pgCode === "23505") {
          await db.deleteEmailChallengesForUser(userId);
          return { ok: false, code: "email_conflict" };
        }
        throw err;
      }
      await db.deleteEmailChallengesForUser(userId);
      return { ok: true };
    },
  });
}

export async function consumeEmailChallengeCode(
  userId: string,
  challengeId: string,
  codeRaw: string,
): Promise<EmailConfirmResult> {
  const code = codeRaw.trim();
  if (!code) {
    return { ok: false, code: "invalid_code" };
  }

  if (!env.DATABASE_URL) {
    const row = memEmailChallenges.get(challengeId);
    if (!row || row.userId !== userId) {
      return { ok: false, code: "expired_code" };
    }
    if (row.expiresAt <= Math.floor(Date.now() / 1000)) {
      memEmailChallenges.delete(challengeId);
      return { ok: false, code: "expired_code" };
    }
    if (row.code !== code) {
      row.attempts += 1;
      if (row.attempts >= OTP_MAX_VERIFY_ATTEMPTS) {
        memEmailChallenges.delete(challengeId);
        return { ok: false, code: "too_many_attempts", retryAfterSeconds: OTP_LOCK_DURATION_SEC };
      }
      return { ok: false, code: "invalid_code" };
    }
    memEmailChallenges.delete(challengeId);
    return { ok: true };
  }

  const db = requireEmailAuthDb();
  const row = await db.findEmailChallengeForConsume(challengeId, userId);
  if (!row) {
    return { ok: false, code: "expired_code" };
  }

  return verifyChallengeCodeRow({
    userId,
    challengeId,
    code,
    row,
    onSuccess: async () => {
      await db.deleteEmailChallengesForUser(userId);
      return { ok: true };
    },
  });
}

/**
 * Patient-facing confirm for admin-initiated email change:
 * verifies the latest unexpired challenge code and, on success, calls verifyUserEmail
 * to actually switch the email on the account (same semantics as confirmEmailChallenge
 * but without requiring the challengeId — the patient only knows the code).
 */
export async function confirmLatestEmailChallengeCodeForUser(
  userId: string,
  codeRaw: string,
  options?: ConfirmEmailOptions,
): Promise<EmailConfirmResult> {
  const code = codeRaw.trim();
  if (!code) {
    return { ok: false, code: "invalid_code" };
  }

  if (!env.DATABASE_URL) {
    const now = Math.floor(Date.now() / 1000);
    let bestId: string | null = null;
    let best: { userId: string; email: string; code: string; expiresAt: number; attempts: number } | null = null;
    for (const [cid, row] of memEmailChallenges) {
      if (row.userId !== userId) continue;
      if (row.expiresAt <= now) {
        memEmailChallenges.delete(cid);
        continue;
      }
      if (!best || row.expiresAt > best.expiresAt) {
        best = row;
        bestId = cid;
      }
    }
    if (!bestId || !best) {
      return { ok: false, code: "expired_code" };
    }
    if (best.code !== code) {
      best.attempts += 1;
      if (best.attempts >= OTP_MAX_VERIFY_ATTEMPTS) {
        memEmailChallenges.delete(bestId);
        return { ok: false, code: "too_many_attempts", retryAfterSeconds: OTP_LOCK_DURATION_SEC };
      }
      return { ok: false, code: "invalid_code" };
    }
    const normalized = normalizeEmail(best.email);
    const owner = memEmailOwnerByNormalized.get(normalized);
    if (owner && owner !== userId) {
      memEmailChallenges.delete(bestId);
      return { ok: false, code: "email_conflict" };
    }
    for (const [emailNorm, uid] of memEmailOwnerByNormalized) {
      if (uid === userId) memEmailOwnerByNormalized.delete(emailNorm);
    }
    memEmailOwnerByNormalized.set(normalized, userId);
    memEmailChallenges.delete(bestId);
    return { ok: true };
  }

  const db = requireEmailAuthDb();
  const now = Math.floor(Date.now() / 1000);
  const row = await db.findLatestPendingEmailChallengeForUser(userId, now);
  if (!row) {
    return { ok: false, code: "expired_code" };
  }

  return verifyChallengeCodeRow({
    userId,
    challengeId: row.id,
    code,
    row,
    onSuccess: async () => {
      try {
        const claimed = await db.claimVerifiedEmail(userId, row.email, options);
        if (!claimed.ok) {
          await db.deleteEmailChallengesForUser(userId);
          return { ok: false, code: "email_conflict" };
        }
      } catch (err: unknown) {
        const pgCode = typeof err === "object" && err !== null ? String((err as { code?: unknown }).code ?? "") : "";
        if (pgCode === "23505") {
          await db.deleteEmailChallengesForUser(userId);
          return { ok: false, code: "email_conflict" };
        }
        throw err;
      }
      await db.deleteEmailChallengesForUser(userId);
      return { ok: true };
    },
  });
}

export async function consumeLatestEmailChallengeCodeForUser(
  userId: string,
  codeRaw: string,
): Promise<EmailConfirmResult> {
  const code = codeRaw.trim();
  if (!code) {
    return { ok: false, code: "invalid_code" };
  }

  if (!env.DATABASE_URL) {
    const now = Math.floor(Date.now() / 1000);
    let bestId: string | null = null;
    let best: { userId: string; email: string; code: string; expiresAt: number; attempts: number } | null = null;
    for (const [cid, row] of memEmailChallenges) {
      if (row.userId !== userId) continue;
      if (row.expiresAt <= now) {
        memEmailChallenges.delete(cid);
        continue;
      }
      if (!best || row.expiresAt > best.expiresAt) {
        best = row;
        bestId = cid;
      }
    }
    if (!bestId || !best) {
      return { ok: false, code: "expired_code" };
    }
    if (best.code !== code) {
      best.attempts += 1;
      if (best.attempts >= OTP_MAX_VERIFY_ATTEMPTS) {
        memEmailChallenges.delete(bestId);
        return { ok: false, code: "too_many_attempts", retryAfterSeconds: OTP_LOCK_DURATION_SEC };
      }
      return { ok: false, code: "invalid_code" };
    }
    memEmailChallenges.delete(bestId);
    return { ok: true };
  }

  const db = requireEmailAuthDb();
  const now = Math.floor(Date.now() / 1000);
  const row = await db.findLatestEmailChallengeForUser(userId, now);
  if (!row) {
    return { ok: false, code: "expired_code" };
  }

  return verifyChallengeCodeRow({
    userId,
    challengeId: row.id,
    code,
    row,
    onSuccess: async () => {
      await db.deleteEmailChallengesForUser(userId);
      return { ok: true };
    },
  });
}
