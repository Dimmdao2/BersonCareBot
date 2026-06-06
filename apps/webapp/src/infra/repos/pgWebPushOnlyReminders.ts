import { sql } from "drizzle-orm";
import { getWebappSqlDb, runWebappSql, runWebappTransaction } from "@/infra/db/runWebappSql";
import type {
  WebPushOnlyDueOccurrenceRow,
  WebPushOnlyReminderRuleRow,
  WebPushOnlyRemindersPort,
} from "@/modules/reminders/webPushOnlyPorts";
import type { ReminderCategory, ReminderLinkedObjectType } from "@/modules/reminders/types";

function parseLinkedType(raw: string | null): ReminderLinkedObjectType | null {
  if (!raw) return null;
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

function mapRuleRow(row: {
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
  schedule_data: unknown;
  quiet_hours_start_minute: number | null;
  quiet_hours_end_minute: number | null;
  notification_topic_code: string | null;
  linked_object_type: string | null;
  linked_object_id: string | null;
  custom_title: string | null;
  custom_text: string | null;
  display_title: string | null;
  reminder_intent: string | null;
}): WebPushOnlyReminderRuleRow {
  return {
    integratorRuleId: row.integrator_rule_id,
    platformUserId: row.platform_user_id,
    category: row.category as ReminderCategory,
    isEnabled: row.is_enabled,
    scheduleType: row.schedule_type ?? "interval_window",
    timezone: row.timezone?.trim() || "Europe/Moscow",
    intervalMinutes: row.interval_minutes,
    windowStartMinute: row.window_start_minute,
    windowEndMinute: row.window_end_minute,
    daysMask: row.days_mask,
    scheduleData: row.schedule_data,
    quietHoursStartMinute: row.quiet_hours_start_minute,
    quietHoursEndMinute: row.quiet_hours_end_minute,
    notificationTopicCode: row.notification_topic_code,
    linkedObjectType: parseLinkedType(row.linked_object_type),
    linkedObjectId: row.linked_object_id,
    customTitle: row.custom_title,
    customText: row.custom_text,
    displayTitle: row.display_title,
    reminderIntent: row.reminder_intent,
  };
}

const RULE_SELECT = `
  rr.integrator_rule_id,
  rr.platform_user_id::text,
  rr.category,
  rr.is_enabled,
  rr.schedule_type,
  rr.timezone,
  rr.interval_minutes,
  rr.window_start_minute,
  rr.window_end_minute,
  rr.days_mask,
  rr.schedule_data,
  rr.quiet_hours_start_minute,
  rr.quiet_hours_end_minute,
  rr.notification_topic_code,
  rr.linked_object_type,
  rr.linked_object_id,
  rr.custom_title,
  rr.custom_text,
  rr.display_title,
  rr.reminder_intent
`;

/** Drop pending rows after schedule change so old catch-up slots never dispatch. */
export async function cancelWebPushOnlyPendingOccurrencesForRule(integratorRuleId: string): Promise<number> {
  const r = await runWebappSql(
    getWebappSqlDb(),
    sql`DELETE FROM webapp_reminder_occurrences
     WHERE integrator_rule_id = ${integratorRuleId}
       AND status IN ('planned', 'queued')`,
  );
  return r.rowCount ?? 0;
}

/** Legacy catch-up rows: pending slot older than grace window (cron runs every minute). */
export async function expireOrphanedWebPushOnlyPendingOccurrences(nowIso: string): Promise<number> {
  const r = await runWebappSql(
    getWebappSqlDb(),
    sql`UPDATE webapp_reminder_occurrences
     SET status = 'failed', failed_at = now(), error_code = 'orphaned_past_slot', updated_at = now()
     WHERE status IN ('planned', 'queued')
       AND planned_at < ${nowIso}::timestamptz - interval '3 minutes'`,
  );
  return r.rowCount ?? 0;
}

export function createPgWebPushOnlyRemindersPort(): WebPushOnlyRemindersPort {
  return {
    async listEnabledWebPushOnlyRules(nowIso) {
      const res = await runWebappSql<Parameters<typeof mapRuleRow>[0]>(
        getWebappSqlDb(),
        sql`SELECT ${sql.raw(RULE_SELECT)}
         FROM reminder_rules rr
         INNER JOIN platform_users pu ON pu.id = rr.platform_user_id
         WHERE rr.integrator_user_id IS NULL
           AND rr.platform_user_id IS NOT NULL
           AND rr.is_enabled = true
           AND (pu.reminder_muted_until IS NULL OR pu.reminder_muted_until <= ${nowIso}::timestamptz)`,
      );
      return res.rows.map(mapRuleRow);
    },

    async getRuleByIntegratorRuleId(integratorRuleId) {
      const res = await runWebappSql<Parameters<typeof mapRuleRow>[0]>(
        getWebappSqlDb(),
        sql`SELECT ${sql.raw(RULE_SELECT)}
         FROM reminder_rules rr
         WHERE rr.integrator_rule_id = ${integratorRuleId}
           AND rr.integrator_user_id IS NULL
         LIMIT 1`,
      );
      const row = res.rows[0];
      return row ? mapRuleRow(row) : null;
    },

    async upsertPlannedOccurrences(platformUserId, integratorRuleId, drafts) {
      if (drafts.length === 0) return 0;
      let inserted = 0;
      for (const d of drafts) {
        const r = await runWebappSql(
          getWebappSqlDb(),
          sql`INSERT INTO webapp_reminder_occurrences (
             integrator_rule_id, platform_user_id, occurrence_key, planned_at, status, updated_at
           ) VALUES (${integratorRuleId}, ${platformUserId}::uuid, ${d.occurrenceKey}, ${d.plannedAt}::timestamptz, 'planned', now())
           ON CONFLICT (integrator_rule_id, occurrence_key) DO NOTHING
           RETURNING id`,
        );
        if (r.rowCount && r.rowCount > 0) inserted += 1;
      }
      return inserted;
    },

    async claimDueOccurrences(nowIso, limit) {
      const lim = Math.max(1, Math.trunc(limit));
      await runWebappSql(
        getWebappSqlDb(),
        sql`UPDATE webapp_reminder_occurrences
         SET status = 'planned', updated_at = now()
         WHERE status = 'queued'
           AND updated_at < ${nowIso}::timestamptz - interval '10 minutes'`,
      );
      return runWebappTransaction(async (tx) => {
        const sel = await runWebappSql<{
          id: string;
          integrator_rule_id: string;
          platform_user_id: string;
          occurrence_key: string;
          planned_at: string;
        }>(
          tx,
          sql`SELECT o.id::text, o.integrator_rule_id, o.platform_user_id::text, o.occurrence_key, o.planned_at::text
           FROM webapp_reminder_occurrences o
           INNER JOIN platform_users pu ON pu.id = o.platform_user_id
           WHERE o.status = 'planned'
             AND o.planned_at <= ${nowIso}::timestamptz
             AND (pu.reminder_muted_until IS NULL OR pu.reminder_muted_until <= ${nowIso}::timestamptz)
           ORDER BY o.planned_at ASC
           LIMIT ${lim}
           FOR UPDATE SKIP LOCKED`,
        );
        const ids = sel.rows.map((r) => r.id);
        if (ids.length > 0) {
          await runWebappSql(
            tx,
            sql`UPDATE webapp_reminder_occurrences SET status = 'queued', updated_at = now() WHERE id = ANY(${ids}::uuid[])`,
          );
        }
        return sel.rows.map(
          (r): WebPushOnlyDueOccurrenceRow => ({
            id: r.id,
            integratorRuleId: r.integrator_rule_id,
            platformUserId: r.platform_user_id,
            occurrenceKey: r.occurrence_key,
            plannedAt: r.planned_at,
          }),
        );
      });
    },

    async markOccurrenceSent(occurrenceId) {
      await runWebappSql(
        getWebappSqlDb(),
        sql`UPDATE webapp_reminder_occurrences
         SET status = 'sent', sent_at = now(), updated_at = now()
         WHERE id = ${occurrenceId}::uuid`,
      );
    },

    async markOccurrenceFailed(occurrenceId, errorCode) {
      await runWebappSql(
        getWebappSqlDb(),
        sql`UPDATE webapp_reminder_occurrences
         SET status = 'failed', failed_at = now(), error_code = ${errorCode.slice(0, 120)}, updated_at = now()
         WHERE id = ${occurrenceId}::uuid`,
      );
    },

    async expireOrphanedPendingOccurrences(nowIso) {
      return expireOrphanedWebPushOnlyPendingOccurrences(nowIso);
    },

    async resolveLinkedCatalogTitle(linkedObjectType, linkedObjectId) {
      if (linkedObjectType === "content_page") {
        const res = await runWebappSql<{ title: string }>(
          getWebappSqlDb(),
          sql`SELECT title FROM content_pages
           WHERE slug = ${linkedObjectId} AND is_published = true AND deleted_at IS NULL
           LIMIT 1`,
        );
        const title = res.rows[0]?.title?.trim();
        return title && title.length > 0 ? title : null;
      }
      if (linkedObjectType === "content_section") {
        const res = await runWebappSql<{ title: string }>(
          getWebappSqlDb(),
          sql`SELECT title FROM content_sections WHERE slug = ${linkedObjectId} LIMIT 1`,
        );
        const title = res.rows[0]?.title?.trim();
        return title && title.length > 0 ? title : null;
      }
      return null;
    },
  };
}

export const pgWebPushOnlyRemindersPort = createPgWebPushOnlyRemindersPort();
