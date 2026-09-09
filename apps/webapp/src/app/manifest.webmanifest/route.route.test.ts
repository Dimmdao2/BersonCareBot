import { describe, expect, it, vi } from 'vitest';
import { PATIENT_DEFAULT_SURFACE, STAFF_SURFACE } from '@/config/productSurfaces';
import {
  DEFAULT_SURFACE_AUTH_POLICY_CONFIG,
  type ResolvedSurface,
} from '@/shared/lib/surface/requestSurface';

const fakes = vi.hoisted(() => ({ getResolvedSurface: vi.fn() }));

vi.mock('@/shared/lib/surface/requestSurface.server', () => ({
  getResolvedSurface: fakes.getResolvedSurface,
}));

import { GET } from './route';
import { GET as getStaffManifest } from '../manifest-staff.webmanifest/route';

describe('GET /manifest.webmanifest on the transitional shared Host', () => {
  it('returns 404 instead of throwing on the platform-admin surface', async () => {
    const resolved: ResolvedSurface = {
      surface: 'platform_admin',
      publicOrigin: 'https://admin.staff.example.test',
      authPolicy: DEFAULT_SURFACE_AUTH_POLICY_CONFIG.platform_admin,
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
        authPolicy: DEFAULT_SURFACE_AUTH_POLICY_CONFIG.staff,
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

describe('public PWA manifest handlers', () => {
  it('returns 404 from both handlers on the platform-admin surface', async () => {
    const resolved: ResolvedSurface = {
      surface: 'platform_admin',
      publicOrigin: 'https://admin.staff.example.test',
      authPolicy: DEFAULT_SURFACE_AUTH_POLICY_CONFIG.platform_admin,
    };
    fakes.getResolvedSurface.mockResolvedValue(resolved);

    await expect(GET()).resolves.toMatchObject({ status: 404 });
    await expect(getStaffManifest()).resolves.toMatchObject({ status: 404 });
  });

  it('keeps each valid public surface on its own manifest handler', async () => {
    fakes.getResolvedSurface.mockResolvedValue({
      surface: 'patient_default',
      publicOrigin: PATIENT_DEFAULT_SURFACE.origin,
      authPolicy: DEFAULT_SURFACE_AUTH_POLICY_CONFIG.patient,
    } satisfies ResolvedSurface);
    const patient = await GET();
    expect(patient.status).toBe(200);
    await expect(patient.json()).resolves.toMatchObject({
      id: '/app',
    });

    fakes.getResolvedSurface.mockResolvedValue({
      surface: 'staff',
      publicOrigin: STAFF_SURFACE.origin,
      authPolicy: DEFAULT_SURFACE_AUTH_POLICY_CONFIG.staff,
    } satisfies ResolvedSurface);
    const staff = await getStaffManifest();
    expect(staff.status).toBe(200);
    await expect(staff.json()).resolves.toMatchObject({
      id: '/app-staff',
    });
  });
});
