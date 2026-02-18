import { describe, it, expect } from 'vitest';
import { buildApp } from '../app.js';

// POST /webhook/telegram должен возвращать 200 и { ok: true }
describe('POST /webhook/telegram', () => {
  it('should return 200 and { ok: true }', async () => {
    const app = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/webhook/telegram',
      payload: { test: 'data' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
  });
});
