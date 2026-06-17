/**
 * S11 — Pre-fork redirect channel-coverage tests.
 *
 * PLAN S11 DoD: Prove the pre-fork redirect (`applyPreForkDevRedirect`) neutralizes
 * EVERY channel — including `email` (recipient.email) and `web_push` (pushUserId) —
 * not just `chatId`. This test file is the audit evidence cited by S15 and S16.
 *
 * For channel ∈ { telegram, max, smsc, email, web_push }, dispatch a message with a
 * REAL-looking recipient and DEV_DELIVERY_REDIRECT=1. Assert:
 *   (a) PRE_FORK_DEV_DELIVERY_REDIRECT is logged.
 *   (b) The selected adapter is the telegram adapter (not the channel-specific one).
 *   (c) The outbound recipient is the test chat id (chatId = TEST_CHAT_ID).
 *   (d) NO real email / phone / pushUserId / userId reaches any adapter send().
 *
 * Audited in S11: `applyPreForkDevRedirect` sets `recipient = { chatId: testChatId }`
 * (a new object containing ONLY chatId) and overrides `delivery.channels` to
 * `['telegram']` before the adapter fork. Since the redirect constructs a fresh
 * recipient object, no real `email`/`phoneNormalized`/`pushUserId`/`userId` field
 * from the original intent can survive. This test proves that invariant
 * programmatically for each channel.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { DeliveryAdapter, OutgoingIntent } from '../../kernel/contracts/index.js';
import { createDefaultDispatchPort } from './dispatchPort.js';
import { _resetDevRedirectActiveCache } from '../../shared/devDeliveryRedirect.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const TEST_CHAT_ID = 364943522; // default from TELEGRAM_ADMIN_ID
const NOW = '2026-06-17T00:00:00.000Z';

// ─── Adapter factories ─────────────────────────────────────────────────────────

/**
 * Build a telegram adapter that uses meta.source === 'telegram' to handle.
 * After the redirect, meta.source is forced to 'telegram', so this will catch
 * the collapsed intent for ANY original channel.
 */
function buildTelegramCaptureAdapter(): {
  adapter: DeliveryAdapter;
  captured: OutgoingIntent[];
  sendSpy: ReturnType<typeof vi.fn>;
} {
  const captured: OutgoingIntent[] = [];
  const sendSpy = vi.fn(async (intent: OutgoingIntent) => {
    captured.push(intent);
    return {};
  });
  const adapter: DeliveryAdapter = {
    canHandle: (intent) => intent.meta.source === 'telegram',
    send: sendSpy,
  };
  return { adapter, captured, sendSpy };
}

/**
 * Build a spy adapter for a non-telegram channel that MUST NOT be reached
 * when the redirect is active.
 */
function buildBypassAdapter(
  name: string,
  canHandleFn: (intent: OutgoingIntent) => boolean,
): { adapter: DeliveryAdapter; sendSpy: ReturnType<typeof vi.fn> } {
  const sendSpy = vi.fn(async () => {
    throw new Error(`${name} adapter send() should NOT be called when redirect is active`);
  });
  const adapter: DeliveryAdapter = {
    canHandle: canHandleFn,
    send: sendSpy,
  };
  return { adapter, sendSpy };
}

// ─── Env helpers ──────────────────────────────────────────────────────────────

function activateRedirect() {
  // Use explicit flag so NODE_ENV doesn't matter for the test.
  process.env.NODE_ENV = 'production'; // avoid implicit test-env activation
  process.env.DEV_DELIVERY_REDIRECT = '1';
  process.env.TELEGRAM_ADMIN_ID = String(TEST_CHAT_ID);
  delete process.env.DEV_DELIVERY_REDIRECT_CHAT_ID;
  _resetDevRedirectActiveCache();
}

function restoreEnv() {
  process.env.NODE_ENV = 'test';
  delete process.env.DEV_DELIVERY_REDIRECT;
  delete process.env.TELEGRAM_ADMIN_ID;
  delete process.env.DEV_DELIVERY_REDIRECT_CHAT_ID;
  _resetDevRedirectActiveCache();
}

