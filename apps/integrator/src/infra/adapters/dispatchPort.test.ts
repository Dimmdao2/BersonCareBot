import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { DeliveryAdapter, OutgoingIntent } from '../../kernel/contracts/index.js';
import { createDefaultDispatchPort } from './dispatchPort.js';
import { _resetDevRedirectActiveCache } from '../../shared/devDeliveryRedirect.js';
import { readChannel } from './channelRouting.js';

const sendPrimaryMock = vi.fn().mockResolvedValue(undefined);
const sendSecondaryMock = vi.fn().mockResolvedValue(undefined);
const channelPrimary = 'channel-a';
const channelSecondary = 'channel-b';

function buildAdapters(): DeliveryAdapter[] {
  return [
    {
      canHandle: (intent) => intent.type === 'message.send' && readChannel(intent) === channelPrimary,
      send: sendPrimaryMock,
    },
    {
      canHandle: (intent) => intent.type === 'message.send' && readChannel(intent) === channelSecondary,
      send: sendSecondaryMock,
    },
  ];
}

/** Helper: set prod env so pre-fork redirect is inactive for passthrough tests. */
function setProdEnv() {
  process.env.NODE_ENV = 'production';
  delete process.env.DEV_DELIVERY_REDIRECT;
  _resetDevRedirectActiveCache();
}

function restoreTestEnv() {
  process.env.NODE_ENV = 'test';
  delete process.env.DEV_DELIVERY_REDIRECT;
  _resetDevRedirectActiveCache();
}

