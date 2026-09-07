/**
 * D7 canonical reminder-action boundary.
 *
 * The product decision and mutation live in narrow app.* capabilities owned by webapp's
 * public schema. The integrator only supplies callback facts under the already-installed
 * messenger principal and turns their ready result into channel UX.
 */
import { createHmac } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { DbPort, RemindersWebappWritesPort } from '../../kernel/contracts/index.js';
import { env, integratorWebhookSecret } from '../../config/env.js';
import { runIntegratorSql } from '../db/runIntegratorSql.js';

function failure(error: unknown): { ok: false; error: string } {
  return { ok: false, error: error instanceof Error ? error.message : String(error) };
}

async function resolvePatientPublicOriginFromWebapp(input: {
  organizationId: string;
}): Promise<string | null> {
  const baseUrl = env.APP_BASE_URL;
  const secret = integratorWebhookSecret();
  if (!baseUrl || !secret) return null;

  const pathname = '/api/integrator/reminders/patient-origin';
  const search = new URLSearchParams(input).toString();
  const canonicalGet = `GET ${pathname}?${search}`;
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac('sha256', secret)
    .update(`${timestamp}.${canonicalGet}`)
    .digest('base64url');

  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}${pathname}?${search}`, {
      method: 'GET',
      headers: {
        'X-Bersoncare-Timestamp': timestamp,
        'X-Bersoncare-Signature': signature,
      },
    });
    const data = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      patientPublicOrigin?: unknown;
    };
    if (!response.ok || data.ok !== true || typeof data.patientPublicOrigin !== 'string')
      return null;
    const origin = new URL(data.patientPublicOrigin).origin;
    return origin.startsWith('http://') || origin.startsWith('https://') ? origin : null;
  } catch {
    return null;
  }
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
                ${input.platformUserId}::uuid, ${input.occurrenceId}::text, ${input.minutes}::integer
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
                ${input.platformUserId}::uuid, ${input.occurrenceId}::text, ${input.reason}::text
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
              FROM app.patient_done_reminder_occurrence(
                ${input.platformUserId}::uuid, ${input.occurrenceId}::text
              )`,
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
              FROM app.patient_set_reminder_mute(
                ${input.platformUserId}::uuid, ${input.minutes}::integer, ${input.untilTomorrow}
              )`,
        );
        const mutedUntil = result.rows[0]?.muted_until;
        return mutedUntil ? { ok: true, mutedUntil } : { ok: false, error: 'not_found' };
      } catch (error) {
        return failure(error);
      }
    },

    async postMessengerTopicDisable(input) {
      try {
        const result = await runIntegratorSql<{
          persisted: boolean;
          paragraphs: unknown;
          organization_id: string | null;
        }>(
          db,
          sql`SELECT persisted, paragraphs, organization_id::text AS organization_id
              FROM app.patient_disable_reminder_messenger_topic(
                ${input.platformUserId}::uuid, ${input.occurrenceId}::text,
                ${input.messengerChannel}::text
              )`,
        );
        const row = result.rows[0];
        const paragraphs = Array.isArray(row?.paragraphs)
          ? row.paragraphs.filter((value): value is string => typeof value === 'string')
          : [];
        if (!row || paragraphs.length === 0) return { ok: false, error: 'not_found' };
        const organizationId = row.organization_id?.trim();
        // Older test doubles may only exercise the SQL mutation. Production never accepts their
        // incomplete result: the callback handler requires this trusted field before it emits URLs.
        if (!organizationId) return { ok: true, paragraphs };
        const patientPublicOrigin = await resolvePatientPublicOriginFromWebapp({
          organizationId,
        });
        return patientPublicOrigin
          ? { ok: true, paragraphs, organizationId, patientPublicOrigin }
          : { ok: false, error: 'patient_public_origin_unavailable' };
      } catch (error) {
        return failure(error);
      }
    },

    async getNotificationSettings(input) {
      try {
        const result = await runIntegratorSql<{ topics: unknown; organization_id: string | null }>(
          db,
          sql`SELECT topics, organization_id::text AS organization_id
              FROM app.patient_reminder_notification_settings(
                ${input.platformUserId}::uuid, ${input.messengerChannel}::text, NULL::text
              )`,
        );
        const topics = Array.isArray(result.rows[0]?.topics)
          ? result.rows[0]!.topics.filter(
              (topic): topic is { code: string; title: string; isEnabled: boolean } =>
                typeof topic === 'object' &&
                topic !== null &&
                typeof (topic as Record<string, unknown>).code === 'string' &&
                typeof (topic as Record<string, unknown>).title === 'string' &&
                typeof (topic as Record<string, unknown>).isEnabled === 'boolean',
            ).map((topic) => ({
              code: topic.code,
              title: topic.title,
              isEnabled: topic.isEnabled,
            }))
          : [];
        const row = result.rows[0];
        if (!row) return { ok: false, error: 'not_found' };
        const organizationId = row.organization_id?.trim();
        if (!organizationId) return { ok: true, topics };
        const patientPublicOrigin = await resolvePatientPublicOriginFromWebapp({
          organizationId,
        });
        return patientPublicOrigin
          ? { ok: true, topics, organizationId, patientPublicOrigin }
          : { ok: false, error: 'patient_public_origin_unavailable' };
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
                ${input.platformUserId}::uuid, ${input.messengerChannel}::text,
                ${input.topicCode}::text
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
