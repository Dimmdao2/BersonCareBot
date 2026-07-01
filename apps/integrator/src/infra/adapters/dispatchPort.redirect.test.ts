/**
 * PER-CHANNEL PRE-FORK REDIRECT — channel-coverage + D7 safety tests (Q-A rework).
 *
 * Supersedes the S11 "collapse-everything-to-telegram" proof. The dev redirect now
 * redirects each intent to the TEST USER's binding FOR ITS OWN CHANNEL (channel
 * PRESERVED), and SUPPRESSES channels with no binding. This file is the audit
 * evidence that:
 *
 *   (a) PER-CHANNEL: for channel ∈ { telegram, max, smsc, email, web_push } a
 *       real-looking recipient is REWRITTEN to the test user's binding for THAT
 *       channel, and the intent reaches THAT channel's own adapter (not collapsed).
 *   (b) D7 (no real recipient leaks): the outbound recipient object that reaches
 *       any adapter contains ONLY the test user's id field(s) for that channel —
 *       no real chatId/userId/phoneNormalized/email/pushUserId from the original
 *       intent can survive.
 *   (c) SUPPRESS-D7: when the test user has NO binding for a channel, NO adapter is
 *       ever reached (no-op success) — never a real client, never a different person.
 *   (d) PRODUCTION: redirect inactive → real recipients pass through to their own
 *       channel adapter unchanged.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { DeliveryAdapter, OutgoingIntent } from '../../kernel/contracts/index.js';
import { createDefaultDispatchPort } from './dispatchPort.js';
import { _resetDevRedirectActiveCache } from '../../shared/devDeliveryRedirect.js';

// ─── Дмитрий per-channel targets (set via env, deterministic) ──────────────────

const TG_TARGET = 7924656602;
const MAX_TARGET = 207278131;
const PHONE_TARGET = '+79189000782';
const EMAIL_TARGET = 'dimmdao@yandex.ru';
const PUSH_TARGET = '1c312a64-fab8-4b75-b24e-88a1d6ebe4e0';
const NOW = '2026-06-17T00:00:00.000Z';

// ─── Adapter factories ─────────────────────────────────────────────────────────

/** Capture adapter for one channel (matches delivery.channels[0]). */
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
    send: async (intent) => {
      captured.push(intent);
      return {};
    },
  };
  return { adapter, captured };
}

/** Adapter that throws if reached — for "must not be called" assertions. */
function buildForbiddenAdapter(
  name: string,
  channel: string,
): { adapter: DeliveryAdapter; sendSpy: ReturnType<typeof vi.fn> } {
  const sendSpy = vi.fn(async () => {
    throw new Error(`${name} adapter send() should NOT be called`);
  });
  const adapter: DeliveryAdapter = {
    canHandle: (intent) =>
      intent.type === 'message.send' &&
      Array.isArray((intent.payload as { delivery?: { channels?: unknown } }).delivery?.channels) &&
      ((intent.payload as { delivery?: { channels?: string[] } }).delivery?.channels ?? []).includes(channel),
    send: sendSpy,
  };
  return { adapter, sendSpy };
}

// ─── Env helpers ──────────────────────────────────────────────────────────────

function activateRedirectWithTargets() {
  process.env.NODE_ENV = 'production'; // avoid implicit test-env activation
  process.env.DEV_DELIVERY_REDIRECT = '1';
  process.env.DEV_REDIRECT_TELEGRAM_CHAT_ID = String(TG_TARGET);
  process.env.DEV_REDIRECT_MAX_USER_ID = String(MAX_TARGET);
  process.env.DEV_REDIRECT_PHONE = PHONE_TARGET;
  process.env.DEV_REDIRECT_EMAIL = EMAIL_TARGET;
  process.env.DEV_REDIRECT_WEB_PUSH_USER_ID = PUSH_TARGET;
  delete process.env.DEV_REDIRECT_DISABLE_DEFAULTS;
  _resetDevRedirectActiveCache();
}

