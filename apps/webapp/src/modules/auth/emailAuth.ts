import { createHash, randomInt, randomUUID } from 'node:crypto';
import { env, integratorWebhookSecret } from '@/config/env';
import { normalizeEmail } from '@/modules/auth/emailNormalize';
import {
  OTP_LOCKOUT_BASE_SEC,
  OTP_MAX_VERIFY_ATTEMPTS,
  OTP_RESEND_COOLDOWN_SEC,
  nextOtpLockoutDurationSeconds,
} from '@/modules/auth/otpConstants';
import type { EmailAuthDbPort, EmailChallengePurpose } from '@/modules/auth/emailAuthPort';
import { sendEmailAuthCode } from '@/modules/auth/emailSendPort';

export type { EmailChallengePurpose } from '@/modules/auth/emailAuthPort';

// 10 -> 30 минут (владелец 28.07: код на yandex.ru приходил уже мёртвым).
// Измерено по заголовкам настоящего письма: наше приложение отдало письмо релею в 16:06:24, а Яндекс получил
// его в 16:22:29 — шестнадцать минут письмо ждало ВНЕ нас, между почтой хостинга и Яндексом. При десятиминутном
// сроке код физически не мог дожить до ящика. Почта — канал без гарантии времени доставки, поэтому срок жизни
// кода обязан покрывать типичную задержку, а не идеальный случай (у gmail то же письмо приходит мгновенно).
// 30 минут — верх обычного диапазона для кодов, приходящих почтой; для SMS такой запас не нужен и там
// остаются свои 10 минут.
// ⚠️ Это временное значение в коде. По правилу владельца «все сроки настраиваются в кабинете, а дефолты берём
// из исследований» его место — настройка с этим числом как значением по умолчанию (§28.5).
const CHALLENGE_TTL_SEC = 1800; // 30 min

let emailAuthDbPort: EmailAuthDbPort | undefined;

/** Composition root: bind DB port once (see `ensureAuthModulePortsBound`). */
export function bindEmailAuthDbPort(port: EmailAuthDbPort): void {
  emailAuthDbPort = port;
}

function requireEmailAuthDb(): EmailAuthDbPort {
  if (!emailAuthDbPort) {
    throw new Error(
      'EmailAuthDbPort is not bound. Call ensureAuthModulePortsBound() from buildAppDeps.',
    );
  }
  return emailAuthDbPort;
}

/** Без БД (тесты): хранение челленджей в памяти процесса. */
const memEmailChallenges = new Map<
  string,
  {
    userId: string;
    email: string;
    code: string;
    expiresAt: number;
    attempts: number;
    purpose: EmailChallengePurpose;
  }
>();

/** In-memory владельцы email (только без DATABASE_URL). */
const memEmailOwnerByNormalized = new Map<string, string>();

/**
 * Decaying OTP lockout (night plan C-2 step 3), in-memory mirror of `email_otp_locks` (only
 * Vitest without `DATABASE_URL`). Keyed by userId, same identity every startEmailChallenge /
 * confirm* / consume* call already carries. Deliberately NOT cleared just because a lock's
 * `lockedUntil` is in the past -- only a successful verification resets it (NIST SP 800-63B
 * §5.2.2), same as the DB path.
 */
const memEmailLocks = new Map<string, number>();
const memEmailLockCycles = new Map<string, number>();

/** Сброс in-memory состояния между тестами. */
export function resetEmailAuthMemStateForTests(): void {
  memEmailChallenges.clear();
  memEmailOwnerByNormalized.clear();
  memEmailLocks.clear();
  memEmailLockCycles.clear();
}

/**
 * Decaying OTP lockout (night plan C-2 step 3) gate check, used by `startEmailChallenge` for both
 * the authenticated and public (delegating) email flows.
 */
