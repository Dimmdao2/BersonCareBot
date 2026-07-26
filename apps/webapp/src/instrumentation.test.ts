import { beforeEach, describe, expect, it, vi } from 'vitest';

// D1 (C-1, 2026-07-26) wiring coverage. `register()` only reaches the session-revocation schema
// guard when `NEXT_RUNTIME === 'nodejs'` (the documented Next.js pattern to exclude Node-only deps
// from the Edge build — see instrumentation.ts). Under Vitest that variable is unset, so without
// stubbing it below, this exact branch — and the assertSessionRevocationSchema/probe wiring inside
// it — never executes, in this file or anywhere else in the suite. `probeSessionRevocationColumn`
// is the one seam mocked out (it opens a real `pg` connection); `assertSessionRevocationSchema` and
// `SessionRevocationSchemaError` are left real via `importOriginal` so the actual wiring runs.
const { probeSessionRevocationColumnMock } = vi.hoisted(() => ({
  probeSessionRevocationColumnMock: vi.fn(),
}));

vi.mock('@/modules/auth/sessionRevocationSchema', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/modules/auth/sessionRevocationSchema')>();
  return {
    ...actual,
    probeSessionRevocationColumn: probeSessionRevocationColumnMock,
  };
});

// NEXT_RUNTIME === 'nodejs' also unlocks the error-tracking import below the schema guard in
// register(). Stubbed to a no-op so these tests stay hermetic and don't reach for a real DB pool.
vi.mock('@/app-layer/observability/errorTracking', () => ({
  initWebappErrorTracking: vi.fn(async () => {}),
  captureWebappRequestError: vi.fn(),
}));

import { register } from './instrumentation';

describe('webapp startup auth configuration', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('ALLOW_DEV_AUTH_BYPASS', 'false');
  });

  it('fails startup when production has the dev auth bypass enabled', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('ALLOW_DEV_AUTH_BYPASS', 'true');
    vi.stubEnv('DATABASE_URL', 'postgresql://example.invalid/db');
    vi.stubEnv('npm_lifecycle_event', 'start');

    await expect(register()).rejects.toThrow(/cannot be enabled in production/);
  });

  it('allows production startup with the bypass disabled', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DATABASE_URL', 'postgresql://example.invalid/db');
    vi.stubEnv('npm_lifecycle_event', 'start');

    await expect(register()).resolves.toBeUndefined();
  });

  it('allows the explicitly enabled development configuration', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('ALLOW_DEV_AUTH_BYPASS', 'true');

    await expect(register()).resolves.toBeUndefined();
  });
});

describe('webapp startup session-revocation schema guard (D1, C-1)', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('ALLOW_DEV_AUTH_BYPASS', 'false');
    vi.stubEnv('DATABASE_URL', 'postgresql://example.invalid/db');
    // The one env var that actually gates this branch — see the module-level comment above.
    vi.stubEnv('NEXT_RUNTIME', 'nodejs');
    probeSessionRevocationColumnMock.mockReset();
  });

  it('rejects startup, naming migration 0244, when the probe reports the column missing', async () => {
    probeSessionRevocationColumnMock.mockResolvedValue(false);

    await expect(register()).rejects.toThrow(/platform_users\.session_epoch is missing[\s\S]*0244/);
  });

  it('allows startup when the probe reports the column present', async () => {
    probeSessionRevocationColumnMock.mockResolvedValue(true);

    await expect(register()).resolves.toBeUndefined();
  });

  it('does not fail startup when the database is merely unreachable', async () => {
    // Same "unreachable is not fatal" behaviour sessionRevocationSchema.test.ts proves for the pure
    // function — asserted here again through the actual register() wiring, not just the function.
    probeSessionRevocationColumnMock.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(register()).resolves.toBeUndefined();
  });
});
