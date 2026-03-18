import { describe, expect, it } from 'vitest';
import { parseMaxUpdate } from './schema.js';

describe('max schema', () => {
  it('parses message_created with real payload (body.text, recipient, sender)', () => {
    const raw = {
      update_type: 'message_created',
      timestamp: 1739184000000,
      message: {
        recipient: { chat_id: 100, user_id: 12345 },
        body: { mid: 'mid.1', seq: 0, text: 'Hello' },
        sender: { user_id: 54321, first_name: 'User', name: 'User' },
      },
      user_locale: 'ru',
    };
    const result = parseMaxUpdate(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.update_type).toBe('message_created');
      expect(result.data.message?.body?.text).toBe('Hello');
      expect(result.data.message?.recipient?.chat_id).toBe(100);
      expect(result.data.message?.sender?.user_id).toBe(54321);
    }
  });

  it('parses message_callback with real payload (callback object)', () => {
    const raw = {
      update_type: 'message_callback',
      timestamp: 1739184000000,
      callback: { callback_id: 'cb-123', payload: 'menu.back', user: { user_id: 54321 } },
      message: {
        recipient: { chat_id: -100000000, user_id: 54321 },
        body: { mid: 'mid.2', text: 'Menu' },
        sender: { user_id: 12345, is_bot: true },
      },
      user_locale: 'ru',
    };
    const result = parseMaxUpdate(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.update_type).toBe('message_callback');
      expect(result.data.callback?.callback_id).toBe('cb-123');
      expect(result.data.callback?.payload).toBe('menu.back');
    }
  });

  it('parses message_created when recipient has only user_id (private chat)', () => {
    const result = parseMaxUpdate({
      update_type: 'message_created',
      timestamp: 1,
      message: {
        recipient: { user_id: 12345 },
        body: { text: 'Hi' },
        sender: { user_id: 12345 },
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.message?.recipient?.user_id).toBe(12345);
      expect(result.data.message?.recipient?.chat_id).toBeUndefined();
    }
  });

  it('parses bot_started', () => {
    const result = parseMaxUpdate({ update_type: 'bot_started', timestamp: 1, message: { recipient: { chat_id: 1 }, sender: { user_id: 2 } } });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.update_type).toBe('bot_started');
  });

  it('rejects invalid update_type', () => {
    const result = parseMaxUpdate({ update_type: 'invalid', timestamp: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects missing timestamp', () => {
    const result = parseMaxUpdate({ update_type: 'message_created' });
    expect(result.success).toBe(false);
  });
});
