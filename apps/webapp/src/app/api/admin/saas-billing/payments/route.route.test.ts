import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  buildAppDeps: vi.fn(),
  requirePlatformOperationsApiContext: vi.fn(),
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: fakes.buildAppDeps }));
vi.mock('@/app-layer/guards/requireRole', () => ({
  requirePlatformOperationsApiContext: fakes.requirePlatformOperationsApiContext,
}));

import { GET } from './route';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('К1 — стена: клиника не получает платформенный журнал платежей прямым запросом к маршруту', () => {
  it('returns the gate response and never reaches the billing repository for a non-platform session', async () => {
    const deniedResponse = NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
    fakes.requirePlatformOperationsApiContext.mockResolvedValue({
      ok: false,
      response: deniedResponse,
    });

    const response = await GET(new Request('http://localhost/api/admin/saas-billing/payments'));

    expect(response).toBe(deniedResponse);
    expect(response.status).toBe(403);
    expect(fakes.buildAppDeps).not.toHaveBeenCalled();
  });

  it('reaches the repository and returns payments once a platform session passes the gate', async () => {
    fakes.requirePlatformOperationsApiContext.mockResolvedValue({ ok: true, session: {} });
    const listPlatformPayments = vi.fn().mockResolvedValue([
      {
        id: 'invoice-1',
        organizationId: 'org-1',
        organizationTitle: 'Клиника А',
        tariffName: 'Старт',
        amountMinor: 100000,
        currency: 'RUB',
        status: 'paid',
        providerId: 'yookassa',
        servicePeriodStartsAt: '2026-07-01T00:00:00.000Z',
        servicePeriodEndsAt: '2026-08-01T00:00:00.000Z',
        createdAt: '2026-07-01T00:00:00.000Z',
      },
    ]);
    fakes.buildAppDeps.mockReturnValue({ saasBilling: { listPlatformPayments } });

    const response = await GET(new Request('http://localhost/api/admin/saas-billing/payments'));
    const body = await response.json();

    expect(body.ok).toBe(true);
    expect(body.payments).toHaveLength(1);
    expect(listPlatformPayments).toHaveBeenCalledTimes(1);
  });
});
