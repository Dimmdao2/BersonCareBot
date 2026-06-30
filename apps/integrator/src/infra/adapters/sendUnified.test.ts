/**
 * Unit tests for sendUnified.ts (PLAN S3 DoD).
 *
 * Key assertion (PLAN S3 / Q-A rework): with DEV_DELIVERY_REDIRECT=1, an `email`
 * AND a `web_push` UnifiedOutgoingMessage are redirected PER-CHANNEL to the test
 * user's own binding (email→test email, web_push→test pushUserId) — proving the
 * façade inherits the pre-fork redirect. The redirect now PRESERVES the channel
 * rather than collapsing everything to telegram (Q-A per-channel rework).
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { DeliveryAdapter, OutgoingIntent } from '../../kernel/contracts/index.js';
import type { UnifiedOutgoingMessage } from '../../kernel/contracts/unifiedMessage.js';
import { createDefaultDispatchPort } from './dispatchPort.js';
import { createUnifiedSender } from './sendUnified.js';
import { _resetDevRedirectActiveCache } from '../../shared/devDeliveryRedirect.js';

const DEV_EMAIL_TARGET = 'dimmdao@yandex.ru'; // Дмитрий default
const DEV_PUSH_USER_ID = '1c312a64-fab8-4b75-b24e-88a1d6ebe4e0'; // Дмитрий default
const now = '2026-06-17T00:00:00.000Z';

/** A channel-specific capture adapter that matches by delivery.channels[0]. */
function buildChannelCapture(channel: string): { adapter: DeliveryAdapter; captured: OutgoingIntent[] } {
  const captured: OutgoingIntent[] = [];
  return {
    captured,
    adapter: {
      canHandle: (intent) =>
        intent.type === 'message.send' &&
        Array.isArray((intent.payload as { delivery?: { channels?: unknown } }).delivery?.channels) &&
        ((intent.payload as { delivery?: { channels?: string[] } }).delivery?.channels ?? []).includes(channel),
      send: async (intent) => {
        captured.push(intent);
        return {};
      },
    },
  };
}

/** A telegram adapter that captures intents it receives (used for channel-validation tests). */
function buildTelegramCapture(): { adapter: DeliveryAdapter; captured: OutgoingIntent[] } {
  return buildChannelCapture('telegram');
}

function activateDevRedirect() {
  process.env.NODE_ENV = 'production'; // avoid implicit dev
  process.env.DEV_DELIVERY_REDIRECT = '1';
  // Do NOT set DEV_REDIRECT_EMAIL or DEV_REDIRECT_WEB_PUSH_USER_ID —
  // the Дмитрий defaults kick in (dimmdao@yandex.ru / 1c312a64…).
  delete process.env.DEV_REDIRECT_EMAIL;
  delete process.env.DEV_REDIRECT_WEB_PUSH_USER_ID;
  delete process.env.DEV_REDIRECT_DISABLE_DEFAULTS;
  _resetDevRedirectActiveCache();
}

function restoreEnv() {
  process.env.NODE_ENV = 'test';
  delete process.env.DEV_DELIVERY_REDIRECT;
  delete process.env.TELEGRAM_ADMIN_ID;
  delete process.env.DEV_REDIRECT_EMAIL;
  delete process.env.DEV_REDIRECT_WEB_PUSH_USER_ID;
  delete process.env.DEV_REDIRECT_DISABLE_DEFAULTS;
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

describe('createUnifiedSender — PRE-FORK PER-CHANNEL DEV REDIRECT (PLAN S3 DoD / Q-A rework)', () => {
  beforeEach(() => {
    activateDevRedirect();
  });

  afterEach(() => {
    restoreEnv();
  });

  it('email message is redirected to test email (channel preserved, real email dropped)', async () => {
    // Q-A: email stays as email — redirected to dev test user's email, NOT collapsed to telegram.
    const { adapter: emailAdapter, captured } = buildChannelCapture('email');
    const dispatchPort = createDefaultDispatchPort({ adapters: [emailAdapter] });
    const sender = createUnifiedSender({ dispatchPort });

    const emailMsg: UnifiedOutgoingMessage = {
      kind: 'message.send',
      channel: 'email',
      recipient: { email: 'real-patient@example.com' },
      content: { text: 'Your appointment is confirmed.', title: 'Appointment Reminder' },
      meta: { eventId: 'email-001', occurredAt: now, source: 'email' },
    };

    await sender.send(emailMsg);

    expect(captured).toHaveLength(1);
    const receivedPayload = captured[0]!.payload as {
      recipient: { email: unknown; chatId?: unknown };
      delivery: { channels: string[] };
    };
    // Assert redirect preserved email channel and replaced recipient with test user's email.
    expect(receivedPayload.delivery.channels).toEqual(['email']);
    expect(receivedPayload.recipient.email).toBe(DEV_EMAIL_TARGET);
    // Assert NO real email recipient reached the adapter.
    expect(receivedPayload.recipient.email).not.toBe('real-patient@example.com');
    // Assert no telegram chatId leaked in.
    expect(receivedPayload.recipient).not.toHaveProperty('chatId');
  });

  it('web_push message is redirected to test pushUserId (channel preserved, real pushUserId dropped)', async () => {
    // Q-A: web_push stays as web_push — redirected to dev test user's pushUserId.
    const { adapter: pushAdapter, captured } = buildChannelCapture('web_push');
    const dispatchPort = createDefaultDispatchPort({ adapters: [pushAdapter] });
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
      recipient: { pushUserId: unknown; chatId?: unknown };
      delivery: { channels: string[] };
    };
    // Assert redirect preserved web_push channel and replaced recipient.
    expect(receivedPayload.delivery.channels).toEqual(['web_push']);
    expect(receivedPayload.recipient.pushUserId).toBe(DEV_PUSH_USER_ID);
    // Assert NO real pushUserId reached the adapter.
    expect(receivedPayload.recipient.pushUserId).not.toBe('user-real-id-123');
    // Assert no telegram chatId leaked in.
    expect(receivedPayload.recipient).not.toHaveProperty('chatId');
  });

  it('redirect log message is emitted (PRE_FORK_DEV_DELIVERY_REDIRECT)', async () => {
    const { adapter: emailAdapter } = buildChannelCapture('email');
    const dispatchPort = createDefaultDispatchPort({ adapters: [emailAdapter] });
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
