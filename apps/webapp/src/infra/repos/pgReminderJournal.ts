/**
 * Журнал действий по напоминаниям + запись snooze/skip в reminder_occurrence_history.
 */
import { getPool } from "@/infra/db/client";
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
      const pool = getPool();
      const r = await pool.query<{ id: string }>(
        `INSERT INTO reminder_journal (rule_id, occurrence_id, action, snooze_until, skip_reason)
         SELECT rr.id, $3, $4, $5, $6
         FROM reminder_rules rr
         LEFT JOIN platform_users pu ON pu.integrator_user_id = rr.integrator_user_id
         WHERE rr.integrator_rule_id = $1
           AND (rr.platform_user_id = $2::uuid OR pu.id = $2::uuid)
         LIMIT 1
         RETURNING id`,
        [
          params.ruleIntegratorId,
          params.platformUserId,
          params.occurrenceId,
          params.action,
          params.snoozeUntil ?? null,
          params.skipReason ?? null,
        ],
      );
      if (r.rowCount === 0 || !r.rows[0]) {
        throw new Error(
          "reminder_journal.logAction: no row inserted (rule not found or not owned by user)",
        );
      }
    },

    async listByRule(ruleIntegratorId, platformUserId) {
      const pool = getPool();
      const r = await pool.query<{
        id: string;
        rule_id: string;
        occurrence_id: string | null;
        action: string;
        snooze_until: string | null;
        skip_reason: string | null;
        created_at: string;
      }>(
        `SELECT rj.id, rj.rule_id, rj.occurrence_id, rj.action, rj.snooze_until, rj.skip_reason, rj.created_at
         FROM reminder_journal rj
         INNER JOIN reminder_rules rr ON rr.id = rj.rule_id
         LEFT JOIN platform_users pu ON pu.integrator_user_id = rr.integrator_user_id
         WHERE rr.integrator_rule_id = $1
           AND (rr.platform_user_id = $2::uuid OR pu.id = $2::uuid)
         ORDER BY rj.created_at DESC`,
        [ruleIntegratorId, platformUserId],
      );
      return r.rows.map(mapJournalRow);
    },

    async statsForUser(platformUserId, days) {
      const pool = getPool();
      const r = await pool.query<{ action: string; cnt: string }>(
        `SELECT rj.action, COUNT(*)::text AS cnt
         FROM reminder_journal rj
         INNER JOIN reminder_rules rr ON rr.id = rj.rule_id
         LEFT JOIN platform_users pu ON pu.integrator_user_id = rr.integrator_user_id
         WHERE (rr.platform_user_id = $1::uuid OR pu.id = $1::uuid)
           AND rj.created_at >= now() - make_interval(days => $2)
         GROUP BY rj.action`,
        [platformUserId, days],
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
      const pool = getPool();
      const r = await pool.query<{ rule_id: string; action: string; cnt: string }>(
        `SELECT rr.integrator_rule_id AS rule_id, rj.action, COUNT(*)::text AS cnt
         FROM reminder_journal rj
         INNER JOIN reminder_rules rr ON rr.id = rj.rule_id
         LEFT JOIN platform_users pu ON pu.integrator_user_id = rr.integrator_user_id
         WHERE (rr.platform_user_id = $1::uuid OR pu.id = $1::uuid)
           AND rj.created_at >= now() - make_interval(days => $2)
         GROUP BY rr.integrator_rule_id, rj.action`,
        [platformUserId, days],
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

    async recordSnooze(platformUserId, integratorOccurrenceId, minutes) {
      const pool = getPool();
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const own = await client.query<{ rule_pk: string; snoozed_until: string | null }>(
          `SELECT rr.id AS rule_pk, roh.snoozed_until
           FROM reminder_occurrence_history roh
           INNER JOIN platform_users pu ON pu.integrator_user_id = roh.integrator_user_id
           INNER JOIN reminder_rules rr ON rr.integrator_rule_id = roh.integrator_rule_id
           WHERE roh.integrator_occurrence_id = $1 AND pu.id = $2::uuid`,
          [integratorOccurrenceId, platformUserId],
        );
        if (own.rows.length === 0) {
          await client.query("ROLLBACK");
          return { ok: false, error: "not_found" };
        }
        const rulePk = own.rows[0].rule_pk;
        const untilR = await client.query<{ until: string }>(
          `SELECT (now() + make_interval(mins => $1)) AS until`,
          [minutes],
        );
        const snoozedUntil = untilR.rows[0]?.until;
        if (!snoozedUntil) {
          await client.query("ROLLBACK");
          return { ok: false, error: "not_found" };
        }

        const existingUntil = own.rows[0].snoozed_until;
        if (
          existingUntil &&
          new Date(existingUntil).getTime() === new Date(snoozedUntil).getTime()
        ) {
          await client.query("COMMIT");
          return { ok: true, occurrenceId: integratorOccurrenceId, snoozedUntil: existingUntil };
        }

        await client.query(
          `UPDATE reminder_occurrence_history
           SET snoozed_at = now(), snoozed_until = $2::timestamptz
           WHERE integrator_occurrence_id = $1`,
          [integratorOccurrenceId, snoozedUntil],
        );

        await client.query(
          `INSERT INTO reminder_journal (rule_id, occurrence_id, action, snooze_until)
           SELECT $1::uuid, $2, 'snoozed', $3::timestamptz
           WHERE NOT EXISTS (
             SELECT 1 FROM reminder_journal
             WHERE occurrence_id = $2 AND action = 'snoozed' AND snooze_until = $3::timestamptz
           )`,
          [rulePk, integratorOccurrenceId, snoozedUntil],
        );

        await client.query("COMMIT");
        return { ok: true, occurrenceId: integratorOccurrenceId, snoozedUntil };
      } catch (err) {
        try {
          await client.query("ROLLBACK");
        } catch {
          /* ignore */
        }
        console.warn("[pgReminderJournal.recordSnooze]", err);
        return { ok: false, error: "not_found" };
      } finally {
        client.release();
      }
    },

    async recordSkip(platformUserId, integratorOccurrenceId, reason) {
      const pool = getPool();
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const own = await client.query<{ rule_pk: string }>(
          `SELECT rr.id AS rule_pk
           FROM reminder_occurrence_history roh
           INNER JOIN platform_users pu ON pu.integrator_user_id = roh.integrator_user_id
           INNER JOIN reminder_rules rr ON rr.integrator_rule_id = roh.integrator_rule_id
           WHERE roh.integrator_occurrence_id = $1 AND pu.id = $2::uuid`,
          [integratorOccurrenceId, platformUserId],
        );
        if (own.rows.length === 0) {
          await client.query("ROLLBACK");
          return { ok: false, error: "not_found" };
        }
        const rulePk = own.rows[0].rule_pk;
        const upd = await client.query<{ skipped_at: string }>(
          `UPDATE reminder_occurrence_history roh
           SET skipped_at = COALESCE(roh.skipped_at, now()),
               skip_reason = CASE WHEN roh.skipped_at IS NULL THEN $2 ELSE roh.skip_reason END
           FROM platform_users pu
           WHERE roh.integrator_occurrence_id = $1
             AND roh.integrator_user_id = pu.integrator_user_id
             AND pu.id = $3::uuid
           RETURNING roh.skipped_at`,
          [integratorOccurrenceId, reason, platformUserId],
        );
        const skippedAt = upd.rows[0]?.skipped_at;
        if (!skippedAt) {
          await client.query("ROLLBACK");
          return { ok: false, error: "not_found" };
        }

        await client.query(
          `INSERT INTO reminder_journal (rule_id, occurrence_id, action, skip_reason)
           SELECT $1::uuid, $2, 'skipped', $3
           WHERE NOT EXISTS (
             SELECT 1 FROM reminder_journal
             WHERE occurrence_id = $2 AND action = 'skipped'
           )`,
          [rulePk, integratorOccurrenceId, reason],
        );

        await client.query("COMMIT");
        return { ok: true, occurrenceId: integratorOccurrenceId, skippedAt };
      } catch (err) {
        try {
          await client.query("ROLLBACK");
        } catch {
          /* ignore */
        }
        console.warn("[pgReminderJournal.recordSkip]", err);
        return { ok: false, error: "not_found" };
      } finally {
        client.release();
      }
    },
  };
}
