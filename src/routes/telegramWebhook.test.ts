import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const OLD_SECRET = process.env.TG_WEBHOOK_SECRET;

async function makeApp() {
  vi.resetModules();
  const { buildApp } = await import('../app.js');
  return buildApp();
}

describe('POST /webhook/telegram', () => {
  afterEach(() => {
    if (OLD_SECRET === undefined) {
      delete process.env.TG_WEBHOOK_SECRET;
    } else {
      process.env.TG_WEBHOOK_SECRET = OLD_SECRET;
    }
  });

  it('returns 200 if no secret set', async () => {
    delete process.env.TG_WEBHOOK_SECRET;
    const app = await makeApp();

    const response = await app.inject({
      method: 'POST',
      url: '/webhook/telegram',
      payload: { test: 'data' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
  });

  it('returns 200 with correct secret', async () => {
    process.env.TG_WEBHOOK_SECRET = 'testsecret';
    const app = await makeApp();

    const response = await app.inject({
      method: 'POST',
      url: '/webhook/telegram',
      payload: { test: 'data' },
      headers: {
        'x-telegram-bot-api-secret-token': 'testsecret',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
  });

  it('returns 403 with wrong secret', async () => {
    process.env.TG_WEBHOOK_SECRET = 'testsecret';
    const app = await makeApp();

    const response = await app.inject({
      method: 'POST',
      url: '/webhook/telegram',
      payload: { test: 'data' },
      headers: {
        'x-telegram-bot-api-secret-token': 'wrong',
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ ok: false });
  });
});