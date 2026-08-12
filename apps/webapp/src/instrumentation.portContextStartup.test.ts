import { afterEach, describe, expect, it, vi } from 'vitest';
import { register } from './instrumentation';

describe('webapp port-context startup database gate', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('starts with only the two target mTLS URLs and no legacy DATABASE_URL', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('ALLOW_DEV_AUTH_BYPASS', 'false');
    vi.stubEnv('npm_lifecycle_event', 'start');
    vi.stubEnv('NEXT_RUNTIME', 'edge');
    vi.stubEnv('DB_PRINCIPAL_CONTEXT_MODE', 'port-context');
    vi.stubEnv('DATABASE_URL', '');
    vi.stubEnv('DATABASE_URL_STAFF', 'postgresql://staff@example.test/app');
    vi.stubEnv('DATABASE_URL_PATIENT', 'postgresql://patient@example.test/app');
    vi.stubEnv('DATABASE_URL_GLOBAL_ADMIN', 'postgresql://global-admin@example.test/app');

    await expect(register()).resolves.toBeUndefined();
  });

  it('fails production startup when either target mTLS URL is absent', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('ALLOW_DEV_AUTH_BYPASS', 'false');
    vi.stubEnv('npm_lifecycle_event', 'start');
    vi.stubEnv('NEXT_RUNTIME', 'edge');
    vi.stubEnv('DB_PRINCIPAL_CONTEXT_MODE', 'port-context');
    vi.stubEnv('DATABASE_URL', 'postgresql://legacy-must-not-mask-target@example.test/app');
    vi.stubEnv('DATABASE_URL_STAFF', 'postgresql://staff@example.test/app');
    vi.stubEnv('DATABASE_URL_PATIENT', '');
    vi.stubEnv('DATABASE_URL_GLOBAL_ADMIN', 'postgresql://global-admin@example.test/app');

    await expect(register()).rejects.toThrow('DATABASE_URL_STAFF, DATABASE_URL_PATIENT and DATABASE_URL_GLOBAL_ADMIN');
  });
});
