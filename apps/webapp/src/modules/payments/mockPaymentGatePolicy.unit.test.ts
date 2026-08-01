import { describe, expect, it, vi } from 'vitest';
import { isMockPaymentConfirmEnabled } from './mockPaymentGatePolicy';

describe('isMockPaymentConfirmEnabled', () => {
  it('is enabled in development', () => {
    expect(isMockPaymentConfirmEnabled({ nodeEnv: 'development', isTestEnv: false })).toBe(true);
  });

  it('is enabled in the automated-test runtime regardless of NODE_ENV', () => {
    expect(isMockPaymentConfirmEnabled({ nodeEnv: 'production', isTestEnv: true })).toBe(true);
    expect(isMockPaymentConfirmEnabled({ nodeEnv: 'test', isTestEnv: true })).toBe(true);
  });

  it('is disabled in production outside the test runtime', () => {
    expect(isMockPaymentConfirmEnabled({ nodeEnv: 'production', isTestEnv: false })).toBe(false);
  });

  it('is disabled for the "test" NODE_ENV value unless isTestEnv also says so', () => {
    // NODE_ENV=test alone does not enable it — only the app's own isTestEnv computation does
    // (isTestEnv also covers the VITEST_WORKER_ID case that NODE_ENV=test does not capture).
    expect(isMockPaymentConfirmEnabled({ nodeEnv: 'test', isTestEnv: false })).toBe(false);
  });
});

describe('NODE_ENV schema default (apps/webapp/src/config/env.ts)', () => {
  it('classifies a process with no NODE_ENV as development, which the mock gate treats as enabled', async () => {
    vi.resetModules();
    // Hermetic: never touch real .env files while probing the schema default.
    vi.doMock('dotenv', () => ({ config: vi.fn() }));
    const mutableEnv = process.env as Record<string, string | undefined>;
    const originalNodeEnv = mutableEnv.NODE_ENV;
    delete mutableEnv.NODE_ENV;
    try {
      const { env: freshEnv } = await import('@/config/env');
      expect(freshEnv.NODE_ENV).toBe('development');
      // Composed with the real predicate: an unset NODE_ENV is indistinguishable from explicit
      // development, so the gate is enabled by default rather than fail-closed on a missing value.
      expect(isMockPaymentConfirmEnabled({ nodeEnv: freshEnv.NODE_ENV, isTestEnv: false })).toBe(
        true,
      );
    } finally {
      mutableEnv.NODE_ENV = originalNodeEnv;
      vi.doUnmock('dotenv');
      vi.resetModules();
    }
  });
});