function restoreEnv() {
  process.env.NODE_ENV = 'test';
  delete process.env.DEV_DELIVERY_REDIRECT;
  delete process.env.DEV_REDIRECT_TELEGRAM_CHAT_ID;
  delete process.env.DEV_REDIRECT_MAX_USER_ID;
  delete process.env.DEV_REDIRECT_PHONE;
  delete process.env.DEV_REDIRECT_EMAIL;
  delete process.env.DEV_REDIRECT_WEB_PUSH_USER_ID;
  delete process.env.DEV_REDIRECT_DISABLE_DEFAULTS;
  delete process.env.DEV_DELIVERY_REDIRECT_CHAT_ID;
  delete process.env.TELEGRAM_ADMIN_ID;
  delete process.env.DEV_REDIRECT_PASSTHROUGH_TELEGRAM;
  delete process.env.DEV_REDIRECT_PASSTHROUGH_MAX;
  delete process.env.DEV_REDIRECT_PASSTHROUGH_PHONES;
  delete process.env.DEV_REDIRECT_PASSTHROUGH_EMAILS;
  delete process.env.DEV_REDIRECT_PASSTHROUGH_WEB_PUSH;
  _resetDevRedirectActiveCache();
}

// ─── Per-channel test cases ────────────────────────────────────────────────────

type ChannelCase = {
  channel: string;
  wireChannel: string; // delivery.channels[0] after redirect
  source: string;
  description: string;
  intent: (eventId: string) => OutgoingIntent;
  /** The recipient field(s) that the test user's binding produces. */
  expectedRecipient: Record<string, unknown>;
  /** Real recipient fields from the original intent that must NOT survive. */
  realFieldsThatMustNotLeak: string[];
};

const CHANNEL_CASES: ChannelCase[] = [
  {
    channel: 'telegram',
    wireChannel: 'telegram',
    source: 'telegram',
    description: 'telegram — real chatId → his telegram chat',
    intent: (eventId) => ({
      type: 'message.send',
      meta: { eventId, occurredAt: NOW, source: 'telegram' },
      payload: {
        recipient: { chatId: 999111222 },
        message: { text: 'Telegram message to real patient' },
        delivery: { channels: ['telegram'], maxAttempts: 1 },
      },
    }),
    expectedRecipient: { chatId: TG_TARGET },
    realFieldsThatMustNotLeak: [],
  },
  {
    channel: 'max',
    wireChannel: 'max',
    source: 'max',
    description: 'max — real userId → his MAX id',
    intent: (eventId) => ({
      type: 'message.send',
      meta: { eventId, occurredAt: NOW, source: 'max' },
      payload: {
        recipient: { userId: 8877665544, chatId: 8877665544 },
        message: { text: 'MAX message to real patient' },
        delivery: { channels: ['max'], maxAttempts: 1 },
      },
    }),
    expectedRecipient: { userId: MAX_TARGET, chatId: MAX_TARGET },
    realFieldsThatMustNotLeak: [],
  },
  {
    channel: 'smsc',
    wireChannel: 'smsc',
    source: 'smsc',
    description: 'smsc — real phoneNormalized → his phone',
    intent: (eventId) => ({
      type: 'message.send',
      meta: { eventId, occurredAt: NOW, source: 'smsc' },
      payload: {
        recipient: { phoneNormalized: '+79991234567' },
        message: { text: 'SMS code: 123456' },
        delivery: { channels: ['smsc'], maxAttempts: 1 },
      },
    }),
    expectedRecipient: { phoneNormalized: PHONE_TARGET },
    realFieldsThatMustNotLeak: [],
  },
  {
    channel: 'email',
    wireChannel: 'email',
    source: 'email',
    description: 'email — real recipient.email → his email',
    intent: (eventId) => ({
      type: 'message.send',
      meta: { eventId, occurredAt: NOW, source: 'email' },
      payload: {
        recipient: { email: 'real.patient@example.com' },
        subject: 'Appointment Reminder',
        message: { text: 'Your appointment is tomorrow at 10:00.' },
        delivery: { channels: ['email'], maxAttempts: 1 },
      },
    }),
    expectedRecipient: { email: EMAIL_TARGET },
    realFieldsThatMustNotLeak: ['chatId', 'pushUserId', 'phoneNormalized'],
  },
  {
    channel: 'web_push',
    wireChannel: 'web_push',
    source: 'web_push',
    description: 'web_push — real pushUserId → his pushUserId',
    intent: (eventId) => ({
      type: 'message.send',
      meta: { eventId, occurredAt: NOW, source: 'web_push' },
      payload: {
        recipient: { pushUserId: 'real-webapp-user-id-42' },
        message: { text: 'You have a new message from your doctor.' },
        delivery: { channels: ['web_push'], maxAttempts: 1 },
      },
    }),
    expectedRecipient: { pushUserId: PUSH_TARGET },
    realFieldsThatMustNotLeak: ['chatId', 'email', 'phoneNormalized'],
  },
];

