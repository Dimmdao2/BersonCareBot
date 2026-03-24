import { createHash, randomBytes, randomUUID } from "node:crypto";
import { getPool } from "@/infra/db/client";
import { env, integratorWebhookSecret } from "@/config/env";
import { OTP_LOCK_DURATION_SEC, OTP_MAX_VERIFY_ATTEMPTS, OTP_RESEND_COOLDOWN_SEC } from "@/modules/auth/otpConstants";

const CHALLENGE_TTL_SEC = 600; // 10 min

/** Без БД (тесты): хранение челленджей в памяти процесса. */
const memEmailChallenges = new Map<
  string,
  { userId: string; email: string; code: string; expiresAt: number; attempts: number }
>();

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function emailCodePepper(): string {
  return integratorWebhookSecret() || env.SESSION_COOKIE_SECRET || "test-email-pepper";
}

function hashCode(code: string): string {
  return createHash("sha256").update(`${code}:${emailCodePepper()}`).digest("hex");
}

function generateEmailCode(): string {
  return String(100000 + Math.floor(Math.random() * 900000));
}

export type EmailStartResult =
  | { ok: true; challengeId: string; retryAfterSeconds?: number }
  | { ok: false; code: "invalid_email" | "rate_limited" | "too_many_attempts"; retryAfterSeconds?: number };

export type EmailConfirmResult =
  | { ok: true }
  | { ok: false; code: "invalid_code" | "expired_code" | "too_many_attempts"; retryAfterSeconds?: number };

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
    console.info(`[emailAuth] (no DB) OTP for ${email}: ${code}`);
    return { ok: true, challengeId, retryAfterSeconds: OTP_RESEND_COOLDOWN_SEC };
  }

  const pool = getPool();
  const now = Date.now();

  const cooldown = await pool.query<{ last_sent_at: Date }>(
    "SELECT last_sent_at FROM email_send_cooldowns WHERE user_id = $1 AND email_normalized = $2",
    [userId, email]
  );
  if (cooldown.rows.length > 0) {
    const delta = Math.floor((now - new Date(cooldown.rows[0].last_sent_at).getTime()) / 1000);
    if (delta < OTP_RESEND_COOLDOWN_SEC) {
      return {
        ok: false,
        code: "rate_limited",
        retryAfterSeconds: OTP_RESEND_COOLDOWN_SEC - delta,
      };
    }
  }

  await pool.query("DELETE FROM email_challenges WHERE user_id = $1", [userId]);

  const code = generateEmailCode();
  const codeHash = hashCode(code);
  const expiresAt = Math.floor(Date.now() / 1000) + CHALLENGE_TTL_SEC;

  const ins = await pool.query<{ id: string }>(
    `INSERT INTO email_challenges (user_id, email, code_hash, expires_at, attempts)
     VALUES ($1, $2, $3, $4, 0) RETURNING id`,
    [userId, email, codeHash, expiresAt]
  );
  const challengeId = ins.rows[0].id;

  await pool.query(
    `INSERT INTO email_send_cooldowns (user_id, email_normalized, last_sent_at)
     VALUES ($1, $2, now())
     ON CONFLICT (user_id, email_normalized) DO UPDATE SET last_sent_at = now()`,
    [userId, email]
  );

  console.info(`[emailAuth] OTP for ${email} (user ${userId}): ${code}`);

  return { ok: true, challengeId, retryAfterSeconds: OTP_RESEND_COOLDOWN_SEC };
}

export async function confirmEmailChallenge(userId: string, challengeId: string, codeRaw: string): Promise<EmailConfirmResult> {
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

  const pool = getPool();
  const now = Math.floor(Date.now() / 1000);

  const row = await pool.query<{
    id: string;
    email: string;
    code_hash: string;
    expires_at: string;
    attempts: string;
  }>(
    "SELECT id, email, code_hash, expires_at, attempts FROM email_challenges WHERE id = $1 AND user_id = $2",
    [challengeId, userId]
  );
  if (row.rows.length === 0) {
    return { ok: false, code: "expired_code" };
  }
  const r = row.rows[0];
  const expiresAt = Number(r.expires_at);
  if (expiresAt <= now) {
    await pool.query("DELETE FROM email_challenges WHERE id = $1", [challengeId]);
    return { ok: false, code: "expired_code" };
  }

  const attempts = Number(r.attempts);
  if (attempts >= OTP_MAX_VERIFY_ATTEMPTS) {
    return { ok: false, code: "too_many_attempts", retryAfterSeconds: OTP_LOCK_DURATION_SEC };
  }

  const expectedHash = hashCode(code);
  if (expectedHash !== r.code_hash) {
    const next = attempts + 1;
    await pool.query("UPDATE email_challenges SET attempts = $1 WHERE id = $2", [next, challengeId]);
    if (next >= OTP_MAX_VERIFY_ATTEMPTS) {
      await pool.query("DELETE FROM email_challenges WHERE id = $1", [challengeId]);
      return { ok: false, code: "too_many_attempts", retryAfterSeconds: OTP_LOCK_DURATION_SEC };
    }
    return { ok: false, code: "invalid_code" };
  }

  await pool.query(
    "UPDATE platform_users SET email = $1, email_verified_at = now(), updated_at = now() WHERE id = $2",
    [r.email, userId]
  );
  await pool.query("DELETE FROM email_challenges WHERE user_id = $1", [userId]);

  return { ok: true };
}
