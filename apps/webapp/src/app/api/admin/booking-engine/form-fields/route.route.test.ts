import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  buildAppDeps: vi.fn(),
  requireClinicManagementBookingEngine: vi.fn(),
  requireEntitlementForMutation: vi.fn(),
  upsertAdminField: vi.fn(),
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: fakes.buildAppDeps }));
vi.mock('../_requireClinicManagementBookingEngine', () => ({
  requireClinicManagementBookingEngine: fakes.requireClinicManagementBookingEngine,
}));
vi.mock('@/app-layer/guards/requireEntitlement', () => ({
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

function request(overrides: Record<string, unknown> = {}) {
  return new Request('http://test/api/admin/booking-engine/form-fields', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      fieldKey: 'complaint',
      fieldType: 'text',
      label: 'Жалоба',
      isRequired: true,
      visibleToPatient: true,
      visibleToStaff: true,
      sortOrder: 10,
      isActive: true,
      ...overrides,
    }),
  });
}

describe('clinic-owner booking form field mutation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakes.requireClinicManagementBookingEngine.mockResolvedValue({
      ok: true,
      ctx: { organizationId: ORGANIZATION_ID },
    });
    fakes.requireEntitlementForMutation.mockResolvedValue({ ok: true });
    fakes.buildAppDeps.mockReturnValue({
      bookingForm: { upsertAdminField: fakes.upsertAdminField },
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('creates through the exact organization port and returns the usable field', async () => {
    const field = {
      id: '22222222-2222-4222-8222-222222222222',
      organizationId: ORGANIZATION_ID,
      fieldKey: 'complaint',
      fieldType: 'text',
      label: 'Жалоба',
    };
    fakes.upsertAdminField.mockResolvedValue(field);

    const response = await POST(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, field });
    expect(fakes.upsertAdminField).toHaveBeenCalledWith(
      ORGANIZATION_ID,
      expect.objectContaining({ fieldKey: 'complaint', fieldType: 'text', placeholder: null }),
    );
  });

  it('returns a safe duplicate-key conflict', async () => {
    fakes.upsertAdminField.mockRejectedValue({
      code: '23505',
      constraint: 'uq_be_booking_form_fields_org_key',
    });

    const response = await POST(request());

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'field_key_already_exists',
    });
  });

  it('rejects invalid keys and types before the DB capability is entered', async () => {
    const response = await POST(request({ fieldKey: 'Bad key', fieldType: 'script' }));

    expect(response.status).toBe(400);
    expect(fakes.upsertAdminField).not.toHaveBeenCalled();
  });

  it('redacts a missing insert capability as a specific safe service error', async () => {
    fakes.upsertAdminField.mockRejectedValue({ code: '42501', message: 'secret relation detail' });

    const response = await POST(request());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'booking_form_capability_unavailable',
    });
  });
});
