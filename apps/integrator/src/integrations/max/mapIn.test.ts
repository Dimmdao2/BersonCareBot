import { describe, expect, it } from 'vitest';
import { fromMax } from './mapIn.js';

/** Real MAX payload: message.body.text, message.recipient, message.sender; callback.* */
describe('max mapIn', () => {
  it('maps message_created (real payload) to IncomingMessageUpdate', () => {
    const body = {
      update_type: 'message_created' as const,
      timestamp: 1739184000000,
      message: {
        recipient: { chat_id: 200, user_id: 12345 },
        body: { mid: 'mid-1', text: 'Hi' },
        sender: { user_id: 200, username: 'maxuser', first_name: 'Max', last_name: 'User' },
      },
      user_locale: 'ru',
    };
    const incoming = fromMax(body);
    expect(incoming).not.toBeNull();
    expect(incoming?.kind).toBe('message');
    if (incoming?.kind === 'message') {
      expect(incoming.chatId).toBe(200);
      expect(incoming.channelId).toBe('200');
      expect(incoming.messageId).toBe('mid-1');
      expect(incoming.text).toBe('Hi');
      expect(incoming.channelUsername).toBe('maxuser');
      expect(incoming.channelFirstName).toBe('Max');
      expect(incoming.channelLastName).toBe('User');
    }
  });

  it('maps menu.more text to action', () => {
    const body = {
      update_type: 'message_created' as const,
      timestamp: 1,
      message: {
        recipient: { chat_id: 201 },
        body: { text: '⚙️ Меню' },
        sender: { user_id: 201 },
      },
    };
    const incoming = fromMax(body);
    expect(incoming?.kind).toBe('message');
    if (incoming?.kind === 'message') expect(incoming.action).toBe('menu.more');
  });

  it('maps /diary and /menu to webapp nav actions', () => {
    const diary = {
      update_type: 'message_created' as const,
      timestamp: 1,
      message: {
        recipient: { chat_id: 201 },
        body: { text: '/diary' },
        sender: { user_id: 201 },
      },
    };
    const menu = {
      update_type: 'message_created' as const,
      timestamp: 1,
      message: {
        recipient: { chat_id: 202 },
        body: { text: '/menu' },
        sender: { user_id: 202 },
      },
    };
    const d = fromMax(diary);
    expect(d?.kind).toBe('message');
    if (d?.kind === 'message') expect(d.action).toBe('nav.webapp.diary');
    const m = fromMax(menu);
    expect(m?.kind).toBe('message');
    if (m?.kind === 'message') expect(m.action).toBe('nav.webapp.menu');
  });

  it('maps /book command to booking.open', () => {
    const body = {
      update_type: 'message_created' as const,
      timestamp: 1,
      message: {
        recipient: { chat_id: 201 },
        body: { text: '/book' },
        sender: { user_id: 201 },
      },
    };
    const incoming = fromMax(body);
    expect(incoming?.kind).toBe('message');
    if (incoming?.kind === 'message') expect(incoming.action).toBe('booking.open');
  });

  it('maps /start link_<secret> with leading BOM to start.link', () => {
    const body = {
      update_type: 'message_created' as const,
      timestamp: 1,
      message: {
        recipient: { chat_id: 201 },
        body: { text: '\uFEFF/start link_abC123-_' },
        sender: { user_id: 201 },
      },
    };
    const incoming = fromMax(body);
    expect(incoming?.kind).toBe('message');
    if (incoming?.kind === 'message') {
      expect(incoming.action).toBe('start.link');
      expect((incoming as { linkSecret?: string }).linkSecret).toBe('link_abC123-_');
    }
  });

  it('maps /start@BotName link_<secret> to start.link (меню команд с суффиксом бота)', () => {
    const body = {
      update_type: 'message_created' as const,
      timestamp: 1,
      message: {
        recipient: { chat_id: 201 },
        body: { text: '/start@MyMaxBot link_abC123-_' },
        sender: { user_id: 201 },
      },
    };
    const incoming = fromMax(body);
    expect(incoming?.kind).toBe('message');
    if (incoming?.kind === 'message') {
      expect(incoming.action).toBe('start.link');
      expect((incoming as { linkSecret?: string }).linkSecret).toBe('link_abC123-_');
    }
  });

  it('maps /start link_<secret> to start.link and keeps linkSecret', () => {
    const body = {
      update_type: 'message_created' as const,
      timestamp: 1,
      message: {
        recipient: { chat_id: 201 },
        body: { text: '/start link_abC123-_' },
        sender: { user_id: 201 },
      },
    };
    const incoming = fromMax(body);
    expect(incoming?.kind).toBe('message');
    if (incoming?.kind === 'message') {
      expect(incoming.action).toBe('start.link');
      expect((incoming as { linkSecret?: string }).linkSecret).toBe('link_abC123-_');
    }
  });

  it('maps image attachment to relayMessageType photo', () => {
    const body = {
      update_type: 'message_created' as const,
      timestamp: 1,
      message: {
        recipient: { chat_id: 201 },
        body: { mid: 'mid-photo', attachments: [{ type: 'image', payload: { url: 'https://x.test/a.jpg' } }] },
        sender: { user_id: 201 },
      },
    };
    const incoming = fromMax(body);
    expect(incoming?.kind).toBe('message');
    if (incoming?.kind === 'message') expect(incoming.relayMessageType).toBe('photo');
  });

  it('maps message_callback (real payload) to IncomingCallbackUpdate', () => {
    const body = {
      update_type: 'message_callback' as const,
      timestamp: 1,
      callback: {
        callback_id: 'cb-1',
        payload: 'admin_reply:conv-42',
        user: { user_id: 202, username: 'callback-user', first_name: 'Call', last_name: 'Back' },
      },
      message: { recipient: { chat_id: 202 }, body: { mid: 'mid-callback-1' }, sender: { user_id: 12345 } },
    };
    const incoming = fromMax(body);
    expect(incoming).not.toBeNull();
    expect(incoming?.kind).toBe('callback');
    if (incoming?.kind === 'callback') {
      expect(incoming.messageId).toBe('mid-callback-1');
      expect(incoming.callbackQueryId).toBe('cb-1');
      expect(incoming.callbackData).toBe('admin_reply');
      expect(incoming.action).toBe('admin_reply');
      expect(incoming.conversationId).toBe('conv-42');
      expect(incoming.channelUserId).toBe(202);
      expect(incoming.channelUsername).toBe('callback-user');
      expect(incoming.channelFirstName).toBe('Call');
      expect(incoming.channelLastName).toBe('Back');
    }
  });

  it('maps message_callback rem_snooze payload to reminder fields (same parser as Telegram)', () => {
    const body = {
      update_type: 'message_callback' as const,
      timestamp: 1,
      callback: {
        callback_id: 'cb-rem',
        payload: 'rem_snooze:occ-max:60',
        user: { user_id: 303 },
      },
      message: { recipient: { chat_id: 303 }, body: { mid: 'mid-rem' }, sender: { user_id: 303 } },
    };
    const incoming = fromMax(body);
    expect(incoming?.kind).toBe('callback');
    if (incoming?.kind === 'callback') {
      expect(incoming.action).toBe('rem_snooze');
      expect(incoming.reminderOccurrenceId).toBe('occ-max');
      expect(incoming.reminderSnoozeMinutes).toBe(60);
    }
  });

  it('maps bot_started with message to /start-like message', () => {
    const body = {
      update_type: 'bot_started' as const,
      timestamp: 1,
      message: { recipient: { chat_id: 203 }, sender: { user_id: 203 } },
    };
    const incoming = fromMax(body);
    expect(incoming?.kind).toBe('message');
    if (incoming?.kind === 'message') expect(incoming.text).toBe('/start');
  });

  it('maps user_added to /start-like message', () => {
    const body = {
      update_type: 'user_added' as const,
      timestamp: 1,
      chat_id: 204,
      user: { user_id: 204, name: 'User' },
    };
    const incoming = fromMax(body);
    expect(incoming?.kind).toBe('message');
    if (incoming?.kind === 'message') {
      expect(incoming.text).toBe('/start');
      expect(incoming.chatId).toBe(204);
      expect(incoming.channelId).toBe('204');
    }
  });

  it('returns null for message_callback without callback object', () => {
    const body = {
      update_type: 'message_callback' as const,
      timestamp: 1,
      message: { recipient: { chat_id: 204 }, sender: { user_id: 204 } },
    };
    const incoming = fromMax(body);
    expect(incoming).toBeNull();
  });

  it('maps message_callback when body.mid missing but update.message_id present', () => {
    const body = {
      update_type: 'message_callback' as const,
      timestamp: 1,
      message_id: 'root-mid-99',
      callback: { callback_id: 'cb-1', payload: 'notifications.show', user: { user_id: 202 } },
      message: { recipient: { chat_id: 202 }, body: {}, sender: { user_id: 12345 } },
    };
    const incoming = fromMax(body);
    expect(incoming?.kind).toBe('callback');
    if (incoming?.kind === 'callback') {
      expect(incoming.messageId).toBe('root-mid-99');
    }
  });

  it('returns null for message_callback without message mid and without update.message_id', () => {
    const body = {
      update_type: 'message_callback' as const,
      timestamp: 1,
      callback: { callback_id: 'cb-1', payload: 'notifications.show', user: { user_id: 202 } },
      message: { recipient: { chat_id: 202 }, body: {}, sender: { user_id: 12345 } },
    };
    const incoming = fromMax(body);
    expect(incoming).toBeNull();
  });
});
