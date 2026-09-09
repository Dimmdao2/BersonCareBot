/**
 * Final #915 auditor-live acceptance seam for mobile runtime configuration.
 *
 * Failure caught: a fixed authenticated surface reads the other app's configuration or serializes a
 * provider credential envelope instead of the sole public project id.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  buildAppDeps: vi.fn(),
  requireAccountWebPushSelfApiSession: vi.fn(),
  requirePatientApiBusinessAccess: vi.fn(),
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: fakes.buildAppDeps }));
vi.mock('@/app-layer/guards/requireRole', () => ({
  requireAccountWebPushSelfApiSession: fakes.requireAccountWebPushSelfApiSession,
  requirePatientApiBusinessAccess: fakes.requirePatientApiBusinessAccess,
}));
vi.mock('@/modules/web-push/nativePush', () => ({
  isNativePushProvider: (value: unknown) => value === 'rustore' || value === 'fcm' || value === 'hms',
}));

import { GET as accountGet } from '@/app/api/account/native-push/route';
import { GET as patientGet } from '@/app/api/patient/native-push/route';

const userId = '3c91f0cf-ff9a-48f3-88e6-6bd773056fd3';

afterEach(() => {
  vi.clearAllMocks();
});

function installAuthenticatedDeps(projectId: string | null) {
  const status = vi.fn(async () => ({ active: true, providers: ['rustore'] as const }));
  const getNativePushProjectId = vi.fn(async (surface: 'therapygo' | 'therapysto') =>
    projectId === null ? null : `${projectId}-${surface}`,
  );
  fakes.buildAppDeps.mockReturnValue({
    nativePushTargets: { status },
    systemSettings: { getNativePushProjectId },
  });
  fakes.requirePatientApiBusinessAccess.mockResolvedValue({ ok: true, session: { user: { userId } } });
  fakes.requireAccountWebPushSelfApiSession.mockResolvedValue({ ok: true, session: { user: { userId } } });
}

describe('fixed-surface native Push runtime projection — M6-08/M6-09', () => {
  it('returns only each authenticated surface’s own public project id', async () => {
    installAuthenticatedDeps('project-public-only');

    const [patientResponse, accountResponse] = await Promise.all([patientGet(), accountGet()]);
    const [patientBody, accountBody] = await Promise.all([patientResponse.json(), accountResponse.json()]);

    expect(patientBody).toEqual({
      ok: true,
      active: true,
      providers: ['rustore'],
      projectId: 'project-public-only-therapygo',
    });
    expect(accountBody).toEqual({
      ok: true,
      active: true,
      providers: ['rustore'],
      projectId: 'project-public-only-therapysto',
    });
    expect(JSON.stringify([patientBody, accountBody])).not.toMatch(/authToken|endpoint|secret/i);
  });

  it('reports a missing public project id as typed unavailable without a secret fallback', async () => {
    installAuthenticatedDeps(null);

    const response = await patientGet();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      active: true,
      providers: ['rustore'],
      projectId: null,
      runtime: 'unavailable',
    });
  });
});
