import { describe, expect, it, vi } from 'vitest';
import { GET } from './route';

vi.mock('@/modules/system-settings/supportContactUrl', () => ({
  getSupportContactUrl: vi.fn(async () => 'https://t.me/example_support'),
}));

describe('GET /api/public/support-contact-url', () => {
  it('returns configured support contact url', async () => {
    const res = await GET(new Request('http://localhost/api/public/support-contact-url'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, url: 'https://t.me/example_support' });
  });
});
