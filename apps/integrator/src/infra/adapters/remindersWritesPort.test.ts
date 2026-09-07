import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DbPort, DbQueryResult } from '../../kernel/contracts/index.js';
import { createRemindersWritesPort } from './remindersWritesPort.js';

vi.mock('../../config/env.js', () => ({
  env: { APP_BASE_URL: 'https://staff.example.test' },
  integratorWebhookSecret: () => 'test-webhook-secret-value',
}));

function dbWithRows(...responses: Array<DbQueryResult<unknown>>): DbPort {
  return {
    query: async function query<T>(_sql: string, _params?: unknown[]): Promise<DbQueryResult<T>> {
      return (responses.shift() ?? { rows: [] }) as DbQueryResult<T>;
    },
    tx: async (fn) => fn(dbWithRows()),
  };
}

describe('D7 reminder callback capability adapter', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('uses the installed principal capability for snooze and preserves its ready result', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const port = createRemindersWritesPort({
      db: dbWithRows({ rows: [{ snoozed_until: '2026-08-02T10:20:00.000Z' }] }),
    });

    await expect(
      port.postOccurrenceSnooze({
        platformUserId: '00000000-0000-0000-0000-000000000001',
        occurrenceId: 'occ-1',
        minutes: 20,
      }),
    ).resolves.toEqual({
      ok: true,
      snoozedUntil: '2026-08-02T10:20:00.000Z',
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('uses the installed principal capability for an idempotent skip', async () => {
    const port = createRemindersWritesPort({
      db: dbWithRows({ rows: [{ skipped_at: '2026-08-02T10:00:00.000Z' }] }),
    });

    await expect(
      port.postOccurrenceSkip({
        platformUserId: '00000000-0000-0000-0000-000000000001',
        occurrenceId: 'occ-1',
        reason: null,
      }),
    ).resolves.toEqual({
      ok: true,
      skippedAt: '2026-08-02T10:00:00.000Z',
    });
  });

  it('preserves the ready done aggregate used by legacy Telegram and MAX callbacks', async () => {
    const port = createRemindersWritesPort({
      db: dbWithRows({
        rows: [
          {
            done_at: '2026-08-02T10:00:00.000Z',
            first_done_for_occurrence: true,
            day_done_count: 3,
            day_sent_total: 3,
            day_fully_done: true,
          },
        ],
      }),
    });

    await expect(
      port.postOccurrenceDone({
        platformUserId: '00000000-0000-0000-0000-000000000001',
        occurrenceId: 'occ-1',
      }),
    ).resolves.toEqual({
      ok: true,
      doneAt: '2026-08-02T10:00:00.000Z',
      firstDoneForOccurrence: true,
      dayDoneCount: 3,
      daySentTotal: 3,
      dayFullyDone: true,
    });
  });

  it('treats mute as a capability failure when the principal cannot be resolved', async () => {
    const port = createRemindersWritesPort({ db: dbWithRows({ rows: [] }) });

    await expect(
      port.postReminderMuteUntil({
        platformUserId: '00000000-0000-0000-0000-000000000001',
        minutes: null,
        untilTomorrow: true,
      }),
    ).resolves.toEqual({ ok: false, error: 'not_found' });
  });

  it('materializes the patient origin from the organization returned by the canonical capability', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ ok: true, patientPublicOrigin: 'https://clinic.patient.example/path' }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
    vi.stubGlobal('fetch', fetch);
    const port = createRemindersWritesPort({
      db: dbWithRows({
        rows: [
          {
            persisted: true,
            paragraphs: ['Отключаю в Telegram.', 'Push остаётся активным.'],
            organization_id: '22222222-2222-4222-8222-222222222222',
          },
        ],
      }),
    });

    await expect(
      port.postMessengerTopicDisable({
        platformUserId: '00000000-0000-0000-0000-000000000001',
        occurrenceId: 'occ-1',
        messengerChannel: 'telegram',
      }),
    ).resolves.toEqual({
      ok: true,
      paragraphs: ['Отключаю в Telegram.', 'Push остаётся активным.'],
      organizationId: '22222222-2222-4222-8222-222222222222',
      patientPublicOrigin: 'https://clinic.patient.example',
    });
  });

  it('does not substitute another destination when patient-origin resolution fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ ok: false, error: 'unavailable' }), { status: 503 }),
        ),
    );
    const port = createRemindersWritesPort({
      db: dbWithRows({
        rows: [
          {
            persisted: true,
            paragraphs: ['Готово.'],
            organization_id: '22222222-2222-4222-8222-222222222222',
          },
        ],
      }),
    });

    await expect(
      port.postMessengerTopicDisable({
        platformUserId: '00000000-0000-0000-0000-000000000001',
        occurrenceId: 'occ-1',
        messengerChannel: 'telegram',
      }),
    ).resolves.toEqual({ ok: false, error: 'patient_public_origin_unavailable' });
  });

  it('opens notification settings with the trusted patient origin and toggles through the same capability', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ ok: true, patientPublicOrigin: 'https://clinic.patient.example' }),
            { status: 200 },
          ),
        ),
    );
    const port = createRemindersWritesPort({
      db: dbWithRows(
        {
          rows: [
            {
              topics: [
                { code: 'warmup_reminders', title: 'Напоминания о разминках', isEnabled: true },
              ],
              organization_id: '22222222-2222-4222-8222-222222222222',
            },
          ],
        },
        { rows: [{ new_state: false }] },
      ),
    });

    await expect(
      port.getNotificationSettings({
        platformUserId: '00000000-0000-0000-0000-000000000001',
        messengerChannel: 'max',
      }),
    ).resolves.toEqual({
      ok: true,
      topics: [{ code: 'warmup_reminders', title: 'Напоминания о разминках', isEnabled: true }],
      organizationId: '22222222-2222-4222-8222-222222222222',
      patientPublicOrigin: 'https://clinic.patient.example',
    });
    await expect(
      port.toggleNotificationTopic({
        platformUserId: '00000000-0000-0000-0000-000000000001',
        messengerChannel: 'max',
        topicCode: 'warmup_reminders',
      }),
    ).resolves.toEqual({ ok: true, newState: false });
  });
});
