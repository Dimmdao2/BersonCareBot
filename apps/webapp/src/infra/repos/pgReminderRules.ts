/**
 * Репозиторий настроек напоминаний для webapp-пользователя.
 * Читает из `reminder_rules` по `platform_user_id` (или через join с `platform_users`).
 */
import { randomUUID } from "node:crypto";
import { getPool } from "@/infra/db/client";
import type { ReminderRulesPort } from "@/modules/reminders/ports";
import type {
  ReminderCategory,
  ReminderIntent,
  ReminderLinkedObjectType,
  ReminderRule,
  ReminderUpdateSchedule,
} from "@/modules/reminders/types";
import type { SlotsV1ScheduleData } from "@/modules/reminders/scheduleSlots";
import { DEFAULT_REHAB_DAILY_SLOTS } from "@/modules/reminders/scheduleSlots";
import { notificationTopicCodeFromReminderRule } from "@/modules/reminders/notificationTopicCode";

const FALLBACK_CATEGORIES = new Set(["appointment", "lfk", "chat", "important"]);

function mapLinkedTypeToCategory(linked: ReminderLinkedObjectType): ReminderCategory {
  if (
    linked === "lfk_complex" ||
    linked === "content_section" ||
    linked === "rehab_program" ||
    linked === "treatment_program_item"
  ) {
    return "lfk";
  }
  return "important";
}

function parseLinkedType(raw: string | null): ReminderLinkedObjectType | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (
    raw === "lfk_complex" ||
    raw === "content_section" ||
    raw === "content_page" ||
    raw === "custom" ||
    raw === "rehab_program" ||
    raw === "treatment_program_item"
  ) {
    return raw;
  }
  return null;
}

function parseIntent(raw: string | null | undefined): ReminderIntent {
  if (raw === "warmup" || raw === "exercises" || raw === "stretch" || raw === "generic") return raw;
  return "generic";
}

