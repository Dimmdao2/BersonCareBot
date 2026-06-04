/**
 * Репозиторий настроек напоминаний для webapp-пользователя.
 * Читает из `reminder_rules` по `platform_user_id` (или через join с `platform_users`).
 */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { getWebappSqlDb, runWebappSql, runWebappTransaction } from "@/infra/db/runWebappSql";
import type { ReminderRulesPort } from "@/modules/reminders/ports";
import type {
  ReminderCategory,
  ReminderIntent,
  ReminderLinkedObjectType,
  ReminderRule,
  ReminderUpdateSchedule,
} from "@/modules/reminders/types";
import type { SlotsV1ScheduleData } from "@/modules/reminders/scheduleSlots";
import { cancelWebPushOnlyPendingOccurrencesForRule } from "@/infra/repos/pgWebPushOnlyReminders";
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
  integrator_user_id: string | null;
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
    integratorUserId: row.integrator_user_id?.trim() ? row.integrator_user_id.trim() : null,
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
      const r = await runWebappSql<{ integrator_user_id: string }>(
        getWebappSqlDb(),
        sql`SELECT integrator_user_id::text FROM platform_users WHERE id = ${platformUserId}::uuid LIMIT 1`,
      );
      return r.rows[0]?.integrator_user_id ?? null;
    },

    async listByPlatformUser(platformUserId) {
      const r = await runWebappSql<RuleRow>(
        getWebappSqlDb(),
        sql`SELECT ${sql.raw(SELECT_COLS)}
         FROM reminder_rules rr
         LEFT JOIN platform_users pu ON pu.integrator_user_id = rr.integrator_user_id
         WHERE rr.platform_user_id = ${platformUserId}::uuid OR pu.id = ${platformUserId}::uuid
         ORDER BY rr.category`,
      );
      return r.rows.map(toRule);
    },

    async listByPlatformUserWithObjects(platformUserId) {
      const r = await runWebappSql<RuleRow>(
        getWebappSqlDb(),
        sql`SELECT ${sql.raw(SELECT_COLS)}
         FROM reminder_rules rr
         LEFT JOIN platform_users pu ON pu.integrator_user_id = rr.integrator_user_id
         WHERE rr.platform_user_id = ${platformUserId}::uuid OR pu.id = ${platformUserId}::uuid
         ORDER BY rr.updated_at DESC`,
      );
      return r.rows.map(toRule);
    },

    async getByPlatformUserAndCategory(platformUserId, category) {
      const r = await runWebappSql<RuleRow>(
        getWebappSqlDb(),
        sql`SELECT ${sql.raw(SELECT_COLS)}
         FROM reminder_rules rr
         LEFT JOIN platform_users pu ON pu.integrator_user_id = rr.integrator_user_id
         WHERE (rr.platform_user_id = ${platformUserId}::uuid OR pu.id = ${platformUserId}::uuid) AND rr.category = ${category}
         LIMIT 1`,
      );
      return r.rows.length > 0 ? toRule(r.rows[0]) : null;
    },

    async create(input) {
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
      const scheduleDataJson = scheduleData ? JSON.stringify(scheduleData) : null;
      const r = await runWebappSql<RuleRow>(
        getWebappSqlDb(),
        sql`INSERT INTO reminder_rules (
          integrator_rule_id, platform_user_id, integrator_user_id, category, is_enabled,
          schedule_type, timezone, interval_minutes, window_start_minute, window_end_minute,
          days_mask, content_mode,
          linked_object_type, linked_object_id, custom_title, custom_text,
          schedule_data, reminder_intent, display_title, display_description,
          quiet_hours_start_minute, quiet_hours_end_minute,
          notification_topic_code,
          updated_at
        ) VALUES (
          ${integratorRuleId}, ${input.platformUserId}::uuid, ${input.integratorUserId}::bigint, ${category}, ${input.enabled},
          ${scheduleType}, ${tz}, ${input.schedule.intervalMinutes}, ${input.schedule.windowStartMinute}, ${input.schedule.windowEndMinute},
          ${input.schedule.daysMask}, 'none',
          ${input.linkedObjectType}, ${input.linkedObjectId}, ${input.customTitle}, ${input.customText},
          ${scheduleDataJson}::jsonb, ${reminderIntent}, ${input.displayTitle ?? null}, ${input.displayDescription ?? null},
          ${input.quietHoursStartMinute ?? null}, ${input.quietHoursEndMinute ?? null},
          ${notificationTopicCode},
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
      );
      const row = r.rows[0];
      if (!row) throw new Error("reminder_rules insert returned no row");
      return toRule(row);
    },

    async delete(ruleIntegratorId, platformUserId) {
      try {
        return await runWebappTransaction(async (tx) => {
          const own = await runWebappSql<{ id: string; integrator_rule_id: string }>(
            tx,
            sql`SELECT rr.id, rr.integrator_rule_id
           FROM reminder_rules rr
           WHERE rr.integrator_rule_id = ${ruleIntegratorId}
             AND (
               rr.platform_user_id = ${platformUserId}::uuid
               OR rr.integrator_user_id IN (
                 SELECT integrator_user_id FROM platform_users WHERE id = ${platformUserId}::uuid
               )
             )
           LIMIT 1`,
          );
          if (own.rows.length === 0) {
            tx.rollback();
            return false;
          }
          const target = own.rows[0]!;
          await runWebappSql(
            tx,
            sql`DELETE FROM reminder_occurrence_history
           WHERE integrator_rule_id = ${target.integrator_rule_id}`,
          );
          await runWebappSql(
            tx,
            sql`DELETE FROM reminder_rules
           WHERE id = ${target.id}::uuid`,
          );
          return true;
        });
      } catch {
        throw new Error("failed to delete reminder");
      }
    },

    async updateEnabled(ruleIntegratorId, enabled) {
      await runWebappSql(
        getWebappSqlDb(),
        sql`UPDATE reminder_rules SET is_enabled = ${enabled}, updated_at = now()
         WHERE integrator_rule_id = ${ruleIntegratorId}`,
      );
    },

    async updateSchedule(ruleIntegratorId, schedule) {
      await runWebappSql(
        getWebappSqlDb(),
        sql`UPDATE reminder_rules
         SET interval_minutes = ${schedule.intervalMinutes}, window_start_minute = ${schedule.windowStartMinute}, window_end_minute = ${schedule.windowEndMinute},
             days_mask = ${schedule.daysMask}, updated_at = now()
         WHERE integrator_rule_id = ${ruleIntegratorId}`,
      );
    },

    async updateScheduleAndType(ruleIntegratorId, params) {
      const scheduleDataJson = params.scheduleData ? JSON.stringify(params.scheduleData) : null;
      await runWebappSql(
        getWebappSqlDb(),
        sql`UPDATE reminder_rules
         SET schedule_type = ${params.scheduleType},
             interval_minutes = ${params.intervalMinutes},
             window_start_minute = ${params.windowStartMinute},
             window_end_minute = ${params.windowEndMinute},
             days_mask = ${params.daysMask},
             schedule_data = ${scheduleDataJson}::jsonb,
             quiet_hours_start_minute = ${params.quietHoursStartMinute},
             quiet_hours_end_minute = ${params.quietHoursEndMinute},
             updated_at = now()
         WHERE integrator_rule_id = ${ruleIntegratorId}`,
      );
    },

    async updateCustomTexts(ruleIntegratorId, customTitle, customText) {
      await runWebappSql(
        getWebappSqlDb(),
        sql`UPDATE reminder_rules
         SET custom_title = ${customTitle}, custom_text = ${customText}, updated_at = now()
         WHERE integrator_rule_id = ${ruleIntegratorId}`,
      );
    },

    async updateDisplayTexts(ruleIntegratorId, displayTitle, displayDescription) {
      await runWebappSql(
        getWebappSqlDb(),
        sql`UPDATE reminder_rules
         SET display_title = ${displayTitle}, display_description = ${displayDescription}, updated_at = now()
         WHERE integrator_rule_id = ${ruleIntegratorId}`,
      );
    },

    async setReminderMutedUntil(platformUserId, untilIso) {
      await runWebappSql(
        getWebappSqlDb(),
        sql`UPDATE platform_users SET reminder_muted_until = ${untilIso}::timestamptz, updated_at = now()
         WHERE id = ${platformUserId}::uuid`,
      );
    },

    async getReminderMutedUntil(platformUserId) {
      const r = await runWebappSql<{ t: string | null }>(
        getWebappSqlDb(),
        sql`SELECT reminder_muted_until::text AS t FROM platform_users WHERE id = ${platformUserId}::uuid`,
      );
      return r.rows[0]?.t ?? null;
    },

    /** После успешного переименования страницы в CMS (`content_pages.slug` уже `newSlug`). */
    async retargetContentPageLinkedSlug(contentPageId, oldSlug, newSlug) {
      await runWebappSql(
        getWebappSqlDb(),
        sql`UPDATE reminder_rules AS rr
         SET linked_object_id = ${newSlug}, updated_at = now()
         FROM content_pages AS cp
         WHERE cp.id = ${contentPageId}::uuid
           AND cp.slug = ${newSlug}
           AND rr.linked_object_type = 'content_page'
           AND btrim(rr.linked_object_id) = ${oldSlug}`,
      );
    },

    async retargetRehabProgramInstanceLinkedId(platformUserId, oldInstanceId, newInstanceId) {
      const r = await runWebappSql<{ n: number }>(
        getWebappSqlDb(),
        sql`UPDATE reminder_rules
         SET linked_object_id = ${newInstanceId.trim()}, updated_at = now()
         WHERE platform_user_id = ${platformUserId}::uuid
           AND linked_object_type = 'rehab_program'
           AND btrim(linked_object_id) = ${oldInstanceId.trim()}
         RETURNING 1 AS n`,
      );
      return r.rowCount ?? 0;
    },

    async cancelWebPushPendingOccurrences(ruleIntegratorId) {
      await cancelWebPushOnlyPendingOccurrencesForRule(ruleIntegratorId);
    },
  };
}
