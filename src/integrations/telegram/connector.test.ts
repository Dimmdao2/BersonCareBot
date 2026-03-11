import { describe, expect, it } from 'vitest';
import type { IncomingUpdate } from '../../kernel/domain/types.js';
import { telegramIncomingToEvent } from './connector.js';
import { fromTelegram, normalizeTelegramAction } from './mapIn.js';

describe('normalizeTelegramAction', () => {
  it('maps legacy callback keys to canonical action keys', () => {
    expect(normalizeTelegramAction('menu_notifications')).toBe('notifications.show');
    expect(normalizeTelegramAction('menu_my_bookings')).toBe('bookings.show');
    expect(normalizeTelegramAction('menu_back')).toBe('menu.back');
    expect(normalizeTelegramAction('notify_toggle_spb')).toBe('notifications.toggle.spb');
  });

  it('keeps canonical action keys unchanged', () => {
    expect(normalizeTelegramAction('notifications.toggle.online')).toBe('notifications.toggle.online');
    expect(normalizeTelegramAction('bookings.show')).toBe('bookings.show');
  });
});

describe('fromTelegram', () => {
  it('normalizes callback data and does not force linked flag', () => {
    const update = fromTelegram(
      {
        update_id: 1,
        callback_query: {
          id: 'cq-1',
          from: { id: 123, is_bot: false, first_name: 'U' },
          message: {
            message_id: 10,
            chat: { id: 123, type: 'private' },
            date: 1700000000,
          },
          data: 'menu_notifications',
        },
      },
      { userRow: null, telegramId: '123' },
    );

    expect(update).toMatchObject({
      kind: 'callback',
      action: 'notifications.show',
      callbackData: 'notifications.show',
    });
    expect(update && 'hasLinkedPhone' in update ? update.hasLinkedPhone : undefined).toBeUndefined();
  });

  it('does not force idle user state when context is absent', () => {
    const update = fromTelegram(
      {
        update_id: 2,
        message: {
          message_id: 11,
          from: { id: 123, is_bot: false, first_name: 'U', username: 'u1' },
          chat: { id: 123, type: 'private' },
          date: 1700000000,
          text: '/start',
        },
      },
      { userRow: null, telegramId: '123' },
    );

    expect(update).toMatchObject({
      kind: 'message',
      userState: '',
      action: '',
      channelId: '123',
    });
  });

  it('maps menu message text to canonical action', () => {
    const update = fromTelegram(
      {
        update_id: 3,
        message: {
          message_id: 12,
          from: { id: 123, is_bot: false, first_name: 'U', username: 'u1' },
          chat: { id: 123, type: 'private' },
          date: 1700000000,
          text: '❓ Задать вопрос',
        },
      },
      { userRow: null, telegramId: '123' },
    );

    expect(update).toMatchObject({
      kind: 'message',
      action: 'question.ask',
    });
  });

  it('maps "Вернуться в меню" to phone.request.cancel', () => {
    const update = fromTelegram(
      {
        update_id: 5,
        message: {
          message_id: 14,
          from: { id: 123, is_bot: false, first_name: 'U', username: 'u1' },
          chat: { id: 123, type: 'private' },
          date: 1700000000,
          text: 'Вернуться в меню',
        },
      },
      { userRow: null, telegramId: '123' },
    );

    expect(update).toMatchObject({
      kind: 'message',
      action: 'phone.request.cancel',
    });
  });

  it('normalizes shared contact phone into canonical phone field', () => {
    const update = fromTelegram(
      {
        update_id: 4,
        message: {
          message_id: 13,
          from: { id: 123, is_bot: false, first_name: 'U', username: 'u1' },
          chat: { id: 123, type: 'private' },
          date: 1700000000,
          contact: {
            phone_number: '8 (918) 900-07-82',
            user_id: 123,
            first_name: 'U',
          },
        },
      },
      { userRow: null, telegramId: '123' },
    );

    expect(update).toMatchObject({
      kind: 'message',
      phone: '+79189000782',
      contactPhone: '8 (918) 900-07-82',
    });
  });
});

describe('telegramIncomingToEvent', () => {
  it('maps message update to IncomingEvent', () => {
    const incoming: IncomingUpdate = {
      kind: 'message',
      chatId: 123,
      channelId: '123',
      text: '/start',
      userRow: { id: '1', channel_id: '123' },
      userState: 'idle',
    };

    const event = telegramIncomingToEvent({
      incoming,
      correlationId: 'corr-1',
      eventId: 'evt-1',
      facts: {
        actor: { displayName: 'User One' },
      },
    });

    expect(event.type).toBe('message.received');
    expect(event.meta.source).toBe('telegram');
    expect(event.meta.correlationId).toBe('corr-1');
    expect(event.meta.eventId).toBe('evt-1');
    expect(event.payload).toMatchObject({
      incoming,
      facts: {
        actor: { displayName: 'User One' },
      },
    });
  });

  it('maps callback update to IncomingEvent', () => {
    const incoming: IncomingUpdate = {
      kind: 'callback',
      chatId: 123,
      messageId: 10,
      channelUserId: 123,
      callbackData: 'menu_notifications',
      callbackQueryId: 'cb-1',
    };

    const event = telegramIncomingToEvent({
      incoming,
      correlationId: 'corr-2',
      eventId: 'evt-2',
      updateId: 99,
    });

    expect(event.type).toBe('callback.received');
    expect(event.meta.source).toBe('telegram');
    expect(event.meta.correlationId).toBe('corr-2');
    expect(event.meta.eventId).toBe('evt-2');
    expect(event.meta.dedupFingerprint).toEqual({ updateId: 99 });
    expect(event.payload).toMatchObject({ incoming });
  });
});
