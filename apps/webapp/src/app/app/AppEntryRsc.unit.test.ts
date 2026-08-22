import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RoleLoginPortal } from '@/modules/auth/roleLogin';

const mocks = vi.hoisted(() => ({
  getCurrentSession: vi.fn(),
  redirect: vi.fn((target: string): never => {
    throw new Error(`redirect:${target}`);
  }),
}));

vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({ auth: { getCurrentSession: mocks.getCurrentSession } }),
}));

import { AppEntryRsc } from './AppEntryRsc';

describe('AppEntryRsc role-login entry', () => {
  beforeEach(() => {
    mocks.redirect.mockClear();
    mocks.getCurrentSession.mockResolvedValue({ user: { role: 'doctor' } });
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
});
