import { Children, isValidElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RoleLoginPortal } from '@/modules/auth/roleLogin';

const mocks = vi.hoisted(() => ({
  getCurrentSession: vi.fn(),
  redirect: vi.fn((target: string): never => {
    throw new Error(`redirect:${target}`);
  }),
  buildPrefetchedPublicAuthConfig: vi.fn(),
  getPlatformEntry: vi.fn(),
  getMessengerSurfaceHint: vi.fn(),
  getUnsupportedClientFallbackEnabled: vi.fn(),
  getResolvedSurface: vi.fn(),
}));

vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({ auth: { getCurrentSession: mocks.getCurrentSession } }),
}));
vi.mock('@/modules/auth/appEntryClassification', () => ({
  classifyUnauthenticatedAppEntry: () => 'browser',
  shouldAllowStandaloneTokenExchange: () => false,
}));
vi.mock('@/modules/auth/publicAuthSnapshot', () => ({
  buildPrefetchedPublicAuthConfig: mocks.buildPrefetchedPublicAuthConfig,
}));
vi.mock('@/shared/lib/platformCookie.server', () => ({
  getPlatformEntry: mocks.getPlatformEntry,
  getMessengerSurfaceHint: mocks.getMessengerSurfaceHint,
}));
vi.mock('@/modules/auth/unsupportedClientFallback', () => ({
  getUnsupportedClientFallbackEnabled: mocks.getUnsupportedClientFallbackEnabled,
}));
vi.mock('@/shared/lib/surface/requestSurface.server', () => ({
  getResolvedSurface: mocks.getResolvedSurface,
}));
vi.mock('@/shared/lib/surface/requestSurface', () => ({
  surfaceDisplayName: (surface: { surface: string }) =>
    surface.surface === 'patient_default' ? 'Therapygo' : 'Therapysto',
}));
vi.mock('@/config/productSurfaces', () => ({
  STAFF_SURFACE: { name: 'Therapysto', origin: 'https://therapysto.example.test' },
  PATIENT_DEFAULT_SURFACE: { name: 'Therapygo', origin: 'https://therapygo.example.test' },
}));
vi.mock('@/shared/ui/patient/PatientAppShell', () => ({
  PatientAppShell: () => null,
}));
vi.mock('./AppEntryLoginContent', () => ({
  AppEntryLoginContent: () => null,
}));

import { AppEntryRsc } from './AppEntryRsc';

function loginContentProps(entry: Awaited<ReturnType<typeof AppEntryRsc>>) {
  const loginContent = Children.toArray(entry.props.children).find(
    (child) =>
      isValidElement(child) &&
      'roleLoginPortal' in (child.props as Record<string, unknown>),
  );
  if (!loginContent || !isValidElement(loginContent)) {
    throw new Error('app_entry_login_content_missing');
  }
  return loginContent.props as {
    roleLoginPortal: RoleLoginPortal | null;
    alternateRoleLoginHref: string | null;
    surfaceAuthPolicy: { availableMethods: string[]; enabledMethods: string[] };
  };
}

describe('AppEntryRsc role-login entry', () => {
  beforeEach(() => {
    mocks.redirect.mockClear();
    mocks.getCurrentSession.mockResolvedValue({ user: { role: 'doctor' } });
    mocks.buildPrefetchedPublicAuthConfig.mockResolvedValue(null);
    mocks.getPlatformEntry.mockResolvedValue(null);
    mocks.getMessengerSurfaceHint.mockResolvedValue(null);
    mocks.getUnsupportedClientFallbackEnabled.mockResolvedValue(false);
    mocks.getResolvedSurface.mockResolvedValue({
      surface: 'staff',
      publicOrigin: 'https://therapysto.example.test',
      authPolicy: { availableMethods: ['password'], enabledMethods: ['password'] },
    });
  });

  it.each([
    ['patient', '/app/doctor'],
    ['admin', '/app/doctor'],
  ] as const)(
    'sends an already signed-in doctor from the %s login door to their cabinet without denial feedback',
    async (roleLoginPortal: RoleLoginPortal, expectedTarget) => {
      await expect(
        AppEntryRsc({
          searchParams: Promise.resolve({}),
          routeBoundMessengerSurface: null,
          roleLoginPortal,
        }),
      ).rejects.toThrow(`redirect:${expectedTarget}`);

      expect(mocks.redirect).toHaveBeenCalledWith(expectedTarget);
    },
  );

  it.each([
    ['doctor', 'https://therapygo.example.test/app/patient/login'],
    ['patient', 'https://therapysto.example.test/app/doctor/login'],
    ['admin', null],
  ] as const)(
    'projects the %s door onto its canonical product origin without forwarding next=',
    async (roleLoginPortal, alternateRoleLoginHref) => {
      mocks.getCurrentSession.mockResolvedValue(null);

      const entry = await AppEntryRsc({
        searchParams: Promise.resolve({ next: 'https://attacker.example/app/doctor' }),
        routeBoundMessengerSurface: null,
        roleLoginPortal,
      });

      expect(loginContentProps(entry)).toMatchObject({
        roleLoginPortal,
        alternateRoleLoginHref,
        surfaceAuthPolicy: { availableMethods: ['password'], enabledMethods: ['password'] },
      });
    },
  );
});
