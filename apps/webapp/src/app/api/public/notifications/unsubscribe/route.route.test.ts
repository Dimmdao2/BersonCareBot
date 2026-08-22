import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  unsubscribeByToken: vi.fn(),
  stampBootstrapPrincipal: vi.fn(),
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({ topicUnsubscribe: { unsubscribeByToken: fakes.unsubscribeByToken } }),
}));
vi.mock('@/app-layer/principal/bootstrapPrincipal', () => ({
  stampBootstrapPrincipal: fakes.stampBootstrapPrincipal,
}));

import { GET } from './route';

describe('public topic unsubscribe response', () => {
  beforeEach(() => {
    fakes.unsubscribeByToken.mockReset();
    fakes.stampBootstrapPrincipal.mockReset();
  });

  it('returns the same non-cacheable response for applied and invalid/unknown recipients', async () => {
    fakes.unsubscribeByToken.mockResolvedValueOnce('applied').mockRejectedValueOnce(new Error('unknown'));

    const applied = await GET(new Request('https://example.test/api/public/notifications/unsubscribe?token=ok'));
    const unknown = await GET(new Request('https://example.test/api/public/notifications/unsubscribe?token=bad'));

    expect(applied.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(await applied.text()).toBe(await unknown.text());
    expect(applied.headers.get('cache-control')).toBe('no-store');
    expect(applied.headers.get('referrer-policy')).toBe('no-referrer');
  });
});
