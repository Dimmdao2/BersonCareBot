import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  buildAppDeps: vi.fn(),
  requireClinicManagementBookingEngine: vi.fn(),
  resolveMechanicAccess: vi.fn(),
  getDrizzle: vi.fn(),
  limit: vi.fn(),
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: fakes.buildAppDeps }));
vi.mock('../_requireAdminBookingEngine', () => ({
  requireClinicManagementBookingEngine: fakes.requireClinicManagementBookingEngine,
}));
vi.mock('@/app-layer/db/drizzle', () => ({ getDrizzle: fakes.getDrizzle }));

import { GET } from './route';

const ORGANIZATION_ID = '20000000-0000-4000-8000-000000000002';

function request(): Request {
  return new Request('https://app.example.test/api/admin/booking-engine/public-appointments?limit=20');
}

beforeEach(() => {
  vi.clearAllMocks();
  fakes.requireClinicManagementBookingEngine.mockResolvedValue({
    ok: true,
    ctx: { organizationId: ORGANIZATION_ID },
  });
  fakes.buildAppDeps.mockReturnValue({
    orgEntitlements: { resolveMechanicAccess: fakes.resolveMechanicAccess },
  });
  fakes.limit.mockResolvedValue([
    {
      id: 'appt-1',
      startAt: new Date('2026-08-01T10:00:00.000Z'),
      phoneNormalized: '+70000000000',
      attributionJson: { utm_source: 'yandex' },
      createdAt: new Date('2026-07-30T00:00:00.000Z'),
    },
  ]);
  fakes.getDrizzle.mockReturnValue({
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({
            limit: fakes.limit,
          }),
        }),
      }),
    }),
  });
});

describe('GET /api/admin/booking-engine/public-appointments entitlement gate', () => {
  it('refuses attribution data before reading it when doctor_statistics is disabled', async () => {
    fakes.resolveMechanicAccess.mockResolvedValue({ state: 'disabled', warning: null });

    const response = await GET(request());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ ok: false, error: 'entitlement_required', mechanic: 'doctor_statistics' }),
    );
    expect(fakes.getDrizzle).not.toHaveBeenCalled();
    expect(fakes.resolveMechanicAccess).toHaveBeenCalledWith(ORGANIZATION_ID, 'doctor_statistics');
  });

  it('keeps attribution data readable when doctor_statistics is read_only', async () => {
    fakes.resolveMechanicAccess.mockResolvedValue({ state: 'read_only', warning: null });

    const response = await GET(request());

    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok: boolean; items: unknown[] };
    expect(body.ok).toBe(true);
    expect(body.items).toHaveLength(1);
    expect(fakes.limit).toHaveBeenCalledTimes(1);
  });

  it('keeps attribution data readable when doctor_statistics is full_access', async () => {
    fakes.resolveMechanicAccess.mockResolvedValue({ state: 'full_access', warning: null });

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(fakes.limit).toHaveBeenCalledTimes(1);
  });
});