describe('createDefaultDispatchPort', () => {
  beforeEach(() => {
    sendPrimaryMock.mockReset();
    sendSecondaryMock.mockReset();
    // Existing tests need production mode (redirect inactive) so adapters for
    // 'channel-a'/'channel-b' are reachable without being collapsed to telegram.
    setProdEnv();
  });

  afterEach(() => {
    restoreTestEnv();
  });

  it('dispatches primary adapter when first channel matches', async () => {
    const writeDb = vi.fn().mockResolvedValue(undefined);
    const dispatchPort = createDefaultDispatchPort({ adapters: buildAdapters(), writePort: { writeDb } });
    const intent: OutgoingIntent = {
      type: 'message.send',
      meta: { eventId: 'evt-1', occurredAt: '2026-03-03T00:00:00.000Z', source: 'adapter' },
      payload: {
        recipient: { chatId: 1 },
        message: { text: 'hi' },
        delivery: { channels: [channelPrimary], maxAttempts: 1 },
      },
    };

    await dispatchPort.dispatchOutgoing(intent);
    expect(sendPrimaryMock).toHaveBeenCalledTimes(1);
    expect(sendSecondaryMock).not.toHaveBeenCalled();
    expect(writeDb).toHaveBeenCalledTimes(1);
  });

  it('does not fallback after primary failure', async () => {
    sendPrimaryMock.mockRejectedValueOnce(new Error('adapter down'));
    const writeDb = vi.fn().mockResolvedValue(undefined);
    const dispatchPort = createDefaultDispatchPort({ adapters: buildAdapters(), writePort: { writeDb } });
    const intent: OutgoingIntent = {
      type: 'message.send',
      meta: { eventId: 'evt-2', occurredAt: '2026-03-03T00:00:00.000Z', source: 'adapter' },
      payload: {
        recipient: { chatId: 1, phoneNormalized: '+79990001122' },
        message: { text: 'hi' },
        delivery: { channels: [channelPrimary, channelSecondary], maxAttempts: 1 },
      },
    };

    await expect(dispatchPort.dispatchOutgoing(intent)).rejects.toThrow('adapter down');
    expect(sendPrimaryMock).toHaveBeenCalledTimes(1);
    expect(sendSecondaryMock).toHaveBeenCalledTimes(0);
    expect(writeDb).toHaveBeenCalledTimes(0);
  });

  it('sends secondary when first channel is secondary', async () => {
    const dispatchPort = createDefaultDispatchPort({
      adapters: buildAdapters(),
    });
    const intent: OutgoingIntent = {
      type: 'message.send',
      meta: { eventId: 'evt-3', occurredAt: '2026-03-03T00:00:00.000Z', source: 'adapter' },
      payload: {
        recipient: { phoneNormalized: '+79990001122' },
        message: { text: 'hi' },
        delivery: { channels: [channelSecondary], maxAttempts: 1 },
      },
    };

    await dispatchPort.dispatchOutgoing(intent);
    expect(sendPrimaryMock).toHaveBeenCalledTimes(0);
    expect(sendSecondaryMock).toHaveBeenCalledTimes(1);
  });

  it('does not auto-resolve phone recipient through readPort', async () => {
    const readDb = vi.fn().mockResolvedValue({ chatId: 77 });
    const dispatchPort = createDefaultDispatchPort({
      adapters: buildAdapters(),
      readPort: { readDb },
    });
    const intent: OutgoingIntent = {
      type: 'message.send',
      meta: { eventId: 'evt-3b', occurredAt: '2026-03-03T00:00:00.000Z', source: 'adapter' },
      payload: {
        recipient: { phoneNormalized: '+79990001122' },
        message: { text: 'hi' },
        delivery: { channels: [channelPrimary], maxAttempts: 1 },
      },
    };

    await dispatchPort.dispatchOutgoing(intent);
    expect(sendPrimaryMock).toHaveBeenCalledTimes(1);
    expect(readDb).not.toHaveBeenCalled();
  });

  it('dispatches non-message intent by intent source', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const dispatchPort = createDefaultDispatchPort({
      adapters: [{
        canHandle: (intent) => intent.type === 'callback.answer' && intent.meta.source === 'telegram',
        send,
      }],
    });

    await dispatchPort.dispatchOutgoing({
      type: 'callback.answer',
      meta: { eventId: 'evt-4', occurredAt: '2026-03-03T00:00:00.000Z', source: 'telegram' },
      payload: { callbackQueryId: 'cb-1' },
    });

    expect(send).toHaveBeenCalledTimes(1);
  });

  it('redacts OTP payload in delivery logs', async () => {
    const writeDb = vi.fn().mockResolvedValue(undefined);
    const dispatchPort = createDefaultDispatchPort({ adapters: buildAdapters(), writePort: { writeDb } });
    const intent: OutgoingIntent = {
      type: 'message.send',
      meta: { eventId: 'otp:telegram:test', occurredAt: '2026-03-03T00:00:00.000Z', source: 'telegram', correlationId: 'otp:123:654321' },
      payload: {
        recipient: { chatId: '123' },
        message: { text: 'Код для входа в BersonCare: 654321' },
        delivery: { channels: [channelPrimary], maxAttempts: 1 },
      },
    };

    await dispatchPort.dispatchOutgoing(intent);

    expect(writeDb).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'delivery.attempt.log',
        params: expect.objectContaining({
          correlationId: null,
          payload: expect.objectContaining({ kind: 'otp_redacted' }),
        }),
      }),
    );
  });
});

// ─── PRE-FORK DEV DELIVERY REDIRECT tests (Q-A: PER-CHANNEL → Дмитрий) ─────────
//
// These tests verify the PRIMARY override layer in applyPreForkDevRedirect after
// the Q-A rework: with redirect active, every intent is redirected to the dev TEST
// USER's binding FOR ITS OWN CHANNEL (channel PRESERVED), NOT collapsed to one
// telegram chat. A channel with no binding → SUPPRESS (adapter never reached).
// Production mode: unchanged passthrough.

