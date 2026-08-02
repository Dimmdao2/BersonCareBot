/**
 * D7 canonical reminder-action boundary.
 *
 * The product decision and mutation live in narrow app.* capabilities owned by webapp's
 * public schema. The integrator only supplies callback facts under the already-installed
 * messenger principal and turns their ready result into channel UX.
 */
import { sql } from 'drizzle-orm';
import type { DbPort, RemindersWebappWritesPort } from '../../kernel/contracts/index.js';
import { runIntegratorSql } from '../db/runIntegratorSql.js';

function failure(error: unknown): { ok: false; error: string } {
  return { ok: false, error: error instanceof Error ? error.message : String(error) };
}

export function createRemindersWritesPort(deps: { db: DbPort }): RemindersWebappWritesPort {
  const { db } = deps;
  return {
    async postOccurrenceSnooze(input) {
      try {
        const result = await runIntegratorSql<{ snoozed_until: string }>(
          db,
          sql`SELECT snoozed_until::text
              FROM app.patient_snooze_reminder_occurrence(
                NULL::uuid, ${input.occurrenceId}::text, ${input.minutes}::integer
              )`,
        );
        const snoozedUntil = result.rows[0]?.snoozed_until;
        return snoozedUntil ? { ok: true, snoozedUntil } : { ok: false, error: 'not_found' };
      } catch (error) {
        return failure(error);
      }
    },

    async postOccurrenceSkip(input) {
      try {
        const result = await runIntegratorSql<{ skipped_at: string }>(
          db,
          sql`SELECT skipped_at::text
              FROM app.patient_skip_reminder_occurrence(
                NULL::uuid, ${input.occurrenceId}::text, ${input.reason}::text
              )`,
        );
        const skippedAt = result.rows[0]?.skipped_at;
        return skippedAt ? { ok: true, skippedAt } : { ok: false, error: 'not_found' };
      } catch (error) {
        return failure(error);
      }
    },

    async postOccurrenceDone(input) {
      try {
        const result = await runIntegratorSql<{
          done_at: string;
          first_done_for_occurrence: boolean;
          day_done_count: number;
          day_sent_total: number;
          day_fully_done: boolean;
        }>(
          db,
          sql`SELECT done_at::text, first_done_for_occurrence, day_done_count, day_sent_total,
                     day_fully_done
              FROM app.patient_done_reminder_occurrence(${input.occurrenceId}::text)`,
        );
        const row = result.rows[0];
        return row
          ? {
              ok: true,
              doneAt: row.done_at,
              firstDoneForOccurrence: row.first_done_for_occurrence,
              dayDoneCount: Number(row.day_done_count),
              daySentTotal: Number(row.day_sent_total),
              dayFullyDone: row.day_fully_done,
            }
          : { ok: false, error: 'not_found' };
      } catch (error) {
        return failure(error);
      }
    },

    async postReminderMuteUntil(input) {
      try {
        const result = await runIntegratorSql<{ muted_until: string | null }>(
          db,
          sql`SELECT muted_until::text
              FROM app.patient_set_reminder_muted_until(${input.mutedUntilIso}::timestamptz)`,
        );
        return result.rows.length > 0 ? { ok: true } : { ok: false, error: 'not_found' };
      } catch (error) {
        return failure(error);
      }
    },

    async postMessengerTopicDisable(input) {
      try {
        const result = await runIntegratorSql<{ persisted: boolean; paragraphs: unknown }>(
          db,
          sql`SELECT persisted, paragraphs
              FROM app.patient_disable_reminder_messenger_topic(
                ${input.occurrenceId}::text, ${input.messengerChannel}::text
              )`,
        );
        const row = result.rows[0];
        const paragraphs = Array.isArray(row?.paragraphs)
          ? row.paragraphs.filter((value): value is string => typeof value === 'string')
          : [];
        return row && paragraphs.length > 0
          ? { ok: true, paragraphs }
          : { ok: false, error: 'not_found' };
      } catch (error) {
        return failure(error);
      }
    },

    async getNotificationSettings(input) {
      try {
        const result = await runIntegratorSql<{ topics: unknown }>(
          db,
          sql`SELECT topics
              FROM app.patient_reminder_notification_settings(${input.messengerChannel}::text, NULL::text)`,
        );
        const topics = Array.isArray(result.rows[0]?.topics)
          ? result.rows[0]!.topics
              .filter(
                (topic): topic is { code: string; title: string; isEnabled: boolean } =>
                  typeof topic === 'object' &&
                  topic !== null &&
                  typeof (topic as Record<string, unknown>).code === 'string' &&
                  typeof (topic as Record<string, unknown>).title === 'string' &&
                  typeof (topic as Record<string, unknown>).isEnabled === 'boolean',
              )
              .map((topic) => ({
                code: topic.code,
                title: topic.title,
                isEnabled: topic.isEnabled,
              }))
          : [];
        return result.rows[0] ? { ok: true, topics } : { ok: false, error: 'not_found' };
      } catch (error) {
        return failure(error);
      }
    },

    async toggleNotificationTopic(input) {
      try {
        const result = await runIntegratorSql<{ new_state: boolean }>(
          db,
          sql`SELECT new_state
              FROM app.patient_reminder_notification_settings(
                ${input.messengerChannel}::text, ${input.topicCode}::text
              )`,
        );
        const row = result.rows[0];
        return row ? { ok: true, newState: row.new_state } : { ok: false, error: 'not_found' };
      } catch (error) {
        return failure(error);
      }
    },
  };
}
