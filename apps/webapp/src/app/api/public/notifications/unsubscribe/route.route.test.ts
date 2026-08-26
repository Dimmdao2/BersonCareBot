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

  it('returns the same non-cacheable response for existing and unknown recipients with one signed topic', async () => {
    const signedTopic = { topicCode: 'patient_news', topicTitle: 'Новости и уведомления' };
    fakes.unsubscribeByToken
      .mockResolvedValueOnce({ applied: true, ...signedTopic })
      .mockResolvedValueOnce({ applied: true, ...signedTopic });

    const applied = await GET(
      new Request('https://example.test/api/public/notifications/unsubscribe?token=ok'),
    );
    const unknown = await GET(
      new Request('https://example.test/api/public/notifications/unsubscribe?token=unknown'),
    );

    expect(applied.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(await applied.text()).toBe(await unknown.text());
    expect(applied.headers.get('cache-control')).toBe('no-store');
    expect(applied.headers.get('referrer-policy')).toBe('no-referrer');
  });

  it('does not claim that settings changed when the unsubscribe write fails', async () => {
    fakes.unsubscribeByToken.mockResolvedValue({
      applied: false,
      topicCode: null,
      topicTitle: null,
    });

    const response = await GET(
      new Request('https://example.test/api/public/notifications/unsubscribe?token=failed'),
    );
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('Настройки уведомлений не изменены');
    expect(html).not.toContain('Настройки уведомлений обновлены');
  });
});
