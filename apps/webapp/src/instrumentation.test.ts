import { beforeEach, describe, expect, it, vi } from 'vitest';

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
