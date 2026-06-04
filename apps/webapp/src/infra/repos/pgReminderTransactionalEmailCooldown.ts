import { and, eq, sql } from "drizzle-orm";
import { getDrizzle } from "@/app-layer/db/drizzle";
import { emailSendCooldowns } from "../../../db/schema/schema";

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
      const db = getDrizzle();
      const rows = await db
        .select({ lastSentAt: emailSendCooldowns.lastSentAt })
        .from(emailSendCooldowns)
        .where(
          and(
            eq(emailSendCooldowns.userId, platformUserId),
            eq(emailSendCooldowns.emailNormalized, REMINDER_TRANSACTIONAL_EMAIL_COOLDOWN_EMAIL_KEY),
          ),
        )
        .limit(1);
      if (rows.length === 0) return false;
      const last = rows[0]!.lastSentAt;
      const delta = (Date.now() - new Date(last).getTime()) / 1000;
      return delta < minIntervalSec;
    },

    async recordSent(platformUserId) {
      const db = getDrizzle();
      await db
        .insert(emailSendCooldowns)
        .values({
          userId: platformUserId,
          emailNormalized: REMINDER_TRANSACTIONAL_EMAIL_COOLDOWN_EMAIL_KEY,
          lastSentAt: sql`now()`,
        })
        .onConflictDoUpdate({
          target: [emailSendCooldowns.userId, emailSendCooldowns.emailNormalized],
          set: { lastSentAt: sql`now()` },
        });
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
