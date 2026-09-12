import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SURFACE_AUTH_POLICY_CONFIG, type ResolvedSurface } from '@/shared/lib/surface/requestSurface';

const fakes = vi.hoisted(() => ({ getResolvedSurface: vi.fn() }));

vi.mock('@/shared/lib/surface/requestSurface.server', () => ({
  getResolvedSurface: fakes.getResolvedSurface,
}));

import { GET } from './route';

describe('GET /manifest-admin.webmanifest', () => {
  it('serves the admin manifest on the platform-admin surface', async () => {
    const resolved: ResolvedSurface = {
      surface: 'platform_admin',
      publicOrigin: 'https://admin.staff.example.test',
      authPolicy: DEFAULT_SURFACE_AUTH_POLICY_CONFIG.platform_admin,
    };
    fakes.getResolvedSurface.mockResolvedValue(resolved);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/manifest+json');
    await expect(response.json()).resolves.toMatchObject({
      id: '/app-admin',
      scope: '/app',
      start_url: '/app/admin',
      icons: [
        expect.objectContaining({ src: '/admin-pwa-icon-192.png', purpose: 'any' }),
        expect.objectContaining({ src: '/admin-pwa-icon-512.png', purpose: 'any' }),
        expect.objectContaining({ src: '/admin-pwa-icon-maskable-512.png', purpose: 'maskable' }),
      ],
    });
  });

  it.each(['staff', 'patient_default'] as const)(
    'returns 404 on the %s surface (this door belongs to platform-admin only)',
    async (surface) => {
      fakes.getResolvedSurface.mockResolvedValue({
        surface,
        publicOrigin: 'https://example.test',
        authPolicy: DEFAULT_SURFACE_AUTH_POLICY_CONFIG[surface === 'staff' ? 'staff' : 'patient'],
      } as ResolvedSurface);

      const response = await GET();

      expect(response.status).toBe(404);
    },
  );
});
