import { describe, expect, it } from 'vitest';
import type {
  Action,
  DbReadPort,
  DbWritePort,
  DomainContext,
  RemindersWebappWritesPort,
} from '../../../contracts/index.js';
import { handleReminders } from './reminders.js';

/**
 * D22: the bot's notification-category screen must show whatever categories the webapp returns —
 * zero category names hardcoded in the integrator. Proven by swapping the source (the injected
 * `remindersWebappWritesPort`, standing in for the webapp) and asserting the rendered keyboard
 * changes to match, then reverting and asserting it changes back.
 */

const userId = '44444444-4444-4444-8444-444444444444';

function notifSettingsOpenAction(): Action {
  return {
    id: 'notif-open-1',
    type: 'reminders.notifSettings.open.callback',
    mode: 'sync',
    params: {
      occurrenceId: '55555555-5555-4555-8555-555555555555',
      channelUserId: '7001',
      resource: 'telegram',
      chatId: 7001,
      messageId: 55,
      callbackQueryId: 'cbq-notif-1',
    },
  };
}

function notifSettingsOpenContext(): DomainContext {
  return {
    event: {
      type: 'callback.received',
      meta: {
        eventId: 'event-notif-open-1',
        occurredAt: '2026-08-01T09:00:00.000Z',
        source: 'telegram',
      },
      payload: {
        incoming: { chatId: 7001, messageId: 55, callbackQueryId: 'cbq-notif-1' },
      },
    },
    nowIso: '2026-08-01T09:00:00.000Z',
    values: {},
    base: { actor: { isAdmin: false }, identityLinks: [] },
  };
}

function unusedRemindersWebappWritesPort(): RemindersWebappWritesPort {
  return {
    postOccurrenceSnooze: async () => ({ ok: false, error: 'not used' }),
    postOccurrenceSkip: async () => ({ ok: false, error: 'not used' }),
    postOccurrenceDone: async () => ({ ok: false, error: 'not used' }),
    postReminderMuteUntil: async () => ({ ok: false, error: 'not used' }),
    postMessengerTopicDisable: async () => ({ ok: false, error: 'not used' }),
    getNotificationSettings: async () => ({ ok: false, error: 'not used' }),
    toggleNotificationTopic: async () => ({ ok: false, error: 'not used' }),
  };
}

function readPortForOwnedOccurrence(): DbReadPort {
  return {
    readDb: async <T>(query: Parameters<DbReadPort['readDb']>[0]): Promise<T> => {
      if (query.type === 'user.byIdentity') return { userId } as T;
      if (query.type === 'reminders.occurrence.ownerUserId') return userId as T;
      throw new Error(`unexpected read: ${query.type}`);
    },
  };
}

function noopWritePort(): DbWritePort {
  return { writeDb: async () => {} };
}

describe('D22: bot notification-category screen has zero hardcoded categories — taxonomy comes from webapp', () => {
  it('renders exactly the topics the webapp source returns, with no city/online/booking constants baked in', async () => {
    const topicsFromWebapp = [
      { code: 'appointment_reminders', title: 'Напоминания о записях', isEnabled: true },
      { code: 'patient_news', title: 'Новости и уведомления', isEnabled: false },
    ];
    const remindersWebappWritesPort: RemindersWebappWritesPort = {
      ...unusedRemindersWebappWritesPort(),
      getNotificationSettings: async () => ({ ok: true, topics: topicsFromWebapp }),
    };

    const result = await handleReminders(notifSettingsOpenAction(), notifSettingsOpenContext(), {
      readPort: readPortForOwnedOccurrence(),
      writePort: noopWritePort(),
      remindersWebappWritesPort,
    });

    expect(result.status).toBe('success');
    const editIntent = result.intents?.find(
      (i) => i.type === 'message.edit' || i.type === 'message.send',
    );
    const replyMarkup = (editIntent?.payload as { replyMarkup?: { inline_keyboard: unknown[][] } })
      ?.replyMarkup;
    const buttons = (replyMarkup?.inline_keyboard ?? []).flat() as Array<{
      text: string;
      callback_data: string;
    }>;
    expect(buttons.map((b) => b.text)).toEqual([
      '✓ Напоминания о записях',
      '✗ Новости и уведомления',
    ]);
    expect(buttons.map((b) => b.callback_data)).toEqual([
      'rem_notif_toggle:appointment_reminders',
      'rem_notif_toggle:patient_news',
    ]);
    // The old hardcoded taxonomy must never leak back into rendered output.
    const allText = buttons.map((b) => b.text).join(' ');
    expect(allText).not.toMatch(/spb|msk|Петербург|Москва|Онлайн-уроки/i);
  });

  it('changes the rendered keyboard when the webapp source is swapped for a completely different taxonomy, and reverts when swapped back', async () => {
    const original = [{ code: 'support_messages', title: 'Сообщения поддержки', isEnabled: true }];
    const swapped = [
      { code: 'clinic_branch_downtown', title: 'Филиал в центре', isEnabled: false },
      { code: 'clinic_branch_online', title: 'Онлайн-приём', isEnabled: true },
      { code: 'clinic_branch_uptown', title: 'Филиал на севере', isEnabled: true },
    ];

    async function renderWith(topics: typeof original) {
      const remindersWebappWritesPort: RemindersWebappWritesPort = {
        ...unusedRemindersWebappWritesPort(),
        getNotificationSettings: async () => ({ ok: true, topics }),
      };
      const result = await handleReminders(notifSettingsOpenAction(), notifSettingsOpenContext(), {
        readPort: readPortForOwnedOccurrence(),
        writePort: noopWritePort(),
        remindersWebappWritesPort,
      });
      const editIntent = result.intents?.find(
        (i) => i.type === 'message.edit' || i.type === 'message.send',
      );
      const replyMarkup = (
        editIntent?.payload as { replyMarkup?: { inline_keyboard: unknown[][] } }
      )?.replyMarkup;
      return ((replyMarkup?.inline_keyboard ?? []).flat() as Array<{ text: string }>).map(
        (b) => b.text,
      );
    }

    const before = await renderWith(original);
    expect(before).toEqual(['✓ Сообщения поддержки']);

    const afterSwap = await renderWith(swapped);
    expect(afterSwap).toEqual(['✗ Филиал в центре', '✓ Онлайн-приём', '✓ Филиал на севере']);
    expect(afterSwap).not.toEqual(before);

    const afterRevert = await renderWith(original);
    expect(afterRevert).toEqual(before);
  });
});
