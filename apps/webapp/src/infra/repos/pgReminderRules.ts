/**
 * Репозиторий настроек напоминаний для webapp-пользователя.
 * Читает из `reminder_rules` по `platform_user_id` (или через join с `platform_users`).
 */
import { randomUUID } from "node:crypto";
import { getPool } from "@/infra/db/client";
import type { ReminderRulesPort } from "@/modules/reminders/ports";
import type { ReminderCategory, ReminderLinkedObjectType, ReminderRule, ReminderUpdateSchedule } from "@/modules/reminders/types";

const FALLBACK_CATEGORIES = new Set(["appointment", "lfk", "chat", "important"]);

function mapLinkedTypeToCategory(linked: ReminderLinkedObjectType): ReminderCategory {
  if (linked === "lfk_complex" || linked === "content_section") return "lfk";
  return "important";
}

function parseLinkedType(raw: string | null): ReminderLinkedObjectType | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (
    raw === "lfk_complex" ||
    raw === "content_section" ||
    raw === "content_page" ||
    raw === "custom"
  ) {
    return raw;
  }
  return null;
}

function toRule(row: {
  integrator_rule_id: string;
  integrator_user_id: string;
  category: string;
  is_enabled: boolean;
  interval_minutes: number;
  window_start_minute: number;
  window_end_minute: number;
  days_mask: string;
  linked_object_type: string | null;
  linked_object_id: string | null;
  custom_title: string | null;
  custom_text: string | null;
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
    linkedObjectType: parseLinkedType(row.linked_object_type),
    linkedObjectId: row.linked_object_id ?? null,
    customTitle: row.custom_title ?? null,
    customText: row.custom_text ?? null,
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
  rr.linked_object_type,
  rr.linked_object_id,
  rr.custom_title,
  rr.custom_text,
  rr.updated_at
`;

type RuleRow = Parameters<typeof toRule>[0];

export function createPgReminderRulesPort(): ReminderRulesPort {
  return {
    async resolveIntegratorUserId(platformUserId) {
      const pool = getPool();
      const r = await pool.query<{ integrator_user_id: string }>(
        `SELECT integrator_user_id::text FROM platform_users WHERE id = $1::uuid LIMIT 1`,
        [platformUserId],
      );
      return r.rows[0]?.integrator_user_id ?? null;
    },

    async listByPlatformUser(platformUserId) {
      const pool = getPool();
      const r = await pool.query<RuleRow>(
        `SELECT ${SELECT_COLS}
         FROM reminder_rules rr
         LEFT JOIN platform_users pu ON pu.integrator_user_id = rr.integrator_user_id
         WHERE rr.platform_user_id = $1::uuid OR pu.id = $1::uuid
         ORDER BY rr.category`,
        [platformUserId],
      );
      return r.rows.map(toRule);
    },

    async listByPlatformUserWithObjects(platformUserId) {
      const pool = getPool();
      const r = await pool.query<RuleRow>(
        `SELECT ${SELECT_COLS}
         FROM reminder_rules rr
         LEFT JOIN platform_users pu ON pu.integrator_user_id = rr.integrator_user_id
         WHERE rr.platform_user_id = $1::uuid OR pu.id = $1::uuid
         ORDER BY rr.updated_at DESC`,
        [platformUserId],
      );
      return r.rows.map(toRule);
    },

    async getByPlatformUserAndCategory(platformUserId, category) {
      const pool = getPool();
      const r = await pool.query<RuleRow>(
        `SELECT ${SELECT_COLS}
         FROM reminder_rules rr
         LEFT JOIN platform_users pu ON pu.integrator_user_id = rr.integrator_user_id
         WHERE (rr.platform_user_id = $1::uuid OR pu.id = $1::uuid) AND rr.category = $2
         LIMIT 1`,
        [platformUserId, category],
      );
      return r.rows.length > 0 ? toRule(r.rows[0]) : null;
    },

    async create(input) {
      const pool = getPool();
      const integratorRuleId = `wp-${randomUUID()}`;
      const category = mapLinkedTypeToCategory(input.linkedObjectType);
      const r = await pool.query<RuleRow>(
        `INSERT INTO reminder_rules (
          integrator_rule_id, platform_user_id, integrator_user_id, category, is_enabled,
          schedule_type, timezone, interval_minutes, window_start_minute, window_end_minute,
          days_mask, content_mode,
          linked_object_type, linked_object_id, custom_title, custom_text,
          updated_at
        ) VALUES (
          $1, $2::uuid, $3::bigint, $4, $5,
          'interval_window', 'Europe/Moscow', $6, $7, $8, $9, 'none',
          $10, $11, $12, $13,
          now()
        )
        RETURNING
          integrator_rule_id,
          integrator_user_id::text,
          category,
          is_enabled,
          interval_minutes,
          window_start_minute,
          window_end_minute,
          days_mask,
          linked_object_type,
          linked_object_id,
          custom_title,
          custom_text,
          updated_at`,
        [
          integratorRuleId,
          input.platformUserId,
          input.integratorUserId,
          category,
          input.enabled,
          input.schedule.intervalMinutes,
          input.schedule.windowStartMinute,
          input.schedule.windowEndMinute,
          input.schedule.daysMask,
          input.linkedObjectType,
          input.linkedObjectId,
          input.customTitle,
          input.customText,
        ],
      );
      const row = r.rows[0];
      if (!row) throw new Error("reminder_rules insert returned no row");
      return toRule(row);
    },

    async delete(ruleIntegratorId, platformUserId) {
      const pool = getPool();
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const own = await client.query<{ id: string; integrator_rule_id: string }>(
          `SELECT rr.id, rr.integrator_rule_id
           FROM reminder_rules rr
           WHERE rr.integrator_rule_id = $1
             AND (
               rr.platform_user_id = $2::uuid
               OR rr.integrator_user_id IN (
                 SELECT integrator_user_id FROM platform_users WHERE id = $2::uuid
               )
             )
           LIMIT 1`,
          [ruleIntegratorId, platformUserId],
        );
        if (own.rows.length === 0) {
          await client.query("ROLLBACK");
          return false;
        }
        const target = own.rows[0];
        await client.query(
          `DELETE FROM reminder_occurrence_history
           WHERE integrator_rule_id = $1`,
          [target.integrator_rule_id],
        );
        await client.query(
          `DELETE FROM reminder_rules
           WHERE id = $1::uuid`,
          [target.id],
        );
        await client.query("COMMIT");
        return true;
      } catch {
        try {
          await client.query("ROLLBACK");
        } catch {
          /* ignore */
        }
        throw new Error("failed to delete reminder");
      } finally {
        client.release();
      }
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

    async updateCustomTexts(ruleIntegratorId, customTitle, customText) {
      const pool = getPool();
      await pool.query(
        `UPDATE reminder_rules
         SET custom_title = $2, custom_text = $3, updated_at = now()
         WHERE integrator_rule_id = $1`,
        [ruleIntegratorId, customTitle, customText],
      );
    },
  };
}
