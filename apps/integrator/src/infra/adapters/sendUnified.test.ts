/**
 * Unit tests for sendUnified.ts (PLAN S3 DoD).
 *
 * Key assertion (PLAN S3): with DEV_DELIVERY_REDIRECT=1, an `email` AND a `web_push`
 * UnifiedOutgoingMessage are collapsed to the telegram test chat — proving the façade
 * inherits the pre-fork redirect even for channels that have no adapter yet.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { DeliveryAdapter, OutgoingIntent } from '../../kernel/contracts/index.js';
import type { UnifiedOutgoingMessage } from '../../kernel/contracts/unifiedMessage.js';
import { createDefaultDispatchPort } from './dispatchPort.js';
import { createUnifiedSender } from './sendUnified.js';
import { _resetDevRedirectActiveCache } from '../../shared/devDeliveryRedirect.js';

const TEST_CHAT_ID = 364943522;
const now = '2026-06-17T00:00:00.000Z';

/** A telegram adapter that captures intents it receives. */
function buildTelegramCapture(): { adapter: DeliveryAdapter; captured: OutgoingIntent[] } {
  const captured: OutgoingIntent[] = [];
  return {
    captured,
    adapter: {
      canHandle: (intent) => intent.meta.source === 'telegram',
      send: async (intent) => {
        captured.push(intent);
        return {};
      },
    },
  };
}

function activateDevRedirect() {
  process.env.NODE_ENV = 'production'; // avoid implicit dev
  process.env.DEV_DELIVERY_REDIRECT = '1';
  process.env.TELEGRAM_ADMIN_ID = String(TEST_CHAT_ID);
  _resetDevRedirectActiveCache();
}

function restoreEnv() {
  process.env.NODE_ENV = 'test';
  delete process.env.DEV_DELIVERY_REDIRECT;
  delete process.env.TELEGRAM_ADMIN_ID;
  _resetDevRedirectActiveCache();
}

describe('createUnifiedSender — channel validation', () => {
  it('throws UNKNOWN_CHANNEL for an invalid channel', async () => {
    const { adapter } = buildTelegramCapture();
    const dispatchPort = createDefaultDispatchPort({ adapters: [adapter] });
    const sender = createUnifiedSender({ dispatchPort });

    const msg = {
      kind: 'message.send' as const,
      channel: 'invalid-channel' as never,
      recipient: { chatId: 123 },
      content: { text: 'hi' },
      meta: { eventId: 'e1', occurredAt: now, source: 'telegram' },
    };

    await expect(sender.send(msg)).rejects.toThrow('UNKNOWN_CHANNEL');
  });

  it('accepts all valid Channel values', () => {
    // Static check — these should compile without error.
    const validChannels: UnifiedOutgoingMessage['channel'][] = [
      'telegram', 'max', 'smsc', 'email', 'web_push',
    ];
    expect(validChannels).toHaveLength(5);
  });
});

