/**
 * Reminder + content access projection repo (Stage 7).
 * Idempotent by integrator_* ids; platform_user_id resolved from platform_users.
 * Read API returns rows with id/userId as integrator ids (string) for adapter compatibility.
 */

import { sql } from "drizzle-orm";
import { getPool } from "@/infra/db/client";
import { getWebappSqlDb, runWebappSql } from "@/infra/db/runWebappSql";
import { buildReminderDeepLink } from "@/modules/reminders/buildReminderDeepLink";
import { loadWarmupsSectionSlugs } from "@/infra/repos/pgWarmupsSectionSlugs";
import { findCanonicalUserIdByIntegratorId } from "@/infra/repos/pgCanonicalPlatformUser";

export type ReminderRuleListItem = {
  id: string;
  userId: string;
  category: string;
  isEnabled: boolean;
  scheduleType: string;
  timezone: string;
  intervalMinutes: number;
  windowStartMinute: number;
  windowEndMinute: number;
  daysMask: string;
  contentMode: string;
  linkedObjectType: string | null;
  linkedObjectId: string | null;
  customTitle: string | null;
  customText: string | null;
  /** Absolute HTTPS (or dev) URL for bot open-in-webapp (S2.T08). */
  deepLink: string;
  /** `slots_v1` payload; null for `interval_window`. */
  scheduleData: Record<string, unknown> | null;
  reminderIntent: string | null;
  displayTitle: string | null;
  displayDescription: string | null;
  quietHoursStartMinute: number | null;
  quietHoursEndMinute: number | null;
  /** Patient mailing topic (`notifications_topics.id`); null when unset. */
  notificationTopicCode: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type ReminderOccurrenceHistoryItem = {
  id: string;
  ruleId: string;
  status: "sent" | "failed";
  deliveryChannel: string | null;
  errorCode: string | null;
  occurredAt: string;
};

export type ReminderProjectionPort = {
  upsertRuleFromProjection(params: {
    integratorRuleId: string;
    integratorUserId: string;
    category: string;
    isEnabled: boolean;
    scheduleType: string;
    timezone: string;
    intervalMinutes: number;
    windowStartMinute: number;
    windowEndMinute: number;
    daysMask: string;
    contentMode: string;
    updatedAt: string;
  }): Promise<void>;
  appendFinalizedOccurrenceFromProjection(params: {
    integratorOccurrenceId: string;
    integratorRuleId: string;
    integratorUserId: string;
    category: string;
    status: "sent" | "failed";
    deliveryChannel: string | null;
    errorCode: string | null;
    occurredAt: string;
  }): Promise<void>;
  appendDeliveryEventFromProjection(params: {
    integratorDeliveryLogId: string;
    integratorOccurrenceId: string;
    integratorRuleId: string;
    integratorUserId: string;
    channel: string;
    status: string;
    errorCode: string | null;
    payloadJson: Record<string, unknown>;
    createdAt: string;
  }): Promise<void>;
  upsertContentAccessGrantFromProjection(params: {
    integratorGrantId: string;
    integratorUserId: string;
    contentId: string;
    purpose: string;
    tokenHash: string | null;
    expiresAt: string;
    revokedAt: string | null;
    metaJson: Record<string, unknown>;
    createdAt: string;
  }): Promise<void>;
  listRulesByIntegratorUserId(integratorUserId: string): Promise<ReminderRuleListItem[]>;
  getRuleByIntegratorUserIdAndCategory(
    integratorUserId: string,
    category: string
  ): Promise<ReminderRuleListItem | null>;
  listHistoryByIntegratorUserId(
    integratorUserId: string,
    limit?: number
  ): Promise<ReminderOccurrenceHistoryItem[]>;
  /**
   * Кол-во непросмотренных occurrence для пользователя (webapp platform_user_id).
   * Колонка seen_at добавляется в миграции 032. До миграции — всегда 0.
   */
  getUnseenCount(platformUserId: string): Promise<number>;
  /**
   * Статистика occurrence за N дней для пользователя (webapp platform_user_id).
   * Добавляется в D.5; до миграции — нулевые агрегаты.
   */
  getStats(
    platformUserId: string,
    days: number
  ): Promise<{ total: number; seen: number; unseen: number; failed: number }>;
  /**
   * Отмечает occurrence как просмотренные (seen_at = now()) для текущего пользователя.
   * Добавляется в D.5.
   */
  markSeen(platformUserId: string, occurrenceIds: string[]): Promise<void>;
  /**
   * Отмечает ВСЕ непросмотренные occurrence текущего пользователя как просмотренные.
   */
  markAllSeen(platformUserId: string): Promise<void>;
};

function resolvePlatformUserId(
  pool: Awaited<ReturnType<typeof getPool>>,
  integratorUserId: string
): Promise<string | null> {
  if (integratorUserId === "") return Promise.resolve(null);
  return findCanonicalUserIdByIntegratorId(pool, integratorUserId);
}

function mapScheduleDataColumn(raw: unknown): Record<string, unknown> | null {
  if (raw == null) return null;
  if (typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
  return null;
}

export function createPgReminderProjectionPort(): ReminderProjectionPort {
  return {
    async upsertRuleFromProjection(params) {
      const pool = getPool();
      const platformUserId = await resolvePlatformUserId(pool, params.integratorUserId);
      await runWebappSql(
        getWebappSqlDb(),
        sql`
        INSERT INTO reminder_rules (
          integrator_rule_id, platform_user_id, integrator_user_id, category, is_enabled,
          schedule_type, timezone, interval_minutes, window_start_minute, window_end_minute,
          days_mask, content_mode, updated_at
        ) VALUES (
          ${params.integratorRuleId}, ${platformUserId}, ${params.integratorUserId}::bigint, ${params.category},
          ${params.isEnabled}, ${params.scheduleType}, ${params.timezone}, ${params.intervalMinutes},
          ${params.windowStartMinute}, ${params.windowEndMinute}, ${params.daysMask}, ${params.contentMode},
          ${params.updatedAt}::timestamptz
        )
        ON CONFLICT (integrator_rule_id) DO UPDATE SET
          platform_user_id = COALESCE(EXCLUDED.platform_user_id, reminder_rules.platform_user_id),
          integrator_user_id = EXCLUDED.integrator_user_id,
          category = EXCLUDED.category,
          is_enabled = EXCLUDED.is_enabled,
          schedule_type = EXCLUDED.schedule_type,
          timezone = EXCLUDED.timezone,
          interval_minutes = EXCLUDED.interval_minutes,
          window_start_minute = EXCLUDED.window_start_minute,
          window_end_minute = EXCLUDED.window_end_minute,
          days_mask = EXCLUDED.days_mask,
          content_mode = EXCLUDED.content_mode,
          updated_at = EXCLUDED.updated_at`,
      );
    },

    async appendFinalizedOccurrenceFromProjection(params) {
      await runWebappSql(
        getWebappSqlDb(),
        sql`
        INSERT INTO reminder_occurrence_history (
          integrator_occurrence_id, integrator_rule_id, integrator_user_id, category,
          status, delivery_channel, error_code, occurred_at
        ) VALUES (
          ${params.integratorOccurrenceId}, ${params.integratorRuleId}, ${params.integratorUserId}::bigint,
          ${params.category}, ${params.status}, ${params.deliveryChannel ?? null},
          ${params.errorCode ?? null}, ${params.occurredAt}::timestamptz
        )
        ON CONFLICT (integrator_occurrence_id) DO NOTHING`,
      );
    },

    async appendDeliveryEventFromProjection(params) {
      await runWebappSql(
        getWebappSqlDb(),
        sql`
        INSERT INTO reminder_delivery_events (
          integrator_delivery_log_id, integrator_occurrence_id, integrator_rule_id, integrator_user_id,
          channel, status, error_code, payload_json, created_at
        ) VALUES (
          ${params.integratorDeliveryLogId}, ${params.integratorOccurrenceId}, ${params.integratorRuleId},
          ${params.integratorUserId}::bigint, ${params.channel}, ${params.status}, ${params.errorCode ?? null},
          ${JSON.stringify(params.payloadJson ?? {})}::jsonb, ${params.createdAt}::timestamptz
        )
        ON CONFLICT (integrator_delivery_log_id) DO NOTHING`,
      );
    },

    async upsertContentAccessGrantFromProjection(params) {
      const pool = getPool();
      const platformUserId = await resolvePlatformUserId(pool, params.integratorUserId);
      await runWebappSql(
        getWebappSqlDb(),
        sql`
        INSERT INTO content_access_grants_webapp (
          integrator_grant_id, platform_user_id, integrator_user_id, content_id, purpose,
          token_hash, expires_at, revoked_at, meta_json, created_at
        ) VALUES (
          ${params.integratorGrantId}, ${platformUserId}, ${params.integratorUserId}::bigint, ${params.contentId},
          ${params.purpose}, ${params.tokenHash ?? null}, ${params.expiresAt}::timestamptz,
          ${params.revokedAt ?? null}::timestamptz, ${JSON.stringify(params.metaJson ?? {})}::jsonb,
          ${params.createdAt}::timestamptz
        )
        ON CONFLICT (integrator_grant_id) DO UPDATE SET
          platform_user_id = COALESCE(EXCLUDED.platform_user_id, content_access_grants_webapp.platform_user_id),
          integrator_user_id = EXCLUDED.integrator_user_id,
          content_id = EXCLUDED.content_id,
          purpose = EXCLUDED.purpose,
          token_hash = EXCLUDED.token_hash,
          expires_at = EXCLUDED.expires_at,
          revoked_at = EXCLUDED.revoked_at,
          meta_json = EXCLUDED.meta_json`,
      );
    },

    async listRulesByIntegratorUserId(integratorUserId: string) {
      const pool = getPool();
      const r = await runWebappSql<{
        integrator_rule_id: string;
        integrator_user_id: string;
        category: string;
        is_enabled: boolean;
        schedule_type: string;
        timezone: string;
        interval_minutes: number;
        window_start_minute: number;
        window_end_minute: number;
        days_mask: string;
        content_mode: string;
        linked_object_type: string | null;
        linked_object_id: string | null;
        custom_title: string | null;
        custom_text: string | null;
        schedule_data: unknown;
        reminder_intent: string | null;
        display_title: string | null;
        display_description: string | null;
        quiet_hours_start_minute: number | null;
        quiet_hours_end_minute: number | null;
        notification_topic_code: string | null;
        created_at: string;
        updated_at: string;
      }>(
        getWebappSqlDb(),
        sql`
        SELECT integrator_rule_id, integrator_user_id::text, category, is_enabled, schedule_type,
                timezone, interval_minutes, window_start_minute, window_end_minute, days_mask, content_mode,
                linked_object_type, linked_object_id, custom_title, custom_text,
                schedule_data, reminder_intent, display_title, display_description,
                quiet_hours_start_minute, quiet_hours_end_minute,
                notification_topic_code,
                created_at, updated_at
         FROM reminder_rules WHERE integrator_user_id = ${integratorUserId}::bigint ORDER BY category`,
      );
      const warmupsSectionSlugs = await loadWarmupsSectionSlugs(pool);
      const deepLinkOpts = { warmupsSectionSlugs };
      return r.rows.map((row) => {
        return {
          id: row.integrator_rule_id,
          userId: row.integrator_user_id,
          category: row.category,
          isEnabled: row.is_enabled,
          scheduleType: row.schedule_type,
          timezone: row.timezone,
          intervalMinutes: row.interval_minutes,
          windowStartMinute: row.window_start_minute,
          windowEndMinute: row.window_end_minute,
          daysMask: row.days_mask,
          contentMode: row.content_mode,
          linkedObjectType: row.linked_object_type,
          linkedObjectId: row.linked_object_id,
          customTitle: row.custom_title,
          customText: row.custom_text,
          scheduleData: mapScheduleDataColumn(row.schedule_data),
          reminderIntent: row.reminder_intent,
          displayTitle: row.display_title,
          displayDescription: row.display_description,
          quietHoursStartMinute: row.quiet_hours_start_minute ?? null,
          quietHoursEndMinute: row.quiet_hours_end_minute ?? null,
          notificationTopicCode: row.notification_topic_code ?? null,
          deepLink: buildReminderDeepLink(
            {
              linkedObjectType: row.linked_object_type,
              linkedObjectId: row.linked_object_id,
              reminderIntent: row.reminder_intent,
            },
            deepLinkOpts,
          ),
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        };
      });
    },

    async getRuleByIntegratorUserIdAndCategory(integratorUserId: string, category: string) {
      const pool = getPool();
      const r = await runWebappSql<{
        integrator_rule_id: string;
        integrator_user_id: string;
        category: string;
        is_enabled: boolean;
        schedule_type: string;
        timezone: string;
        interval_minutes: number;
        window_start_minute: number;
        window_end_minute: number;
        days_mask: string;
        content_mode: string;
        linked_object_type: string | null;
        linked_object_id: string | null;
        custom_title: string | null;
        custom_text: string | null;
        schedule_data: unknown;
        reminder_intent: string | null;
        display_title: string | null;
        display_description: string | null;
        quiet_hours_start_minute: number | null;
        quiet_hours_end_minute: number | null;
        notification_topic_code: string | null;
        created_at: string;
        updated_at: string;
      }>(
        getWebappSqlDb(),
        sql`
        SELECT integrator_rule_id, integrator_user_id::text, category, is_enabled, schedule_type,
                timezone, interval_minutes, window_start_minute, window_end_minute, days_mask, content_mode,
                linked_object_type, linked_object_id, custom_title, custom_text,
                schedule_data, reminder_intent, display_title, display_description,
                quiet_hours_start_minute, quiet_hours_end_minute,
                notification_topic_code,
                created_at, updated_at
         FROM reminder_rules WHERE integrator_user_id = ${integratorUserId}::bigint AND category = ${category}`,
      );
      const row = r.rows[0];
      if (!row) return null;
      const warmupsSectionSlugs = await loadWarmupsSectionSlugs(pool);
      return {
        id: row.integrator_rule_id,
        userId: row.integrator_user_id,
        category: row.category,
        isEnabled: row.is_enabled,
        scheduleType: row.schedule_type,
        timezone: row.timezone,
        intervalMinutes: row.interval_minutes,
        windowStartMinute: row.window_start_minute,
        windowEndMinute: row.window_end_minute,
        daysMask: row.days_mask,
        contentMode: row.content_mode,
        linkedObjectType: row.linked_object_type,
        linkedObjectId: row.linked_object_id,
        customTitle: row.custom_title,
        customText: row.custom_text,
        scheduleData: mapScheduleDataColumn(row.schedule_data),
        reminderIntent: row.reminder_intent,
        displayTitle: row.display_title,
        displayDescription: row.display_description,
        quietHoursStartMinute: row.quiet_hours_start_minute ?? null,
        quietHoursEndMinute: row.quiet_hours_end_minute ?? null,
        notificationTopicCode: row.notification_topic_code ?? null,
        deepLink: buildReminderDeepLink(
          {
            linkedObjectType: row.linked_object_type,
            linkedObjectId: row.linked_object_id,
            reminderIntent: row.reminder_intent,
          },
          { warmupsSectionSlugs },
        ),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    },

    async listHistoryByIntegratorUserId(integratorUserId: string, limit = 50) {
      const r = await runWebappSql<{
        integrator_occurrence_id: string;
        integrator_rule_id: string;
        status: string;
        delivery_channel: string | null;
        error_code: string | null;
        occurred_at: string;
      }>(
        getWebappSqlDb(),
        sql`
        SELECT integrator_occurrence_id, integrator_rule_id, status, delivery_channel, error_code, occurred_at
         FROM reminder_occurrence_history
         WHERE integrator_user_id = ${integratorUserId}::bigint
         ORDER BY occurred_at DESC
         LIMIT ${limit}`,
      );
      return r.rows.map((row) => ({
        id: row.integrator_occurrence_id,
        ruleId: row.integrator_rule_id,
        status: row.status as "sent" | "failed",
        deliveryChannel: row.delivery_channel,
        errorCode: row.error_code,
        occurredAt: row.occurred_at,
      }));
    },

    async getUnseenCount(platformUserId: string) {
      try {
        const r = await runWebappSql<{ cnt: string }>(
          getWebappSqlDb(),
          sql`
          SELECT COUNT(*)::text AS cnt
           FROM reminder_occurrence_history roh
           JOIN reminder_rules rr ON rr.integrator_rule_id = roh.integrator_rule_id
           WHERE rr.platform_user_id = ${platformUserId}::uuid
             AND roh.seen_at IS NULL`,
        );
        return parseInt(r.rows[0]?.cnt ?? "0", 10);
      } catch {
        // seen_at column doesn't exist yet (migration 032 pending)
        return 0;
      }
    },

    async getStats(platformUserId: string, days: number) {
      try {
        const r = await runWebappSql<{
          total: string;
          seen: string;
          unseen: string;
          failed: string;
        }>(
          getWebappSqlDb(),
          sql`
          SELECT
             COUNT(*)::text AS total,
             COUNT(*) FILTER (WHERE roh.seen_at IS NOT NULL)::text AS seen,
             COUNT(*) FILTER (WHERE roh.seen_at IS NULL)::text AS unseen,
             COUNT(*) FILTER (WHERE roh.status = 'failed')::text AS failed
           FROM reminder_occurrence_history roh
           JOIN reminder_rules rr ON rr.integrator_rule_id = roh.integrator_rule_id
           WHERE rr.platform_user_id = ${platformUserId}::uuid
             AND roh.occurred_at >= now() - make_interval(days => ${days})`,
        );
        const row = r.rows[0];
        return {
          total: parseInt(row?.total ?? "0", 10),
          seen: parseInt(row?.seen ?? "0", 10),
          unseen: parseInt(row?.unseen ?? "0", 10),
          failed: parseInt(row?.failed ?? "0", 10),
        };
      } catch {
        return { total: 0, seen: 0, unseen: 0, failed: 0 };
      }
    },

    async markSeen(platformUserId: string, occurrenceIds: string[]) {
      if (occurrenceIds.length === 0) return;
      await runWebappSql(
        getWebappSqlDb(),
        sql`
        UPDATE reminder_occurrence_history
         SET seen_at = now()
         WHERE integrator_occurrence_id = ANY(${occurrenceIds})
           AND integrator_rule_id IN (
             SELECT integrator_rule_id
             FROM reminder_rules
             WHERE platform_user_id = ${platformUserId}::uuid
           )`,
      );
    },

    async markAllSeen(platformUserId: string) {
      await runWebappSql(
        getWebappSqlDb(),
        sql`
        UPDATE reminder_occurrence_history
         SET seen_at = now()
         WHERE seen_at IS NULL
           AND integrator_rule_id IN (
             SELECT integrator_rule_id
             FROM reminder_rules
             WHERE platform_user_id = ${platformUserId}::uuid
           )`,
      );
    },
  };
}
