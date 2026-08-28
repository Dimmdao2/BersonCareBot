/**
 * Reminder projection reads (Stage 7).
 *
 * Track D (#987): every read is keyed by canonical `public.platform_users.id`; `userId` in the
 * returned rows is that same canonical uuid, not a retired integrator id. The two projection
 * upserts that used to live here were the retired M2M write path and had no callers — see
 * `@/modules/reminders/projectionPort`.
 */

import { sql } from 'drizzle-orm';
import { getCurrentDbPrincipal } from '@bersoncare/db-principal';
import { getPool } from '@/infra/db/client';
import { getWebappSqlDb, runWebappNamedRoot, runWebappSql } from '@/infra/db/runWebappSql';
import { buildReminderDeepLink } from '@/modules/reminders/buildReminderDeepLink';
import { env } from '@/config/env';
import { loadWarmupsSectionSlugs } from '@/infra/repos/pgWarmupsSectionSlugs';
import type {
  ReminderOccurrenceHistoryItem,
  ReminderProjectionPort,
  ReminderRuleListItem,
} from '@/modules/reminders/projectionPort';

function mapScheduleDataColumn(raw: unknown): Record<string, unknown> | null {
  if (raw == null) return null;
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>;
  return null;
}

export function createPgReminderProjectionPort(): ReminderProjectionPort {
  return {
    async listRulesByPlatformUserId(platformUserId: string) {
      const pool = getPool();
      const r = await runWebappSql<{
        integrator_rule_id: string;
        platform_user_id: string;
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
        SELECT integrator_rule_id, platform_user_id::text, category, is_enabled, schedule_type,
                timezone, interval_minutes, window_start_minute, window_end_minute, days_mask, content_mode,
                linked_object_type, linked_object_id, custom_title, custom_text,
                schedule_data, reminder_intent, display_title, display_description,
                quiet_hours_start_minute, quiet_hours_end_minute,
                notification_topic_code,
                created_at, updated_at
         FROM reminder_rules WHERE platform_user_id = ${platformUserId}::uuid ORDER BY category`,
      );
      const warmupsSectionSlugs = await loadWarmupsSectionSlugs(pool);
      const deepLinkOpts = { warmupsSectionSlugs };
      return r.rows.map((row) => {
        return {
          id: row.integrator_rule_id,
          userId: row.platform_user_id,
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
              appBaseUrl: env.APP_BASE_URL,
            },
            deepLinkOpts,
          ),
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        };
      });
    },

    async getRuleByPlatformUserIdAndCategory(platformUserId: string, category: string) {
      const pool = getPool();
      const r = await runWebappSql<{
        integrator_rule_id: string;
        platform_user_id: string;
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
        SELECT integrator_rule_id, platform_user_id::text, category, is_enabled, schedule_type,
                timezone, interval_minutes, window_start_minute, window_end_minute, days_mask, content_mode,
                linked_object_type, linked_object_id, custom_title, custom_text,
                schedule_data, reminder_intent, display_title, display_description,
                quiet_hours_start_minute, quiet_hours_end_minute,
                notification_topic_code,
                created_at, updated_at
         FROM reminder_rules WHERE platform_user_id = ${platformUserId}::uuid AND category = ${category}`,
      );
      const row = r.rows[0];
      if (!row) return null;
      const warmupsSectionSlugs = await loadWarmupsSectionSlugs(pool);
      return {
        id: row.integrator_rule_id,
        userId: row.platform_user_id,
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
            appBaseUrl: env.APP_BASE_URL,
          },
          { warmupsSectionSlugs },
        ),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    },

    async listHistoryByPlatformUserId(platformUserId: string, limit = 50) {
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
         WHERE platform_user_id = ${platformUserId}::uuid
         ORDER BY occurred_at DESC
         LIMIT ${limit}`,
      );
      return r.rows.map((row) => ({
        id: row.integrator_occurrence_id,
        ruleId: row.integrator_rule_id,
        status: row.status as 'sent' | 'failed',
        deliveryChannel: row.delivery_channel,
        errorCode: row.error_code,
        occurredAt: row.occurred_at,
      }));
    },

    async getUnseenCount(platformUserId: string) {
      const r = await runWebappSql<{ cnt: string }>(
        getWebappSqlDb(),
        sql`
          SELECT COUNT(*)::text AS cnt
           FROM reminder_occurrence_history
           WHERE platform_user_id = ${platformUserId}::uuid
             AND seen_at IS NULL`,
      );
      return parseInt(r.rows[0]?.cnt ?? '0', 10);
    },

    async getStats(platformUserId: string, days: number) {
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
            COUNT(*) FILTER (WHERE seen_at IS NOT NULL)::text AS seen,
            COUNT(*) FILTER (WHERE seen_at IS NULL)::text AS unseen,
            COUNT(*) FILTER (WHERE status = 'failed')::text AS failed
          FROM reminder_occurrence_history
          WHERE platform_user_id = ${platformUserId}::uuid
            AND occurred_at >= now() - make_interval(days => ${days})`,
      );
      const row = r.rows[0];
      return {
        total: parseInt(row?.total ?? '0', 10),
        seen: parseInt(row?.seen ?? '0', 10),
        unseen: parseInt(row?.unseen ?? '0', 10),
        failed: parseInt(row?.failed ?? '0', 10),
      };
    },

    async markSeen(platformUserId: string, occurrenceIds: string[]) {
      if (occurrenceIds.length === 0) return;
      if (getCurrentDbPrincipal()?.kind === 'patient') {
        await runWebappNamedRoot(
          getWebappSqlDb(),
          'app.mark_current_patient_reminder_history_seen(text)',
          [JSON.stringify(occurrenceIds)],
          sql`SELECT app.mark_current_patient_reminder_history_seen(
            ${JSON.stringify(occurrenceIds)}::text
          ) AS affected`,
        );
        return;
      }
      await runWebappSql(
        getWebappSqlDb(),
        sql`
        UPDATE reminder_occurrence_history
         SET seen_at = now()
         WHERE integrator_occurrence_id = ANY(${sql.param(occurrenceIds)}::text[])
           AND platform_user_id = ${platformUserId}::uuid`,
      );
    },

    async markAllSeen(platformUserId: string) {
      if (getCurrentDbPrincipal()?.kind === 'patient') {
        await runWebappNamedRoot(
          getWebappSqlDb(),
          'app.mark_all_current_patient_reminder_history_seen()',
          [],
          sql`SELECT app.mark_all_current_patient_reminder_history_seen() AS affected`,
        );
        return;
      }
      await runWebappSql(
        getWebappSqlDb(),
        sql`
        UPDATE reminder_occurrence_history
         SET seen_at = now()
         WHERE seen_at IS NULL
           AND platform_user_id = ${platformUserId}::uuid`,
      );
    },
  };
}
