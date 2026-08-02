import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DbPort, DbQueryResult } from '../../kernel/contracts/index.js';
import { createRemindersWritesPort } from './remindersWritesPort.js';

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
      port.postOccurrenceSnooze({ occurrenceId: 'occ-1', minutes: 20 }),
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

    await expect(port.postOccurrenceSkip({ occurrenceId: 'occ-1', reason: null })).resolves.toEqual(
      {
        ok: true,
        skippedAt: '2026-08-02T10:00:00.000Z',
      },
    );
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

    await expect(port.postOccurrenceDone({ occurrenceId: 'occ-1' })).resolves.toEqual({
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
      port.postReminderMuteUntil({ minutes: null, untilTomorrow: true }),
    ).resolves.toEqual({ ok: false, error: 'not_found' });
  });

  it('returns ready messenger-topic copy from the canonical capability', async () => {
    const port = createRemindersWritesPort({
      db: dbWithRows({
        rows: [
          { persisted: true, paragraphs: ['Отключаю в Telegram.', 'Push остаётся активным.'] },
        ],
      }),
    });

    await expect(
      port.postMessengerTopicDisable({ occurrenceId: 'occ-1', messengerChannel: 'telegram' }),
    ).resolves.toEqual({
      ok: true,
      paragraphs: ['Отключаю в Telegram.', 'Push остаётся активным.'],
    });
  });

  it('opens and toggles notification settings through the same principal-bound capability', async () => {
    const port = createRemindersWritesPort({
      db: dbWithRows(
        {
          rows: [
            {
              topics: [
                { code: 'warmup_reminders', title: 'Напоминания о разминках', isEnabled: true },
              ],
            },
          ],
        },
        { rows: [{ new_state: false }] },
      ),
    });

    await expect(port.getNotificationSettings({ messengerChannel: 'max' })).resolves.toEqual({
      ok: true,
      topics: [{ code: 'warmup_reminders', title: 'Напоминания о разминках', isEnabled: true }],
    });
    await expect(
      port.toggleNotificationTopic({ messengerChannel: 'max', topicCode: 'warmup_reminders' }),
    ).resolves.toEqual({ ok: true, newState: false });
  });
});
