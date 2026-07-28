import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const organizationId = '10000000-0000-4000-8000-000000000001';
const otherOrganizationId = '20000000-0000-4000-8000-000000000002';
const requestId = '00000000-0000-4000-8000-000000000001';

const requireDoctorWorkspaceApiContextMock = vi.hoisted(() => vi.fn());
const withDoctorWorkspacePrincipalMock = vi.hoisted(() =>
  vi.fn((_: unknown, sourceOrFn: string | (() => unknown), maybeFn?: () => unknown) => {
    const fn = typeof sourceOrFn === 'function' ? sourceOrFn : maybeFn;
    if (!fn) throw new Error('principal_callback_required');
    return fn();
  }),
);
const getRequestForDoctorMock = vi.hoisted(() => vi.fn());
const buildDoctorOnlineIntakeDetailResponseMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ id: '00000000-0000-4000-8000-000000000001', ok: true }),
);

vi.mock('@/app-layer/guards/requireRole', () => ({
  requireDoctorWorkspaceApiContext: () => requireDoctorWorkspaceApiContextMock(),
}));

vi.mock('@/app-layer/guards/doctorWorkspacePrincipal', () => ({
  withDoctorWorkspacePrincipal: (
    ctx: unknown,
    sourceOrFn: string | (() => unknown),
    maybeFn?: () => unknown,
  ) => {
    const fn = typeof sourceOrFn === 'function' ? sourceOrFn : maybeFn;
    if (!fn) throw new Error('principal_callback_required');
    return withDoctorWorkspacePrincipalMock(ctx, fn);
  },
}));

vi.mock('@/app-layer/di/onlineIntakeDeps', () => ({
  getOnlineIntakeService: () => ({
    getRequestForDoctor: getRequestForDoctorMock,
  }),
}));

vi.mock('@/modules/online-intake/doctorIntakeDetailResponse', () => ({
  buildDoctorOnlineIntakeDetailResponse: buildDoctorOnlineIntakeDetailResponseMock,
}));

import { GET } from './route';

describe('GET /api/doctor/online-intake/[id]', () => {
  beforeEach(() => {
    requireDoctorWorkspaceApiContextMock.mockReset();
    requireDoctorWorkspaceApiContextMock.mockResolvedValue({
      ok: true,
      ctx: {
        organizationId,
        session: { user: { userId: 'd1', role: 'doctor', bindings: {}, displayName: 'D' } },
      },
    });
    withDoctorWorkspacePrincipalMock.mockClear();
    withDoctorWorkspacePrincipalMock.mockImplementation(
      (_: unknown, sourceOrFn: string | (() => unknown), maybeFn?: () => unknown) => {
        const fn = typeof sourceOrFn === 'function' ? sourceOrFn : maybeFn;
        if (!fn) throw new Error('principal_callback_required');
        return fn();
      },
    );
    getRequestForDoctorMock.mockReset();
    buildDoctorOnlineIntakeDetailResponseMock.mockClear();
  });

  it('returns workspace gate response', async () => {
    requireDoctorWorkspaceApiContextMock.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 }),
    });
    const res = await GET(new Request('http://localhost/api/doctor/online-intake/x'), {
      params: Promise.resolve({ id: requestId }),
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe('FORBIDDEN');
  });

  it('returns detail inside selected workspace', async () => {
    getRequestForDoctorMock.mockResolvedValue({
      id: requestId,
      organizationId,
      userId: '00000000-0000-4000-8000-0000000000bb',
      status: 'new',
    });
    const res = await GET(new Request(`http://localhost/api/doctor/online-intake/${requestId}`), {
      params: Promise.resolve({ id: requestId }),
    });
    expect(res.status).toBe(200);
    expect(buildDoctorOnlineIntakeDetailResponseMock).toHaveBeenCalledOnce();
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId }),
      expect.any(Function),
    );
  });

  it('returns 404 for requests from another workspace', async () => {
    getRequestForDoctorMock.mockResolvedValue({
      id: requestId,
      organizationId: otherOrganizationId,
      userId: '00000000-0000-4000-8000-0000000000bb',
      status: 'new',
    });
    const res = await GET(new Request(`http://localhost/api/doctor/online-intake/${requestId}`), {
      params: Promise.resolve({ id: requestId }),
    });
    expect(res.status).toBe(404);
    expect(buildDoctorOnlineIntakeDetailResponseMock).not.toHaveBeenCalled();
  });
});
