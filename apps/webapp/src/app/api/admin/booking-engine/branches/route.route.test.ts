import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  requireClinicManagementBookingEngine: vi.fn(),
  requireEntitlementForMutation: vi.fn(),
  createPhysicalBranch: vi.fn(),
}));

vi.mock('../_requireClinicManagementBookingEngine', () => ({
  requireClinicManagementBookingEngine: fakes.requireClinicManagementBookingEngine,
}));
// Only the decision is faked; the product sentence stays the real one, so the assertion below
// cannot pass against a message this test invented.
vi.mock('@/app-layer/guards/requireEntitlement', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app-layer/guards/requireEntitlement')>()),
  requireEntitlementForMutation: fakes.requireEntitlementForMutation,
}));
vi.mock('@/app-layer/principal/withOrganizationPrincipal', () => ({
  withDoctorWorkspacePrincipal: (
    _ctx: unknown,
    _source: string,
    work: () => Promise<unknown>,
  ) => work(),
}));

import { POST } from './route';

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';

function request() {
  return new Request('http://test/api/admin/booking-engine/branches', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      title: 'Центр',
      shortTitle: 'Центр',
      cityCode: 'MSK',
      address: 'Улица, 1',
      timezone: 'Europe/Moscow',
    }),
  });
}

describe('clinic-owner branch create', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakes.requireClinicManagementBookingEngine.mockResolvedValue({
      ok: true,
      ctx: {
        organizationId: ORGANIZATION_ID,
        service: { catalog: { createPhysicalBranch: fakes.createPhysicalBranch } },
      },
    });
    fakes.requireEntitlementForMutation.mockResolvedValue({ ok: true });
  });

  it('uses the exact organization branch capability and returns the created branch', async () => {
    const branch = { id: 'branch-1', organizationId: ORGANIZATION_ID, title: 'Центр' };
    fakes.createPhysicalBranch.mockResolvedValue(branch);

    const response = await POST(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, branch });
    expect(fakes.requireEntitlementForMutation).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORGANIZATION_ID }),
      'branches',
    );
    expect(fakes.createPhysicalBranch).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORGANIZATION_ID,
        title: 'Центр',
        cityCode: 'msk',
      }),
    );
  });

  /**
   * Owner live pass 18.08, L-1. A limit-bearing mechanic has no «выключено» state any more, so the
   * ceiling is the only refusal this write can produce — and it must arrive as the sentence the
   * Локации section renders (`apiJson` prefers `message`), never as `branch_quota_reached`.
   * Breakage this pins: the clinic owner is shown a machine code again, the «(ошибка)» he reported.
   */
  it('returns a precise quota response without retrying the write', async () => {
    fakes.createPhysicalBranch.mockRejectedValue(new Error('saas_quota_reached:branches'));

    const response = await POST(request());

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'branch_quota_reached',
      mechanic: 'branches',
      message:
        'Невозможно создать локацию: в тарифе клиники исчерпан лимит «Филиалы». ' +
        'Чтобы продолжить, увеличьте лимит в тарифе клиники.',
    });
    expect(fakes.createPhysicalBranch).toHaveBeenCalledTimes(1);
  });

  it('does not reach the entitlement or write port when the org capability gate refuses access', async () => {
    fakes.requireClinicManagementBookingEngine.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ ok: false, error: 'forbidden' }), { status: 403 }),
    });

    const response = await POST(request());

    expect(response.status).toBe(403);
    expect(fakes.requireEntitlementForMutation).not.toHaveBeenCalled();
    expect(fakes.createPhysicalBranch).not.toHaveBeenCalled();
  });
});