// ─── Per-channel test cases ────────────────────────────────────────────────────

/**
 * Each entry describes one channel's real-looking intent and an optional
 * bypass adapter that should NOT be called.
 *
 * "real-looking" means the recipient carries the fields that the actual
 * channel adapter would read to send to a real user.
 */
const CHANNEL_CASES = [
  {
    channel: 'telegram' as const,
    description: 'telegram — real chatId',
    intent: (eventId: string): OutgoingIntent => ({
      type: 'message.send',
      meta: { eventId, occurredAt: NOW, source: 'telegram' },
      payload: {
        recipient: { chatId: 999111222 },
        message: { text: 'Telegram message to real patient' },
        delivery: { channels: ['telegram'], maxAttempts: 1 },
      },
    }),
    // Telegram itself also serves as the bypass — the chatId must be rewritten to TEST_CHAT_ID.
    bypassChannel: null, // telegram IS the collapse target; no separate bypass adapter needed
    realFieldsThatMustNotLeak: [] as string[], // chatId is expected — just must be TEST_CHAT_ID
  },
  {
    channel: 'max' as const,
    description: 'max — real userId',
    intent: (eventId: string): OutgoingIntent => ({
      type: 'message.send',
      meta: { eventId, occurredAt: NOW, source: 'max' },
      payload: {
        recipient: { userId: 8877665544, chatId: 8877665544 },
        message: { text: 'MAX message to real patient' },
        delivery: { channels: ['max'], maxAttempts: 1 },
      },
    }),
    bypassChannel: 'max',
    // After redirect the recipient is { chatId: TEST_CHAT_ID } only — no userId.
    realFieldsThatMustNotLeak: ['userId'],
  },
  {
    channel: 'smsc' as const,
    description: 'smsc — real phoneNormalized',
    intent: (eventId: string): OutgoingIntent => ({
      type: 'message.send',
      meta: { eventId, occurredAt: NOW, source: 'smsc' },
      payload: {
        recipient: { phoneNormalized: '+79991234567' },
        message: { text: 'SMS code: 123456' },
        delivery: { channels: ['smsc'], maxAttempts: 1 },
      },
    }),
    bypassChannel: 'smsc',
    realFieldsThatMustNotLeak: ['phoneNormalized'],
  },
  {
    channel: 'email' as const,
    description: 'email — real recipient.email',
    intent: (eventId: string): OutgoingIntent => ({
      type: 'message.send',
      meta: { eventId, occurredAt: NOW, source: 'email' },
      payload: {
        recipient: { email: 'real.patient@example.com' },
        subject: 'Appointment Reminder',
        message: { text: 'Your appointment is tomorrow at 10:00.' },
        delivery: { channels: ['email'], maxAttempts: 1 },
      },
    }),
    bypassChannel: 'email',
    realFieldsThatMustNotLeak: ['email'],
  },
  {
    channel: 'web_push' as const,
    description: 'web_push — real pushUserId',
    intent: (eventId: string): OutgoingIntent => ({
      type: 'message.send',
      meta: { eventId, occurredAt: NOW, source: 'web_push' },
      payload: {
        recipient: { pushUserId: 'real-webapp-user-id-42' },
        message: { text: 'You have a new message from your doctor.' },
        delivery: { channels: ['web_push'], maxAttempts: 1 },
      },
    }),
    bypassChannel: 'web_push',
    realFieldsThatMustNotLeak: ['pushUserId'],
  },
] as const;

// ─── Main test suite ──────────────────────────────────────────────────────────

