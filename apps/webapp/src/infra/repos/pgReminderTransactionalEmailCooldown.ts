import { getPool } from "@/infra/db/client";

/**
 * Резервный ключ в `email_send_cooldowns.email_normalized` для интервала между
 * **transactional** письмами напоминаний (не OTP — не конфликтует с реальным email).
 */
export const REMINDER_TRANSACTIONAL_EMAIL_COOLDOWN_EMAIL_KEY = "!reminder_txn_v1";

const DEFAULT_MIN_INTERVAL_SEC = 45;

export type ReminderTransactionalEmailCooldownPort = {
  shouldSkipDueToCooldown: (platformUserId: string) => Promise<boolean>;
  recordSent: (platformUserId: string) => Promise<void>;
};

export function createPgReminderTransactionalEmailCooldownPort(
  minIntervalSec = DEFAULT_MIN_INTERVAL_SEC,
): ReminderTransactionalEmailCooldownPort {
  return {
    async shouldSkipDueToCooldown(platformUserId) {
      const pool = getPool();
      const res = await pool.query<{ last_sent_at: Date }>(
        `SELECT last_sent_at FROM email_send_cooldowns
         WHERE user_id = $1::uuid AND email_normalized = $2
         LIMIT 1`,
        [platformUserId, REMINDER_TRANSACTIONAL_EMAIL_COOLDOWN_EMAIL_KEY],
      );
      if (res.rows.length === 0) return false;
      const delta = (Date.now() - new Date(res.rows[0].last_sent_at).getTime()) / 1000;
      return delta < minIntervalSec;
    },

    async recordSent(platformUserId) {
      const pool = getPool();
      await pool.query(
        `INSERT INTO email_send_cooldowns (user_id, email_normalized, last_sent_at)
         VALUES ($1::uuid, $2, now())
         ON CONFLICT (user_id, email_normalized) DO UPDATE SET last_sent_at = now()`,
        [platformUserId, REMINDER_TRANSACTIONAL_EMAIL_COOLDOWN_EMAIL_KEY],
      );
    },
  };
}

export function createNoOpReminderTransactionalEmailCooldownPort(): ReminderTransactionalEmailCooldownPort {
  return {
    async shouldSkipDueToCooldown() {
      return false;
    },
    async recordSent() {
      /* noop */
    },
  };
}