// ─── Main test suite ──────────────────────────────────────────────────────────

describe('PER-CHANNEL PRE-FORK REDIRECT: each channel → Дмитрий, channel preserved', () => {
  beforeEach(() => {
    activateRedirectWithTargets();
  });

  afterEach(() => {
    restoreEnv();
    vi.restoreAllMocks();
  });

  // (a) PRE_FORK_DEV_DELIVERY_REDIRECT is logged; the channel's OWN adapter is reached.

  it.each(CHANNEL_CASES)(
    '(a) channel=$channel: logs redirect and routes to its own ($wireChannel) adapter',
    async ({ channel, wireChannel, intent }) => {
      const target = buildChannelCaptureAdapter(wireChannel);

      const port = createDefaultDispatchPort({ adapters: [target.adapter] });

      const { logger } = await import('../observability/logger.js');
      const warnSpy = vi.spyOn(logger, 'warn');

      await port.dispatchOutgoing(intent(`pc-a-${channel}`));

      const redirectLogs = warnSpy.mock.calls.filter(
        (args) => typeof args[1] === 'string' && args[1] === 'PRE_FORK_DEV_DELIVERY_REDIRECT',
      );
      expect(redirectLogs.length, `redirect log for ${channel}`).toBeGreaterThan(0);

      expect(target.captured, `own adapter reached for ${channel}`).toHaveLength(1);
    },
  );

  // (b) Outbound recipient equals the test user's binding for that channel; channel preserved.

  it.each(CHANNEL_CASES)(
    '(b) channel=$channel: recipient rewritten to Дмитрий binding; channel preserved',
    async ({ channel, wireChannel, expectedRecipient, intent }) => {
      const target = buildChannelCaptureAdapter(wireChannel);
      const port = createDefaultDispatchPort({ adapters: [target.adapter] });

      await port.dispatchOutgoing(intent(`pc-b-${channel}`));

      expect(target.captured).toHaveLength(1);
      const payload = target.captured[0]!.payload as {
        recipient: Record<string, unknown>;
        delivery: { channels: string[] };
      };
      expect(payload.recipient).toEqual(expectedRecipient);
      expect(payload.delivery.channels).toEqual([wireChannel]);
    },
  );

  // (c) D7: no real recipient field reaches the adapter.

  it.each(CHANNEL_CASES)(
    '(c) D7 channel=$channel: no real recipient field reaches adapter.send()',
    async ({ channel, wireChannel, realFieldsThatMustNotLeak, intent }) => {
      const target = buildChannelCaptureAdapter(wireChannel);
      const port = createDefaultDispatchPort({ adapters: [target.adapter] });

      await port.dispatchOutgoing(intent(`pc-c-${channel}`));

      expect(target.captured).toHaveLength(1);
      const recipient = (target.captured[0]!.payload as { recipient: Record<string, unknown> }).recipient;

      for (const field of realFieldsThatMustNotLeak) {
        expect(recipient, `recipient.${field} must be absent for ${channel}`).not.toHaveProperty(field);
      }
    },
  );

  // (d) D7 cross-adapter: even if ALL channel adapters are registered, only the right one runs.

  it('D7: with all 5 adapters registered, an email intent reaches ONLY the email adapter', async () => {
    const tg = buildForbiddenAdapter('telegram', 'telegram');
    const max = buildForbiddenAdapter('max', 'max');
    const sms = buildForbiddenAdapter('smsc', 'smsc');
    const push = buildForbiddenAdapter('web_push', 'web_push');
    const email = buildChannelCaptureAdapter('email');

    const port = createDefaultDispatchPort({
      adapters: [tg.adapter, max.adapter, sms.adapter, push.adapter, email.adapter],
    });

    await port.dispatchOutgoing({
      type: 'message.send',
      meta: { eventId: 'pc-d-email', occurredAt: NOW, source: 'email' },
      payload: {
        recipient: { email: 'real.patient@clinic.example.com' },
        subject: 'S',
        message: { text: 'B' },
        delivery: { channels: ['email'], maxAttempts: 1 },
      },
    });

    expect(email.captured).toHaveLength(1);
    expect(tg.sendSpy).not.toHaveBeenCalled();
    expect(max.sendSpy).not.toHaveBeenCalled();
    expect(sms.sendSpy).not.toHaveBeenCalled();
    expect(push.sendSpy).not.toHaveBeenCalled();
    expect((email.captured[0]!.payload as { recipient: Record<string, unknown> }).recipient.email).toBe(
      EMAIL_TARGET,
    );
  });
});

