import { describe, expect, it, vi } from 'vitest';
import type { IncomingUpdate } from '../types.js';
import type { UserPort } from '../ports/user.js';
import type { NotificationsPort } from '../ports/notifications.js';
import type { WebhookContent } from '../webhookContent.js';
import { handleUpdate } from './handleUpdate.js';

const content: WebhookContent = {
  mainMenu: { ask: 'ask', book: 'book', more: 'more' },
  mainMenuKeyboard: [[{ text: 'book' }]],
  requestContactKeyboard: { keyboard: [[{ text: 'send contact', request_contact: true }]] },
  bookingUrl: 'https://example.com',
  moreMenuInline: { inline_keyboard: [] },
  messages: {
    welcome: 'welcome',
    chooseMenu: 'choose',
    describeQuestion: 'describe',
    questionAccepted: 'accepted',
    notImplemented: 'not-implemented',
    bookingMy: 'booking-my',
    confirmPhoneForRubitime: 'confirm-contact',
    bookingOpenPrompt: 'open',
    bookingOpenButton: 'button',
  },
  notificationSettings: { title: 't', subtitle: 's' },
  buildNotificationKeyboard: () => ({ inline_keyboard: [] }),
};

function buildUserPort(): UserPort {
  return {
    upsertTelegramUser: vi.fn().mockResolvedValue({ id: '1', telegram_id: '100' }),
    setTelegramUserState: vi.fn().mockResolvedValue(undefined),
    setTelegramUserPhone: vi.fn().mockResolvedValue(undefined),
    getTelegramUserState: vi.fn().mockResolvedValue('idle'),
    tryAdvanceLastUpdateId: vi.fn().mockResolvedValue(true),
    tryConsumeStart: vi.fn().mockResolvedValue(true),
  };
}

const notificationsPort: NotificationsPort = {
  getNotificationSettings: vi.fn().mockResolvedValue({
    notify_spb: false,
    notify_msk: false,
    notify_online: false,
  }),
  updateNotificationSettings: vi.fn().mockResolvedValue(undefined),
};

describe('handleUpdate contact linking', () => {
  it('stores phone and resets state in await_contact flow', async () => {
    const userPort = buildUserPort();
    const incoming: IncomingUpdate = {
      kind: 'message',
      chatId: 100,
      telegramId: '100',
      text: '',
      contactPhone: '8 (919) 123-45-67',
      userRow: { id: '1', telegram_id: '100' },
      userState: 'await_contact:rubitime_record:7878663',
    };

    const actions = await handleUpdate(incoming, userPort, notificationsPort, content);

    expect(userPort.setTelegramUserPhone).toHaveBeenCalledWith('100', '+79191234567');
    expect(userPort.setTelegramUserState).toHaveBeenCalledWith('100', 'idle');
    expect(actions[0]).toMatchObject({
      type: 'sendMessage',
      chatId: 100,
      text: 'choose',
    });
  });

  it('asks for contact again when await_contact has no phone payload', async () => {
    const userPort = buildUserPort();
    const incoming: IncomingUpdate = {
      kind: 'message',
      chatId: 100,
      telegramId: '100',
      text: 'мой номер 8919...',
      userRow: { id: '1', telegram_id: '100' },
      userState: 'await_contact:rubitime_record:7878663',
    };

    const actions = await handleUpdate(incoming, userPort, notificationsPort, content);

    expect(userPort.setTelegramUserPhone).not.toHaveBeenCalled();
    expect(userPort.setTelegramUserState).not.toHaveBeenCalled();
    expect(actions[0]).toMatchObject({
      type: 'sendMessage',
      chatId: 100,
      text: 'confirm-contact',
    });
  });
});
