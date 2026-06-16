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
 *
 * Per-channel integration tests (Telegram client, MAX, email, SMS) have been
 * removed — those layers no longer contain redirect logic. The dispatchPort
 * pre-fork tests live in dispatchPort.test.ts.
 */

import { afterEach, describe, expect, it } from 'vitest';

import {
  _resetDevRedirectActiveCache,
  buildDevPrefix,
  getDevRedirectChatId,
  hasDevPrefix,
  isDevRedirectActive,
} from './devDeliveryRedirect.js';

// ─── Setup / teardown ────────────────────────────────────────────────────────

afterEach(() => {
  // Restore env to test defaults
  process.env.NODE_ENV = 'test';
  delete process.env.DEV_DELIVERY_REDIRECT;
  delete process.env.DEV_DELIVERY_REDIRECT_CHAT_ID;
  process.env.TELEGRAM_ADMIN_ID = '364943522';
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
  it('returns DEV_DELIVERY_REDIRECT_CHAT_ID when set', () => {
    process.env.DEV_DELIVERY_REDIRECT_CHAT_ID = '55555';
    expect(getDevRedirectChatId()).toBe(55555);
  });

  it('falls back to TELEGRAM_ADMIN_ID when DEV_DELIVERY_REDIRECT_CHAT_ID is unset', () => {
    delete process.env.DEV_DELIVERY_REDIRECT_CHAT_ID;
    process.env.TELEGRAM_ADMIN_ID = '777777';
    expect(getDevRedirectChatId()).toBe(777777);
  });

  it('falls back to hardcoded default when both env vars are absent', () => {
    delete process.env.DEV_DELIVERY_REDIRECT_CHAT_ID;
    delete process.env.TELEGRAM_ADMIN_ID;
    expect(getDevRedirectChatId()).toBe(364943522);
  });
});
