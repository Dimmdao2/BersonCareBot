import { describe, expect, it } from 'vitest';
import { parseMaxUpdate } from './schema.js';

describe('max schema', () => {
  it('parses message_created update', () => {
    const raw = {
      update_type: 'message_created',
      timestamp: 1234567890,
      message: { id: 1, text: 'Hello', user_id: 100, chat_id: 100 },
    };
    const result = parseMaxUpdate(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.update_type).toBe('message_created');
      expect(result.data.message?.text).toBe('Hello');
    }
  });

  it('parses message_callback update', () => {
    const raw = {
      update_type: 'message_callback',
      timestamp: 1234567890,
      callback_id: 'cb-123',
      payload: 'menu.back',
      message: { id: 2, user_id: 100, chat_id: 100 },
    };
    const result = parseMaxUpdate(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.update_type).toBe('message_callback');
      expect(result.data.callback_id).toBe('cb-123');
      expect(result.data.payload).toBe('menu.back');
    }
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
