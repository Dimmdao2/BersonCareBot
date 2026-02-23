import { buildApp } from './server.js';
import { describe, it, expect, vi } from 'vitest';

vi.mock('../db/client.js', () => ({
  healthCheckDb: () => Promise.resolve(true),
}));

describe('GET /health', () => {
  it('should return ok: true and db="up"', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/health',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, db: 'up' });
  });
});