// ─── SUPPRESS-D7: missing binding → no adapter reached ─────────────────────────

describe('SUPPRESS-D7: a channel with no binding never reaches an adapter', () => {
  beforeEach(() => {
    // Disable defaults; configure ONLY telegram. All other channels have no binding.
    process.env.NODE_ENV = 'production';
    process.env.DEV_DELIVERY_REDIRECT = '1';
    process.env.DEV_REDIRECT_DISABLE_DEFAULTS = '1';
    process.env.DEV_REDIRECT_TELEGRAM_CHAT_ID = String(TG_TARGET);
    delete process.env.DEV_REDIRECT_EMAIL;
    delete process.env.DEV_REDIRECT_PHONE;
    delete process.env.DEV_REDIRECT_WEB_PUSH_USER_ID;
    delete process.env.DEV_REDIRECT_MAX_USER_ID;
    _resetDevRedirectActiveCache();
  });

  afterEach(() => {
    restoreEnv();
  });

  it.each([
    { channel: 'email', source: 'email', recipient: { email: 'real@example.com' } },
    { channel: 'smsc', source: 'smsc', recipient: { phoneNormalized: '+79991234567' } },
    { channel: 'web_push', source: 'web_push', recipient: { pushUserId: 'real-user-1' } },
    { channel: 'max', source: 'max', recipient: { userId: 42, chatId: 42 } },
  ])('channel=$channel with no binding → no-op success, adapter never called', async ({ channel, source, recipient }) => {
    const forbidden = buildForbiddenAdapter(channel, channel);
    const port = createDefaultDispatchPort({ adapters: [forbidden.adapter] });

    await expect(
      port.dispatchOutgoing({
        type: 'message.send',
        meta: { eventId: `sup-${channel}`, occurredAt: NOW, source },
        payload: {
          recipient,
          message: { text: 'must be suppressed' },
          delivery: { channels: [channel], maxAttempts: 1 },
        },
      }),
    ).resolves.toEqual({});

    expect(forbidden.sendSpy).not.toHaveBeenCalled();
  });
});

// ─── Production: redirect inactive, real recipients pass through ───────────────