// Дмитрий per-channel targets — set explicitly via env in beforeEach so the tests
// are deterministic regardless of the built-in defaults.
const TG_TARGET = 7924656602; // his telegram chat id
const MAX_TARGET = 207278131; // his MAX user id
const PHONE_TARGET = '+79189000782';
const EMAIL_TARGET = 'dimmdao@yandex.ru';
const PUSH_TARGET = '1c312a64-fab8-4b75-b24e-88a1d6ebe4e0';

/** Build a telegram adapter that captures what it received. */
function buildTelegramCaptureAdapter(): { adapter: DeliveryAdapter; captured: OutgoingIntent[] } {
  const captured: OutgoingIntent[] = [];
  const adapter: DeliveryAdapter = {
    canHandle: (intent) => intent.meta.source === 'telegram',
    send: async (intent) => { captured.push(intent); return {}; },
  };
  return { adapter, captured };
}

/** Build a capture adapter for a specific channel (by delivery.channels[0]). */
function buildChannelCaptureAdapter(channel: string): {
  adapter: DeliveryAdapter;
  captured: OutgoingIntent[];
} {
  const captured: OutgoingIntent[] = [];
  const adapter: DeliveryAdapter = {
    canHandle: (intent) =>
      intent.type === 'message.send' &&
      Array.isArray((intent.payload as { delivery?: { channels?: unknown } }).delivery?.channels) &&
      ((intent.payload as { delivery?: { channels?: string[] } }).delivery?.channels ?? []).includes(channel),
    send: async (intent) => { captured.push(intent); return {}; },
  };
  return { adapter, captured };
}

/** A throwing adapter: if it is ever reached, the test must fail loudly. */
function buildForbiddenAdapter(channel: string): { adapter: DeliveryAdapter; send: ReturnType<typeof vi.fn> } {
  const send = vi.fn(async () => {
    throw new Error(`${channel} adapter must NOT be reached when redirect is active`);
  });
  const adapter: DeliveryAdapter = {
    canHandle: (intent) =>
      intent.type === 'message.send' &&
      Array.isArray((intent.payload as { delivery?: { channels?: unknown } }).delivery?.channels) &&
      ((intent.payload as { delivery?: { channels?: string[] } }).delivery?.channels ?? []).includes(channel),
    send,
  };
  return { adapter, send };
}

function setRedirectTargets() {
  process.env.DEV_REDIRECT_TELEGRAM_CHAT_ID = String(TG_TARGET);
  process.env.DEV_REDIRECT_MAX_USER_ID = String(MAX_TARGET);
  process.env.DEV_REDIRECT_PHONE = PHONE_TARGET;
  process.env.DEV_REDIRECT_EMAIL = EMAIL_TARGET;
  process.env.DEV_REDIRECT_WEB_PUSH_USER_ID = PUSH_TARGET;
}

function clearRedirectTargets() {
  delete process.env.DEV_REDIRECT_TELEGRAM_CHAT_ID;
  delete process.env.DEV_REDIRECT_MAX_USER_ID;
  delete process.env.DEV_REDIRECT_PHONE;
  delete process.env.DEV_REDIRECT_EMAIL;
  delete process.env.DEV_REDIRECT_WEB_PUSH_USER_ID;
  delete process.env.DEV_REDIRECT_DISABLE_DEFAULTS;
  delete process.env.DEV_DELIVERY_REDIRECT_CHAT_ID;
  delete process.env.TELEGRAM_ADMIN_ID;
}

