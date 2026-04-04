import { describe, expect, it, vi } from 'vitest';
import type { IncomingUpdate } from '../types.js';
import type { ChannelUserPort } from '../ports/user.js';
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
    onboardingWelcome: 'onboarding-welcome',
    chooseMenu: 'choose',
    describeQuestion: 'describe',
    questionAccepted: 'accepted',
    notImplemented: 'not-implemented',
    bookingMy: 'booking-my',
    confirmPhoneForBooking: 'confirm-contact',
    bookingOpenPrompt: 'open',
    bookingOpenButton: 'button',
  },
  notificationSettings: { title: 't', subtitle: 's' },
  buildNotificationKeyboard: () => ({ inline_keyboard: [] }),
};

function buildUserPort(): ChannelUserPort {
  return {
    upsertUser: vi.fn().mockResolvedValue({ id: '1', channel_id: '100' }),
    setUserState: vi.fn().mockResolvedValue(undefined),
    setUserPhone: vi.fn().mockResolvedValue(undefined),
    getUserState: vi.fn().mockResolvedValue('idle'),
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
      channelId: '100',
      text: '',
      contactPhone: '8 (919) 123-45-67',
      userRow: { id: '1', channel_id: '100' },
      userState: 'await_contact:booking_record:7878663',
    };

    const actions = await handleUpdate(incoming, userPort, notificationsPort, content);

    expect(userPort.setUserPhone).toHaveBeenCalledWith('100', '+79191234567');
    expect(userPort.setUserState).toHaveBeenCalledWith('100', 'idle');
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
      channelId: '100',
      text: 'мой номер 8919...',
      userRow: { id: '1', channel_id: '100' },
      userState: 'await_contact:booking_record:7878663',
    };

    const actions = await handleUpdate(incoming, userPort, notificationsPort, content);

    expect(userPort.setUserPhone).not.toHaveBeenCalled();
    expect(userPort.setUserState).not.toHaveBeenCalled();
    expect(actions[0]).toMatchObject({
      type: 'sendMessage',
      chatId: 100,
      text: 'confirm-contact',
    });
  });

  it('does not send welcome on /start when phone is already linked', async () => {
    const userPort = buildUserPort();
    const incoming: IncomingUpdate = {
      kind: 'message',
      chatId: 100,
      channelId: '100',
      text: '/start',
      hasLinkedPhone: true,
      userRow: { id: '1', channel_id: '100' },
      userState: 'idle',
    };

    const actions = await handleUpdate(incoming, userPort, notificationsPort, content);
    expect(actions[0]).toMatchObject({
      type: 'sendMessage',
      chatId: 100,
      text: 'choose',
    });
  });

  it('sends onboarding and request_contact on /start when phone is not linked', async () => {
    const userPort = buildUserPort();
    const incoming: IncomingUpdate = {
      kind: 'message',
      chatId: 100,
      channelId: '100',
      text: '/start',
      hasLinkedPhone: false,
      userRow: { id: '1', channel_id: '100' },
      userState: 'idle',
    };

    const actions = await handleUpdate(incoming, userPort, notificationsPort, content);
    expect(userPort.setUserState).toHaveBeenCalledWith('100', 'await_contact:subscription');
    expect(actions[0]).toMatchObject({
      type: 'sendMessage',
      chatId: 100,
      text: 'onboarding-welcome',
      replyMarkup: content.requestContactKeyboard,
    });
  });

  it('requests contact when book button pressed and phone is not linked', async () => {
    const userPort = buildUserPort();
    const incoming: IncomingUpdate = {
      kind: 'message',
      chatId: 100,
      channelId: '100',
      text: 'book',
      hasLinkedPhone: false,
      userRow: { id: '1', channel_id: '100' },
      userState: 'idle',
    };

    const actions = await handleUpdate(incoming, userPort, notificationsPort, content);
    expect(userPort.setUserState).toHaveBeenCalledWith('100', 'await_contact:subscription');
    expect(actions[0]).toMatchObject({
      type: 'sendMessage',
      chatId: 100,
      text: 'confirm-contact',
    });
  });

  it('requests contact for callback "menu_my_bookings" without linked phone', async () => {
    const userPort = buildUserPort();
    const incoming: IncomingUpdate = {
      kind: 'callback',
      chatId: 100,
      messageId: 10,
      channelUserId: 100,
      hasLinkedPhone: false,
      callbackData: 'menu_my_bookings',
      callbackQueryId: 'cbq-1',
    };

    const actions = await handleUpdate(incoming, userPort, notificationsPort, content);
    expect(userPort.setUserState).toHaveBeenCalledWith('100', 'await_contact:subscription');
    expect(actions[0]).toMatchObject({
      type: 'sendMessage',
      chatId: 100,
      text: 'confirm-contact',
    });
    expect(actions[1]).toMatchObject({
      type: 'answerCallbackQuery',
      callbackQueryId: 'cbq-1',
    });
  });
});
