import { describe, expect, it } from 'vitest';
import type {
  Action,
  DbReadPort,
  DbWritePort,
  DomainContext,
  RemindersWebappWritesPort,
} from '../../../contracts/index.js';
import { handleReminders } from './reminders.js';

const platformUserId = '11111111-1111-4111-8111-111111111111';

const action: Action = {
  id: 'disable-reminder-topic',
  type: 'reminders.messengerTopic.disable.callback',
  mode: 'sync',
  params: {
    occurrenceId: 'occurrence-1',
    channelUserId: '7001',
    resource: 'telegram',
    chatId: 7001,
    messageId: 55,
    callbackQueryId: 'callback-1',
  },
};

const context: DomainContext = {
  event: {
    type: 'callback.received',
    meta: {
      eventId: 'event-1',
      occurredAt: '2026-09-07T12:00:00.000Z',
      source: 'telegram',
    },
    payload: {
      incoming: { chatId: 7001, messageId: 55, callbackQueryId: 'callback-1' },
    },
  },
  nowIso: '2026-09-07T12:00:00.000Z',
  values: {},
  base: { actor: { isAdmin: false }, identityLinks: [] },
};

const readPort: DbReadPort = {
  readDb: async <T>(query: Parameters<DbReadPort['readDb']>[0]): Promise<T> => {
    if (query.type === 'user.byIdentity') return { userId: platformUserId } as T;
    throw new Error(`unexpected read: ${query.type}`);
  },
};

const writePort: DbWritePort = { writeDb: async () => {} };

function remindersPort(
  result: Awaited<ReturnType<RemindersWebappWritesPort['postMessengerTopicDisable']>>,
): RemindersWebappWritesPort {
  const unused = async () => ({ ok: false as const, error: 'not used' });
  return {
    postOccurrenceSnooze: unused,
    postOccurrenceSkip: unused,
    postOccurrenceDone: unused,
    postReminderMuteUntil: unused,
    postMessengerTopicDisable: async () => result,
    getNotificationSettings: unused,
    toggleNotificationTopic: unused,
  };
}

describe('reminder callback patient-origin behavior', () => {
  it('emits patient destinations only on the trusted resolved origin', async () => {
    const result = await handleReminders(action, context, {
      readPort,
      writePort,
      remindersWebappWritesPort: remindersPort({
        ok: true,
        paragraphs: ['Готово.'],
        organizationId: '22222222-2222-4222-8222-222222222222',
        patientPublicOrigin: 'https://clinic.patient.example',
      }),
    });

    expect(result.status).toBe('success');
    const serialized = JSON.stringify(result.intents);
    expect(serialized).toContain(
      'https://clinic.patient.example/app/patient/profile#patient-profile-notifications',
    );
    expect(serialized).toContain('https://clinic.patient.example/app/patient');
    expect(serialized).not.toContain('staff.example');
  });

  it('emits no intent when the trusted operation has no patient origin', async () => {
    const result = await handleReminders(action, context, {
      readPort,
      writePort,
      remindersWebappWritesPort: remindersPort({ ok: true, paragraphs: ['Готово.'] }),
    });

    expect(result.status).toBe('failed');
    expect(result.intents).toBeUndefined();
  });
});
