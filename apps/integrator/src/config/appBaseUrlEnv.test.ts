import { afterEach, describe, expect, it, vi } from 'vitest';

const ORIGINAL_ENV = { ...process.env };

function setRequiredEnv(appBaseUrl?: string): void {
  process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:5432/test';
  process.env.BOOKING_URL = 'https://booking.example';
  if (appBaseUrl === undefined) delete process.env.APP_BASE_URL;
  else process.env.APP_BASE_URL = appBaseUrl;
}

describe('integrator APP_BASE_URL env contract', () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.resetModules();
  });

  it('exposes a validated deployment URL', async () => {
    setRequiredEnv('https://app.example');
    vi.resetModules();

    const { env } = await import('./env.js');

    expect(env.APP_BASE_URL).toBe('https://app.example');
  });

  it('fails fast when APP_BASE_URL is missing', async () => {
    setRequiredEnv();
    vi.resetModules();

    await expect(import('./env.js')).rejects.toThrow();
  });

  it('fails fast when APP_BASE_URL uses a non-HTTP protocol', async () => {
    setRequiredEnv('ftp://example.com');
    vi.resetModules();

    await expect(import('./env.js')).rejects.toThrow(
      'APP_BASE_URL must use the http or https protocol',
    );
  });

  it('removes the trailing slash from APP_BASE_URL', async () => {
    setRequiredEnv('https://x.ru/');
    vi.resetModules();

    const { env } = await import('./env.js');

    expect(env.APP_BASE_URL).toBe('https://x.ru');
  });
});
