import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { logger } from '../../infra/observability/logger.js';
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

  it('maps phoneauth cancel texts to phone.request.cancel', () => {
    for (const text of ['Отмена', 'Вернуться в меню'] as const) {
      const body = {
        update_type: 'message_created' as const,
        timestamp: 1,
        message: {
          recipient: { chat_id: 201 },
          body: { text },
          sender: { user_id: 201 },
        },
      };
      const incoming = fromMax(body);
      expect(incoming?.kind).toBe('message');
      if (incoming?.kind === 'message') expect(incoming.action).toBe('phone.request.cancel');
    }
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
        body: {
          mid: 'mid-photo',
          attachments: [{ type: 'image', payload: { url: 'https://x.test/a.jpg' } }],
        },
        sender: { user_id: 201 },
      },
    };
    const incoming = fromMax(body);
    expect(incoming?.kind).toBe('message');
    if (incoming?.kind === 'message') expect(incoming.relayMessageType).toBe('photo');
  });

  it('maps message_callback with reply link on message to replyToMessageId', () => {
    const body = {
      update_type: 'message_callback' as const,
      timestamp: 1,
      callback: {
        callback_id: 'cb-reply',
        payload: 'menu.more',
        user: { user_id: 303 },
      },
      message: {
        recipient: { chat_id: 303 },
        body: { mid: 'mid-cb-msg' },
        sender: { user_id: 303 },
        link: {
          type: 'reply' as const,
          message: { mid: 'mid-prompt-under-cb', seq: 0, text: '?', attachments: null },
        },
      },
    };
    const incoming = fromMax(body);
    expect(incoming?.kind).toBe('callback');
    if (incoming?.kind === 'callback') {
      expect(incoming.messageId).toBe('mid-cb-msg');
      expect(incoming.replyToMessageId).toBe('mid-prompt-under-cb');
    }
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
      message: {
        recipient: { chat_id: 202 },
        body: { mid: 'mid-callback-1' },
        sender: { user_id: 12345 },
      },
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

  it('maps bot_started payload bare link_* to start.link', () => {
    const body = {
      update_type: 'bot_started' as const,
      timestamp: 1,
      payload: 'link_deepMax1',
      chat_id: 301,
      user: { user_id: 301 },
    };
    const incoming = fromMax(body);
    expect(incoming?.kind).toBe('message');
    if (incoming?.kind === 'message') {
      expect(incoming.action).toBe('start.link');
      expect(incoming.linkSecret).toBe('link_deepMax1');
      expect(incoming.text).toBe('/start link_deepMax1');
    }
  });

  it('maps message_created /start noticeme to start.noticeme', () => {
    const body = {
      update_type: 'message_created' as const,
      timestamp: 1,
      message: {
        recipient: { chat_id: 201 },
        body: { text: '/start noticeme' },
        sender: { user_id: 201 },
      },
    };
    const incoming = fromMax(body);
    expect(incoming?.kind).toBe('message');
    if (incoming?.kind === 'message') expect(incoming.action).toBe('start.noticeme');
  });

  it('maps message_created bare noticeme via canonicalize to start.noticeme', () => {
    const body = {
      update_type: 'message_created' as const,
      timestamp: 1,
      message: {
        recipient: { chat_id: 201 },
        body: { text: 'noticeme' },
        sender: { user_id: 201 },
      },
    };
    const incoming = fromMax(body);
    expect(incoming?.kind).toBe('message');
    if (incoming?.kind === 'message') expect(incoming.action).toBe('start.noticeme');
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

  it('maps message_created with reply link to replyToMessageId', () => {
    const body = {
      update_type: 'message_created' as const,
      timestamp: 1,
      message: {
        recipient: { chat_id: 201 },
        body: { mid: 'mid-reply-src', text: 'skip reason text' },
        sender: { user_id: 201 },
        link: {
          type: 'reply' as const,
          message: { mid: 'mid-prompt', seq: 0, text: 'Почему?', attachments: null },
        },
      },
    };
    const incoming = fromMax(body);
    expect(incoming?.kind).toBe('message');
    if (incoming?.kind === 'message') {
      expect(incoming.messageId).toBe('mid-reply-src');
      expect(incoming.replyToMessageId).toBe('mid-prompt');
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
      callback: { callback_id: 'cb-1', payload: 'menu.more', user: { user_id: 202 } },
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
      callback: { callback_id: 'cb-1', payload: 'menu.more', user: { user_id: 202 } },
      message: { recipient: { chat_id: 202 }, body: {}, sender: { user_id: 12345 } },
    };
    const incoming = fromMax(body);
    expect(incoming).toBeNull();
  });

  // ── contact attachment: real MAX vcf_info payload ────────────────────────────

  const FAKE_TOKEN = 'test-bot-token-secret';
  function makeHash(vcf: string, token = FAKE_TOKEN): string {
    return createHmac('sha256', token).update(vcf).digest('hex');
  }

  const VCF_SIMPLE = 'BEGIN:VCARD\r\nVERSION:3.0\r\nTEL:+79001112233\r\nEND:VCARD';
  // eslint-disable-next-line no-secrets/no-secrets
  const VCF_TYPE =
    'BEGIN:VCARD\r\nVERSION:3.0\r\nTEL;TYPE=cell:+79004445566\r\nFN:Ivan\r\nEND:VCARD';
  // eslint-disable-next-line no-secrets/no-secrets
  const VCF_LF = 'BEGIN:VCARD\nVERSION:3.0\nTEL;TYPE=CELL,HOME:+79007778899\nEND:VCARD';

  it('maps real MAX contact (vcf_info, TEL:) with valid hash to phone', () => {
    const vcf = VCF_SIMPLE;
    const body = {
      update_type: 'message_created' as const,
      timestamp: 1,
      message: {
        recipient: { chat_id: 501 },
        body: {
          mid: 'mid-contact',
          text: '',
          attachments: [{ type: 'contact', payload: { vcf_info: vcf, hash: makeHash(vcf) } }],
        },
        sender: { user_id: 501 },
      },
    };
    const incoming = fromMax(body, FAKE_TOKEN);
    expect(incoming?.kind).toBe('message');
    if (incoming?.kind === 'message') {
      expect(incoming.phone).toBe('+79001112233');
      expect(incoming.relayMessageType).toBe('contact');
    }
  });

  it('maps real MAX contact (vcf_info, TEL;TYPE=cell:) with valid hash to phone', () => {
    const vcf = VCF_TYPE;
    const body = {
      update_type: 'message_created' as const,
      timestamp: 1,
      message: {
        recipient: { chat_id: 502 },
        body: {
          mid: 'mid-contact2',
          text: '',
          attachments: [{ type: 'contact', payload: { vcf_info: vcf, hash: makeHash(vcf) } }],
        },
        sender: { user_id: 502 },
      },
    };
    const incoming = fromMax(body, FAKE_TOKEN);
    expect(incoming?.kind).toBe('message');
    if (incoming?.kind === 'message') expect(incoming.phone).toBe('+79004445566');
  });

  it('maps real MAX contact (vcf_info with LF line endings, TEL;TYPE=...) with valid hash', () => {
    const vcf = VCF_LF;
    const body = {
      update_type: 'message_created' as const,
      timestamp: 1,
      message: {
        recipient: { chat_id: 503 },
        body: {
          mid: 'mid-contact3',
          text: '',
          attachments: [{ type: 'contact', payload: { vcf_info: vcf, hash: makeHash(vcf) } }],
        },
        sender: { user_id: 503 },
      },
    };
    const incoming = fromMax(body, FAKE_TOKEN);
    expect(incoming?.kind).toBe('message');
    if (incoming?.kind === 'message') expect(incoming.phone).toBe('+79007778899');
  });

  // vcf_info as delivered with literal two-char "\r\n" escape sequences instead of real newlines
  const VCF_LITERAL_ESCAPED = 'BEGIN:VCARD\\r\\nVERSION:3.0\\r\\nTEL:+79001112233\\r\\nEND:VCARD';

  it('rejects contact with hash mismatch (returns null phone) and emits WARN', () => {
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const vcf = VCF_SIMPLE;
    const body = {
      update_type: 'message_created' as const,
      timestamp: 1,
      message: {
        recipient: { chat_id: 504 },
        body: {
          mid: 'mid-contact-bad',
          text: '',
          attachments: [
            { type: 'contact', payload: { vcf_info: vcf, hash: 'deadbeef'.repeat(8) } },
          ],
        },
        sender: { user_id: 504 },
      },
    };
    const incoming = fromMax(body, FAKE_TOKEN);
    expect(incoming?.kind).toBe('message');
    if (incoming?.kind === 'message') expect(incoming.phone).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        receivedHashPrefix: 'deadbeef',
        expectedHashPrefixes: [makeHash(vcf).slice(0, 8)],
      }),
      expect.stringContaining('hash mismatch'),
    );
    warnSpy.mockRestore();
  });

  it('accepts literal-escaped vcf_info when hash was computed over the UNESCAPED form', () => {
    const unescaped = VCF_LITERAL_ESCAPED.replace(/\\r\\n/g, '\r\n');
    const body = {
      update_type: 'message_created' as const,
      timestamp: 1,
      message: {
        recipient: { chat_id: 507 },
        body: {
          mid: 'mid-contact-esc1',
          text: '',
          attachments: [
            {
              type: 'contact',
              payload: { vcf_info: VCF_LITERAL_ESCAPED, hash: makeHash(unescaped) },
            },
          ],
        },
        sender: { user_id: 507 },
      },
    };
    const incoming = fromMax(body, FAKE_TOKEN);
    expect(incoming?.kind).toBe('message');
    if (incoming?.kind === 'message') expect(incoming.phone).toBe('+79001112233');
  });

  it('accepts literal-escaped vcf_info when hash was computed over the RAW (escaped) form', () => {
    const body = {
      update_type: 'message_created' as const,
      timestamp: 1,
      message: {
        recipient: { chat_id: 508 },
        body: {
          mid: 'mid-contact-esc2',
          text: '',
          attachments: [
            {
              type: 'contact',
              payload: { vcf_info: VCF_LITERAL_ESCAPED, hash: makeHash(VCF_LITERAL_ESCAPED) },
            },
          ],
        },
        sender: { user_id: 508 },
      },
    };
    const incoming = fromMax(body, FAKE_TOKEN);
    expect(incoming?.kind).toBe('message');
    if (incoming?.kind === 'message') expect(incoming.phone).toBe('+79001112233');
  });

  it('rejects literal-escaped vcf_info with garbage hash (neither variant matches)', () => {
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const body = {
      update_type: 'message_created' as const,
      timestamp: 1,
      message: {
        recipient: { chat_id: 509 },
        body: {
          mid: 'mid-contact-esc3',
          text: '',
          attachments: [
            {
              type: 'contact',
              payload: { vcf_info: VCF_LITERAL_ESCAPED, hash: 'cafebabe'.repeat(8) },
            },
          ],
        },
        sender: { user_id: 509 },
      },
    };
    const incoming = fromMax(body, FAKE_TOKEN);
    expect(incoming?.kind).toBe('message');
    if (incoming?.kind === 'message') expect(incoming.phone).toBeUndefined();
    // WARN carries both computed prefixes (raw + unescaped variants)
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        receivedHashPrefix: 'cafebabe',
        expectedHashPrefixes: [
          makeHash(VCF_LITERAL_ESCAPED).slice(0, 8),
          makeHash(VCF_LITERAL_ESCAPED.replace(/\\r\\n/g, '\r\n')).slice(0, 8),
        ],
      }),
      expect.stringContaining('hash mismatch'),
    );
    warnSpy.mockRestore();
  });

  it('accepts contact carrying a valid hash when botToken is empty and warns token not configured', () => {
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const vcf = VCF_SIMPLE;
    const body = {
      update_type: 'message_created' as const,
      timestamp: 1,
      message: {
        recipient: { chat_id: 510 },
        body: {
          mid: 'mid-contact-notoken',
          text: '',
          attachments: [{ type: 'contact', payload: { vcf_info: vcf, hash: makeHash(vcf) } }],
        },
        sender: { user_id: 510 },
      },
    };
    const incoming = fromMax(body, '');
    expect(incoming?.kind).toBe('message');
    if (incoming?.kind === 'message') expect(incoming.phone).toBe('+79001112233');
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({ vcfPresent: true, hashPresent: true }),
      expect.stringContaining('token not configured'),
    );
    warnSpy.mockRestore();
  });

  it('accepts contact with absent hash (no botToken) and emits WARN', () => {
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const vcf = VCF_SIMPLE;
    const body = {
      update_type: 'message_created' as const,
      timestamp: 1,
      message: {
        recipient: { chat_id: 505 },
        body: {
          mid: 'mid-contact-nohash',
          text: '',
          attachments: [{ type: 'contact', payload: { vcf_info: vcf } }],
        },
        sender: { user_id: 505 },
      },
    };
    // neither hash nor botToken → genuinely 'hash absent' → accept + warn
    const incoming = fromMax(body, '');
    expect(incoming?.kind).toBe('message');
    if (incoming?.kind === 'message') expect(incoming.phone).toBe('+79001112233');
    expect(warnSpy).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('hash absent'));
    warnSpy.mockRestore();
  });

  it('accepts contact when hash field is absent (valid botToken but hash missing) and warns', () => {
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const vcf = VCF_TYPE;
    const body = {
      update_type: 'message_created' as const,
      timestamp: 1,
      message: {
        recipient: { chat_id: 506 },
        body: {
          mid: 'mid-contact-nohash2',
          text: '',
          attachments: [{ type: 'contact', payload: { vcf_info: vcf } }],
        },
        sender: { user_id: 506 },
      },
    };
    const incoming = fromMax(body, FAKE_TOKEN);
    expect(incoming?.kind).toBe('message');
    if (incoming?.kind === 'message') expect(incoming.phone).toBe('+79004445566');
    expect(warnSpy).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('hash absent'));
    warnSpy.mockRestore();
  });

  it('returns null for message_edited (no fromMax branch)', () => {
    const body = {
      update_type: 'message_edited' as const,
      timestamp: 1,
      message: {
        recipient: { chat_id: 601 },
        body: { mid: 'mid-ed', text: 'edited' },
        sender: { user_id: 601 },
      },
    };
    expect(fromMax(body)).toBeNull();
  });

  it('returns null for message_removed (ignored update type)', () => {
    const body = {
      update_type: 'message_removed' as const,
      timestamp: 1,
      message: {
        recipient: { chat_id: 602 },
        body: { mid: 'mid-rm' },
        sender: { user_id: 602 },
      },
    };
    expect(fromMax(body)).toBeNull();
  });

  it.each([
    { update_type: 'bot_added' as const },
    { update_type: 'bot_removed' as const },
    { update_type: 'user_removed' as const },
    { update_type: 'chat_title_changed' as const },
    { update_type: 'message_construction_request' as const },
    { update_type: 'message_constructed' as const },
    { update_type: 'message_chat_created' as const },
  ])('returns null for $update_type (no dedicated fromMax branch)', (row) => {
    expect(fromMax({ ...row, timestamp: 1 })).toBeNull();
  });

  it('maps bot_started setphone_* payload to start.setphone + phone (canonicalize path)', () => {
    const body = {
      update_type: 'bot_started' as const,
      timestamp: 1,
      payload: 'setphone_%2B79005556677',
      chat_id: 801,
      user: { user_id: 801 },
    };
    const incoming = fromMax(body);
    expect(incoming?.kind).toBe('message');
    if (incoming?.kind === 'message') {
      expect(incoming.action).toBe('start.setphone');
      expect(incoming.phone).toBe('+79005556677');
      expect(incoming.text).toMatch(/^\/start setphone_/);
    }
  });

  it('maps message_created bare link_* text via canonicalize to start.link', () => {
    const body = {
      update_type: 'message_created' as const,
      timestamp: 1,
      message: {
        recipient: { chat_id: 901 },
        body: { text: 'link_deepBare99' },
        sender: { user_id: 901 },
      },
    };
    const incoming = fromMax(body);
    expect(incoming?.kind).toBe('message');
    if (incoming?.kind === 'message') {
      expect(incoming.action).toBe('start.link');
      expect(incoming.linkSecret).toBe('link_deepBare99');
    }
  });
});