describe('createUnifiedSender — PRE-FORK DEV REDIRECT (PLAN S3 DoD)', () => {
  beforeEach(() => {
    activateDevRedirect();
  });

  afterEach(() => {
    restoreEnv();
  });

  it('email message collapses to telegram test chat (redirect proves façade inherits chokepoint)', async () => {
    const { adapter, captured } = buildTelegramCapture();
    const dispatchPort = createDefaultDispatchPort({ adapters: [adapter] });
    const sender = createUnifiedSender({ dispatchPort });

    const emailMsg: UnifiedOutgoingMessage = {
      kind: 'message.send',
      channel: 'email',
      recipient: { email: 'real-patient@example.com' },
      content: { text: 'Your appointment is confirmed.', title: 'Appointment Reminder' },
      meta: { eventId: 'email-001', occurredAt: now, source: 'email' },
    };

    // With redirect active and no email adapter, the intent is collapsed to
    // telegram by applyPreForkDevRedirect BEFORE adapter selection.
    // The telegram adapter should then handle it.
    await sender.send(emailMsg);

    expect(captured).toHaveLength(1);
    const receivedPayload = captured[0]!.payload as {
      recipient: { chatId: unknown };
      delivery: { channels: string[] };
    };
    // Assert redirect collapsed to telegram test chat.
    expect(receivedPayload.recipient.chatId).toBe(TEST_CHAT_ID);
    expect(receivedPayload.delivery.channels).toEqual(['telegram']);
    // Assert NO real email recipient reached the adapter.
    expect(receivedPayload.recipient).not.toHaveProperty('email');
  });

  it('web_push message collapses to telegram test chat (redirect proves façade inherits chokepoint)', async () => {
    const { adapter, captured } = buildTelegramCapture();
    const dispatchPort = createDefaultDispatchPort({ adapters: [adapter] });
    const sender = createUnifiedSender({ dispatchPort });

    const pushMsg: UnifiedOutgoingMessage = {
      kind: 'message.send',
      channel: 'web_push',
      recipient: { pushUserId: 'user-real-id-123' },
      content: {
        text: 'You have a new message.',
        title: 'BersonCare',
        pushExtras: { tag: 'chat-msg', topicCode: 'patient_chat' },
      },
      meta: { eventId: 'push-001', occurredAt: now, source: 'web_push' },
    };

    await sender.send(pushMsg);

    expect(captured).toHaveLength(1);
    const receivedPayload = captured[0]!.payload as {
      recipient: { chatId: unknown };
      delivery: { channels: string[] };
    };
    // Assert redirect collapsed to telegram test chat.
    expect(receivedPayload.recipient.chatId).toBe(TEST_CHAT_ID);
    expect(receivedPayload.delivery.channels).toEqual(['telegram']);
    // Assert NO real push userId reached the adapter.
    expect(receivedPayload.recipient).not.toHaveProperty('pushUserId');
  });

  it('redirect log message is emitted (PRE_FORK_DEV_DELIVERY_REDIRECT)', async () => {
    const { adapter } = buildTelegramCapture();
    const dispatchPort = createDefaultDispatchPort({ adapters: [adapter] });
    const sender = createUnifiedSender({ dispatchPort });

    // Spy on the logger module — the redirect emits a warn with 'PRE_FORK_DEV_DELIVERY_REDIRECT'.
    const { logger } = await import('../observability/logger.js');
    const warnSpy = vi.spyOn(logger, 'warn');

    await sender.send({
      kind: 'message.send',
      channel: 'email',
      recipient: { email: 'test@example.com' },
      content: { text: 'test' },
      meta: { eventId: 'e-log', occurredAt: now, source: 'email' },
    });

    const redirectLogs = warnSpy.mock.calls.filter(
      (args) => typeof args[1] === 'string' && args[1].includes('PRE_FORK_DEV_DELIVERY_REDIRECT'),
    );
    expect(redirectLogs.length).toBeGreaterThan(0);

    warnSpy.mockRestore();
  });
});

describe('createUnifiedSender — telegram message delegated to dispatchPort (production mode)', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'production';
    delete process.env.DEV_DELIVERY_REDIRECT;
    _resetDevRedirectActiveCache();
  });

  afterEach(() => {
    restoreEnv();
  });

  it('delegates a telegram message through to the dispatchPort unchanged in production', async () => {
    const { adapter, captured } = buildTelegramCapture();
    const dispatchPort = createDefaultDispatchPort({ adapters: [adapter] });
    const sender = createUnifiedSender({ dispatchPort });

    await sender.send({
      kind: 'message.send',
      channel: 'telegram',
      recipient: { chatId: 364943522 },
      content: { text: 'Hello doctor!' },
      meta: { eventId: 'tg-001', occurredAt: now, source: 'telegram' },
    });

    expect(captured).toHaveLength(1);
    const payload = captured[0]!.payload as { recipient: { chatId: unknown }; delivery: { channels: string[] } };
    expect(payload.recipient.chatId).toBe(364943522);
    expect(payload.delivery.channels).toEqual(['telegram']);
  });
});
