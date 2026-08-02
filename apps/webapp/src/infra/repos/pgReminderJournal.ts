/**
 * Журнал действий по напоминаниям + запись snooze/skip в reminder_occurrence_history.
 */
import { sql } from 'drizzle-orm';
import { getWebappSqlDb, runWebappSql, runWebappTransaction } from '@/infra/db/runWebappSql';
import type {
  ReminderJournalAction,
  ReminderJournalEntry,
  ReminderJournalPort,
  ReminderJournalRuleStats,
} from '@/modules/reminders/reminderJournalPort';

function mapJournalRow(row: {
  id: string;
  rule_id: string;
  occurrence_id: string | null;
  action: string;
  snooze_until: string | null;
  skip_reason: string | null;
  created_at: string;
}): ReminderJournalEntry {
  return {
    id: row.id,
    ruleId: row.rule_id,
    occurrenceId: row.occurrence_id,
    action: row.action as ReminderJournalAction,
    snoozeUntil: row.snooze_until,
    skipReason: row.skip_reason,
    createdAt: row.created_at,
  };
}

export function createPgReminderJournalPort(): ReminderJournalPort {
  return {
    async logAction(params) {
      const r = await runWebappSql<{ id: string }>(
        getWebappSqlDb(),
        sql`INSERT INTO reminder_journal (rule_id, occurrence_id, action, snooze_until, skip_reason)
         SELECT rr.id, ${params.occurrenceId}, ${params.action}, ${params.snoozeUntil ?? null}, ${params.skipReason ?? null}
         FROM reminder_rules rr
         LEFT JOIN platform_users pu ON pu.integrator_user_id = rr.integrator_user_id
         WHERE rr.integrator_rule_id = ${params.ruleIntegratorId}
           AND (rr.platform_user_id = ${params.platformUserId}::uuid OR pu.id = ${params.platformUserId}::uuid)
         LIMIT 1
         RETURNING id`,
      );
      if (r.rowCount === 0 || !r.rows[0]) {
        throw new Error(
          'reminder_journal.logAction: no row inserted (rule not found or not owned by user)',
        );
      }
    },

    async listByRule(ruleIntegratorId, platformUserId) {
      const r = await runWebappSql<{
        id: string;
        rule_id: string;
        occurrence_id: string | null;
        action: string;
        snooze_until: string | null;
        skip_reason: string | null;
        created_at: string;
      }>(
        getWebappSqlDb(),
        sql`SELECT rj.id, rj.rule_id, rj.occurrence_id, rj.action, rj.snooze_until, rj.skip_reason, rj.created_at
         FROM reminder_journal rj
         INNER JOIN reminder_rules rr ON rr.id = rj.rule_id
         LEFT JOIN platform_users pu ON pu.integrator_user_id = rr.integrator_user_id
         WHERE rr.integrator_rule_id = ${ruleIntegratorId}
           AND (rr.platform_user_id = ${platformUserId}::uuid OR pu.id = ${platformUserId}::uuid)
         ORDER BY rj.created_at DESC`,
      );
      return r.rows.map(mapJournalRow);
    },

    async statsForUser(platformUserId, days) {
      const r = await runWebappSql<{ action: string; cnt: string }>(
        getWebappSqlDb(),
        sql`SELECT rj.action, COUNT(*)::text AS cnt
         FROM reminder_journal rj
         INNER JOIN reminder_rules rr ON rr.id = rj.rule_id
         LEFT JOIN platform_users pu ON pu.integrator_user_id = rr.integrator_user_id
         WHERE (rr.platform_user_id = ${platformUserId}::uuid OR pu.id = ${platformUserId}::uuid)
           AND rj.created_at >= now() - make_interval(days => ${days})
         GROUP BY rj.action`,
      );
      const out = { done: 0, skipped: 0, snoozed: 0 };
      for (const row of r.rows) {
        const n = parseInt(row.cnt, 10);
        if (row.action === 'done') out.done = n;
        else if (row.action === 'skipped') out.skipped = n;
        else if (row.action === 'snoozed') out.snoozed = n;
      }
      return out;
    },

    async statsPerRuleForUser(platformUserId, days) {
      const r = await runWebappSql<{ rule_id: string; action: string; cnt: string }>(
        getWebappSqlDb(),
        sql`SELECT rr.integrator_rule_id AS rule_id, rj.action, COUNT(*)::text AS cnt
         FROM reminder_journal rj
         INNER JOIN reminder_rules rr ON rr.id = rj.rule_id
         LEFT JOIN platform_users pu ON pu.integrator_user_id = rr.integrator_user_id
         WHERE (rr.platform_user_id = ${platformUserId}::uuid OR pu.id = ${platformUserId}::uuid)
           AND rj.created_at >= now() - make_interval(days => ${days})
         GROUP BY rr.integrator_rule_id, rj.action`,
      );
      const out: Record<string, ReminderJournalRuleStats> = {};
      for (const row of r.rows) {
        const rid = row.rule_id;
        if (!out[rid]) out[rid] = { done: 0, skipped: 0, snoozed: 0 };
        const n = parseInt(row.cnt, 10);
        if (row.action === 'done') out[rid].done = n;
        else if (row.action === 'skipped') out[rid].skipped = n;
        else if (row.action === 'snoozed') out[rid].snoozed = n;
      }
      return out;
    },

    async countDoneSkippedInUtcRange(platformUserId, rangeStart, rangeEnd) {
      const r = await runWebappSql<{ cnt: string }>(
        getWebappSqlDb(),
        sql`SELECT COUNT(*)::text AS cnt
         FROM reminder_journal rj
         INNER JOIN reminder_rules rr ON rr.id = rj.rule_id
         LEFT JOIN platform_users pu ON pu.integrator_user_id = rr.integrator_user_id
         WHERE (rr.platform_user_id = ${platformUserId}::uuid OR pu.id = ${platformUserId}::uuid)
           AND rj.created_at >= ${rangeStart.toISOString()}::timestamptz
           AND rj.created_at < ${rangeEnd.toISOString()}::timestamptz
           AND rj.action IN ('done','skipped')`,
      );
      const row = r.rows[0];
      return row ? parseInt(row.cnt, 10) : 0;
    },

    async recordDone(_platformUserId, integratorOccurrenceId, _displayTimeZone) {
      try {
        return await runWebappTransaction(async (tx) => {
          const result = await runWebappSql<{
            done_at: string;
            first_done_for_occurrence: boolean;
            day_done_count: number;
            day_sent_total: number;
            day_fully_done: boolean;
          }>(
            tx,
            sql`SELECT done_at::text, first_done_for_occurrence, day_done_count,
                       day_sent_total, day_fully_done
                FROM app.patient_done_reminder_occurrence(${integratorOccurrenceId}::text)`,
          );
          const row = result.rows[0];
          if (!row) {
            tx.rollback();
            return { ok: false, error: 'not_found' } as const;
          }
          return {
            ok: true,
            occurrenceId: integratorOccurrenceId,
            doneAt: row.done_at,
            firstDoneForOccurrence: row.first_done_for_occurrence,
            dayDoneCount: Number(row.day_done_count),
            daySentTotal: Number(row.day_sent_total),
            dayFullyDone: row.day_fully_done,
          };
        });
      } catch (err) {
        console.warn('[pgReminderJournal.recordDone]', err);
        return { ok: false, error: 'not_found' };
      }
    },

    async recordSnooze(platformUserId, integratorOccurrenceId, minutes) {
      try {
        return await runWebappTransaction(async (tx) => {
          const snoozeAction = await runWebappSql<{ snoozed_until: string }>(
            tx,
            sql`SELECT snoozed_until::text
                FROM app.patient_snooze_reminder_occurrence(
                  ${platformUserId}::uuid,
                  ${integratorOccurrenceId}::text,
                  ${minutes}::integer
                )`,
          );
          const snoozedUntil = snoozeAction.rows[0]?.snoozed_until;
          if (!snoozedUntil) {
            tx.rollback();
            return { ok: false, error: 'not_found' } as const;
          }

          return { ok: true, occurrenceId: integratorOccurrenceId, snoozedUntil };
        });
      } catch (err) {
        console.warn('[pgReminderJournal.recordSnooze]', err);
        return { ok: false, error: 'not_found' };
      }
    },

    async recordSkip(platformUserId, integratorOccurrenceId, _reason) {
      try {
        return await runWebappTransaction(async (tx) => {
          const skipAction = await runWebappSql<{ skipped_at: string }>(
            tx,
            sql`SELECT skipped_at::text
                FROM app.patient_skip_reminder_occurrence(
                  ${platformUserId}::uuid,
                  ${integratorOccurrenceId}::text,
                  NULL::text
                )`,
          );
          const skippedAt = skipAction.rows[0]?.skipped_at;
          if (!skippedAt) {
            tx.rollback();
            return { ok: false, error: 'not_found' } as const;
          }

          return { ok: true, occurrenceId: integratorOccurrenceId, skippedAt };
        });
      } catch (err) {
        console.warn('[pgReminderJournal.recordSkip]', err);
        return { ok: false, error: 'not_found' };
      }
    },
  };
}
