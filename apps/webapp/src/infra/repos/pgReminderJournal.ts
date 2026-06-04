/**
 * Журнал действий по напоминаниям + запись snooze/skip в reminder_occurrence_history.
 */
import { sql } from "drizzle-orm";
import { getWebappSqlDb, runWebappSql, runWebappTransaction } from "@/infra/db/runWebappSql";
import type {
  ReminderJournalAction,
  ReminderJournalEntry,
  ReminderJournalPort,
  ReminderJournalRuleStats,
} from "@/modules/reminders/reminderJournalPort";

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
          "reminder_journal.logAction: no row inserted (rule not found or not owned by user)",
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
        if (row.action === "done") out.done = n;
        else if (row.action === "skipped") out.skipped = n;
        else if (row.action === "snoozed") out.snoozed = n;
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
        if (row.action === "done") out[rid].done = n;
        else if (row.action === "skipped") out[rid].skipped = n;
        else if (row.action === "snoozed") out[rid].snoozed = n;
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

    async recordDone(platformUserId, integratorOccurrenceId, displayTimeZone) {
      try {
        return await runWebappTransaction(async (tx) => {
          const own = await runWebappSql<{
            rule_pk: string;
            integrator_user_id: string;
            occurred_at: string;
          }>(
            tx,
            sql`SELECT rr.id AS rule_pk,
                  roh.integrator_user_id::text AS integrator_user_id,
                  roh.occurred_at::text AS occurred_at
           FROM reminder_occurrence_history roh
           INNER JOIN platform_users pu ON pu.integrator_user_id = roh.integrator_user_id
           INNER JOIN reminder_rules rr ON rr.integrator_rule_id = roh.integrator_rule_id
           WHERE roh.integrator_occurrence_id = ${integratorOccurrenceId} AND pu.id = ${platformUserId}::uuid`,
          );
          if (own.rows.length === 0) {
            tx.rollback();
            return { ok: false, error: "not_found" } as const;
          }
          const { rule_pk: rulePk, integrator_user_id: integratorUserId, occurred_at: occurredAt } =
            own.rows[0]!;
          const ins = await runWebappSql<{ created_at: string }>(
            tx,
            sql`INSERT INTO reminder_journal (rule_id, occurrence_id, action)
           SELECT ${rulePk}::uuid, ${integratorOccurrenceId}, 'done'
           WHERE NOT EXISTS (
             SELECT 1 FROM reminder_journal
             WHERE occurrence_id = ${integratorOccurrenceId} AND action = 'done'
           )
           RETURNING created_at::text`,
          );
          const firstDoneForOccurrence = (ins.rowCount ?? 0) > 0;
          let doneAt: string | undefined;
          if (!firstDoneForOccurrence) {
            const existing = await runWebappSql<{ created_at: string }>(
              tx,
              sql`SELECT created_at::text FROM reminder_journal
             WHERE occurrence_id = ${integratorOccurrenceId} AND action = 'done'
             ORDER BY created_at DESC LIMIT 1`,
            );
            doneAt = existing.rows[0]?.created_at;
            if (!doneAt) {
              tx.rollback();
              return { ok: false, error: "conflict" } as const;
            }
          } else {
            doneAt = ins.rows[0]?.created_at;
            if (!doneAt) {
              tx.rollback();
              return { ok: false, error: "not_found" } as const;
            }
          }

          const stats = await runWebappSql<{ day_sent_total: number; day_done_count: number }>(
            tx,
            sql`WITH day_ctx AS (
             SELECT (${occurredAt}::timestamptz AT TIME ZONE ${displayTimeZone}::text)::date AS local_day,
                    ${integratorUserId}::bigint AS iu
           )
           SELECT
             (
               SELECT COUNT(*)::int
               FROM reminder_occurrence_history roh
               CROSS JOIN day_ctx d
               WHERE roh.integrator_user_id = d.iu
                 AND roh.status = 'sent'
                 AND (roh.occurred_at AT TIME ZONE ${displayTimeZone}::text)::date = d.local_day
             ) AS day_sent_total,
             (
               SELECT COUNT(*)::int
               FROM reminder_occurrence_history roh
               INNER JOIN reminder_rules rr ON rr.integrator_rule_id = roh.integrator_rule_id
               INNER JOIN reminder_journal rj
                 ON rj.rule_id = rr.id
                 AND rj.occurrence_id = roh.integrator_occurrence_id
                 AND rj.action = 'done'
               CROSS JOIN day_ctx d
               WHERE roh.integrator_user_id = d.iu
                 AND roh.status = 'sent'
                 AND (roh.occurred_at AT TIME ZONE ${displayTimeZone}::text)::date = d.local_day
             ) AS day_done_count`,
          );
          const daySentTotal = Number(stats.rows[0]?.day_sent_total ?? 0);
          const dayDoneCount = Number(stats.rows[0]?.day_done_count ?? 0);
          const dayFullyDone =
            firstDoneForOccurrence && daySentTotal > 0 && dayDoneCount === daySentTotal;

          return {
            ok: true,
            occurrenceId: integratorOccurrenceId,
            doneAt: doneAt!,
            firstDoneForOccurrence,
            dayDoneCount,
            daySentTotal,
            dayFullyDone,
          };
        });
      } catch (err) {
        console.warn("[pgReminderJournal.recordDone]", err);
        return { ok: false, error: "not_found" };
      }
    },

    async recordSnooze(platformUserId, integratorOccurrenceId, minutes) {
      try {
        return await runWebappTransaction(async (tx) => {
          const own = await runWebappSql<{
            rule_pk: string;
            snoozed_until: string | null;
            skipped_at: string | null;
          }>(
            tx,
            sql`SELECT rr.id AS rule_pk, roh.snoozed_until, roh.skipped_at
           FROM reminder_occurrence_history roh
           INNER JOIN platform_users pu ON pu.integrator_user_id = roh.integrator_user_id
           INNER JOIN reminder_rules rr ON rr.integrator_rule_id = roh.integrator_rule_id
           WHERE roh.integrator_occurrence_id = ${integratorOccurrenceId} AND pu.id = ${platformUserId}::uuid`,
          );
          if (own.rows.length === 0) {
            tx.rollback();
            return { ok: false, error: "not_found" } as const;
          }
          const rulePk = own.rows[0]!.rule_pk;
          if (own.rows[0]!.skipped_at) {
            tx.rollback();
            return { ok: false, error: "not_found" } as const;
          }
          const untilR = await runWebappSql<{ until: string }>(
            tx,
            sql`SELECT (now() + make_interval(mins => ${minutes})) AS until`,
          );
          const snoozedUntil = untilR.rows[0]?.until;
          if (!snoozedUntil) {
            tx.rollback();
            return { ok: false, error: "not_found" } as const;
          }

          const existingUntil = own.rows[0]!.snoozed_until;
          if (
            existingUntil &&
            new Date(existingUntil).getTime() === new Date(snoozedUntil).getTime()
          ) {
            return { ok: true, occurrenceId: integratorOccurrenceId, snoozedUntil: existingUntil };
          }

          const snoozeUpd = await runWebappSql(
            tx,
            sql`UPDATE reminder_occurrence_history
           SET snoozed_at = now(), snoozed_until = ${snoozedUntil}::timestamptz
           WHERE integrator_occurrence_id = ${integratorOccurrenceId}
             AND skipped_at IS NULL`,
          );
          if ((snoozeUpd.rowCount ?? 0) === 0) {
            tx.rollback();
            return { ok: false, error: "not_found" } as const;
          }

          await runWebappSql(
            tx,
            sql`INSERT INTO reminder_journal (rule_id, occurrence_id, action, snooze_until)
           SELECT ${rulePk}::uuid, ${integratorOccurrenceId}, 'snoozed', ${snoozedUntil}::timestamptz
           WHERE NOT EXISTS (
             SELECT 1 FROM reminder_journal
             WHERE occurrence_id = ${integratorOccurrenceId} AND action = 'snoozed' AND snooze_until = ${snoozedUntil}::timestamptz
           )`,
          );

          return { ok: true, occurrenceId: integratorOccurrenceId, snoozedUntil };
        });
      } catch (err) {
        console.warn("[pgReminderJournal.recordSnooze]", err);
        return { ok: false, error: "not_found" };
      }
    },

    async recordSkip(platformUserId, integratorOccurrenceId, reason) {
      try {
        return await runWebappTransaction(async (tx) => {
          const own = await runWebappSql<{ rule_pk: string }>(
            tx,
            sql`SELECT rr.id AS rule_pk
           FROM reminder_occurrence_history roh
           INNER JOIN platform_users pu ON pu.integrator_user_id = roh.integrator_user_id
           INNER JOIN reminder_rules rr ON rr.integrator_rule_id = roh.integrator_rule_id
           WHERE roh.integrator_occurrence_id = ${integratorOccurrenceId} AND pu.id = ${platformUserId}::uuid`,
          );
          if (own.rows.length === 0) {
            tx.rollback();
            return { ok: false, error: "not_found" } as const;
          }
          const rulePk = own.rows[0]!.rule_pk;
          const upd = await runWebappSql<{ skipped_at: string }>(
            tx,
            sql`UPDATE reminder_occurrence_history roh
           SET skipped_at = COALESCE(roh.skipped_at, now()),
               skip_reason = CASE WHEN roh.skipped_at IS NULL THEN ${reason} ELSE roh.skip_reason END
           FROM platform_users pu
           WHERE roh.integrator_occurrence_id = ${integratorOccurrenceId}
             AND roh.integrator_user_id = pu.integrator_user_id
             AND pu.id = ${platformUserId}::uuid
           RETURNING roh.skipped_at`,
          );
          const skippedAt = upd.rows[0]?.skipped_at;
          if (!skippedAt) {
            tx.rollback();
            return { ok: false, error: "not_found" } as const;
          }

          await runWebappSql(
            tx,
            sql`INSERT INTO reminder_journal (rule_id, occurrence_id, action, skip_reason)
           SELECT ${rulePk}::uuid, ${integratorOccurrenceId}, 'skipped', ${reason}
           WHERE NOT EXISTS (
             SELECT 1 FROM reminder_journal
             WHERE occurrence_id = ${integratorOccurrenceId} AND action = 'skipped'
           )`,
          );

          return { ok: true, occurrenceId: integratorOccurrenceId, skippedAt };
        });
      } catch (err) {
        console.warn("[pgReminderJournal.recordSkip]", err);
        return { ok: false, error: "not_found" };
      }
    },
  };
}
