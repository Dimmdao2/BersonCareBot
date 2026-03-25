/**
 * Репозиторий настроек напоминаний для webapp-пользователя.
 * Читает из `reminder_rules` по `platform_user_id` (или через join с `platform_users`).
 */
import { getPool } from "@/infra/db/client";
import type { ReminderRulesPort } from "@/modules/reminders/ports";
import type { ReminderRule, ReminderUpdateSchedule } from "@/modules/reminders/types";

const FALLBACK_CATEGORIES = new Set(["appointment", "lfk", "chat", "important"]);

function toRule(row: {
  integrator_rule_id: string;
  integrator_user_id: string;
  category: string;
  is_enabled: boolean;
  interval_minutes: number;
  window_start_minute: number;
  window_end_minute: number;
  days_mask: string;
  updated_at: string;
}): ReminderRule {
  return {
    id: row.integrator_rule_id,
    integratorUserId: row.integrator_user_id,
    category: row.category as ReminderRule["category"],
    enabled: row.is_enabled,
    intervalMinutes: row.interval_minutes ?? null,
    windowStartMinute: row.window_start_minute,
    windowEndMinute: row.window_end_minute,
    daysMask: row.days_mask,
    fallbackEnabled: FALLBACK_CATEGORIES.has(row.category),
    updatedAt: row.updated_at,
  };
}

const SELECT_COLS = `
  rr.integrator_rule_id,
  rr.integrator_user_id::text,
  rr.category,
  rr.is_enabled,
  rr.interval_minutes,
  rr.window_start_minute,
  rr.window_end_minute,
  rr.days_mask,
  rr.updated_at
`;

export function createPgReminderRulesPort(): ReminderRulesPort {
  return {
    async listByPlatformUser(platformUserId) {
      const pool = getPool();
      const r = await pool.query<{
        integrator_rule_id: string;
        integrator_user_id: string;
        category: string;
        is_enabled: boolean;
        interval_minutes: number;
        window_start_minute: number;
        window_end_minute: number;
        days_mask: string;
        updated_at: string;
      }>(
        `SELECT ${SELECT_COLS}
         FROM reminder_rules rr
         LEFT JOIN platform_users pu ON pu.integrator_user_id = rr.integrator_user_id
         WHERE rr.platform_user_id = $1 OR pu.id = $1
         ORDER BY rr.category`,
        [platformUserId],
      );
      return r.rows.map(toRule);
    },

    async getByPlatformUserAndCategory(platformUserId, category) {
      const pool = getPool();
      const r = await pool.query<{
        integrator_rule_id: string;
        integrator_user_id: string;
        category: string;
        is_enabled: boolean;
        interval_minutes: number;
        window_start_minute: number;
        window_end_minute: number;
        days_mask: string;
        updated_at: string;
      }>(
        `SELECT ${SELECT_COLS}
         FROM reminder_rules rr
         LEFT JOIN platform_users pu ON pu.integrator_user_id = rr.integrator_user_id
         WHERE (rr.platform_user_id = $1 OR pu.id = $1) AND rr.category = $2
         LIMIT 1`,
        [platformUserId, category],
      );
      return r.rows.length > 0 ? toRule(r.rows[0]) : null;
    },

    async updateEnabled(ruleIntegratorId, enabled) {
      const pool = getPool();
      await pool.query(
        `UPDATE reminder_rules SET is_enabled = $2, updated_at = now()
         WHERE integrator_rule_id = $1`,
        [ruleIntegratorId, enabled],
      );
    },

    async updateSchedule(ruleIntegratorId, schedule) {
      const pool = getPool();
      await pool.query(
        `UPDATE reminder_rules
         SET interval_minutes = $2, window_start_minute = $3, window_end_minute = $4,
             days_mask = $5, updated_at = now()
         WHERE integrator_rule_id = $1`,
        [
          ruleIntegratorId,
          schedule.intervalMinutes,
          schedule.windowStartMinute,
          schedule.windowEndMinute,
          schedule.daysMask,
        ],
      );
    },
  };
}
