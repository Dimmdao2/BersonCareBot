/**
 * Tests for the dev-mode delivery redirect.
 *
 * Safety assertions:
 * (a) When redirect active: provider send is called with TEST chat_id regardless
 *     of the original input chat_id (several different inputs → all become test id).
 * (b) When NODE_ENV='production' and DEV_DELIVERY_REDIRECT unset: recipient
 *     is UNCHANGED (passthrough).
 * (c) Body prefix only appears in dev, not in production.
 *
 * Telegram and MAX client tests live here (mocking the underlying provider).
 * Email and SMS suppression tests also covered.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Telegram mock ───────────────────────────────────────────────────────────
// Mock grammy's Bot so createMessagingPort() never makes real HTTP calls.
// We mock the constructor-level api object so the redirect code (which runs
// before calling api.*) can be tested end-to-end.

const tgSendMessageMock = vi.fn();
const tgCopyMessageMock = vi.fn();
const tgEditMessageTextMock = vi.fn();
const tgEditMessageReplyMarkupMock = vi.fn();
const tgDeleteMessageMock = vi.fn();
const tgAnswerCallbackQueryMock = vi.fn();

vi.mock('grammy', () => ({
  Bot: class {
    api = {
      sendMessage: (...args: unknown[]) => tgSendMessageMock(...args),
      copyMessage: (...args: unknown[]) => tgCopyMessageMock(...args),
      editMessageText: (...args: unknown[]) => tgEditMessageTextMock(...args),
      editMessageReplyMarkup: (...args: unknown[]) => tgEditMessageReplyMarkupMock(...args),
      deleteMessage: (...args: unknown[]) => tgDeleteMessageMock(...args),
      answerCallbackQuery: (...args: unknown[]) => tgAnswerCallbackQueryMock(...args),
    };
  },
}));

// ─── MAX mock ────────────────────────────────────────────────────────────────

const maxSendToUserMock = vi.fn();
const maxSendToChatMock = vi.fn();

vi.mock('@maxhub/max-bot-api', () => ({
  Bot: class {
    api = {
      sendMessageToUser: (...args: unknown[]) => maxSendToUserMock(...args),
      sendMessageToChat: (...args: unknown[]) => maxSendToChatMock(...args),
      getMyInfo: vi.fn(),
      setMyCommands: vi.fn(),
      editMessage: vi.fn(),
      deleteMessage: vi.fn(),
      answerOnCallback: vi.fn(),
    };
  },
}));

// ─── Nodemailer mock ─────────────────────────────────────────────────────────

const nodemailerSendMailMock = vi.fn();

vi.mock('nodemailer', () => ({
  default: {
    createTransport: () => ({
      sendMail: (...args: unknown[]) => nodemailerSendMailMock(...args),
    }),
  },
}));

// ─── Imports (after mocks) ───────────────────────────────────────────────────

import { createMessagingPort, getBotInstance } from '../integrations/telegram/client.js';
import { sendMaxMessage } from '../integrations/max/client.js';
import { sendMail } from '../integrations/email/mailer.js';
import { createSmscClient } from '../integrations/smsc/client.js';
import {
  _resetDevRedirectActiveCache,
  applyTelegramRedirect,
  applyMaxUserIdRedirect,
  buildDevPrefix,
  hasDevPrefix,
  isDevRedirectActive,
} from './devDeliveryRedirect.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const LOG_STUB = { warn: vi.fn(), error: vi.fn() };

const CONFIGURED_SMTP = {
  configured: true as const,
  smtpHost: 'smtp.example.com',
  smtpPort: 587,
  smtpSecure: false,
  smtpUser: 'user',
  smtpPass: 'pass',
  fromAddress: 'noreply@example.com',
};

const TEST_CHAT_ID = 364943522; // default admin id

// ─── Setup / teardown ────────────────────────────────────────────────────────

afterEach(() => {
  vi.clearAllMocks();
  // Restore env to test defaults
  process.env.NODE_ENV = 'test';
  delete process.env.DEV_DELIVERY_REDIRECT;
  delete process.env.DEV_DELIVERY_REDIRECT_CHAT_ID;
  process.env.TELEGRAM_ADMIN_ID = '364943522';
  _resetDevRedirectActiveCache();
});

// ─── Unit tests: devDeliveryRedirect module ───────────────────────────────────

describe('devDeliveryRedirect — isDevRedirectActive', () => {
  it('is active when NODE_ENV=test (vitest default)', () => {
    process.env.NODE_ENV = 'test';
    _resetDevRedirectActiveCache();
    expect(isDevRedirectActive()).toBe(true);
  });

  it('is active when NODE_ENV=development', () => {
    process.env.NODE_ENV = 'development';
    _resetDevRedirectActiveCache();
    expect(isDevRedirectActive()).toBe(true);
  });

  it('is active when NODE_ENV is absent', () => {
    delete process.env.NODE_ENV;
    _resetDevRedirectActiveCache();
    expect(isDevRedirectActive()).toBe(true);
  });

  it('is INACTIVE when NODE_ENV=production and DEV_DELIVERY_REDIRECT unset', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.DEV_DELIVERY_REDIRECT;
    _resetDevRedirectActiveCache();
    expect(isDevRedirectActive()).toBe(false);
  });

  it('is active when NODE_ENV=production BUT DEV_DELIVERY_REDIRECT=1', () => {
    process.env.NODE_ENV = 'production';
    process.env.DEV_DELIVERY_REDIRECT = '1';
    _resetDevRedirectActiveCache();
    expect(isDevRedirectActive()).toBe(true);
  });
});

describe('devDeliveryRedirect — buildDevPrefix / hasDevPrefix', () => {
  it('includes original chat id in prefix', () => {
    expect(buildDevPrefix(99999)).toContain('99999');
  });

  it('hasDevPrefix correctly identifies prefixed messages', () => {
    const prefixed = buildDevPrefix(12345) + 'Hello';
    expect(hasDevPrefix(prefixed)).toBe(true);
    expect(hasDevPrefix('Hello')).toBe(false);
  });
});

// ─── (a) applyTelegramRedirect — redirect active (multiple input ids → test id) ─

describe('applyTelegramRedirect — redirect active', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    delete process.env.DEV_DELIVERY_REDIRECT_CHAT_ID;
    process.env.TELEGRAM_ADMIN_ID = String(TEST_CHAT_ID);
    _resetDevRedirectActiveCache();
  });

  it.each([111111, 222222, 999999999, 555, 1])(
    'chat_id %i → TEST_CHAT_ID (%i)',
    (originalId) => {
      const result = applyTelegramRedirect({ chat_id: originalId, text: 'hello' }, 'tg', LOG_STUB);
      expect(result.chat_id).toBe(TEST_CHAT_ID);
    },
  );

  it('prepends dev prefix to text body', () => {
    const result = applyTelegramRedirect({ chat_id: 999, text: 'Important msg' }, 'tg', LOG_STUB);
    expect(result.text).toMatch(/^「DEV→ intended: 999」/);
    expect(result.text).toContain('Important msg');
  });

  it('does NOT double-prefix if already prefixed', () => {
    const alreadyPrefixed = buildDevPrefix(42) + 'body';
    const result = applyTelegramRedirect({ chat_id: 999, text: alreadyPrefixed }, 'tg', LOG_STUB);
    const prefixCount = (result.text ?? '').split('「DEV→').length - 1;
    expect(prefixCount).toBe(1);
  });

  it('emits warn log with intended/sent/channel', () => {
    applyTelegramRedirect({ chat_id: 777, text: 'x' }, 'tg', LOG_STUB);
    expect(LOG_STUB.warn).toHaveBeenCalledWith(
      expect.objectContaining({ intended: 777, sent: TEST_CHAT_ID, channel: 'tg' }),
      'DEV_DELIVERY_REDIRECT',
    );
  });

  it('uses DEV_DELIVERY_REDIRECT_CHAT_ID when set', () => {
    process.env.DEV_DELIVERY_REDIRECT_CHAT_ID = '55555';
    const result = applyTelegramRedirect({ chat_id: 999, text: 'x' }, 'tg', LOG_STUB);
    expect(result.chat_id).toBe(55555);
  });
});

// ─── (b) applyTelegramRedirect — production passthrough ──────────────────────

describe('applyTelegramRedirect — production passthrough', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'production';
    delete process.env.DEV_DELIVERY_REDIRECT;
    _resetDevRedirectActiveCache();
  });

  it.each([111111, 222222, 999999999])(
    'original chat_id %i is UNCHANGED in production',
    (originalId) => {
      const result = applyTelegramRedirect({ chat_id: originalId, text: 'prod msg' }, 'tg', LOG_STUB);
      expect(result.chat_id).toBe(originalId);
    },
  );

  it('(c) text body has NO dev prefix in production', () => {
    const result = applyTelegramRedirect({ chat_id: 123, text: 'prod msg' }, 'tg', LOG_STUB);
    expect(result.text).toBe('prod msg');
    expect(hasDevPrefix(result.text ?? '')).toBe(false);
  });

  it('does NOT emit warn log in production', () => {
    applyTelegramRedirect({ chat_id: 123, text: 'prod' }, 'tg', LOG_STUB);
    expect(LOG_STUB.warn).not.toHaveBeenCalled();
  });
});

// ─── applyMaxUserIdRedirect ───────────────────────────────────────────────────

describe('applyMaxUserIdRedirect — redirect active', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    _resetDevRedirectActiveCache();
  });

  it.each([
    { chatId: 111 },
    { userId: 222 },
    { chatId: 333, userId: 444 },
  ])('redirects %o → TEST_CHAT_ID (chatId only, no userId)', (input) => {
    const result = applyMaxUserIdRedirect({ ...input, text: 'x' }, LOG_STUB);
    expect(result.chatId).toBe(TEST_CHAT_ID);
    expect(result.userId).toBeUndefined();
  });

  it('prepends dev prefix to text', () => {
    const result = applyMaxUserIdRedirect({ chatId: 999, text: 'MAX msg' }, LOG_STUB);
    expect(result.text).toMatch(/^「DEV→ intended: 999」/);
  });
});

describe('applyMaxUserIdRedirect — production passthrough', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'production';
    delete process.env.DEV_DELIVERY_REDIRECT;
    _resetDevRedirectActiveCache();
  });

  it('chatId UNCHANGED in production', () => {
    const result = applyMaxUserIdRedirect({ chatId: 12345, text: 'prod' }, LOG_STUB);
    expect(result.chatId).toBe(12345);
    expect(result.userId).toBeUndefined();
  });

  it('userId UNCHANGED in production', () => {
    const result = applyMaxUserIdRedirect({ userId: 99999, text: 'prod' }, LOG_STUB);
    expect(result.userId).toBe(99999);
    expect(result.chatId).toBeUndefined();
  });

  it('(c) text body has NO dev prefix in production', () => {
    const result = applyMaxUserIdRedirect({ chatId: 123, text: 'prod' }, LOG_STUB);
    expect(result.text).toBe('prod');
  });
});

// ─── Telegram client integration (provider mock) ──────────────────────────────

describe('Telegram createMessagingPort — redirect active', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    delete process.env.DEV_DELIVERY_REDIRECT_CHAT_ID;
    process.env.TELEGRAM_ADMIN_ID = String(TEST_CHAT_ID);
    _resetDevRedirectActiveCache();
    tgSendMessageMock.mockResolvedValue({ message_id: 1 });
    tgCopyMessageMock.mockResolvedValue({});
    tgEditMessageTextMock.mockResolvedValue({});
    tgEditMessageReplyMarkupMock.mockResolvedValue({});
    tgDeleteMessageMock.mockResolvedValue(true);
  });

  it.each([111111, 222222, 999999999])(
    'sendMessage: chat_id %i → TEST_CHAT_ID',
    async (originalId) => {
      const port = createMessagingPort();
      await port.sendMessage({ chat_id: originalId, text: 'hello' });
      const [calledChatId] = tgSendMessageMock.mock.calls[0] as [number, string];
      expect(calledChatId).toBe(TEST_CHAT_ID);
    },
  );

  it('sendMessage: text gets dev prefix in dev', async () => {
    const port = createMessagingPort();
    await port.sendMessage({ chat_id: 12345, text: 'patient msg' });
    const [, calledText] = tgSendMessageMock.mock.calls[0] as [number, string];
    expect(calledText).toMatch(/^「DEV→ intended: 12345」/);
    expect(calledText).toContain('patient msg');
  });

  it('copyMessage: destination chat_id is redirected', async () => {
    const port = createMessagingPort();
    await port.copyMessage({ chat_id: 999, from_chat_id: 1, message_id: 42 });
    const [calledChatId] = tgCopyMessageMock.mock.calls[0] as [number];
    expect(calledChatId).toBe(TEST_CHAT_ID);
  });

  it('editMessageText: chat_id redirected', async () => {
    const port = createMessagingPort();
    await port.editMessageText({ chat_id: 999, message_id: 1, text: 'edited' });
    const [calledChatId] = tgEditMessageTextMock.mock.calls[0] as [number];
    expect(calledChatId).toBe(TEST_CHAT_ID);
  });

  it('editMessageReplyMarkup: chat_id redirected', async () => {
    const port = createMessagingPort();
    await port.editMessageReplyMarkup({ chat_id: 999, message_id: 1, reply_markup: {} as never });
    const [calledChatId] = tgEditMessageReplyMarkupMock.mock.calls[0] as [number];
    expect(calledChatId).toBe(TEST_CHAT_ID);
  });

  it('deleteMessage: chat_id redirected', async () => {
    const port = createMessagingPort();
    await port.deleteMessage({ chat_id: 999, message_id: 1 });
    const [calledChatId] = tgDeleteMessageMock.mock.calls[0] as [number];
    expect(calledChatId).toBe(TEST_CHAT_ID);
  });
});

describe('Telegram createMessagingPort — production passthrough', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'production';
    delete process.env.DEV_DELIVERY_REDIRECT;
    _resetDevRedirectActiveCache();
    tgSendMessageMock.mockResolvedValue({ message_id: 1 });
  });

  it.each([111111, 222222, 999999999])(
    'sendMessage: chat_id %i is UNCHANGED in production',
    async (originalId) => {
      const port = createMessagingPort();
      await port.sendMessage({ chat_id: originalId, text: 'prod msg' });
      const [calledChatId] = tgSendMessageMock.mock.calls[0] as [number, string];
      expect(calledChatId).toBe(originalId);
    },
  );

  it('(c) text body has NO dev prefix in production', async () => {
    const port = createMessagingPort();
    await port.sendMessage({ chat_id: 123, text: 'prod msg' });
    const [, calledText] = tgSendMessageMock.mock.calls[0] as [number, string];
    expect(calledText).toBe('prod msg');
  });
});

// ─── MAX sendMaxMessage integration ──────────────────────────────────────────

describe('sendMaxMessage — redirect active', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    delete process.env.DEV_DELIVERY_REDIRECT_CHAT_ID;
    process.env.TELEGRAM_ADMIN_ID = String(TEST_CHAT_ID);
    _resetDevRedirectActiveCache();
    maxSendToChatMock.mockResolvedValue({ body: { mid: 'mid-1' }, recipient: {}, timestamp: 1 });
    maxSendToUserMock.mockResolvedValue({ body: { mid: 'mid-2' }, recipient: {}, timestamp: 1 });
  });

  it.each([111, 222, 999999])(
    'chatId %i → sendMessageToChat with TEST_CHAT_ID',
    async (originalChatId) => {
      await sendMaxMessage({ apiKey: 'key' }, { chatId: originalChatId, text: 'x' });
      expect(maxSendToChatMock).toHaveBeenCalledWith(TEST_CHAT_ID, expect.any(String), undefined);
    },
  );

  it('userId is cleared and uses sendMessageToChat in dev', async () => {
    await sendMaxMessage({ apiKey: 'key' }, { userId: 12345, text: 'x' });
    // userId redirect → cleared, falls back to chatId (test id)
    expect(maxSendToUserMock).not.toHaveBeenCalled();
    expect(maxSendToChatMock).toHaveBeenCalledWith(TEST_CHAT_ID, expect.any(String), undefined);
  });

  it('text gets dev prefix in dev', async () => {
    await sendMaxMessage({ apiKey: 'key' }, { chatId: 99999, text: 'patient text' });
    const [, calledText] = maxSendToChatMock.mock.calls[0] as [number, string];
    expect(calledText).toMatch(/^「DEV→ intended: 99999」/);
    expect(calledText).toContain('patient text');
  });
});

describe('sendMaxMessage — production passthrough', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'production';
    delete process.env.DEV_DELIVERY_REDIRECT;
    _resetDevRedirectActiveCache();
    maxSendToChatMock.mockResolvedValue({ body: { mid: 'mid-1' }, recipient: {}, timestamp: 1 });
    maxSendToUserMock.mockResolvedValue({ body: { mid: 'mid-2' }, recipient: {}, timestamp: 1 });
  });

  it.each([111, 222, 999999])(
    'chatId %i is UNCHANGED in production',
    async (originalChatId) => {
      await sendMaxMessage({ apiKey: 'key' }, { chatId: originalChatId, text: 'prod' });
      expect(maxSendToChatMock).toHaveBeenCalledWith(originalChatId, 'prod', undefined);
    },
  );

  it('userId routing UNCHANGED in production', async () => {
    await sendMaxMessage({ apiKey: 'key' }, { userId: 55555, text: 'prod' });
    expect(maxSendToUserMock).toHaveBeenCalledWith(55555, 'prod', undefined);
    expect(maxSendToChatMock).not.toHaveBeenCalled();
  });

  it('(c) text body has NO dev prefix in production', async () => {
    await sendMaxMessage({ apiKey: 'key' }, { chatId: 123, text: 'prod msg' });
    const [, calledText] = maxSendToChatMock.mock.calls[0] as [number, string];
    expect(calledText).toBe('prod msg');
  });
});

// ─── Email mailer — dev suppression ──────────────────────────────────────────

describe('sendMail — dev suppression', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    _resetDevRedirectActiveCache();
    nodemailerSendMailMock.mockResolvedValue({ accepted: ['real@example.com'], rejected: [], messageId: 'x' });
  });

  it('suppresses email in dev and returns empty accepted', async () => {
    const result = await sendMail(CONFIGURED_SMTP, { to: 'patient@example.com', subject: 'OTP', text: '123456' });
    expect(result).toEqual({ accepted: [], rejected: [] });
    expect(nodemailerSendMailMock).not.toHaveBeenCalled();
  });

  it('suppresses email regardless of recipient address', async () => {
    const result = await sendMail(CONFIGURED_SMTP, { to: ['a@b.com', 'c@d.com'], subject: 'Test', text: 'x' });
    expect(result.accepted).toHaveLength(0);
    expect(nodemailerSendMailMock).not.toHaveBeenCalled();
  });
});

describe('sendMail — production passthrough', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'production';
    delete process.env.DEV_DELIVERY_REDIRECT;
    _resetDevRedirectActiveCache();
    nodemailerSendMailMock.mockResolvedValue({
      accepted: ['real@example.com'],
      rejected: [],
      messageId: 'msg-1',
    });
  });

  it('calls transport in production', async () => {
    const result = await sendMail(CONFIGURED_SMTP, { to: 'real@example.com', subject: 'Hi', text: 'body' });
    expect(nodemailerSendMailMock).toHaveBeenCalledTimes(1);
    expect(result.accepted).toContain('real@example.com');
  });
});

// ─── SMSC client — dev suppression ───────────────────────────────────────────

describe('createSmscClient.sendSms — dev suppression', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    _resetDevRedirectActiveCache();
  });

  it('suppresses SMS in dev and returns ok:true (no HTTP call)', async () => {
    const fetchImpl = vi.fn();
    const client = createSmscClient({
      apiKey: 'key',
      log: LOG_STUB,
      fetchImpl: fetchImpl as unknown as typeof globalThis.fetch,
    });
    const result = await client.sendSms({ toPhone: '+79990001122', message: 'OTP 1234' });
    expect(result).toEqual({ ok: true });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('suppresses SMS for various phone numbers', async () => {
    const fetchImpl = vi.fn();
    const client = createSmscClient({ apiKey: 'key', log: LOG_STUB, fetchImpl: fetchImpl as unknown as typeof globalThis.fetch });
    for (const phone of ['+79991112233', '+79994445566', '+70000000000']) {
      const res = await client.sendSms({ toPhone: phone, message: 'code' });
      expect(res).toEqual({ ok: true });
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('createSmscClient.sendSms — production passthrough', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'production';
    delete process.env.DEV_DELIVERY_REDIRECT;
    _resetDevRedirectActiveCache();
  });

  it('calls HTTP in production (real send path)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => JSON.stringify({ id: 1, cnt: 1 }),
    });
    const client = createSmscClient({
      apiKey: 'prod-key',
      log: LOG_STUB,
      fetchImpl: fetchImpl as unknown as typeof globalThis.fetch,
    });
    const result = await client.sendSms({ toPhone: '+79990001122', message: 'OTP' });
    expect(result).toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
