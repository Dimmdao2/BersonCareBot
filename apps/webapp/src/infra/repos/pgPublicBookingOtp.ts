/**
 * DB implementation of `PublicBookingOtpPort`, over the two SECURITY DEFINER accessors added by
 * `0245_public_booking_phone_otp_accessors.sql`.
 *
 * Same construction as `pgEmailOtpPublic.ts`: every statement is a `SELECT ... FROM app.<accessor>`,
 * so the calling runtime role needs EXECUTE on the function and NOTHING on `public.phone_challenges`
 * or `public.phone_otp_locks`. That is the whole point — `deploy/postgres/p0-5b-grants.sql` grants
 * those two tables to app_staff only, and the anonymous booking handlers run as app_patient.
 */
import { sql } from 'drizzle-orm';
import { getWebappSqlDb, runWebappNamedRoot } from '@/infra/db/runWebappSql';
import type { PhoneChallengePayload } from '@/modules/auth/phoneChallengeStore';
import type {
  PublicBookingOtpConsumeResult,
  PublicBookingOtpPort,
} from '@/modules/public-booking/publicBookingOtpPort';

const OTP_DELIVERY_KEYS = new Set(['sms', 'telegram', 'max', 'email']);

function deliveryChannelFromRow(raw: unknown): PhoneChallengePayload['deliveryChannel'] {
  if (typeof raw !== 'string' || !OTP_DELIVERY_KEYS.has(raw)) return undefined;
  return raw as PhoneChallengePayload['deliveryChannel'];
}

export function createPgPublicBookingOtpPort(): PublicBookingOtpPort {
  return {
    async issueChallenge(input) {
      const result = await runWebappNamedRoot<{ issued: boolean }>(
        getWebappSqlDb(),
        'app.phone_otp_public_booking_issue_challenge(text,text,text,integer,integer,text,text)',
        [
          input.phone,
          input.challengeId,
          input.code,
          input.ttlSec,
          input.resendCooldownSec,
          input.deliveryChannel,
          JSON.stringify(input.intent),
        ],
        sql`SELECT app.phone_otp_public_booking_issue_challenge(${input.phone}, ${input.challengeId}, ${input.code}, ${input.ttlSec}, ${input.resendCooldownSec}, ${input.deliveryChannel}, ${JSON.stringify(input.intent)}) AS issued`,
      );
      return result.rows[0]?.issued === true;
    },

    async consumeChallenge(challengeId, code, maxAttempts, lockDurationSec) {
      const result = await runWebappNamedRoot<{
        ok: boolean;
        intent: unknown;
        delivery_channel: string | null;
        retry_after_seconds: number | string | null;
      }>(
        getWebappSqlDb(),
        'app.phone_otp_public_booking_consume_challenge(text,text,integer,integer)',
        [challengeId, code, maxAttempts, lockDurationSec],
        sql`SELECT ok, intent, delivery_channel, retry_after_seconds
         FROM app.phone_otp_public_booking_consume_challenge(${challengeId}, ${code}, ${maxAttempts}, ${lockDurationSec})`,
      );
      const row = result.rows[0];
      if (!row) throw new Error('phone_otp_public_booking_consume_challenge_failed');
      if (row.ok) {
        return {
          ok: true as const,
          intent: row.intent,
          deliveryChannel: deliveryChannelFromRow(row.delivery_channel),
        };
      }
      const retry = row.retry_after_seconds == null ? null : Number(row.retry_after_seconds);
      return {
        ok: false as const,
        ...(retry != null && Number.isFinite(retry) ? { retryAfterSeconds: retry } : {}),
      } satisfies PublicBookingOtpConsumeResult;
    },
  };
}

/**
 * In-memory implementation for Vitest without `DATABASE_URL`. It reproduces the accessors'
 * externally visible behaviour (cooldown, lockout, attempt counting, single use) and nothing else.
 */
type MemChallenge = {
  phone: string;
  code: string;
  expiresAtSec: number;
  attempts: number;
  deliveryChannel: PhoneChallengePayload['deliveryChannel'];
  intent: unknown;
  createdAtSec: number;
};

const memChallenges = new Map<string, MemChallenge>();
const memLocks = new Map<string, number>();

export function resetPublicBookingOtpMemStateForTests(): void {
  memChallenges.clear();
  memLocks.clear();
}

const nowSec = () => Math.floor(Date.now() / 1000);

export const inMemoryPublicBookingOtpPort: PublicBookingOtpPort = {
  async issueChallenge(input) {
    const now = nowSec();
    for (const [phone, until] of memLocks) if (until <= now) memLocks.delete(phone);
    const lockedUntil = memLocks.get(input.phone);
    if (lockedUntil != null && lockedUntil > now) return false;

    for (const challenge of memChallenges.values()) {
      if (
        challenge.phone === input.phone &&
        now - challenge.createdAtSec < input.resendCooldownSec
      ) {
        return false;
      }
    }
    for (const [id, challenge] of memChallenges) {
      if (challenge.phone === input.phone) memChallenges.delete(id);
    }

    memChallenges.set(input.challengeId, {
      phone: input.phone,
      code: input.code,
      expiresAtSec: now + input.ttlSec,
      attempts: 0,
      deliveryChannel: input.deliveryChannel,
      intent: input.intent,
      createdAtSec: now,
    });
    return true;
  },

  async consumeChallenge(challengeId, code, maxAttempts, lockDurationSec) {
    const stored = memChallenges.get(challengeId);
    if (!stored) return { ok: false };
    if (stored.expiresAtSec <= nowSec()) {
      memChallenges.delete(challengeId);
      return { ok: false };
    }
    if (stored.code !== code) {
      stored.attempts += 1;
      if (stored.attempts >= maxAttempts) {
        memChallenges.delete(challengeId);
        memLocks.set(stored.phone, nowSec() + lockDurationSec);
        return { ok: false, retryAfterSeconds: lockDurationSec };
      }
      return { ok: false };
    }
    memChallenges.delete(challengeId);
    return { ok: true, intent: stored.intent, deliveryChannel: stored.deliveryChannel };
  },
};
