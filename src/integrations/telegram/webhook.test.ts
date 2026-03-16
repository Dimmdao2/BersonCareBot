import { describe, expect, it } from 'vitest';
import { mapBodyToIncoming } from './webhook.js';
import type { TelegramWebhookBodyValidated } from './schema.js';

describe('mapBodyToIncoming', () => {
  it('includes contactPhone only when contact.user_id === from.id (own contact)', () => {
    const body: TelegramWebhookBodyValidated = {
      message: {
        from: { id: 100, is_bot: false, first_name: 'A' },
        chat: { id: 100 },
        text: '',
        contact: {
          phone_number: '+79181234567',
          user_id: 100,
        },
      },
    };
    const incoming = mapBodyToIncoming(body);
    expect(incoming).not.toBeNull();
    expect(incoming?.kind).toBe('message');
    if (incoming?.kind === 'message') {
      expect(incoming.contactPhone).toBe('+79181234567');
      expect(incoming.phone).toBeDefined();
    }
  });

  it('omits contactPhone when contact.user_id !== from.id (hostile: someone else’s contact)', () => {
    const body: TelegramWebhookBodyValidated = {
      message: {
        from: { id: 200, is_bot: false, first_name: 'B' },
        chat: { id: 200 },
        text: '',
        contact: {
          phone_number: '+79187654321',
          user_id: 999,
        },
      },
    };
    const incoming = mapBodyToIncoming(body);
    expect(incoming).not.toBeNull();
    if (incoming?.kind === 'message') {
      expect(incoming.contactPhone).toBeUndefined();
      expect(incoming.phone).toBeUndefined();
    }
  });

  it('parses deep link /start setrubitimerecord_<id> and sets action + recordId for RubiTime linking', () => {
    const body: TelegramWebhookBodyValidated = {
      message: {
        from: { id: 500, is_bot: false, first_name: 'User' },
        chat: { id: 500 },
        text: '/start setrubitimerecord_rec-abc123',
      },
    };
    const incoming = mapBodyToIncoming(body);
    expect(incoming).not.toBeNull();
    expect(incoming?.kind).toBe('message');
    if (incoming?.kind === 'message') {
      expect(incoming.action).toBe('start.setrubitimerecord');
      expect((incoming as { recordId?: string }).recordId).toBe('rec-abc123');
    }
  });

  it('does not set start.setphone action or phone for /start setphone_... (unsafe shortcut removed)', () => {
    const body: TelegramWebhookBodyValidated = {
      message: {
        from: { id: 100, is_bot: false, first_name: 'A' },
        chat: { id: 100 },
        // eslint-disable-next-line no-secrets/no-secrets -- test payload for rejected start.setphone pattern
        text: '/start setphone_+79181234567',
      },
    };
    const incoming = mapBodyToIncoming(body);
    expect(incoming).not.toBeNull();
    if (incoming?.kind === 'message') {
      expect(incoming.action).not.toBe('start.setphone');
      expect((incoming as { phone?: string }).phone).toBeUndefined();
    }
  });
});
