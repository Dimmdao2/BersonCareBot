import { describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { mapBodyToIncoming, registerTelegramWebhookRoutes } from './webhook.js';
import type { TelegramWebhookBodyValidated } from './schema.js';

vi.mock('./setupMenuButton.js', () => ({
  setupTelegramMenuButton: vi.fn(async () => undefined),
  ensureNoMenuButtonForUser: vi.fn(async () => undefined),
}));

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

  it('parses /start setphone_<phone> to start.setphone with normalized phone (deep link)', () => {
    const body: TelegramWebhookBodyValidated = {
      message: {
        from: { id: 100, is_bot: false, first_name: 'A' },
        chat: { id: 100 },
        // eslint-disable-next-line no-secrets/no-secrets -- test payload for setphone deep link
        text: '/start setphone_+79181234567',
      },
    };
    const incoming = mapBodyToIncoming(body);
    expect(incoming).not.toBeNull();
    if (incoming?.kind === 'message') {
      expect(incoming.action).toBe('start.setphone');
      expect((incoming as { phone?: string }).phone).toBe('+79181234567');
    }
  });

  it('parses /start link_<secret> to start.link with linkSecret', () => {
    const body: TelegramWebhookBodyValidated = {
      message: {
        from: { id: 321, is_bot: false, first_name: 'Link' },
        chat: { id: 321 },
        text: '/start link_abC123-_',
      },
    };
    const incoming = mapBodyToIncoming(body);
    expect(incoming).not.toBeNull();
    if (incoming?.kind === 'message') {
      expect(incoming.action).toBe('start.link');
      expect((incoming as { linkSecret?: string }).linkSecret).toBe('link_abC123-_');
    }
  });

  it('propagates reply_to_message.message_id as replyToMessageId', () => {
    const body = {
      message: {
        from: { id: 100, is_bot: false, first_name: 'A' },
        chat: { id: 100 },
        message_id: 999,
        text: 'болит колено',
        reply_to_message: { message_id: 42 },
      },
    } as TelegramWebhookBodyValidated;
    const incoming = mapBodyToIncoming(body);
    expect(incoming?.kind).toBe('message');
    if (incoming?.kind === 'message') {
      expect(incoming.replyToMessageId).toBe(42);
      expect(incoming.messageId).toBe(999);
    }
  });

  it('maps rem_snooze callback_data to reminderOccurrenceId and reminderSnoozeMinutes', () => {
    const occId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const body = {
      callback_query: {
        id: 'cq-rem',
        from: { id: 100, is_bot: false, first_name: 'U' },
        message: { message_id: 50, chat: { id: 100 } },
        data: `rem_snooze:${occId}:15`,
      },
    } as TelegramWebhookBodyValidated;
    const incoming = mapBodyToIncoming(body);
    expect(incoming?.kind).toBe('callback');
    if (incoming?.kind === 'callback') {
      expect(incoming.action).toBe('rem_snooze');
      expect(incoming.reminderOccurrenceId).toBe(occId);
      expect(incoming.reminderSnoozeMinutes).toBe(15);
      expect(incoming.callbackQueryId).toBe('cq-rem');
    }
  });

  it('maps diary.symptom.select callback_data to trackingId', () => {
    const body = {
      callback_query: {
        id: 'cq-diary',
        from: { id: 200, is_bot: false, first_name: 'U' },
        message: { message_id: 51, chat: { id: 200 } },
        data: 'diary.symptom.select:track-uuid-1',
      },
    } as TelegramWebhookBodyValidated;
    const incoming = mapBodyToIncoming(body);
    expect(incoming?.kind).toBe('callback');
    if (incoming?.kind === 'callback') {
      expect(incoming.action).toBe('diary.symptom.select');
      expect(incoming.trackingId).toBe('track-uuid-1');
    }
  });

  it('maps admin_reply callback to action and conversationId', () => {
    const body = {
      callback_query: {
        id: 'cq-adm',
        from: { id: 1, is_bot: false, first_name: 'Admin' },
        message: { message_id: 1, chat: { id: 1 } },
        data: 'admin_reply:conv-123',
      },
    } as TelegramWebhookBodyValidated;
    const incoming = mapBodyToIncoming(body);
    expect(incoming?.kind).toBe('callback');
    if (incoming?.kind === 'callback') {
      expect(incoming.action).toBe('admin_reply');
      expect(incoming.conversationId).toBe('conv-123');
    }
  });
});

describe('registerTelegramWebhookRoutes', () => {
  it('returns 200 and emits event for valid /webhook/telegram payload', async () => {
    const handleIncomingEvent = vi.fn().mockResolvedValue({ status: 'accepted' });
    const app = Fastify();
    await registerTelegramWebhookRoutes(app, {
      eventGateway: { handleIncomingEvent },
      resolveIntegratorUserIdForMessenger: async () => undefined,
    });
    const res = await app.inject({
      method: 'POST',
      url: '/webhook/telegram',
      payload: {
        update_id: 11,
        message: {
          message_id: 7,
          from: { id: 101, is_bot: false, first_name: 'U' },
          chat: { id: 101, type: 'private' },
          text: '/start',
        },
      },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload)).toEqual({ ok: true });
    expect(handleIncomingEvent).toHaveBeenCalledTimes(1);
    const event = handleIncomingEvent.mock.calls[0]?.[0] as { meta: { source: string } };
    expect(event.meta.source).toBe('telegram');
  });
});
