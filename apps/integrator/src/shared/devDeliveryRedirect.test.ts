/**
 * Tests for the dev-mode delivery redirect engine helpers.
 *
 * These helpers are the low-level primitives used by dispatchPort's
 * applyPreForkDevRedirect() — the single authoritative redirect chokepoint.
 *
 * Safety assertions:
 * (a) isDevRedirectActive() is true in non-production, false in production.
 * (b) buildDevPrefix / hasDevPrefix work correctly.
 * (c) getDevRedirectChatId() resolves env vars in the right priority order.
 * (d) resolveDevRedirect() returns the PER-CHANNEL target (Q-A): each channel maps
 *     to the test user's binding for THAT channel, channel preserved; a missing
 *     binding → SUPPRESS.
 *
 * Per-channel integration tests (Telegram client, MAX, email, SMS) have been
 * removed — those layers no longer contain redirect logic. The dispatchPort
 * pre-fork tests live in dispatchPort.test.ts.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  _resetDevRedirectActiveCache,
  buildDevPrefix,
  getDevRedirectChatId,
  getDevRedirectTargets,
  hasDevPrefix,
  isDevRedirectActive,
  normalizeRedirectChannel,
  resolveDevRedirect,
} from './devDeliveryRedirect.js';

// Дмитрий defaults (resolved from dev DB 2026-06-17).
const DMITRY = {
  telegramChatId: 7924656602,
  maxUserId: 207278131,
  phone: '+79189000782',
  email: 'dimmdao@yandex.ru',
  webPushUserId: '1c312a64-fab8-4b75-b24e-88a1d6ebe4e0',
} as const;

// All redirect-target env vars we manipulate, so we can clear them cleanly.
const REDIRECT_ENV_KEYS = [
  'DEV_DELIVERY_REDIRECT',
  'DEV_DELIVERY_REDIRECT_CHAT_ID',
  'DEV_REDIRECT_TELEGRAM_CHAT_ID',
  'DEV_REDIRECT_MAX_USER_ID',
  'DEV_REDIRECT_PHONE',
  'DEV_REDIRECT_EMAIL',
  'DEV_REDIRECT_WEB_PUSH_USER_ID',
  'DEV_REDIRECT_DISABLE_DEFAULTS',
  'TELEGRAM_ADMIN_ID',
] as const;

function clearRedirectEnv() {
  for (const key of REDIRECT_ENV_KEYS) delete process.env[key];
}

// ─── Setup / teardown ────────────────────────────────────────────────────────

beforeEach(() => {
  clearRedirectEnv();
  process.env.NODE_ENV = 'test';
  _resetDevRedirectActiveCache();
});

afterEach(() => {
  clearRedirectEnv();
  process.env.NODE_ENV = 'test';
  _resetDevRedirectActiveCache();
});

// ─── isDevRedirectActive ─────────────────────────────────────────────────────

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

// ─── buildDevPrefix / hasDevPrefix ───────────────────────────────────────────

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

// ─── getDevRedirectChatId ─────────────────────────────────────────────────────

describe('devDeliveryRedirect — getDevRedirectChatId', () => {
  it('returns DEV_REDIRECT_TELEGRAM_CHAT_ID when set (highest priority)', () => {
    process.env.DEV_REDIRECT_TELEGRAM_CHAT_ID = '55555';
    process.env.DEV_DELIVERY_REDIRECT_CHAT_ID = '66666';
    expect(getDevRedirectChatId()).toBe(55555);
  });

  it('returns legacy DEV_DELIVERY_REDIRECT_CHAT_ID when the new var is unset', () => {
    process.env.DEV_DELIVERY_REDIRECT_CHAT_ID = '55555';
    expect(getDevRedirectChatId()).toBe(55555);
  });

  it('falls back to TELEGRAM_ADMIN_ID when explicit chat-id vars are unset', () => {
    process.env.TELEGRAM_ADMIN_ID = '777777';
    expect(getDevRedirectChatId()).toBe(777777);
  });

  it('falls back to the Дмитрий default when no env vars are set', () => {
    expect(getDevRedirectChatId()).toBe(DMITRY.telegramChatId);
  });

  it('returns null when defaults are disabled and nothing is configured', () => {
    process.env.DEV_REDIRECT_DISABLE_DEFAULTS = '1';
    expect(getDevRedirectChatId()).toBeNull();
  });
});

// ─── normalizeRedirectChannel ─────────────────────────────────────────────────

describe('devDeliveryRedirect — normalizeRedirectChannel', () => {
  it('maps known channels', () => {
    expect(normalizeRedirectChannel('telegram')).toBe('telegram');
    expect(normalizeRedirectChannel('max')).toBe('max');
    expect(normalizeRedirectChannel('email')).toBe('email');
    expect(normalizeRedirectChannel('web_push')).toBe('web_push');
  });

  it('maps both sms and smsc to the sms target', () => {
    expect(normalizeRedirectChannel('sms')).toBe('sms');
    expect(normalizeRedirectChannel('smsc')).toBe('sms');
  });

  it('returns null for unknown / missing channels', () => {
    expect(normalizeRedirectChannel('whatsapp')).toBeNull();
    expect(normalizeRedirectChannel(null)).toBeNull();
    expect(normalizeRedirectChannel(undefined)).toBeNull();
  });
});

// ─── getDevRedirectTargets ────────────────────────────────────────────────────

describe('devDeliveryRedirect — getDevRedirectTargets', () => {
  it('defaults every channel to Дмитрий when no env set', () => {
    expect(getDevRedirectTargets()).toEqual({
      telegramChatId: DMITRY.telegramChatId,
      maxUserId: DMITRY.maxUserId,
      phone: DMITRY.phone,
      email: DMITRY.email,
      webPushUserId: DMITRY.webPushUserId,
    });
  });

  it('honours per-channel env overrides', () => {
    process.env.DEV_REDIRECT_TELEGRAM_CHAT_ID = '111';
    process.env.DEV_REDIRECT_MAX_USER_ID = '222';
    process.env.DEV_REDIRECT_PHONE = '+70000000000';
    process.env.DEV_REDIRECT_EMAIL = 'tester@example.com';
    process.env.DEV_REDIRECT_WEB_PUSH_USER_ID = 'user-xyz';
    expect(getDevRedirectTargets()).toEqual({
      telegramChatId: 111,
      maxUserId: 222,
      phone: '+70000000000',
      email: 'tester@example.com',
      webPushUserId: 'user-xyz',
    });
  });

  it('returns all-null when defaults disabled and nothing configured', () => {
    process.env.DEV_REDIRECT_DISABLE_DEFAULTS = '1';
    expect(getDevRedirectTargets()).toEqual({
      telegramChatId: null,
      maxUserId: null,
      phone: null,
      email: null,
      webPushUserId: null,
    });
  });
});

// ─── resolveDevRedirect (per-channel) ─────────────────────────────────────────

describe('devDeliveryRedirect — resolveDevRedirect: per-channel → Дмитрий', () => {
  it('telegram → his telegram chat id, channel preserved', () => {
    const out = resolveDevRedirect('telegram');
    expect(out.kind).toBe('redirect');
    if (out.kind !== 'redirect') return;
    expect(out.recipient).toEqual({ chatId: DMITRY.telegramChatId });
    expect(out.deliveryChannel).toBe('telegram');
  });

  it('max → his max user id (userId+chatId), channel preserved', () => {
    const out = resolveDevRedirect('max');
    expect(out.kind).toBe('redirect');
    if (out.kind !== 'redirect') return;
    expect(out.recipient).toEqual({ userId: DMITRY.maxUserId, chatId: DMITRY.maxUserId });
    expect(out.deliveryChannel).toBe('max');
  });

  it('sms → his phone, channel preserved as sms', () => {
    const out = resolveDevRedirect('sms');
    expect(out.kind).toBe('redirect');
    if (out.kind !== 'redirect') return;
    expect(out.recipient).toEqual({ phoneNormalized: DMITRY.phone });
    expect(out.deliveryChannel).toBe('sms');
  });

  it('smsc → his phone, channel preserved as smsc (adapter wire value)', () => {
    const out = resolveDevRedirect('smsc');
    expect(out.kind).toBe('redirect');
    if (out.kind !== 'redirect') return;
    expect(out.recipient).toEqual({ phoneNormalized: DMITRY.phone });
    expect(out.deliveryChannel).toBe('smsc');
  });

  it('email → his email, channel preserved', () => {
    const out = resolveDevRedirect('email');
    expect(out.kind).toBe('redirect');
    if (out.kind !== 'redirect') return;
    expect(out.recipient).toEqual({ email: DMITRY.email });
    expect(out.deliveryChannel).toBe('email');
  });

  it('web_push → his pushUserId (subscription resolved downstream), channel preserved', () => {
    const out = resolveDevRedirect('web_push');
    expect(out.kind).toBe('redirect');
    if (out.kind !== 'redirect') return;
    expect(out.recipient).toEqual({ pushUserId: DMITRY.webPushUserId });
    expect(out.deliveryChannel).toBe('web_push');
  });

  it('the redirected recipient contains ONLY that channel’s id field (no cross-channel leak)', () => {
    const tg = resolveDevRedirect('telegram');
    if (tg.kind !== 'redirect') throw new Error('expected redirect');
    expect(Object.keys(tg.recipient).sort()).toEqual(['chatId']);

    const email = resolveDevRedirect('email');
    if (email.kind !== 'redirect') throw new Error('expected redirect');
    expect(Object.keys(email.recipient)).toEqual(['email']);

    const push = resolveDevRedirect('web_push');
    if (push.kind !== 'redirect') throw new Error('expected redirect');
    expect(Object.keys(push.recipient)).toEqual(['pushUserId']);
  });
});

describe('devDeliveryRedirect — resolveDevRedirect: SUPPRESS when no binding', () => {
  it('unknown channel → suppress', () => {
    const out = resolveDevRedirect('whatsapp');
    expect(out.kind).toBe('suppress');
    if (out.kind !== 'suppress') return;
    expect(out.reason).toContain('unknown_channel');
  });

  it('null/undefined channel → suppress', () => {
    expect(resolveDevRedirect(null).kind).toBe('suppress');
    expect(resolveDevRedirect(undefined).kind).toBe('suppress');
  });

  it('email with no configured binding (defaults disabled) → suppress, never a fallback recipient', () => {
    process.env.DEV_REDIRECT_DISABLE_DEFAULTS = '1';
    // Configure ONLY telegram; every other channel must suppress.
    process.env.DEV_REDIRECT_TELEGRAM_CHAT_ID = '12345';

    const email = resolveDevRedirect('email');
    expect(email.kind).toBe('suppress');
    if (email.kind === 'suppress') expect(email.reason).toBe('no_email_binding');

    const sms = resolveDevRedirect('sms');
    expect(sms.kind).toBe('suppress');

    const push = resolveDevRedirect('web_push');
    expect(push.kind).toBe('suppress');

    const max = resolveDevRedirect('max');
    expect(max.kind).toBe('suppress');

    // The one configured channel still redirects.
    const tg = resolveDevRedirect('telegram');
    expect(tg.kind).toBe('redirect');
    if (tg.kind === 'redirect') expect(tg.recipient).toEqual({ chatId: 12345 });
  });
});
