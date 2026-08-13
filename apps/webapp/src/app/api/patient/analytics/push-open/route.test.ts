import { beforeEach, describe, expect, it, vi } from 'vitest';

const requirePatientMock = vi.hoisted(() => vi.fn());
const recordPushOpenMock = vi.hoisted(() => vi.fn());

vi.mock('@/app-layer/guards/requireRole', () => ({
  requirePatientApiBusinessAccess: requirePatientMock,
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({
    productAnalytics: { recordPushOpen: recordPushOpenMock },
  }),
}));

import { POST } from './route';

function request(body: unknown): Request {
  return new Request('http://localhost/api/patient/analytics/push-open', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/patient/analytics/push-open', () => {
  beforeEach(() => {
    requirePatientMock.mockReset();
    recordPushOpenMock.mockReset();
  });

  it('does not expose the analytics write before a patient session exists', async () => {
    requirePatientMock.mockResolvedValue({
      ok: false,
      response: Response.json({ ok: false, error: 'unauthorized' }, { status: 401 }),
    });

    const response = await POST(request({
      pushTrackingId: '9f100002-0000-4000-8000-000000000001',
    }));

    expect(response.status).toBe(401);
    expect(recordPushOpenMock).not.toHaveBeenCalled();
  });

  it('records the click as the authenticated patient through the narrow port operation', async () => {
    requirePatientMock.mockResolvedValue({
      ok: true,
      session: { user: { userId: 'patient-user' } },
    });
    recordPushOpenMock.mockResolvedValue({ deduped: false });

    const response = await POST(request({
      pushTrackingId: '9f100002-0000-4000-8000-000000000001',
      entryChannel: 'max',
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, deduped: false });
    expect(recordPushOpenMock).toHaveBeenCalledWith({
      pushTrackingId: '9f100002-0000-4000-8000-000000000001',
      userId: 'patient-user',
      entryChannel: 'max',
    });
  });
});