async function checkEmailOtpLock(
  userId: string,
): Promise<{ locked: true; retryAfterSeconds: number } | { locked: false }> {
  const now = Math.floor(Date.now() / 1000);
  if (!env.DATABASE_URL) {
    const lockedUntil = memEmailLocks.get(userId);
    if (lockedUntil != null && lockedUntil > now) {
      return { locked: true, retryAfterSeconds: Math.max(1, lockedUntil - now) };
    }
    return { locked: false };
  }
  const row = await requireEmailAuthDb().findEmailOtpLock(userId);
  const lockedUntil = row ? Number(row.locked_until) : 0;
  if (lockedUntil > now) {
    return { locked: true, retryAfterSeconds: Math.max(1, lockedUntil - now) };
  }
  return { locked: false };
}

/**
 * Atomically escalates this user's lockout cycle (120s, 240s, 480s, 960s, capped at 1800s -- see
 * otpConstants.ts:nextOtpLockoutDurationSeconds) and returns the retryAfterSeconds to report.
 */
async function registerEmailOtpLockoutForUser(userId: string): Promise<number> {
  const now = Math.floor(Date.now() / 1000);
  if (!env.DATABASE_URL) {
    const previousCycles = memEmailLockCycles.get(userId) ?? 0;
    const duration = nextOtpLockoutDurationSeconds(previousCycles);
    const lockedUntil = now + duration;
    memEmailLockCycles.set(userId, previousCycles + 1);
    memEmailLocks.set(userId, lockedUntil);
    return duration;
  }
  const lockedUntil = await requireEmailAuthDb().registerEmailOtpLockout(userId);
  return Math.max(1, lockedUntil - now);
}

/** NIST SP 800-63B §5.2.2: disregard previous failed attempts after a successful verification. */
async function resetEmailOtpLockoutForUser(userId: string): Promise<void> {
  if (!env.DATABASE_URL) {
    memEmailLocks.delete(userId);
    memEmailLockCycles.delete(userId);
    return;
  }
  await requireEmailAuthDb().resetEmailOtpLockout(userId);
}

export { normalizeEmail };

function emailCodePepper(): string {
  return integratorWebhookSecret() || env.SESSION_COOKIE_SECRET || 'test-email-pepper';
}

/** Shared hash contract for every email challenge caller; raw OTPs never enter SQL. */
export function hashEmailChallengeCode(code: string): string {
  return createHash('sha256').update(`${code}:${emailCodePepper()}`).digest('hex');
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
  return env.DEV_EMAIL_OTP_DEBUG && env.NODE_ENV === 'development';
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
  | {
      ok: false;
      code: 'invalid_email' | 'rate_limited' | 'too_many_attempts' | 'email_send_failed';
      retryAfterSeconds?: number;
    };

export type EmailConfirmResult =
  | { ok: true }
  | {
      ok: false;
      code: 'invalid_code' | 'expired_code' | 'too_many_attempts' | 'email_conflict';
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
  row: {
    id: string;
    code_hash: string;
    expires_at: string;
    attempts: string;
    purpose: string | null;
  };
  /**
   * C-2 step 4 (OWASP ASVS V6.6.2 / NIST SP 800-63B §5.1.3): the purpose THIS confirm call expects.
   * A row whose purpose does not match is treated exactly like a wrong code -- same attempts
   * increment, same result shape (ASVS 6.3.8 uniform response). A NULL row purpose (minted before
   * migration 0249) is grandfathered in for the remainder of its own TTL.
   */
  expectedPurpose: EmailChallengePurpose;
  onSuccess: () => Promise<EmailConfirmResult>;
}): Promise<EmailConfirmResult> {
  const now = Math.floor(Date.now() / 1000);
  const db = requireEmailAuthDb();
  const expiresAt = Number(params.row.expires_at);
  if (expiresAt <= now) {
    await db.deleteEmailChallengeById(params.challengeId);
    return { ok: false, code: 'expired_code' };
  }

  const attempts = Number(params.row.attempts);
  if (attempts >= OTP_MAX_VERIFY_ATTEMPTS) {
    // Defensive re-check on an already-exhausted row that a concurrent request has not yet
    // deleted: report the lock that request's own escalation should already have registered,
    // rather than registering a second escalation for the same exhaustion event (which would
    // double-count the lockout cycle). If that lock is not yet visible (a genuine race), fall back
    // to the shortest possible duration -- never to zero, and never by inventing a new escalation.
    const lockState = await checkEmailOtpLock(params.userId);
    return {
      ok: false,
      code: 'too_many_attempts',
      retryAfterSeconds: lockState.locked ? lockState.retryAfterSeconds : OTP_LOCKOUT_BASE_SEC,
    };
  }

  const expectedHash = hashEmailChallengeCode(params.code);
  const purposeMatches =
    params.row.purpose == null || params.row.purpose === params.expectedPurpose;
  if (expectedHash !== params.row.code_hash || !purposeMatches) {
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
      return { ok: false, code: 'expired_code' };
    }
    if (next >= OTP_MAX_VERIFY_ATTEMPTS) {
      await db.deleteEmailChallengeById(params.challengeId);
      // Decaying lockout (night plan C-2 step 3): escalate this user's cycle instead of a flat
      // 10-minute block -- see registerEmailOtpLockoutForUser / otpConstants.ts for the curve.
      const retryAfterSeconds = await registerEmailOtpLockoutForUser(params.userId);
      return { ok: false, code: 'too_many_attempts', retryAfterSeconds };
    }
    return { ok: false, code: 'invalid_code' };
  }

  // NIST SP 800-63B §5.2.2: disregard previous failed attempts after a successful verification --
  // the code just matched, regardless of what onSuccess() does with it next (e.g. email_conflict is
  // a downstream business-rule failure, not a wrong guess).
  await resetEmailOtpLockoutForUser(params.userId);
  return params.onSuccess();
}