describe('createDefaultDispatchPort — PRE-FORK DEV REDIRECT active: PER-CHANNEL → Дмитрий', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    delete process.env.DEV_DELIVERY_REDIRECT;
    clearRedirectTargets();
    setRedirectTargets();
    _resetDevRedirectActiveCache();
  });

  afterEach(() => {
    clearRedirectTargets();
    restoreTestEnv();
  });

  // ── (a) per-channel redirect → Дмитрий, channel PRESERVED ──────────────────

  it('telegram → his telegram chat, channel preserved (telegram adapter)', async () => {
    const { adapter, captured } = buildTelegramCaptureAdapter();
    const port = createDefaultDispatchPort({ adapters: [adapter] });

    await port.dispatchOutgoing({
      type: 'message.send',
      meta: { eventId: 'e-tg', occurredAt: '2026-01-01T00:00:00.000Z', source: 'telegram' },
      payload: {
        recipient: { chatId: 999111 },
        message: { text: 'hello' },
        delivery: { channels: ['telegram'], maxAttempts: 1 },
      },
    });

    expect(captured).toHaveLength(1);
    const p = captured[0]!.payload as { recipient: { chatId: number }; delivery: { channels: string[] } };
    expect(p.recipient.chatId).toBe(TG_TARGET);
    expect(p.delivery.channels).toEqual(['telegram']);
  });

  it('max → his MAX id, channel preserved → reaches MAX adapter (NOT telegram)', async () => {
    const { adapter: tgAdapter, captured: tgCaptured } = buildTelegramCaptureAdapter();
    const { adapter: maxAdapter, captured: maxCaptured } = buildChannelCaptureAdapter('max');

    const port = createDefaultDispatchPort({ adapters: [tgAdapter, maxAdapter] });

    await port.dispatchOutgoing({
      type: 'message.send',
      meta: { eventId: 'e-max', occurredAt: '2026-01-01T00:00:00.000Z', source: 'max' },
      payload: {
        recipient: { userId: 8877665544, chatId: 8877665544 },
        message: { text: 'max msg' },
        delivery: { channels: ['max'], maxAttempts: 1 },
      },
    });

    expect(tgCaptured).toHaveLength(0);
    expect(maxCaptured).toHaveLength(1);
    const recipient = (maxCaptured[0]!.payload as { recipient: Record<string, unknown> }).recipient;
    expect(recipient.userId).toBe(MAX_TARGET);
    expect(recipient.chatId).toBe(MAX_TARGET);
  });

  it('sms (smsc) → his phone, channel preserved → reaches smsc adapter, real phone dropped', async () => {
    const { adapter: tgAdapter, captured: tgCaptured } = buildTelegramCaptureAdapter();
    const { adapter: smsAdapter, captured: smsCaptured } = buildChannelCaptureAdapter('smsc');

    const port = createDefaultDispatchPort({ adapters: [tgAdapter, smsAdapter] });

    await port.dispatchOutgoing({
      type: 'message.send',
      meta: { eventId: 'e-sms', occurredAt: '2026-01-01T00:00:00.000Z', source: 'smsc' },
      payload: {
        recipient: { phoneNormalized: '+79991234567' },
        message: { text: 'sms code 123' },
        delivery: { channels: ['smsc'], maxAttempts: 1 },
      },
    });

    expect(tgCaptured).toHaveLength(0);
    expect(smsCaptured).toHaveLength(1);
    const recipient = (smsCaptured[0]!.payload as { recipient: Record<string, unknown> }).recipient;
    expect(recipient.phoneNormalized).toBe(PHONE_TARGET);
    expect(recipient.phoneNormalized).not.toBe('+79991234567');
  });

  it('email → his email, channel preserved → reaches email adapter, real email dropped', async () => {
    const { adapter: tgAdapter, captured: tgCaptured } = buildTelegramCaptureAdapter();
    const { adapter: emailAdapter, captured: emailCaptured } = buildChannelCaptureAdapter('email');

    const port = createDefaultDispatchPort({ adapters: [tgAdapter, emailAdapter] });

    await port.dispatchOutgoing({
      type: 'message.send',
      meta: { eventId: 'e-email', occurredAt: '2026-01-01T00:00:00.000Z', source: 'email' },
      payload: {
        recipient: { email: 'real.patient@example.com' },
        subject: 'Appt',
        message: { text: 'your appt is tomorrow' },
        delivery: { channels: ['email'], maxAttempts: 1 },
      },
    });

    expect(tgCaptured).toHaveLength(0);
    expect(emailCaptured).toHaveLength(1);
    const recipient = (emailCaptured[0]!.payload as { recipient: Record<string, unknown> }).recipient;
    expect(recipient.email).toBe(EMAIL_TARGET);
    expect(recipient).not.toHaveProperty('chatId');
  });

  it('web_push → his pushUserId, channel preserved → reaches web_push adapter, real pushUserId dropped', async () => {
    const { adapter: tgAdapter, captured: tgCaptured } = buildTelegramCaptureAdapter();
    const { adapter: pushAdapter, captured: pushCaptured } = buildChannelCaptureAdapter('web_push');

    const port = createDefaultDispatchPort({ adapters: [tgAdapter, pushAdapter] });

    await port.dispatchOutgoing({
      type: 'message.send',
      meta: { eventId: 'e-push', occurredAt: '2026-01-01T00:00:00.000Z', source: 'web_push' },
      payload: {
        recipient: { pushUserId: 'real-webapp-user-99' },
        message: { text: 'new message from your doctor' },
        delivery: { channels: ['web_push'], maxAttempts: 1 },
        pushExtras: { tag: 'chat', topicCode: 'patient_chat' },
      },
    });

    expect(tgCaptured).toHaveLength(0);
    expect(pushCaptured).toHaveLength(1);
    const recipient = (pushCaptured[0]!.payload as { recipient: Record<string, unknown> }).recipient;
    expect(recipient.pushUserId).toBe(PUSH_TARGET);
    expect(recipient.pushUserId).not.toBe('real-webapp-user-99');
  });

  // ── (b) suppress-if-missing-binding: adapter NEVER reached, no throw ────────

  it('SUPPRESS when no binding for the channel: email/sms/push/max adapters never reached', async () => {
    // Disable defaults; configure ONLY telegram. Every other channel must suppress.
    process.env.DEV_REDIRECT_DISABLE_DEFAULTS = '1';
    clearRedirectTargets();
    process.env.DEV_REDIRECT_DISABLE_DEFAULTS = '1';
    process.env.DEV_REDIRECT_TELEGRAM_CHAT_ID = String(TG_TARGET);
    _resetDevRedirectActiveCache();

    const writeDb = vi.fn().mockResolvedValue(undefined);
    const { adapter: tgAdapter, captured: tgCaptured } = buildTelegramCaptureAdapter();
    const email = buildForbiddenAdapter('email');
    const sms = buildForbiddenAdapter('smsc');
    const push = buildForbiddenAdapter('web_push');
    const max = buildForbiddenAdapter('max');

    const port = createDefaultDispatchPort({
      adapters: [tgAdapter, email.adapter, sms.adapter, push.adapter, max.adapter],
      writePort: { writeDb },
    });

    const suppressedChannels: Array<{ channel: string; source: string; recipient: Record<string, unknown> }> = [
      { channel: 'email', source: 'email', recipient: { email: 'real@example.com' } },
      { channel: 'smsc', source: 'smsc', recipient: { phoneNormalized: '+79991234567' } },
      { channel: 'web_push', source: 'web_push', recipient: { pushUserId: 'real-user' } },
      { channel: 'max', source: 'max', recipient: { userId: 555, chatId: 555 } },
    ];

    for (const c of suppressedChannels) {
      // Must NOT throw — suppress is a no-op success.
      await expect(
        port.dispatchOutgoing({
          type: 'message.send',
          meta: { eventId: `e-suppress-${c.channel}`, occurredAt: '2026-01-01T00:00:00.000Z', source: c.source },
          payload: {
            recipient: c.recipient,
            message: { text: 'should be suppressed' },
            delivery: { channels: [c.channel], maxAttempts: 1 },
          },
        }),
      ).resolves.toEqual({});
    }

    // No real-channel adapter was reached.
    expect(email.send).not.toHaveBeenCalled();
    expect(sms.send).not.toHaveBeenCalled();
    expect(push.send).not.toHaveBeenCalled();
    expect(max.send).not.toHaveBeenCalled();
    expect(tgCaptured).toHaveLength(0);

    // Suppressed sends are logged with the suppress reason.
    const suppressLogs = writeDb.mock.calls.filter(
      (args) =>
        (args[0] as { params?: { reason?: string } })?.params?.reason === 'dev_redirect_suppressed',
    );
    expect(suppressLogs.length).toBe(suppressedChannels.length);

    // The one configured channel (telegram) still delivers.
    await port.dispatchOutgoing({
      type: 'message.send',
      meta: { eventId: 'e-tg-ok', occurredAt: '2026-01-01T00:00:00.000Z', source: 'telegram' },
      payload: {
        recipient: { chatId: 12345 },
        message: { text: 'ok' },
        delivery: { channels: ['telegram'], maxAttempts: 1 },
      },
    });
    expect(tgCaptured).toHaveLength(1);
    expect((tgCaptured[0]!.payload as { recipient: { chatId: number } }).recipient.chatId).toBe(TG_TARGET);
  });

  // ── prefix + config + forced-active ─────────────────────────────────────────

  it('text body gets dev prefix with the original intended recipient', async () => {
    const { adapter, captured } = buildTelegramCaptureAdapter();
    const port = createDefaultDispatchPort({ adapters: [adapter] });

    await port.dispatchOutgoing({
      type: 'message.send',
      meta: { eventId: 'e-prefix', occurredAt: '2026-01-01T00:00:00.000Z', source: 'telegram' },
      payload: {
        recipient: { chatId: 777444 },
        message: { text: 'patient text' },
        delivery: { channels: ['telegram'], maxAttempts: 1 },
      },
    });

    const receivedMessage = (captured[0]!.payload as { message: { text: string } }).message;
    expect(receivedMessage.text).toMatch(/^「DEV→ intended: 777444」/);
    expect(receivedMessage.text).toContain('patient text');
  });

  it('email dev prefix carries the original intended email address', async () => {
    const { adapter: emailAdapter, captured } = buildChannelCaptureAdapter('email');
    const port = createDefaultDispatchPort({ adapters: [emailAdapter] });

    await port.dispatchOutgoing({
      type: 'message.send',
      meta: { eventId: 'e-email-prefix', occurredAt: '2026-01-01T00:00:00.000Z', source: 'email' },
      payload: {
        recipient: { email: 'real.patient@example.com' },
        message: { text: 'body' },
        delivery: { channels: ['email'], maxAttempts: 1 },
      },
    });

    const text = (captured[0]!.payload as { message: { text: string } }).message.text;
    expect(text).toMatch(/^「DEV→ intended: real\.patient@example\.com」/);
  });

  it('uses DEV_REDIRECT_TELEGRAM_CHAT_ID when explicitly configured', async () => {
    process.env.DEV_REDIRECT_TELEGRAM_CHAT_ID = '55555';
    _resetDevRedirectActiveCache();

    const { adapter, captured } = buildTelegramCaptureAdapter();
    const port = createDefaultDispatchPort({ adapters: [adapter] });

    await port.dispatchOutgoing({
      type: 'message.send',
      meta: { eventId: 'e-explicit', occurredAt: '2026-01-01T00:00:00.000Z', source: 'telegram' },
      payload: {
        recipient: { chatId: 999888 },
        message: { text: 'x' },
        delivery: { channels: ['telegram'], maxAttempts: 1 },
      },
    });

    const receivedRecipient = (captured[0]!.payload as { recipient: { chatId: number } }).recipient;
    expect(receivedRecipient.chatId).toBe(55555);
  });

  it('forced active via DEV_DELIVERY_REDIRECT=1 even when NODE_ENV=production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.DEV_DELIVERY_REDIRECT = '1';
    _resetDevRedirectActiveCache();

    const { adapter, captured } = buildTelegramCaptureAdapter();
    const port = createDefaultDispatchPort({ adapters: [adapter] });

    await port.dispatchOutgoing({
      type: 'message.send',
      meta: { eventId: 'e-forced', occurredAt: '2026-01-01T00:00:00.000Z', source: 'telegram' },
      payload: {
        recipient: { chatId: 900800 },
        message: { text: 'forced' },
        delivery: { channels: ['telegram'], maxAttempts: 1 },
      },
    });

    const receivedRecipient = (captured[0]!.payload as { recipient: { chatId: number } }).recipient;
    expect(receivedRecipient.chatId).toBe(TG_TARGET);
  });
});