describe('PRODUCTION: redirect inactive — real recipients pass through to own channel', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'production';
    delete process.env.DEV_DELIVERY_REDIRECT;
    _resetDevRedirectActiveCache();
  });

  afterEach(() => {
    restoreEnv();
  });

  it('production: email intent reaches email adapter with the REAL recipient.email', async () => {
    const email = buildChannelCaptureAdapter('email');
    const port = createDefaultDispatchPort({ adapters: [email.adapter] });

    await port.dispatchOutgoing({
      type: 'message.send',
      meta: { eventId: 'prod-email', occurredAt: NOW, source: 'email' },
      payload: {
        recipient: { email: 'prod.patient@example.com' },
        subject: 'Your appointment',
        message: { text: 'Appointment confirmed.' },
        delivery: { channels: ['email'], maxAttempts: 1 },
      },
    });

    expect(email.captured).toHaveLength(1);
    expect((email.captured[0]!.payload as { recipient: Record<string, unknown> }).recipient.email).toBe(
      'prod.patient@example.com',
    );
  });

  it('production: web_push intent reaches web_push adapter with the REAL pushUserId', async () => {
    const push = buildChannelCaptureAdapter('web_push');
    const port = createDefaultDispatchPort({ adapters: [push.adapter] });

    await port.dispatchOutgoing({
      type: 'message.send',
      meta: { eventId: 'prod-push', occurredAt: NOW, source: 'web_push' },
      payload: {
        recipient: { pushUserId: 'prod-user-id-999' },
        message: { text: 'New message from doctor.' },
        delivery: { channels: ['web_push'], maxAttempts: 1 },
      },
    });

    expect(push.captured).toHaveLength(1);
    expect((push.captured[0]!.payload as { recipient: Record<string, unknown> }).recipient.pushUserId).toBe(
      'prod-user-id-999',
    );
  });
});

// ─── PASSTHROUGH: allowlisted test accounts deliver UNCHANGED ───────────────────
//
// On a real-data test env we want a doctor↔patient conversation to flow to the
// PARTICIPANTS' OWN accounts (so chat/comments/OTP can be exercised in-vivo) while
// real clients stay protected. The env passthrough allowlist achieves exactly that:
// allowlisted recipients bypass the redirect; everyone else is still redirected.

