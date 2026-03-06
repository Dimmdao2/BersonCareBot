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
    });

    expect(event.type).toBe('message.received');
    expect(event.meta.source).toBe('telegram');
    expect(event.meta.correlationId).toBe('corr-1');
    expect(event.meta.eventId).toBe('evt-1');
    expect(event.payload).toMatchObject({ incoming });
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
    });

    expect(event.type).toBe('callback.received');
    expect(event.meta.source).toBe('telegram');
    expect(event.meta.correlationId).toBe('corr-2');
    expect(event.meta.eventId).toBe('evt-2');
    expect(event.payload).toMatchObject({ incoming });
  });
});