describe('createDefaultDispatchPort — PRE-FORK DEV REDIRECT inactive (production)', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'production';
    delete process.env.DEV_DELIVERY_REDIRECT;
    delete process.env.DEV_DELIVERY_REDIRECT_CHAT_ID;
    _resetDevRedirectActiveCache();
  });

  afterEach(() => {
    restoreTestEnv();
  });

  it.each([111111, 222222, 999999999])(
    'production: chatId %i passes through unchanged',
    async (originalId) => {
      const { adapter, captured } = buildTelegramCaptureAdapter();
      const port = createDefaultDispatchPort({ adapters: [adapter] });

      await port.dispatchOutgoing({
        type: 'message.send',
        meta: { eventId: `e-prod-${originalId}`, occurredAt: '2026-01-01T00:00:00.000Z', source: 'telegram' },
        payload: {
          recipient: { chatId: originalId },
          message: { text: 'prod msg' },
          delivery: { channels: ['telegram'], maxAttempts: 1 },
        },
      });

      const receivedRecipient = (captured[0]!.payload as { recipient: { chatId: number } }).recipient;
      expect(receivedRecipient.chatId).toBe(originalId);
    },
  );

  it('production: text body has no dev prefix', async () => {
    const { adapter, captured } = buildTelegramCaptureAdapter();
    const port = createDefaultDispatchPort({ adapters: [adapter] });

    await port.dispatchOutgoing({
      type: 'message.send',
      meta: { eventId: 'e-prod-text', occurredAt: '2026-01-01T00:00:00.000Z', source: 'telegram' },
      payload: {
        recipient: { chatId: 123 },
        message: { text: 'prod msg' },
        delivery: { channels: ['telegram'], maxAttempts: 1 },
      },
    });

    const receivedMessage = (captured[0]!.payload as { message: { text: string } }).message;
    expect(receivedMessage.text).toBe('prod msg');
    expect(receivedMessage.text).not.toContain('DEV→');
  });

  it('production: max channel reaches max adapter (no collapse)', async () => {
    const { adapter: tgAdapter, captured: tgCaptured } = buildTelegramCaptureAdapter();
    const maxCaptured: OutgoingIntent[] = [];
    const maxAdapter: DeliveryAdapter = {
      canHandle: (intent) => intent.meta.source === 'max',
      send: async (intent) => { maxCaptured.push(intent); return {}; },
    };

    const port = createDefaultDispatchPort({ adapters: [tgAdapter, maxAdapter] });

    await port.dispatchOutgoing({
      type: 'message.send',
      meta: { eventId: 'e-prod-max', occurredAt: '2026-01-01T00:00:00.000Z', source: 'max' },
      payload: {
        recipient: { chatId: 888222 },
        message: { text: 'max prod msg' },
        delivery: { channels: ['max'], maxAttempts: 1 },
      },
    });

    expect(tgCaptured).toHaveLength(0);
    expect(maxCaptured).toHaveLength(1);
    const receivedRecipient = (maxCaptured[0]!.payload as { recipient: { chatId: number } }).recipient;
    expect(receivedRecipient.chatId).toBe(888222);
  });
});
