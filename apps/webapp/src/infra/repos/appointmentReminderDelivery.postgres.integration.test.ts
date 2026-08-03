import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPool } from '@/infra/db/client';

const orgId = randomUUID();
const userId = randomUUID();
const appointmentId = randomUUID();
const firstQueueId = randomUUID();
const ladderQueueId = randomUUID();
const blockedRecipientQueueId = randomUUID();
const slotStart = '2026-08-08T12:00:00.000Z';

describe('D30 Ш7 appointment reminder atomic delivery capability', () => {
  const pool = getPool();

  beforeAll(async () => {
    const database = await pool.query<{ name: string }>('SELECT current_database() AS name');
    expect(database.rows[0]?.name).toMatch(/^pbt_/);
    const migration = await readFile(
      new URL(
        '../../../db/drizzle-migrations/9995_d30_appointment_reminder_queue_cutover_local.sql',
        import.meta.url,
      ),
      'utf8',
    );
    await pool.query(migration);
    for (const table of [
      'public.be_organizations',
      'public.platform_users',
      'public.be_appointments',
      'public.user_channel_bindings',
      'public.outgoing_delivery_queue',
    ]) {
      await pool.query(`ALTER TABLE ${table} DISABLE ROW LEVEL SECURITY`);
    }
    await pool.query('ALTER TABLE public.be_organizations DISABLE TRIGGER USER');
    await pool.query(`INSERT INTO public.be_organizations (id, title) VALUES ($1, 'Ш7 org')`, [orgId]);
    await pool.query(
      `INSERT INTO public.platform_users (id, display_name) VALUES ($1, 'Ш7 patient')`,
      [userId],
    );
    await pool.query(
      `INSERT INTO public.be_appointments (
         id, organization_id, platform_user_id, start_at, end_at, duration_minutes, source, status
       ) VALUES ($1, $2, $3, $4, '2026-08-08T13:00:00.000Z', 60, 'native', 'confirmed')`,
      [appointmentId, orgId, userId, slotStart],
    );
    await pool.query(
      `INSERT INTO public.user_channel_bindings (user_id, channel_code, external_id)
       VALUES ($1, 'telegram', 'tg-1'), ($1, 'max', 'max-1')`,
      [userId],
    );
  });

  afterAll(async () => {
    await pool.query('DELETE FROM public.outgoing_delivery_queue WHERE id = ANY($1::uuid[])', [
      [firstQueueId, ladderQueueId, blockedRecipientQueueId],
    ]);
    await pool.query('DELETE FROM public.user_channel_bindings WHERE user_id = $1', [userId]);
    await pool.query('DELETE FROM public.be_appointments WHERE id = $1', [appointmentId]);
    await pool.query('DELETE FROM public.platform_users WHERE id = $1', [userId]);
    await pool.query('DELETE FROM public.be_organizations WHERE id = $1', [orgId]);
    await pool.query('ALTER TABLE public.be_organizations ENABLE TRIGGER USER');
    await pool.end();
  });

  function payload() {
    return {
      appointmentId,
      generationStartAt: slotStart,
      dueAt: '2026-08-08T10:00:00.000Z',
      messengerStepIndex: 0,
      messengerLadder: [
        { channel: 'telegram', recipient: { chatId: 'tg-1' } },
        { channel: 'max', recipient: { userId: 'max-1' } },
      ],
      intent: {
        type: 'message.send',
        meta: { eventId: 'sh7', occurredAt: slotStart, source: 'telegram', userId },
        payload: {
          recipient: { chatId: 'tg-1' },
          message: { text: 'Ш7' },
          delivery: { channels: ['telegram'] },
        },
      },
    };
  }

  async function insertQueue(id: string, eventId: string) {
    await pool.query(
      `INSERT INTO public.outgoing_delivery_queue (
         id, organization_id, event_id, kind, channel, payload_json, status,
         attempt_count, max_attempts, next_retry_at
       ) VALUES ($1, $2, $3, 'appointment_reminder', 'telegram', $4, 'processing', 1, 2, now())`,
      [id, orgId, eventId, payload()],
    );
  }

  it('revalidates the exact canonical generation and terminalizes it after reschedule', async () => {
    await insertQueue(firstQueueId, `sh7-current-${randomUUID()}`);
    const current = await pool.query<{ current: boolean }>(
      'SELECT app.revalidate_appointment_reminder_materialization($1) AS current',
      [firstQueueId],
    );
    expect(current.rows[0]?.current).toBe(true);

    await pool.query(
      `UPDATE public.be_appointments
       SET start_at = '2026-08-09T12:00:00.000Z', end_at = '2026-08-09T13:00:00.000Z'
       WHERE id = $1`,
      [appointmentId],
    );
    const stale = await pool.query<{ current: boolean }>(
      'SELECT app.revalidate_appointment_reminder_materialization($1) AS current',
      [firstQueueId],
    );
    expect(stale.rows[0]?.current).toBe(false);
    const terminal = await pool.query<{ status: string }>(
      'SELECT status FROM public.outgoing_delivery_queue WHERE id = $1',
      [firstQueueId],
    );
    expect(terminal.rows[0]?.status).toBe('dead');
    await pool.query(
      `UPDATE public.be_appointments
       SET start_at = $2, end_at = '2026-08-08T13:00:00.000Z'
       WHERE id = $1`,
      [appointmentId, slotStart],
    );
  });

  it('advances Telegram→MAX once under concurrent retry completion', async () => {
    await insertQueue(ladderQueueId, `sh7-ladder-${randomUUID()}`);
    const results = await Promise.all(
      [1, 2].map(() =>
        pool.query<{ transition: string }>(
          `SELECT app.advance_appointment_reminder_messenger_ladder($1, 1, 'temporary') AS transition`,
          [ladderQueueId],
        ),
      ),
    );
    expect(results.map((result) => result.rows[0]?.transition).sort()).toEqual([
      'advanced',
      'not_transitioned',
    ]);
    const row = await pool.query<{
      channel: string;
      status: string;
      recipient: { userId?: string };
      channels: string[];
    }>(
      `SELECT channel, status,
         payload_json #> '{intent,payload,recipient}' AS recipient,
         payload_json #> '{intent,payload,delivery,channels}' AS channels
       FROM public.outgoing_delivery_queue WHERE id = $1`,
      [ladderQueueId],
    );
    expect(row.rows[0]).toMatchObject({
      channel: 'max',
      status: 'failed_retryable',
      recipient: { userId: 'max-1' },
      channels: ['max'],
    });
  });

  it('terminalizes before provider when the current appointment recipient becomes blocked', async () => {
    await insertQueue(blockedRecipientQueueId, `sh7-blocked-${randomUUID()}`);
    await pool.query('UPDATE public.platform_users SET is_blocked = true WHERE id = $1', [userId]);

    const result = await pool.query<{ current: boolean }>(
      'SELECT app.revalidate_appointment_reminder_materialization($1) AS current',
      [blockedRecipientQueueId],
    );

    expect(result.rows[0]?.current).toBe(false);
    const terminal = await pool.query<{ status: string }>(
      'SELECT status FROM public.outgoing_delivery_queue WHERE id = $1',
      [blockedRecipientQueueId],
    );
    expect(terminal.rows[0]?.status).toBe('dead');
    await pool.query('UPDATE public.platform_users SET is_blocked = false WHERE id = $1', [userId]);
  });
});