export async function startEmailChallenge(
  userId: string,
  emailRaw: string,
  purpose: EmailChallengePurpose,
): Promise<EmailStartResult> {
  const email = normalizeEmail(emailRaw);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, code: 'invalid_email' };
  }

  // Decaying lockout gate (night plan C-2 step 3): before this fix, exhausting attempts on one
  // challenge only deleted that challenge -- nothing stopped a fresh one from being issued the
  // moment the unrelated 60s resend cooldown passed, with attempts back at 0. This also protects
  // `startPublicEmailOtpChallenge`/`startPublicEmailOtpRegistration` (emailOtpPublic.ts), which
  // delegate to this same function.
  const lockState = await checkEmailOtpLock(userId);
  if (lockState.locked) {
    return { ok: false, code: 'too_many_attempts', retryAfterSeconds: lockState.retryAfterSeconds };
  }

  if (!env.DATABASE_URL) {
    const code = generateEmailCode();
    const challengeId = randomUUID();
    const expiresAt = Math.floor(Date.now() / 1000) + CHALLENGE_TTL_SEC;
    memEmailChallenges.set(challengeId, { userId, email, code, expiresAt, attempts: 0, purpose });
    const sent = await sendEmailAuthCode(email, code);
    if (!sent.ok) {
      memEmailChallenges.delete(challengeId);
      return { ok: false, code: 'email_send_failed' };
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
        code: 'rate_limited',
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

  const challengeId = await db.insertEmailChallenge({
    userId,
    email,
    codeHash,
    expiresAt,
    purpose,
  });
  const sent = await sendEmailAuthCode(email, code);
  if (!sent.ok) {
    if (isEmailOtpDebugEnabled()) {
      // Opt-in dev aid: tolerate send failure (no integrator running). Code was logged above.
      console.warn(
        `[DEV] Email send failed for ${email}: ${sent.error}. Use the code from the log.`,
      );
    } else {
      await db.deleteEmailChallengeById(challengeId);
      return { ok: false, code: 'email_send_failed' };
    }
  }
  await db.upsertEmailSendCooldown(userId, email);

  return { ok: true, challengeId, retryAfterSeconds: OTP_RESEND_COOLDOWN_SEC };
}

export async function confirmEmailChallenge(
  userId: string,
  challengeId: string,
  codeRaw: string,
  expectedPurpose: EmailChallengePurpose,
  options?: ConfirmEmailOptions,
): Promise<EmailConfirmResult> {
  const code = codeRaw.trim();
  if (!code) {
    return { ok: false, code: 'invalid_code' };
  }

  if (!env.DATABASE_URL) {
    const row = memEmailChallenges.get(challengeId);
    if (!row || row.userId !== userId) {
      return { ok: false, code: 'expired_code' };
    }
    if (row.expiresAt <= Math.floor(Date.now() / 1000)) {
      memEmailChallenges.delete(challengeId);
      return { ok: false, code: 'expired_code' };
    }
    // C-2 step 4: a purpose mismatch is folded into the SAME branch as a wrong code (ASVS 6.3.8
    // uniform response) -- see verifyChallengeCodeRow for the DB-backed equivalent.
    if (row.code !== code || row.purpose !== expectedPurpose) {
      row.attempts += 1;
      if (row.attempts >= OTP_MAX_VERIFY_ATTEMPTS) {
        memEmailChallenges.delete(challengeId);
        const retryAfterSeconds = await registerEmailOtpLockoutForUser(userId);
        return { ok: false, code: 'too_many_attempts', retryAfterSeconds };
      }
      return { ok: false, code: 'invalid_code' };
    }
    // NIST SP 800-63B §5.2.2: disregard previous failed attempts after a successful verification.
    await resetEmailOtpLockoutForUser(userId);
    const normalized = normalizeEmail(row.email);
    const owner = memEmailOwnerByNormalized.get(normalized);
    if (owner && owner !== userId) {
      memEmailChallenges.delete(challengeId);
      return { ok: false, code: 'email_conflict' };
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
    return { ok: false, code: 'expired_code' };
  }

  return verifyChallengeCodeRow({
    userId,
    challengeId,
    code,
    row,
    expectedPurpose,
    onSuccess: async () => {
      try {
        const claimed = await db.claimVerifiedEmail(userId, row.email, options);
        if (!claimed.ok) {
          await db.deleteEmailChallengesForUser(userId);
          return { ok: false, code: 'email_conflict' };
        }
      } catch (err: unknown) {
        const pgCode =
          typeof err === 'object' && err !== null
            ? String((err as { code?: unknown }).code ?? '')
            : '';
        if (pgCode === '23505') {
          await db.deleteEmailChallengesForUser(userId);
          return { ok: false, code: 'email_conflict' };
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
  expectedPurpose: EmailChallengePurpose,
): Promise<EmailConfirmResult> {
  const code = codeRaw.trim();
  if (!code) {
    return { ok: false, code: 'invalid_code' };
  }

  if (!env.DATABASE_URL) {
    const row = memEmailChallenges.get(challengeId);
    if (!row || row.userId !== userId) {
      return { ok: false, code: 'expired_code' };
    }
    if (row.expiresAt <= Math.floor(Date.now() / 1000)) {
      memEmailChallenges.delete(challengeId);
      return { ok: false, code: 'expired_code' };
    }
    // C-2 step 4: a purpose mismatch is folded into the SAME branch as a wrong code (ASVS 6.3.8
    // uniform response).
    if (row.code !== code || row.purpose !== expectedPurpose) {
      row.attempts += 1;
      if (row.attempts >= OTP_MAX_VERIFY_ATTEMPTS) {
        memEmailChallenges.delete(challengeId);
        const retryAfterSeconds = await registerEmailOtpLockoutForUser(userId);
        return { ok: false, code: 'too_many_attempts', retryAfterSeconds };
      }
      return { ok: false, code: 'invalid_code' };
    }
    // NIST SP 800-63B §5.2.2: disregard previous failed attempts after a successful verification.
    await resetEmailOtpLockoutForUser(userId);
    memEmailChallenges.delete(challengeId);
    return { ok: true };
  }

  const db = requireEmailAuthDb();
  const row = await db.findEmailChallengeForConsume(challengeId, userId);
  if (!row) {
    return { ok: false, code: 'expired_code' };
  }

  return verifyChallengeCodeRow({
    userId,
    challengeId,
    code,
    row,
    expectedPurpose,
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
  expectedPurpose: EmailChallengePurpose,
  options?: ConfirmEmailOptions,
): Promise<EmailConfirmResult> {
  const code = codeRaw.trim();
  if (!code) {
    return { ok: false, code: 'invalid_code' };
  }

  if (!env.DATABASE_URL) {
    const now = Math.floor(Date.now() / 1000);
    let bestId: string | null = null;
    let best: {
      userId: string;
      email: string;
      code: string;
      expiresAt: number;
      attempts: number;
      purpose: EmailChallengePurpose;
    } | null = null;
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
      return { ok: false, code: 'expired_code' };
    }
    // C-2 step 4: a purpose mismatch is folded into the SAME branch as a wrong code (ASVS 6.3.8
    // uniform response).
    if (best.code !== code || best.purpose !== expectedPurpose) {
      best.attempts += 1;
      if (best.attempts >= OTP_MAX_VERIFY_ATTEMPTS) {
        memEmailChallenges.delete(bestId);
        const retryAfterSeconds = await registerEmailOtpLockoutForUser(userId);
        return { ok: false, code: 'too_many_attempts', retryAfterSeconds };
      }
      return { ok: false, code: 'invalid_code' };
    }
    // NIST SP 800-63B §5.2.2: disregard previous failed attempts after a successful verification.
    await resetEmailOtpLockoutForUser(userId);
    const normalized = normalizeEmail(best.email);
    const owner = memEmailOwnerByNormalized.get(normalized);
    if (owner && owner !== userId) {
      memEmailChallenges.delete(bestId);
      return { ok: false, code: 'email_conflict' };
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
    return { ok: false, code: 'expired_code' };
  }

  return verifyChallengeCodeRow({
    userId,
    challengeId: row.id,
    code,
    row,
    expectedPurpose,
    onSuccess: async () => {
      try {
        const claimed = await db.claimVerifiedEmail(userId, row.email, options);
        if (!claimed.ok) {
          await db.deleteEmailChallengesForUser(userId);
          return { ok: false, code: 'email_conflict' };
        }
      } catch (err: unknown) {
        const pgCode =
          typeof err === 'object' && err !== null
            ? String((err as { code?: unknown }).code ?? '')
            : '';
        if (pgCode === '23505') {
          await db.deleteEmailChallengesForUser(userId);
          return { ok: false, code: 'email_conflict' };
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
  expectedPurpose: EmailChallengePurpose,
): Promise<EmailConfirmResult> {
  const code = codeRaw.trim();
  if (!code) {
    return { ok: false, code: 'invalid_code' };
  }

  if (!env.DATABASE_URL) {
    const now = Math.floor(Date.now() / 1000);
    let bestId: string | null = null;
    let best: {
      userId: string;
      email: string;
      code: string;
      expiresAt: number;
      attempts: number;
      purpose: EmailChallengePurpose;
    } | null = null;
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
      return { ok: false, code: 'expired_code' };
    }
    // C-2 step 4: a purpose mismatch is folded into the SAME branch as a wrong code (ASVS 6.3.8
    // uniform response).
    if (best.code !== code || best.purpose !== expectedPurpose) {
      best.attempts += 1;
      if (best.attempts >= OTP_MAX_VERIFY_ATTEMPTS) {
        memEmailChallenges.delete(bestId);
        const retryAfterSeconds = await registerEmailOtpLockoutForUser(userId);
        return { ok: false, code: 'too_many_attempts', retryAfterSeconds };
      }
      return { ok: false, code: 'invalid_code' };
    }
    // NIST SP 800-63B §5.2.2: disregard previous failed attempts after a successful verification.
    await resetEmailOtpLockoutForUser(userId);
    memEmailChallenges.delete(bestId);
    return { ok: true };
  }

  const db = requireEmailAuthDb();
  const now = Math.floor(Date.now() / 1000);
  const row = await db.findLatestEmailChallengeForUser(userId, now);
  if (!row) {
    return { ok: false, code: 'expired_code' };
  }

  return verifyChallengeCodeRow({
    userId,
    challengeId: row.id,
    code,
    expectedPurpose,
    row,
    onSuccess: async () => {
      await db.deleteEmailChallengesForUser(userId);
      return { ok: true };
    },
  });
}
