import { beforeEach, describe, expect, it, vi } from 'vitest';

const resolvePublicBookingOrganizationMock = vi.hoisted(() => vi.fn());
const resolveOrganizationIdBySlugMock = vi.hoisted(() => vi.fn());
const listPatientFieldsMock = vi.hoisted(() => vi.fn());

vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({
    bookingEngine: {},
    bookingForm: { listPatientFields: listPatientFieldsMock },
    clinicDirectory: { resolveOrganizationIdBySlug: resolveOrganizationIdBySlugMock },
    bookingScheduling: { resolvePublicBookingOrganization: resolvePublicBookingOrganizationMock },
  }),
}));

import { GET } from './route';

const ORG_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ORG_B = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab';
const BRANCH_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SERVICE_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function request(query: string) {
  return new Request(`http://localhost/api/booking/public/form-fields?${query}`);
}

describe('GET /api/booking/public/form-fields', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolvePublicBookingOrganizationMock.mockResolvedValue(ORG_A);
    resolveOrganizationIdBySlugMock.mockResolvedValue(ORG_A);
    listPatientFieldsMock.mockResolvedValue([{ fieldKey: 'comment' }]);
  });

  it('reads fields only after matching the slug to canonical branch/service availability', async () => {
    const response = await GET(
      request(`orgSlug=clinic-a&branchId=${BRANCH_ID}&serviceId=${SERVICE_ID}`),
    );

    expect(response.status).toBe(200);
    expect(resolveOrganizationIdBySlugMock).toHaveBeenCalledWith('clinic-a');
    expect(resolvePublicBookingOrganizationMock).toHaveBeenCalledWith({
      branchId: BRANCH_ID,
      serviceId: SERVICE_ID,
    });
    expect(listPatientFieldsMock).toHaveBeenCalledWith(ORG_A);
  });

  it('returns the uniform tenant error for missing slug before field reads', async () => {
    const response = await GET(request(`branchId=${BRANCH_ID}&serviceId=${SERVICE_ID}`));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'ambiguous_booking_tenant',
    });
    expect(resolvePublicBookingOrganizationMock).not.toHaveBeenCalled();
    expect(listPatientFieldsMock).not.toHaveBeenCalled();
  });

  it('returns the uniform tenant error for a cross-tenant slug before field reads', async () => {
    resolveOrganizationIdBySlugMock.mockResolvedValue(ORG_B);
    const response = await GET(
      request(`orgSlug=clinic-b&branchId=${BRANCH_ID}&serviceId=${SERVICE_ID}`),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'ambiguous_booking_tenant',
    });
    expect(listPatientFieldsMock).not.toHaveBeenCalled();
  });

  it('rejects malformed canonical ids before tenant or field reads', async () => {
    const response = await GET(
      request('orgSlug=clinic-a&branchId=not-a-uuid&serviceId=also-not-a-uuid'),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ ok: false, error: 'invalid_query' });
    expect(resolveOrganizationIdBySlugMock).not.toHaveBeenCalled();
    expect(resolvePublicBookingOrganizationMock).not.toHaveBeenCalled();
    expect(listPatientFieldsMock).not.toHaveBeenCalled();
  });
});
