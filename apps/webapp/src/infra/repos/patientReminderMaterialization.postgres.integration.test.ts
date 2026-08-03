import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PoolClient } from 'pg';
import { getPool } from '@/infra/db/client';
import { runWithDbOrganizationPrincipal } from '@bersoncare/db-principal';
import { createPgPatientReminderMaterializationPort } from './pgPatientReminderMaterialization';
import type { PatientReminderRuleForMaterialization } from '@/modules/reminders/patientReminderMaterializationPort';

const orgA = randomUUID();
const orgB = randomUUID();
const patient = randomUUID();
const ruleId = `sh4-rule-${randomUUID()}`;
const occurrenceId = `sh4-occ-${randomUUID()}`;
const occurrenceKey = `sh4-key-${randomUUID()}`;
const plannedAt = '2026-08-04T09:00:00.000Z';

describe('D30 Ш4 patient reminder materialization capabilities', () => {
  const pool = getPool();
  let client: PoolClient;

  async function run<T = Record<string, unknown>>(text: string, values: readonly unknown[] = []) {
    return client.query<T & Record<string, unknown>>(text, [...values]);
  }

  beforeAll(async () => {
    client = await pool.connect();
    const database = await run<{ name: string }>('SELECT current_database() AS name');
    expect(database.rows[0]?.name).toMatch(/^pbt_/);
    const migrationSql = await readFile(
      new URL(
        '../../../db/drizzle-migrations/9996_d30_patient_reminder_materialization_boundary_local.sql',
        import.meta.url,
      ),
      'utf8',
    );
    await run(migrationSql);
    for (const table of [
      'public.be_organizations',
      'public.platform_users',
      'public.reminder_rules',
      'public.user_channel_bindings',
      'public.user_channel_preferences',
      'public.user_notification_topics',
      'public.user_notification_topic_channels',
      'public.user_web_push_subscriptions',
      'public.system_settings',
      'public.outgoing_delivery_queue',
      'public.reminder_journal',
      'integrator.user_reminder_occurrences',
    ]) {
      await run(`ALTER TABLE ${table} DISABLE ROW LEVEL SECURITY`);
    }
    await run('ALTER TABLE public.be_organizations DISABLE TRIGGER USER');
    await run(`INSERT INTO public.be_organizations (id, title) VALUES ($1, 'Ш4 A'), ($2, 'Ш4 B')`, [
      orgA,
      orgB,
    ]);
    await run(
      `INSERT INTO public.platform_users (
         id, display_name, email, email_verified_at, integrator_user_id
       ) VALUES ($1, 'Ш4 patient', 'patient@example.test', statement_timestamp(), 4242)`,
      [patient],
    );
    await run(
      `INSERT INTO public.reminder_rules (
         integrator_rule_id, platform_user_id, integrator_user_id, organization_id, category,
         is_enabled, schedule_type, timezone, interval_minutes, window_start_minute,
         window_end_minute, days_mask, content_mode, notification_topic_code
       ) VALUES ($1, $2, 4242, $3, 'warmup', true, 'interval_window', 'Europe/Moscow',
         60, 480, 1320, '1111111', 'none', 'warmup_reminders')`,
      [ruleId, patient, orgA],
    );
    await run(
      `INSERT INTO public.user_channel_bindings (user_id, channel_code, external_id)
       VALUES ($1, 'telegram', '1001')`,
      [patient],
    );
    await run('ALTER TABLE public.be_organizations ENABLE TRIGGER USER');
  });

  afterAll(async () => {
    await run('RESET ROLE');
    await run('ALTER TABLE public.be_organizations DISABLE TRIGGER USER');
    await run('DELETE FROM public.outgoing_delivery_queue WHERE event_id LIKE $1', [
      `rem:${occurrenceId}:%`,
    ]);
    await run('DELETE FROM integrator.user_reminder_occurrences WHERE rule_id = $1', [ruleId]);
    await run('DELETE FROM public.user_channel_bindings WHERE user_id = $1', [patient]);
    await run('DELETE FROM public.reminder_rules WHERE integrator_rule_id = $1', [ruleId]);
    await run('DELETE FROM public.platform_users WHERE id = $1', [patient]);
    await run('DELETE FROM public.be_organizations WHERE id = ANY($1::uuid[])', [[orgA, orgB]]);
    await run('ALTER TABLE public.be_organizations ENABLE TRIGGER USER');
    client.release();
    await pool.end();
  });

  it('rejects cross-tenant materialization at the exact capability', async () => {
    await run(`SELECT set_config('app.org', $1, false)`, [orgB]);
    await expect(
      run(
        `SELECT * FROM app.upsert_patient_reminder_occurrence_plan(
           $1, $2, $3, $4, $5, $6::timestamptz
         )`,
        [occurrenceId, ruleId, orgA, patient, occurrenceKey, plannedAt],
      ),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('rolls back the production port when queue materialization fails', async () => {
    const atomicKey = `sh4-atomic-${randomUUID()}`;
    const port = createPgPatientReminderMaterializationPort({
      queueWriter: {
        enqueueReady: async () => {
          throw new Error('injected_queue_failure');
        },
      },
    });
    const rule: PatientReminderRuleForMaterialization = {
      id: ruleId,
      organizationId: orgA,
      platformUserId: patient,
      integratorUserId: '4242',
      category: 'warmup',
      isEnabled: true,
      scheduleType: 'interval_window',
      timezone: 'Europe/Moscow',
      intervalMinutes: 60,
      windowStartMinute: 480,
      windowEndMinute: 1320,
      daysMask: '1111111',
      scheduleData: null,
      quietHoursStartMinute: null,
      quietHoursEndMinute: null,
      linkedObjectType: null,
      linkedObjectId: null,
      customTitle: null,
      customText: null,
      displayTitle: null,
      reminderIntent: null,
      notificationTopicCode: 'warmup_reminders',
    };
    await expect(
      runWithDbOrganizationPrincipal(orgA, () =>
        port.materializeOccurrence(
          rule,
          { occurrenceKey: atomicKey, plannedAt },
          async (occurrence) => [
            {
              organizationId: orgA,
              eventId: `rem:${occurrence.id}:g${occurrence.deliveryGeneration}:telegram`,
              kind: 'reminder_dispatch',
              channel: 'telegram',
              maxAttempts: 6,
              nextRetryAt: occurrence.plannedAt,
              occurrenceId: occurrence.id,
              deliveryGeneration: occurrence.deliveryGeneration,
              topicCode: 'warmup_reminders',
              externalId: '1001',
              logText: 'Разминка ⚡',
              platformUserId: patient,
              intent: {
                type: 'message.send',
                meta: { eventId: 'atomic-test', occurredAt: plannedAt, source: 'telegram' },
                payload: { recipient: { chatId: '1001' }, message: { text: 'Разминка ⚡' } },
              },
            },
          ],
        ),
      ),
    ).rejects.toThrow('injected_queue_failure');
    const hot = await run<{ count: string }>(
      `SELECT count(*)::text AS count FROM integrator.user_reminder_occurrences WHERE occurrence_key = $1`,
      [atomicKey],
    );
    expect(hot.rows[0]?.count).toBe('0');
  });

  it('does not materialize an unavailable patient', async () => {
    const blockedOccurrenceId = `sh4-blocked-${randomUUID()}`;
    const blockedOccurrenceKey = `sh4-blocked-key-${randomUUID()}`;
    await run('UPDATE public.platform_users SET is_blocked = true WHERE id = $1', [patient]);
    await run(`SELECT set_config('app.org', $1, false)`, [orgA]);
    const result = await run<{ materializable: boolean }>(
      `SELECT materializable
       FROM app.upsert_patient_reminder_occurrence_plan($1, $2, $3, $4, $5, $6::timestamptz)`,
      [blockedOccurrenceId, ruleId, orgA, patient, blockedOccurrenceKey, plannedAt],
    );
    expect(result.rows[0]?.materializable).toBe(false);
    const rows = await run<{ count: string }>(
      'SELECT count(*)::text AS count FROM integrator.user_reminder_occurrences WHERE id = $1',
      [blockedOccurrenceId],
    );
    expect(rows.rows[0]?.count).toBe('0');
    await run('UPDATE public.platform_users SET is_blocked = false WHERE id = $1', [patient]);
  });

  it('atomically binds exact queue event/generation and revalidates the live recipient', async () => {
    await run(`SELECT set_config('app.org', $1, false)`, [orgA]);
    const upsert = await run<{
      occurrence_id: string;
      delivery_generation: number;
      materializable: boolean;
    }>(
      `SELECT * FROM app.upsert_patient_reminder_occurrence_plan(
         $1, $2, $3, $4, $5, $6::timestamptz
       )`,
      [occurrenceId, ruleId, orgA, patient, occurrenceKey, plannedAt],
    );
    expect(upsert.rows[0]).toEqual({
      occurrence_id: occurrenceId,
      delivery_generation: 0,
      materializable: true,
    });
    const eventId = `rem:${occurrenceId}:g0:telegram`;
    const inserted = await run<{ id: string }>(
      `INSERT INTO public.outgoing_delivery_queue (
         organization_id, event_id, kind, channel, payload_json, status, attempt_count,
         max_attempts, next_retry_at
       ) VALUES ($1, $2, 'reminder_dispatch', 'telegram', $3::jsonb, 'pending', 0, 6, $4)
       RETURNING id::text`,
      [
        orgA,
        eventId,
        JSON.stringify({
          occurrenceId,
          deliveryGeneration: 0,
          topicCode: 'warmup_reminders',
          channel: 'telegram',
          externalId: '1001',
          intent: {
            type: 'message.send',
            payload: { recipient: { chatId: '1001' } },
          },
        }),
        plannedAt,
      ],
    );
    await expect(
      run<{ marked: boolean }>(
        'SELECT app.mark_patient_reminder_occurrence_queued($1, 0, ARRAY[$2]) AS marked',
        [occurrenceId, eventId],
      ),
    ).resolves.toMatchObject({ rows: [{ marked: true }] });
    await run(
      `UPDATE public.outgoing_delivery_queue SET status = 'processing' WHERE event_id = $1`,
      [eventId],
    );
    const current = await run<{ current: boolean }>(
      'SELECT app.revalidate_patient_reminder_delivery_materialization($1) AS current',
      [inserted.rows[0]?.id],
    );
    expect(current.rows[0]?.current).toBe(true);

    await run(
      `UPDATE public.outgoing_delivery_queue
       SET payload_json = jsonb_set(
         payload_json,
         '{intent,payload,recipient,chatId}',
         '9999'::jsonb,
         true
       )
       WHERE event_id = $1`,
      [eventId],
    );
    const forgedRecipient = await run<{ current: boolean }>(
      'SELECT app.revalidate_patient_reminder_delivery_materialization($1) AS current',
      [inserted.rows[0]?.id],
    );
    expect(
      forgedRecipient.rows[0]?.current,
      'the exact gate must validate the provider recipient, not only sibling externalId metadata',
    ).toBe(false);

    await run(
      `UPDATE public.user_channel_bindings SET external_id = '2002'
       WHERE user_id = $1 AND channel_code = 'telegram'`,
      [patient],
    );
    const stale = await run<{ current: boolean }>(
      'SELECT app.revalidate_patient_reminder_delivery_materialization($1) AS current',
      [inserted.rows[0]?.id],
    );
    expect(stale.rows[0]?.current).toBe(false);
  });

  it('converges concurrent wake upserts to one occurrence key', async () => {
    const concurrentKey = `sh4-concurrent-${randomUUID()}`;
    const candidateIds = [`sh4-concurrent-${randomUUID()}`, `sh4-concurrent-${randomUUID()}`];
    const upsertOnOwnConnection = async (candidateId: string) => {
      const connection = await pool.connect();
      try {
        await connection.query('BEGIN');
        await connection.query(`SELECT set_config('app.org', $1, true)`, [orgA]);
        const result = await connection.query<{ occurrence_id: string; materializable: boolean }>(
          `SELECT occurrence_id, materializable
           FROM app.upsert_patient_reminder_occurrence_plan($1, $2, $3, $4, $5, $6::timestamptz)`,
          [candidateId, ruleId, orgA, patient, concurrentKey, plannedAt],
        );
        await connection.query('COMMIT');
        return result.rows[0];
      } catch (error) {
        await connection.query('ROLLBACK');
        throw error;
      } finally {
        connection.release();
      }
    };
    const results = await Promise.all(candidateIds.map(upsertOnOwnConnection));
    expect(results[0]?.materializable).toBe(true);
    expect(results[1]?.materializable).toBe(true);
    expect(results[0]?.occurrence_id).toBe(results[1]?.occurrence_id);
    const rows = await run<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM integrator.user_reminder_occurrences WHERE occurrence_key = $1`,
      [concurrentKey],
    );
    expect(rows.rows[0]?.count).toBe('1');
    await run('DELETE FROM integrator.user_reminder_occurrences WHERE occurrence_key = $1', [
      concurrentKey,
    ]);
  });

  it('does not reset snoozed generation or terminal evidence on an old wake replay', async () => {
    await run(
      `UPDATE integrator.user_reminder_occurrences
       SET planned_at = $2::timestamptz + interval '30 minutes', delivery_generation = 1, status = 'planned'
       WHERE id = $1`,
      [occurrenceId, plannedAt],
    );
    const replay = await run<{ delivery_generation: number; materializable: boolean }>(
      `SELECT delivery_generation, materializable
       FROM app.upsert_patient_reminder_occurrence_plan($1, $2, $3, $4, $5, $6::timestamptz)`,
      [occurrenceId, ruleId, orgA, patient, occurrenceKey, plannedAt],
    );
    expect(replay.rows[0]).toEqual({ delivery_generation: 1, materializable: false });
  });

  it('grants only exact capability execution to locked runtime roles', async () => {
    const grants = await run<{
      staff_upsert: boolean;
      worker_revalidate: boolean;
      public_revalidate: boolean;
    }>(
      `SELECT
         has_function_privilege('app_staff', 'app.upsert_patient_reminder_occurrence_plan(text,text,uuid,uuid,text,timestamptz)', 'EXECUTE') AS staff_upsert,
         has_function_privilege('app_operational_delivery_worker', 'app.revalidate_patient_reminder_delivery_materialization(uuid)', 'EXECUTE') AS worker_revalidate,
         EXISTS (
           SELECT 1 FROM information_schema.routine_privileges
           WHERE routine_schema = 'app'
             AND routine_name = 'revalidate_patient_reminder_delivery_materialization'
             AND grantee = 'PUBLIC' AND privilege_type = 'EXECUTE'
         ) AS public_revalidate`,
    );
    expect(grants.rows[0]).toEqual({
      staff_upsert: true,
      worker_revalidate: true,
      public_revalidate: false,
    });

    const directOccurrenceWrites = await run<{
      owner_insert: boolean;
      owner_update: boolean;
      staff_insert: boolean;
    }>(
      `SELECT
         has_table_privilege('app_owner', 'integrator.user_reminder_occurrences', 'INSERT') AS owner_insert,
         has_table_privilege('app_owner', 'integrator.user_reminder_occurrences', 'UPDATE') AS owner_update,
         has_table_privilege('app_staff', 'integrator.user_reminder_occurrences', 'INSERT') AS staff_insert`,
    );
    expect(directOccurrenceWrites.rows[0]).toEqual({
      owner_insert: false,
      owner_update: false,
      staff_insert: false,
    });
  });
});
