/**
 * Журнал действий по напоминаниям + запись snooze/skip/done в `reminder_occurrence_history`.
 *
 * Track D final cutover (#987): `public.reminder_journal` (an append-only per-action event log)
 * and `integrator.user_reminder_occurrences` were merged into the one physical occurrence store,
 * `public.reminder_occurrence_history` — the owner's architecture treats an occurrence as a row of
 * CURRENT patient facts (`done_at`/`skipped_at`/`snoozed_at`, each set once and never re-appended),
 * not an event log. `listByRule`/`statsForUser`/`statsPerRuleForUser`/`countDoneSkippedInUtcRange`
 * below synthesize at most one entry per action per occurrence from those facts — this already
 * matched the pre-cutover behavior for skip/snooze (which wrote straight to this table's ancestor
 * even before the merge, never through `reminder_journal`); only `done` genuinely moves from a
 * journal-log source to a fact-column source here.
 */
import { sql } from 'drizzle-orm';
import { getWebappSqlDb, runWebappSql, runWebappTransaction } from '@/infra/db/runWebappSql';
import type {
  ReminderJournalEntry,
  ReminderJournalPort,
  ReminderJournalRuleStats,
} from '@/modules/reminders/reminderJournalPort';

type OccurrenceFactsRow = {
  occurrence_id: string;
  rule_id: string;
  done_at: string | null;
  skipped_at: string | null;
  skip_reason: string | null;
  snoozed_at: string | null;
  snoozed_until: string | null;
};

/** Synthesizes up to one `ReminderJournalEntry` per non-null fact timestamp on one occurrence row. */
function factsToEntries(row: OccurrenceFactsRow): ReminderJournalEntry[] {
  const out: ReminderJournalEntry[] = [];
  if (row.done_at) {
    out.push({
      id: `${row.occurrence_id}:done`,
      ruleId: row.rule_id,
      occurrenceId: row.occurrence_id,
      action: 'done',
      snoozeUntil: null,
      skipReason: null,
      createdAt: row.done_at,
    });
  }
  if (row.skipped_at) {
    out.push({
      id: `${row.occurrence_id}:skipped`,
      ruleId: row.rule_id,
      occurrenceId: row.occurrence_id,
      action: 'skipped',
      snoozeUntil: null,
      skipReason: row.skip_reason,
      createdAt: row.skipped_at,
    });
  }
  if (row.snoozed_at) {
    out.push({
      id: `${row.occurrence_id}:snoozed`,
      ruleId: row.rule_id,
      occurrenceId: row.occurrence_id,
      action: 'snoozed',
      snoozeUntil: row.snoozed_until,
      skipReason: null,
      createdAt: row.snoozed_at,
    });
  }
  return out;
}

export function createPgReminderJournalPort(): ReminderJournalPort {
  return {
    async listByRule(ruleIntegratorId, platformUserId) {
      const r = await runWebappSql<OccurrenceFactsRow>(
        getWebappSqlDb(),
        sql`SELECT h.integrator_occurrence_id AS occurrence_id, h.integrator_rule_id AS rule_id,
                   h.done_at::text, h.skipped_at::text, h.skip_reason,
                   h.snoozed_at::text, h.snoozed_until::text
         FROM reminder_occurrence_history h
         INNER JOIN reminder_rules rr ON rr.integrator_rule_id = h.integrator_rule_id
         WHERE h.integrator_rule_id = ${ruleIntegratorId}
           AND h.platform_user_id = ${platformUserId}::uuid
           AND (h.done_at IS NOT NULL OR h.skipped_at IS NOT NULL OR h.snoozed_at IS NOT NULL)
         ORDER BY GREATEST(
           COALESCE(h.done_at, '-infinity'::timestamptz),
           COALESCE(h.skipped_at, '-infinity'::timestamptz),
           COALESCE(h.snoozed_at, '-infinity'::timestamptz)
         ) DESC`,
      );
      return r.rows.flatMap(factsToEntries).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },

    async statsForUser(platformUserId, days) {
      const r = await runWebappSql<{ done_cnt: string; skipped_cnt: string; snoozed_cnt: string }>(
        getWebappSqlDb(),
        sql`SELECT
              COUNT(*) FILTER (WHERE h.done_at >= now() - make_interval(days => ${days}))::text AS done_cnt,
              COUNT(*) FILTER (WHERE h.skipped_at >= now() - make_interval(days => ${days}))::text AS skipped_cnt,
              COUNT(*) FILTER (WHERE h.snoozed_at >= now() - make_interval(days => ${days}))::text AS snoozed_cnt
            FROM reminder_occurrence_history h
            WHERE h.platform_user_id = ${platformUserId}::uuid`,
      );
      const row = r.rows[0];
      return {
        done: row ? parseInt(row.done_cnt, 10) : 0,
        skipped: row ? parseInt(row.skipped_cnt, 10) : 0,
        snoozed: row ? parseInt(row.snoozed_cnt, 10) : 0,
      };
    },

    async statsPerRuleForUser(platformUserId, days) {
      const r = await runWebappSql<{
        rule_id: string;
        done_cnt: string;
        skipped_cnt: string;
        snoozed_cnt: string;
      }>(
        getWebappSqlDb(),
        sql`SELECT h.integrator_rule_id AS rule_id,
              COUNT(*) FILTER (WHERE h.done_at >= now() - make_interval(days => ${days}))::text AS done_cnt,
              COUNT(*) FILTER (WHERE h.skipped_at >= now() - make_interval(days => ${days}))::text AS skipped_cnt,
              COUNT(*) FILTER (WHERE h.snoozed_at >= now() - make_interval(days => ${days}))::text AS snoozed_cnt
            FROM reminder_occurrence_history h
            WHERE h.platform_user_id = ${platformUserId}::uuid
            GROUP BY h.integrator_rule_id`,
      );
      const out: Record<string, ReminderJournalRuleStats> = {};
      for (const row of r.rows) {
        out[row.rule_id] = {
          done: parseInt(row.done_cnt, 10),
          skipped: parseInt(row.skipped_cnt, 10),
          snoozed: parseInt(row.snoozed_cnt, 10),
        };
      }
      return out;
    },

    async countDoneSkippedInUtcRange(platformUserId, rangeStart, rangeEnd) {
      const r = await runWebappSql<{ cnt: string }>(
        getWebappSqlDb(),
        sql`SELECT COUNT(*)::text AS cnt
         FROM (
           SELECT h.done_at AS at FROM reminder_occurrence_history h
           WHERE h.platform_user_id = ${platformUserId}::uuid
             AND h.done_at IS NOT NULL
           UNION ALL
           SELECT h.skipped_at AS at FROM reminder_occurrence_history h
           WHERE h.platform_user_id = ${platformUserId}::uuid
             AND h.skipped_at IS NOT NULL
         ) facts
         WHERE facts.at >= ${rangeStart.toISOString()}::timestamptz
           AND facts.at < ${rangeEnd.toISOString()}::timestamptz`,
      );
      const row = r.rows[0];
      return row ? parseInt(row.cnt, 10) : 0;
    },

    async recordDone(_platformUserId, integratorOccurrenceId, _displayTimeZone) {
      return runWebappTransaction(async (tx) => {
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
    },

    async recordSnooze(platformUserId, integratorOccurrenceId, minutes) {
      return runWebappTransaction(async (tx) => {
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
    },

    async recordSkip(platformUserId, integratorOccurrenceId, _reason) {
      return runWebappTransaction(async (tx) => {
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
    },
  };
}
