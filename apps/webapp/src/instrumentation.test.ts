import { beforeEach, describe, expect, it, vi } from 'vitest';

const { runtimeEnv } = vi.hoisted(() => ({
  runtimeEnv: {
    NODE_ENV: 'development' as 'development' | 'test' | 'production',
    ALLOW_DEV_AUTH_BYPASS: false,
  },
}));

vi.mock('@/config/env', () => ({ env: runtimeEnv }));

import { register } from './instrumentation';

describe('webapp startup auth configuration', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    runtimeEnv.NODE_ENV = 'development';
    runtimeEnv.ALLOW_DEV_AUTH_BYPASS = false;
  });

  it('fails startup when production has the dev auth bypass enabled', () => {
    runtimeEnv.NODE_ENV = 'production';
    runtimeEnv.ALLOW_DEV_AUTH_BYPASS = true;
    vi.stubEnv('DATABASE_URL', 'postgresql://example.invalid/db');
    vi.stubEnv('npm_lifecycle_event', 'start');

    expect(() => register()).toThrow(/cannot be enabled in production/);
  });

  it('allows production startup with the bypass disabled', () => {
    runtimeEnv.NODE_ENV = 'production';
    vi.stubEnv('DATABASE_URL', 'postgresql://example.invalid/db');
    vi.stubEnv('npm_lifecycle_event', 'start');

    expect(() => register()).not.toThrow();
  });

  it('allows the explicitly enabled development configuration', () => {
    runtimeEnv.NODE_ENV = 'development';
    runtimeEnv.ALLOW_DEV_AUTH_BYPASS = true;

    expect(() => register()).not.toThrow();
  });
});
