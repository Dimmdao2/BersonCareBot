import { describe, expect, it } from 'vitest';
import { fromMax } from './mapIn.js';

describe('max mapIn', () => {
  it('maps message_created to IncomingMessageUpdate', () => {
    const body = {
      update_type: 'message_created' as const,
      timestamp: 1,
      message: { id: 10, text: 'Hi', user_id: 200, chat_id: 200 },
    };
    const incoming = fromMax(body);
    expect(incoming).not.toBeNull();
    expect(incoming?.kind).toBe('message');
    if (incoming?.kind === 'message') {
      expect(incoming.chatId).toBe(200);
      expect(incoming.channelId).toBe('200');
      expect(incoming.text).toBe('Hi');
    }
  });

  it('maps menu.more text to action', () => {
    const body = {
      update_type: 'message_created' as const,
      timestamp: 1,
      message: { id: 11, text: '⚙️ Меню', user_id: 201, chat_id: 201 },
    };
    const incoming = fromMax(body);
    expect(incoming?.kind).toBe('message');
    if (incoming?.kind === 'message') expect(incoming.action).toBe('menu.more');
  });

  it('maps message_callback to IncomingCallbackUpdate', () => {
    const body = {
      update_type: 'message_callback' as const,
      timestamp: 1,
      callback_id: 'cb-1',
      payload: 'notifications.show',
      message: { id: 5, user_id: 202, chat_id: 202 },
    };
    const incoming = fromMax(body);
    expect(incoming).not.toBeNull();
    expect(incoming?.kind).toBe('callback');
    if (incoming?.kind === 'callback') {
      expect(incoming.callbackQueryId).toBe('cb-1');
      expect(incoming.callbackData).toBe('notifications.show');
      expect(incoming.channelUserId).toBe(202);
    }
  });

  it('maps bot_started with message to /start-like message', () => {
    const body = {
      update_type: 'bot_started' as const,
      timestamp: 1,
      message: { id: 1, user_id: 203, chat_id: 203 },
    };
    const incoming = fromMax(body);
    expect(incoming?.kind).toBe('message');
    if (incoming?.kind === 'message') expect(incoming.text).toBe('/start');
  });

  it('returns null for message_callback without callback_id', () => {
    const body = {
      update_type: 'message_callback' as const,
      timestamp: 1,
      message: { user_id: 204, chat_id: 204 },
    };
    const incoming = fromMax(body);
    expect(incoming).toBeNull();
  });
});
