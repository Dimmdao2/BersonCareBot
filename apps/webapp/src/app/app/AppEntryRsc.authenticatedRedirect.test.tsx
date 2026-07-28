/** @vitest-environment node */

import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserRole } from '@/shared/types/session';

const redirectMock = vi.hoisted(() =>
  vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
);
const getCurrentSessionMock = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({ redirect: redirectMock }));
vi.mock('next/headers', () => ({ headers: vi.fn(), cookies: vi.fn() }));
vi.mock('@/config/env', () => ({
  env: { NODE_ENV: 'test', ALLOW_DEV_AUTH_BYPASS: false },
}));
vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({
    auth: { getCurrentSession: getCurrentSessionMock },
  }),
}));
vi.mock('@/modules/auth/publicAuthSnapshot', () => ({
  buildPrefetchedPublicAuthConfig: vi.fn(),
}));
vi.mock('@/shared/lib/platformCookie.server', () => ({
  getPlatformEntry: vi.fn(),
  getMessengerSurfaceHint: vi.fn(),
}));
vi.mock('@/shared/ui/patient/PatientAppShell', () => ({
  PatientAppShell: vi.fn(),
}));
vi.mock('./AppEntryLoginContent', () => ({
  AppEntryLoginContent: vi.fn(),
}));
vi.mock('./PatientUnsupportedClientFallback', () => ({
  PatientUnsupportedClientFallback: vi.fn(),
}));

import { AppEntryRsc, type AppEntrySearchParams } from './AppEntryRsc';

type IntentSearchParams = AppEntrySearchParams & { intent?: string };

async function expectAuthenticatedRedirect(
  role: UserRole,
  searchParams: IntentSearchParams,
  expectedPath: string,
) {
  getCurrentSessionMock.mockResolvedValue({ user: { role } });

  await expect(
    AppEntryRsc({
      searchParams: Promise.resolve(searchParams),
      routeBoundMessengerSurface: null,
    }),
  ).rejects.toThrow(`redirect:${expectedPath}`);

  expect(redirectMock).toHaveBeenCalledOnce();
  expect(redirectMock).toHaveBeenCalledWith(expectedPath);
}

describe('AppEntryRsc authenticated redirect ignores landing intent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps a patient session on the patient role path despite specialist intent', async () => {
    await expectAuthenticatedRedirect('client', { intent: 'specialist' }, '/app/patient');
  });

  it('keeps a staff session on the staff role path despite patient intent', async () => {
    await expectAuthenticatedRedirect('doctor', { intent: 'patient' }, '/app/doctor');
  });

  it('keeps no-intent staff entry on the pre-existing role path', async () => {
    await expectAuthenticatedRedirect('admin', {}, '/app/doctor');
  });

  it('keeps direct /app no-intent patient entry working without the landing', async () => {
    await expectAuthenticatedRedirect('client', {}, '/app/patient');
  });

  it('keeps redirect policy free of auth-intent authority', () => {
    const redirectPolicySource = readFileSync(
      new URL('../../modules/auth/redirectPolicy.ts', import.meta.url),
      'utf8',
    );

    expect(redirectPolicySource).not.toMatch(/\bintent\b/);
  });
});
