import { buildApp } from '../app.js';
import { describe, it, expect } from 'vitest';

describe('GET /health', () => {
  it('should return ok: true', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/health',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });
});
