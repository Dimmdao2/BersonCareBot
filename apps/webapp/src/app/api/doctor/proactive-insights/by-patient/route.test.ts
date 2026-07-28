import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireDoctorWorkspaceApiContextMock = vi.hoisted(() => vi.fn());
const withDoctorWorkspacePrincipalMock = vi.hoisted(() =>
  vi.fn((_: unknown, fn: () => unknown) => fn()),
);
const buildAppDepsMock = vi.hoisted(() => vi.fn());
const getAppDisplayTimeZoneMock = vi.hoisted(() => vi.fn());

vi.mock('@/app-layer/guards/requireRole', () => ({
  requireDoctorWorkspaceApiContext: () => requireDoctorWorkspaceApiContextMock(),
}));

vi.mock('@/app-layer/guards/doctorWorkspacePrincipal', () => ({
  withDoctorWorkspacePrincipal: (ctx: unknown, fn: () => unknown) =>
    withDoctorWorkspacePrincipalMock(ctx, fn),
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: buildAppDepsMock,
}));

vi.mock('@/modules/system-settings/appDisplayTimezone', () => ({
  getAppDisplayTimeZone: () => getAppDisplayTimeZoneMock(),
}));

import { GET } from './route';

const ORG_A = '10000000-0000-4000-8000-000000000001';

describe('GET /api/doctor/proactive-insights/by-patient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAppDisplayTimeZoneMock.mockResolvedValue('Europe/Moscow');
  });

  it('returns the workspace gate response without reading insights', async () => {
    const queryInsights = vi.fn();
    requireDoctorWorkspaceApiContextMock.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 }),
    });
    buildAppDepsMock.mockReturnValue({ doctorProactiveInsights: { queryInsights } });

    const response = await GET(new Request('http://localhost'));

    expect(response.status).toBe(401);
    expect(queryInsights).not.toHaveBeenCalled();
  });

  it('maps queryInsights rows down to patientUserId/kind/summary, scoped to the workspace', async () => {
    requireDoctorWorkspaceApiContextMock.mockResolvedValue({
      ok: true,
      ctx: {
        organizationId: ORG_A,
        session: { user: { userId: 'doctor-1', role: 'doctor' } },
      },
    });
    const queryInsights = vi.fn().mockResolvedValue({
      totalCount: 1,
      items: [
        {
          kind: 'wellbeing_low_streak',
          patientUserId: 'patient-1',
          patientDisplayName: 'Петров',
          summary: 'Низкое самочувствие 3 дн. подряд',
          sortAt: '2026-06-02T00:00:00.000Z',
        },
      ],
    });
    buildAppDepsMock.mockReturnValue({ doctorProactiveInsights: { queryInsights } });

    const response = await GET(new Request('http://localhost'));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      items: [
        {
          patientUserId: 'patient-1',
          kind: 'wellbeing_low_streak',
          summary: 'Низкое самочувствие 3 дн. подряд',
        },
      ],
    });
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORG_A }),
      expect.any(Function),
    );
    expect(queryInsights).toHaveBeenCalledWith({
      limit: 10,
      displayIana: 'Europe/Moscow',
      organizationId: ORG_A,
    });
  });
});
