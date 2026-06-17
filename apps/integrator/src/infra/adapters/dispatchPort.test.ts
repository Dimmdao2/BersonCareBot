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

// ─── PRE-FORK DEV DELIVERY REDIRECT tests ────────────────────────────────────
//
// These tests verify the PRIMARY override layer added in applyPreForkDevRedirect.
// Goal: with redirect active, ANY recipient/channel collapses to the single test
//       telegram chat BEFORE the adapter fork. Production mode: unchanged passthrough.

const TEST_CHAT_ID = 364943522; // default (TELEGRAM_ADMIN_ID)

/** Build a telegram adapter that captures what it received. */
function buildTelegramCaptureAdapter(): { adapter: DeliveryAdapter; captured: OutgoingIntent[] } {
  const captured: OutgoingIntent[] = [];
  const adapter: DeliveryAdapter = {
    canHandle: (intent) => intent.meta.source === 'telegram',
    send: async (intent) => { captured.push(intent); return {}; },
  };
  return { adapter, captured };
}

/** Build a max adapter that captures what it received. */
function buildMaxCaptureAdapter(): { adapter: DeliveryAdapter; captured: OutgoingIntent[] } {
  const captured: OutgoingIntent[] = [];
  const adapter: DeliveryAdapter = {
    canHandle: (intent) => intent.meta.source === 'max' || (
      intent.type === 'message.send' &&
      Array.isArray((intent.payload as { delivery?: { channels?: unknown } }).delivery?.channels) &&
      ((intent.payload as { delivery?: { channels?: string[] } }).delivery?.channels ?? []).includes('max')
    ),
    send: async (intent) => { captured.push(intent); return {}; },
  };
  return { adapter, captured };
}

describe('createDefaultDispatchPort — PRE-FORK DEV REDIRECT active (dev env)', () => {
  beforeEach(() => {
    // Activate redirect (test env, which is the default in vitest.setup.ts).
    process.env.NODE_ENV = 'test';
    delete process.env.DEV_DELIVERY_REDIRECT;
    delete process.env.DEV_DELIVERY_REDIRECT_CHAT_ID;
    process.env.TELEGRAM_ADMIN_ID = String(TEST_CHAT_ID);
    _resetDevRedirectActiveCache();
  });

  afterEach(() => {
    restoreTestEnv();
  });

  it('telegram recipient: chatId overridden to test id at pre-fork layer', async () => {
    const { adapter, captured } = buildTelegramCaptureAdapter();
    const port = createDefaultDispatchPort({ adapters: [adapter] });

    await port.dispatchOutgoing({
      type: 'message.send',
      meta: { eventId: 'e1', occurredAt: '2026-01-01T00:00:00.000Z', source: 'telegram' },
      payload: {
        recipient: { chatId: 999111 },
        message: { text: 'hello' },
        delivery: { channels: ['telegram'], maxAttempts: 1 },
      },
    });

    expect(captured).toHaveLength(1);
    const receivedRecipient = (captured[0]!.payload as { recipient: { chatId: number } }).recipient;
    expect(receivedRecipient.chatId).toBe(TEST_CHAT_ID);
  });

  it.each([111111, 222222, 999999999, 555, 1])(
    'various telegram chatId %i → test chat id at pre-fork',
    async (originalId) => {
      const { adapter, captured } = buildTelegramCaptureAdapter();
      const port = createDefaultDispatchPort({ adapters: [adapter] });

      await port.dispatchOutgoing({
        type: 'message.send',
        meta: { eventId: `e-${originalId}`, occurredAt: '2026-01-01T00:00:00.000Z', source: 'telegram' },
        payload: {
          recipient: { chatId: originalId },
          message: { text: 'msg' },
          delivery: { channels: ['telegram'], maxAttempts: 1 },
        },
      });

      const receivedRecipient = (captured[0]!.payload as { recipient: { chatId: number } }).recipient;
      expect(receivedRecipient.chatId).toBe(TEST_CHAT_ID);
    },
  );

  it('max intent: collapses to telegram test chat (channel-collapse)', async () => {
    const { adapter: tgAdapter, captured: tgCaptured } = buildTelegramCaptureAdapter();
    // max adapter should NOT be reached
    const maxSend = vi.fn().mockResolvedValue({});
    const maxAdapter: DeliveryAdapter = {
      canHandle: (intent) =>
        Array.isArray((intent.payload as { delivery?: { channels?: unknown } }).delivery?.channels) &&
        ((intent.payload as { delivery?: { channels?: string[] } }).delivery?.channels ?? []).includes('max'),
      send: maxSend,
    };

    const port = createDefaultDispatchPort({ adapters: [tgAdapter, maxAdapter] });

    await port.dispatchOutgoing({
      type: 'message.send',
      meta: { eventId: 'e-max', occurredAt: '2026-01-01T00:00:00.000Z', source: 'max' },
      payload: {
        recipient: { chatId: 888222 },
        message: { text: 'max msg' },
        delivery: { channels: ['max'], maxAttempts: 1 },
      },
    });

    // telegram adapter should have been used, not max
    expect(tgCaptured).toHaveLength(1);
    expect(maxSend).not.toHaveBeenCalled();
    const receivedRecipient = (tgCaptured[0]!.payload as { recipient: { chatId: number } }).recipient;
    expect(receivedRecipient.chatId).toBe(TEST_CHAT_ID);
  });

  it('non-telegram channel (sms-like custom): also collapses to telegram test chat', async () => {
    const { adapter, captured } = buildTelegramCaptureAdapter();
    const port = createDefaultDispatchPort({ adapters: [adapter] });

    await port.dispatchOutgoing({
      type: 'message.send',
      meta: { eventId: 'e-sms', occurredAt: '2026-01-01T00:00:00.000Z', source: 'sms' },
      payload: {
        recipient: { chatId: 123456 },
        message: { text: 'sms msg' },
        delivery: { channels: ['sms'], maxAttempts: 1 },
      },
    });

    expect(captured).toHaveLength(1);
    const receivedRecipient = (captured[0]!.payload as { recipient: { chatId: number } }).recipient;
    expect(receivedRecipient.chatId).toBe(TEST_CHAT_ID);
  });

  it('text body gets dev prefix with original recipient', async () => {
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

  it('uses DEV_DELIVERY_REDIRECT_CHAT_ID when explicitly configured', async () => {
    process.env.DEV_DELIVERY_REDIRECT_CHAT_ID = '55555';
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

    delete process.env.DEV_DELIVERY_REDIRECT_CHAT_ID;
    _resetDevRedirectActiveCache();
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
    expect(receivedRecipient.chatId).toBe(TEST_CHAT_ID);
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
