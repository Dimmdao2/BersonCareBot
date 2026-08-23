import { describe, expect, it, vi } from 'vitest';
import { PATIENT_DEFAULT_SURFACE, STAFF_SURFACE } from '@/config/productSurfaces';
import type { ResolvedSurface } from '@/shared/lib/surface/requestSurface';

const fakes = vi.hoisted(() => ({ getResolvedSurface: vi.fn() }));

vi.mock('@/shared/lib/surface/requestSurface.server', () => ({
  getResolvedSurface: fakes.getResolvedSurface,
}));

import { GET } from './route';

describe('GET /manifest.webmanifest on the transitional shared Host', () => {
  it('returns 404 instead of throwing on the platform-admin surface', async () => {
    const resolved: ResolvedSurface = {
      surface: 'platform_admin',
      publicOrigin: 'https://admin.staff.example.test',
      authPolicy: 'platform_admin',
    };
    fakes.getResolvedSurface.mockResolvedValue(resolved);

    const response = await GET();

    expect(response.status).toBe(404);
  });

  it('keeps the installed patient PWA contract reachable while the resolver identifies staff', async () => {
    const patientOriginDescriptor = Object.getOwnPropertyDescriptor(
      PATIENT_DEFAULT_SURFACE,
      'origin',
    );
    if (!patientOriginDescriptor) throw new Error('patient_surface_origin_descriptor_missing');
    Object.defineProperty(PATIENT_DEFAULT_SURFACE, 'origin', {
      ...patientOriginDescriptor,
      value: STAFF_SURFACE.origin,
    });

    try {
      const resolved: ResolvedSurface = {
        surface: 'staff',
        publicOrigin: STAFF_SURFACE.origin,
        authPolicy: 'staff',
      };
      fakes.getResolvedSurface.mockResolvedValue(resolved);

      const response = await GET();

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        id: '/app',
        scope: '/app',
        start_url: '/app/patient',
      });
    } finally {
      Object.defineProperty(PATIENT_DEFAULT_SURFACE, 'origin', patientOriginDescriptor);
    }
  });
});
