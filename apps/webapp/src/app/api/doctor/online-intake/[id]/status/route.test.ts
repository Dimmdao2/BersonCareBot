import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const requestId = '00000000-0000-4000-8000-000000000001';
const organizationId = '10000000-0000-4000-8000-000000000001';
const otherOrganizationId = '20000000-0000-4000-8000-000000000002';

const requireDoctorWorkspaceApiContextMock = vi.hoisted(() => vi.fn());
const withDoctorWorkspacePrincipalMock = vi.hoisted(() =>
  vi.fn((_: unknown, sourceOrFn: string | (() => unknown), maybeFn?: () => unknown) => {
    const fn = typeof sourceOrFn === 'function' ? sourceOrFn : maybeFn;
    if (!fn) throw new Error('principal_callback_required');
    return fn();
  }),
);
const getRequestForDoctorMock = vi.hoisted(() => vi.fn());
const changeStatusMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    id: '00000000-0000-4000-8000-000000000001',
    organizationId: '10000000-0000-4000-8000-000000000001',
    status: 'in_review',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }),
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
    changeStatus: changeStatusMock,
  }),
}));

import { PATCH } from './route';

function makeRequest(body: unknown): Request {
  return new Request(`http://localhost/api/doctor/online-intake/${requestId}/status`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function call(body: unknown) {
  return PATCH(makeRequest(body), { params: Promise.resolve({ id: requestId }) });
}

describe('PATCH /api/doctor/online-intake/[id]/status', () => {
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
    getRequestForDoctorMock.mockResolvedValue({
      id: requestId,
      organizationId,
      userId: '00000000-0000-4000-8000-0000000000bb',
      status: 'new',
    });
    changeStatusMock.mockClear();
    changeStatusMock.mockResolvedValue({
      id: requestId,
      organizationId,
      status: 'in_review',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it('returns workspace gate response', async () => {
    requireDoctorWorkspaceApiContextMock.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 }),
    });
    const res = await call({ status: 'in_review' });
    expect(res.status).toBe(401);
    expect(changeStatusMock).not.toHaveBeenCalled();
  });

  it('returns 400 on invalid body', async () => {
    const res = await call({ status: 'new' });
    expect(res.status).toBe(400);
    expect(changeStatusMock).not.toHaveBeenCalled();
  });

  it('returns 404 for requests from another workspace', async () => {
    getRequestForDoctorMock.mockResolvedValueOnce({
      id: requestId,
      organizationId: otherOrganizationId,
      userId: '00000000-0000-4000-8000-0000000000bb',
      status: 'new',
    });
    const res = await call({ status: 'in_review' });
    expect(res.status).toBe(404);
    expect(changeStatusMock).not.toHaveBeenCalled();
  });

  it('changes status under workspace principal', async () => {
    const res = await call({ status: 'in_review', note: 'Взято в работу' });
    expect(res.status).toBe(200);
    expect(changeStatusMock).toHaveBeenCalledWith({
      requestId,
      changedBy: 'd1',
      toStatus: 'in_review',
      note: 'Взято в работу',
    });
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId }),
      expect.any(Function),
    );
  });

  it('keeps invalid transition response', async () => {
    changeStatusMock.mockRejectedValueOnce(
      Object.assign(new Error('invalid_status_transition'), { code: 'INVALID_STATUS_TRANSITION' }),
    );
    const res = await call({ status: 'closed' });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'INVALID_STATUS_TRANSITION' });
  });
});