function parseScheduleData(raw: unknown): SlotsV1ScheduleData | null {
  if (raw == null || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (!Array.isArray(o.timesLocal) || typeof o.dayFilter !== "string") return null;
  return raw as SlotsV1ScheduleData;
}

function toRule(row: {
  integrator_rule_id: string;
  integrator_user_id: string;
  category: string;
  is_enabled: boolean;
  timezone: string;
  interval_minutes: number;
  window_start_minute: number;
  window_end_minute: number;
  days_mask: string;
  schedule_type: string;
  schedule_data: unknown;
  reminder_intent: string | null;
  linked_object_type: string | null;
  linked_object_id: string | null;
  custom_title: string | null;
  custom_text: string | null;
  display_title: string | null;
  display_description: string | null;
  quiet_hours_start_minute: number | null;
  quiet_hours_end_minute: number | null;
  notification_topic_code: string | null;
  updated_at: string;
}): ReminderRule {
  return {
    id: row.integrator_rule_id,
    integratorUserId: row.integrator_user_id,
    category: row.category as ReminderRule["category"],
    enabled: row.is_enabled,
    timezone: row.timezone?.trim() || "Europe/Moscow",
    intervalMinutes: row.interval_minutes ?? null,
    windowStartMinute: row.window_start_minute,
    windowEndMinute: row.window_end_minute,
    daysMask: row.days_mask,
    fallbackEnabled: FALLBACK_CATEGORIES.has(row.category),
    linkedObjectType: parseLinkedType(row.linked_object_type),
    linkedObjectId: row.linked_object_id ?? null,
    customTitle: row.custom_title ?? null,
    customText: row.custom_text ?? null,
    scheduleType: row.schedule_type ?? "interval_window",
    scheduleData: parseScheduleData(row.schedule_data),
    reminderIntent: parseIntent(row.reminder_intent),
    displayTitle: row.display_title ?? null,
    displayDescription: row.display_description ?? null,
    quietHoursStartMinute: row.quiet_hours_start_minute ?? null,
    quietHoursEndMinute: row.quiet_hours_end_minute ?? null,
    notificationTopicCode: row.notification_topic_code ?? null,
    updatedAt: row.updated_at,
  };
}

const SELECT_COLS = `
  rr.integrator_rule_id,
  rr.integrator_user_id::text,
  rr.category,
  rr.is_enabled,
  rr.timezone,
  rr.interval_minutes,
  rr.window_start_minute,
  rr.window_end_minute,
  rr.days_mask,
  rr.schedule_type,
  rr.schedule_data,
  rr.reminder_intent,
  rr.linked_object_type,
  rr.linked_object_id,
  rr.custom_title,
  rr.custom_text,
  rr.display_title,
  rr.display_description,
  rr.quiet_hours_start_minute,
  rr.quiet_hours_end_minute,
  rr.notification_topic_code,
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
      const scheduleType = input.scheduleType ?? "interval_window";
      let scheduleData: SlotsV1ScheduleData | null = input.scheduleData ?? null;
      const reminderIntent = input.reminderIntent ?? "generic";
      const tz = input.timezone?.trim() || "Europe/Moscow";
      if (input.linkedObjectType === "rehab_program" && scheduleType === "slots_v1" && !scheduleData) {
        scheduleData = DEFAULT_REHAB_DAILY_SLOTS;
      }
      const notificationTopicCode = notificationTopicCodeFromReminderRule({
        category,
        linkedObjectType: input.linkedObjectType,
      });
      const r = await pool.query<RuleRow>(
        `INSERT INTO reminder_rules (
          integrator_rule_id, platform_user_id, integrator_user_id, category, is_enabled,
          schedule_type, timezone, interval_minutes, window_start_minute, window_end_minute,
          days_mask, content_mode,
          linked_object_type, linked_object_id, custom_title, custom_text,
          schedule_data, reminder_intent, display_title, display_description,
          quiet_hours_start_minute, quiet_hours_end_minute,
          notification_topic_code,
          updated_at
        ) VALUES (
          $1, $2::uuid, $3::bigint, $4, $5,
          $6, $7, $8, $9, $10, $11, 'none',
          $12, $13, $14, $15,
          $16::jsonb, $17, $18, $19,
          $20, $21,
          $22,
          now()
        )
        RETURNING
          integrator_rule_id,
          integrator_user_id::text,
          category,
          is_enabled,
          timezone,
          interval_minutes,
          window_start_minute,
          window_end_minute,
          days_mask,
          schedule_type,
          schedule_data,
          reminder_intent,
          linked_object_type,
          linked_object_id,
          custom_title,
          custom_text,
          display_title,
          display_description,
          quiet_hours_start_minute,
          quiet_hours_end_minute,
          notification_topic_code,
          updated_at`,
        [
          integratorRuleId,
          input.platformUserId,
          input.integratorUserId,
          category,
          input.enabled,
          scheduleType,
          tz,
          input.schedule.intervalMinutes,
          input.schedule.windowStartMinute,
          input.schedule.windowEndMinute,
          input.schedule.daysMask,
          input.linkedObjectType,
          input.linkedObjectId,
          input.customTitle,
          input.customText,
          scheduleData ? JSON.stringify(scheduleData) : null,
          reminderIntent,
          input.displayTitle ?? null,
          input.displayDescription ?? null,
          input.quietHoursStartMinute ?? null,
          input.quietHoursEndMinute ?? null,
          notificationTopicCode,
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

    async updateScheduleAndType(ruleIntegratorId, params) {
      const pool = getPool();
      await pool.query(
        `UPDATE reminder_rules
         SET schedule_type = $2,
             interval_minutes = $3,
             window_start_minute = $4,
             window_end_minute = $5,
             days_mask = $6,
             schedule_data = $7::jsonb,
             quiet_hours_start_minute = $8,
             quiet_hours_end_minute = $9,
             updated_at = now()
         WHERE integrator_rule_id = $1`,
        [
          ruleIntegratorId,
          params.scheduleType,
          params.intervalMinutes,
          params.windowStartMinute,
          params.windowEndMinute,
          params.daysMask,
          params.scheduleData ? JSON.stringify(params.scheduleData) : null,
          params.quietHoursStartMinute,
          params.quietHoursEndMinute,
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

    async updateDisplayTexts(ruleIntegratorId, displayTitle, displayDescription) {
      const pool = getPool();
      await pool.query(
        `UPDATE reminder_rules
         SET display_title = $2, display_description = $3, updated_at = now()
         WHERE integrator_rule_id = $1`,
        [ruleIntegratorId, displayTitle, displayDescription],
      );
    },

    async setReminderMutedUntil(platformUserId, untilIso) {
      const pool = getPool();
      await pool.query(
        `UPDATE platform_users SET reminder_muted_until = $2::timestamptz, updated_at = now()
         WHERE id = $1::uuid`,
        [platformUserId, untilIso],
      );
    },

    async getReminderMutedUntil(platformUserId) {
      const pool = getPool();
      const r = await pool.query<{ t: string | null }>(
        `SELECT reminder_muted_until::text AS t FROM platform_users WHERE id = $1::uuid`,
        [platformUserId],
      );
      return r.rows[0]?.t ?? null;
    },

    /** После успешного переименования страницы в CMS (`content_pages.slug` уже `newSlug`). */
    async retargetContentPageLinkedSlug(contentPageId, oldSlug, newSlug) {
      const pool = getPool();
      await pool.query(
        `UPDATE reminder_rules AS rr
         SET linked_object_id = $1, updated_at = now()
         FROM content_pages AS cp
         WHERE cp.id = $2::uuid
           AND cp.slug = $1
           AND rr.linked_object_type = 'content_page'
           AND btrim(rr.linked_object_id) = $3`,
        [newSlug, contentPageId, oldSlug],
      );
    },
  };
}