describe('S11 — PRE-FORK DEV REDIRECT: all channels collapse to telegram test chat', () => {
  beforeEach(() => {
    activateRedirect();
  });

  afterEach(() => {
    restoreEnv();
    vi.restoreAllMocks();
  });

  // ─── (a) + (b): PRE_FORK_DEV_DELIVERY_REDIRECT is logged; telegram adapter is selected ──

  it.each(CHANNEL_CASES)(
    '(a)(b) channel=$channel: logs PRE_FORK_DEV_DELIVERY_REDIRECT and routes to telegram adapter',
    async ({ channel, description: _desc, intent, bypassChannel }) => {
      const { adapter: tgAdapter, captured } = buildTelegramCaptureAdapter();

      // Build bypass adapter for this channel so we can assert it is not called.
      const bypassAdapters: DeliveryAdapter[] = [];
      const bypassSendSpies: ReturnType<typeof vi.fn>[] = [];
      if (bypassChannel) {
        const { adapter: bypass, sendSpy } = buildBypassAdapter(
          bypassChannel,
          (i) =>
            i.type === 'message.send' &&
            Array.isArray((i.payload as { delivery?: { channels?: unknown } }).delivery?.channels) &&
            (
              (i.payload as { delivery?: { channels?: string[] } }).delivery?.channels ?? []
            ).includes(bypassChannel),
        );
        bypassAdapters.push(bypass);
        bypassSendSpies.push(sendSpy);
      }

      const port = createDefaultDispatchPort({
        adapters: [tgAdapter, ...bypassAdapters],
      });

      // Spy on logger to capture the redirect log.
      const { logger } = await import('../observability/logger.js');
      const warnSpy = vi.spyOn(logger, 'warn');

      await port.dispatchOutgoing(intent(`s11-ab-${channel}`));

      // (a) PRE_FORK_DEV_DELIVERY_REDIRECT must be logged.
      const redirectLogs = warnSpy.mock.calls.filter(
        (args) => typeof args[1] === 'string' && args[1] === 'PRE_FORK_DEV_DELIVERY_REDIRECT',
      );
      expect(
        redirectLogs.length,
        `Expected PRE_FORK_DEV_DELIVERY_REDIRECT log for channel=${channel}`,
      ).toBeGreaterThan(0);

      // (b) Telegram adapter must have been called (not the bypass).
      expect(
        captured,
        `Telegram adapter should have received the intent for channel=${channel}`,
      ).toHaveLength(1);

      // Bypass adapters must NOT have been called.
      for (const spy of bypassSendSpies) {
        expect(spy, `Bypass adapter for ${bypassChannel ?? ''} must not be called`).not.toHaveBeenCalled();
      }
    },
  );

  // ─── (c): Outbound recipient is the test chat id ───────────────────────────

  it.each(CHANNEL_CASES)(
    '(c) channel=$channel: outbound recipient.chatId === TEST_CHAT_ID',
    async ({ channel, intent }) => {
      const { adapter, captured } = buildTelegramCaptureAdapter();
      const port = createDefaultDispatchPort({ adapters: [adapter] });

      await port.dispatchOutgoing(intent(`s11-c-${channel}`));

      expect(captured).toHaveLength(1);
      const receivedPayload = captured[0]!.payload as {
        recipient: Record<string, unknown>;
        delivery: { channels: string[] };
      };

      // (c) chatId must be the test chat id.
      expect(
        receivedPayload.recipient.chatId,
        `recipient.chatId must be TEST_CHAT_ID for channel=${channel}`,
      ).toBe(TEST_CHAT_ID);

      // Delivery channel must be telegram.
      expect(
        receivedPayload.delivery.channels,
        `delivery.channels must be ['telegram'] for channel=${channel}`,
      ).toEqual(['telegram']);
    },
  );

  // ─── (d): No real email/phone/push value reaches any adapter ─────────────

  it.each(CHANNEL_CASES)(
    '(d) channel=$channel: no real recipient field ($realFieldsThatMustNotLeak) reaches adapter.send()',
    async ({ channel, intent, realFieldsThatMustNotLeak }) => {
      if (realFieldsThatMustNotLeak.length === 0) return; // telegram only checks chatId override (covered above)

      const { adapter, captured } = buildTelegramCaptureAdapter();
      const port = createDefaultDispatchPort({ adapters: [adapter] });

      await port.dispatchOutgoing(intent(`s11-d-${channel}`));

      expect(captured).toHaveLength(1);
      const receivedRecipient = (captured[0]!.payload as { recipient: Record<string, unknown> }).recipient;

      for (const field of realFieldsThatMustNotLeak) {
        expect(
          receivedRecipient,
          `recipient.${field} must NOT be present in adapter.send() for channel=${channel} (redirect must drop it)`,
        ).not.toHaveProperty(field);
      }
    },
  );

  // ─── Email-specific: no email address reaches any adapter ─────────────────

  it('email channel: real recipient.email is dropped — sendMail-like adapter would have no target', async () => {
    // This is the critical safety proof for retiring email interim guards (S15).
    // Even if an email-capable adapter were registered alongside telegram, the redirect
    // collapses the intent to channel='telegram' BEFORE adapter selection, so the
    // email adapter's canHandle() returns false and send() is never called.

    const { adapter: tgAdapter, captured } = buildTelegramCaptureAdapter();

    // Simulate an email adapter being registered (as will exist after S8).
    const emailSendSpy = vi.fn(async () => ({}));
    const emailAdapter: DeliveryAdapter = {
      canHandle: (i) =>
        i.type === 'message.send' &&
        Array.isArray((i.payload as { delivery?: { channels?: unknown } }).delivery?.channels) &&
        (
          (i.payload as { delivery?: { channels?: string[] } }).delivery?.channels ?? []
        ).includes('email'),
      send: emailSendSpy,
    };

    const port = createDefaultDispatchPort({ adapters: [tgAdapter, emailAdapter] });

    await port.dispatchOutgoing({
      type: 'message.send',
      meta: { eventId: 's11-email-adapter', occurredAt: NOW, source: 'email' },
      payload: {
        recipient: { email: 'real.patient@clinic.example.com' },
        subject: 'Test Subject',
        message: { text: 'Test email body' },
        delivery: { channels: ['email'], maxAttempts: 1 },
      },
    });

    // Telegram adapter got it, not email.
    expect(captured).toHaveLength(1);
    expect(emailSendSpy).not.toHaveBeenCalled();

    // recipient.email is absent from what telegram adapter received.
    const recipient = (captured[0]!.payload as { recipient: Record<string, unknown> }).recipient;
    expect(recipient).not.toHaveProperty('email');
    expect(recipient.chatId).toBe(TEST_CHAT_ID);
  });

  // ─── Web_push-specific: no push subscription ref reaches any adapter ───────

  it('web_push channel: pushUserId dropped — adapter cannot perform a real push', async () => {
    // Critical safety proof for G2 retirement (S16).
    // With redirect active, a web_push intent collapses to telegram before any
    // WebPushDeliveryAdapter (S14) could read pushUserId and look up subscriptions.

    const { adapter: tgAdapter, captured } = buildTelegramCaptureAdapter();

    // Simulate a web_push adapter being registered (as will exist after S14).
    const webPushSendSpy = vi.fn(async () => ({}));
    const webPushAdapter: DeliveryAdapter = {
      canHandle: (i) =>
        i.type === 'message.send' &&
        Array.isArray((i.payload as { delivery?: { channels?: unknown } }).delivery?.channels) &&
        (
          (i.payload as { delivery?: { channels?: string[] } }).delivery?.channels ?? []
        ).includes('web_push'),
      send: webPushSendSpy,
    };

    const port = createDefaultDispatchPort({ adapters: [tgAdapter, webPushAdapter] });

    await port.dispatchOutgoing({
      type: 'message.send',
      meta: { eventId: 's11-webpush-adapter', occurredAt: NOW, source: 'web_push' },
      payload: {
        recipient: { pushUserId: 'real-patient-user-id-99' },
        message: { text: 'You have a new message.' },
        delivery: { channels: ['web_push'], maxAttempts: 1 },
        pushExtras: { tag: 'chat-msg', topicCode: 'patient_chat' },
      },
    });

    // Telegram adapter got it, not web_push.
    expect(captured).toHaveLength(1);
    expect(webPushSendSpy).not.toHaveBeenCalled();

    // pushUserId is absent from what telegram adapter received.
    const recipient = (captured[0]!.payload as { recipient: Record<string, unknown> }).recipient;
    expect(recipient).not.toHaveProperty('pushUserId');
    expect(recipient.chatId).toBe(TEST_CHAT_ID);
  });

  // ─── Production mode: redirect inactive, real recipients pass through ──────

  describe('PRE-FORK DEV REDIRECT inactive (production, no force flag)', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'production';
      delete process.env.DEV_DELIVERY_REDIRECT;
      _resetDevRedirectActiveCache();
    });

    it('production: email intent is NOT collapsed — email adapter receives real recipient.email', async () => {
      const { adapter: tgAdapter, captured: tgCaptured } = buildTelegramCaptureAdapter();

      const emailCaptured: OutgoingIntent[] = [];
      const emailAdapter: DeliveryAdapter = {
        canHandle: (i) =>
          i.type === 'message.send' &&
          Array.isArray((i.payload as { delivery?: { channels?: unknown } }).delivery?.channels) &&
          (
            (i.payload as { delivery?: { channels?: string[] } }).delivery?.channels ?? []
          ).includes('email'),
        send: async (intent) => {
          emailCaptured.push(intent);
          return {};
        },
      };

      const port = createDefaultDispatchPort({ adapters: [tgAdapter, emailAdapter] });

      await port.dispatchOutgoing({
        type: 'message.send',
        meta: { eventId: 's11-prod-email', occurredAt: NOW, source: 'email' },
        payload: {
          recipient: { email: 'prod.patient@example.com' },
          subject: 'Your appointment',
          message: { text: 'Appointment confirmed.' },
          delivery: { channels: ['email'], maxAttempts: 1 },
        },
      });

      // In prod: email adapter handles it, NOT telegram.
      expect(tgCaptured).toHaveLength(0);
      expect(emailCaptured).toHaveLength(1);
      const recipient = (emailCaptured[0]!.payload as { recipient: Record<string, unknown> }).recipient;
      // Real email reaches adapter in prod.
      expect(recipient.email).toBe('prod.patient@example.com');
    });

    it('production: web_push intent is NOT collapsed — web_push adapter receives real pushUserId', async () => {
      const { adapter: tgAdapter, captured: tgCaptured } = buildTelegramCaptureAdapter();

      const pushCaptured: OutgoingIntent[] = [];
      const webPushAdapter: DeliveryAdapter = {
        canHandle: (i) =>
          i.type === 'message.send' &&
          Array.isArray((i.payload as { delivery?: { channels?: unknown } }).delivery?.channels) &&
          (
            (i.payload as { delivery?: { channels?: string[] } }).delivery?.channels ?? []
          ).includes('web_push'),
        send: async (intent) => {
          pushCaptured.push(intent);
          return {};
        },
      };

      const port = createDefaultDispatchPort({ adapters: [tgAdapter, webPushAdapter] });

      await port.dispatchOutgoing({
        type: 'message.send',
        meta: { eventId: 's11-prod-push', occurredAt: NOW, source: 'web_push' },
        payload: {
          recipient: { pushUserId: 'prod-user-id-999' },
          message: { text: 'New message from doctor.' },
          delivery: { channels: ['web_push'], maxAttempts: 1 },
        },
      });

      // In prod: web_push adapter handles it, NOT telegram.
      expect(tgCaptured).toHaveLength(0);
      expect(pushCaptured).toHaveLength(1);
      const recipient = (pushCaptured[0]!.payload as { recipient: Record<string, unknown> }).recipient;
      // Real pushUserId reaches adapter in prod.
      expect(recipient.pushUserId).toBe('prod-user-id-999');
    });
  });
});
