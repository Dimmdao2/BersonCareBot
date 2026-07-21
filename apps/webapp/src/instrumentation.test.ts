import { beforeEach, describe, expect, it, vi } from 'vitest';

import { register } from './instrumentation';

describe('webapp startup auth configuration', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('ALLOW_DEV_AUTH_BYPASS', 'false');
  });

  it('fails startup when production has the dev auth bypass enabled', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('ALLOW_DEV_AUTH_BYPASS', 'true');
    vi.stubEnv('DATABASE_URL', 'postgresql://example.invalid/db');
    vi.stubEnv('npm_lifecycle_event', 'start');

    expect(() => register()).toThrow(/cannot be enabled in production/);
  });

  it('allows production startup with the bypass disabled', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DATABASE_URL', 'postgresql://example.invalid/db');
    vi.stubEnv('npm_lifecycle_event', 'start');

    expect(() => register()).not.toThrow();
  });

  it('allows the explicitly enabled development configuration', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('ALLOW_DEV_AUTH_BYPASS', 'true');

    expect(() => register()).not.toThrow();
  });
});