describe('PASSTHROUGH: allowlisted accounts bypass redirect; everyone else still redirected', () => {
  // A SECOND test account (the admin), distinct from the single redirect target.
  const ADMIN_TG = 364943522;
  const ADMIN_PHONE = '+79643805480';

  beforeEach(() => {
    activateRedirectWithTargets();
    process.env.DEV_REDIRECT_PASSTHROUGH_TELEGRAM = `${ADMIN_TG},${TG_TARGET}`;
    process.env.DEV_REDIRECT_PASSTHROUGH_PHONES = `${ADMIN_PHONE},${PHONE_TARGET}`;
    _resetDevRedirectActiveCache();
  });

  afterEach(() => {
    restoreEnv();
    vi.restoreAllMocks();
  });

  it('telegram to an allowlisted account → delivered UNCHANGED (real chatId, no prefix), logs PASSTHROUGH not REDIRECT', async () => {
    const tg = buildChannelCaptureAdapter('telegram');
    const port = createDefaultDispatchPort({ adapters: [tg.adapter] });

    const { logger } = await import('../observability/logger.js');
    const warnSpy = vi.spyOn(logger, 'warn');

    await port.dispatchOutgoing({
      type: 'message.send',
      meta: { eventId: 'pass-tg', occurredAt: NOW, source: 'telegram' },
      payload: {
        recipient: { chatId: ADMIN_TG },
        message: { text: 'Hello admin' },
        delivery: { channels: ['telegram'], maxAttempts: 1 },
      },
    });

    expect(tg.captured).toHaveLength(1);
    const payload = tg.captured[0]!.payload as {
      recipient: Record<string, unknown>;
      message: { text: string };
    };
    // Delivered to the REAL allowlisted recipient — NOT collapsed to the redirect target.
    expect(payload.recipient).toEqual({ chatId: ADMIN_TG });
    // No dev prefix prepended.
    expect(payload.message.text).toBe('Hello admin');

    const passLogs = warnSpy.mock.calls.filter((a) => a[1] === 'PRE_FORK_DEV_DELIVERY_PASSTHROUGH');
    const redirectLogs = warnSpy.mock.calls.filter((a) => a[1] === 'PRE_FORK_DEV_DELIVERY_REDIRECT');
    expect(passLogs.length, 'PASSTHROUGH logged').toBeGreaterThan(0);
    expect(redirectLogs.length, 'REDIRECT NOT logged for passthrough').toBe(0);
  });

  it('telegram to a NON-allowlisted (real client) → STILL redirected to the test target', async () => {
    const tg = buildChannelCaptureAdapter('telegram');
    const port = createDefaultDispatchPort({ adapters: [tg.adapter] });

    await port.dispatchOutgoing({
      type: 'message.send',
      meta: { eventId: 'pass-tg-client', occurredAt: NOW, source: 'telegram' },
      payload: {
        recipient: { chatId: 999111222 },
        message: { text: 'Hello real patient' },
        delivery: { channels: ['telegram'], maxAttempts: 1 },
      },
    });

    const recipient = (tg.captured[0]!.payload as { recipient: Record<string, unknown> }).recipient;
    expect(recipient).toEqual({ chatId: TG_TARGET });
  });

  it('sms: allowlisted phone passes through; an unknown phone is redirected', async () => {
    const sms = buildChannelCaptureAdapter('smsc');
    const port = createDefaultDispatchPort({ adapters: [sms.adapter] });

    await port.dispatchOutgoing({
      type: 'message.send',
      meta: { eventId: 'pass-sms-ok', occurredAt: NOW, source: 'smsc' },
      payload: {
        recipient: { phoneNormalized: ADMIN_PHONE },
        message: { text: 'code 1' },
        delivery: { channels: ['smsc'], maxAttempts: 1 },
      },
    });
    await port.dispatchOutgoing({
      type: 'message.send',
      meta: { eventId: 'pass-sms-client', occurredAt: NOW, source: 'smsc' },
      payload: {
        recipient: { phoneNormalized: '+79991234567' },
        message: { text: 'code 2' },
        delivery: { channels: ['smsc'], maxAttempts: 1 },
      },
    });

    expect(sms.captured).toHaveLength(2);
    const r0 = (sms.captured[0]!.payload as { recipient: Record<string, unknown> }).recipient;
    const r1 = (sms.captured[1]!.payload as { recipient: Record<string, unknown> }).recipient;
    expect(r0.phoneNormalized, 'allowlisted phone passes through').toBe(ADMIN_PHONE);
    expect(r1.phoneNormalized, 'unknown phone redirected').toBe(PHONE_TARGET);
  });

  it('empty allowlist (default) → an account is NOT passed through (collapse-safe)', async () => {
    delete process.env.DEV_REDIRECT_PASSTHROUGH_TELEGRAM;
    delete process.env.DEV_REDIRECT_PASSTHROUGH_PHONES;
    const tg = buildChannelCaptureAdapter('telegram');
    const port = createDefaultDispatchPort({ adapters: [tg.adapter] });

    await port.dispatchOutgoing({
      type: 'message.send',
      meta: { eventId: 'pass-empty', occurredAt: NOW, source: 'telegram' },
      payload: {
        recipient: { chatId: ADMIN_TG },
        message: { text: 'Hello admin' },
        delivery: { channels: ['telegram'], maxAttempts: 1 },
      },
    });

    const recipient = (tg.captured[0]!.payload as { recipient: Record<string, unknown> }).recipient;
    expect(recipient, 'no passthrough env → collapsed to redirect target').toEqual({ chatId: TG_TARGET });
  });
});
