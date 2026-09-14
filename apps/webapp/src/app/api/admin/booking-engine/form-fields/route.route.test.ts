import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  buildAppDeps: vi.fn(),
  requireClinicManagementBookingEngine: vi.fn(),
  requireEntitlementForMutation: vi.fn(),
  requireEntitlementForRead: vi.fn(),
  requireDoctorWorkspaceConfigModuleForApi: vi.fn(),
  listAdminFields: vi.fn(),
  upsertAdminField: vi.fn(),
  archiveAdminField: vi.fn(),
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: fakes.buildAppDeps }));
vi.mock('../_requireClinicManagementBookingEngine', () => ({
  requireClinicManagementBookingEngine: fakes.requireClinicManagementBookingEngine,
}));
vi.mock('@/app-layer/guards/requireEntitlement', () => ({
  requireEntitlementForMutation: fakes.requireEntitlementForMutation,
  requireEntitlementForRead: fakes.requireEntitlementForRead,
}));
vi.mock('@/app-layer/guards/workspaceModuleAccess', () => ({
  requireDoctorWorkspaceConfigModuleForApi: fakes.requireDoctorWorkspaceConfigModuleForApi,
}));
vi.mock('@/app-layer/principal/withOrganizationPrincipal', () => ({
  withDoctorWorkspacePrincipal: (_ctx: unknown, _source: string, work: () => Promise<unknown>) =>
    work(),
}));

import { DELETE, GET, POST } from './route';

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
    fakes.requireEntitlementForRead.mockResolvedValue({ ok: true });
    fakes.requireDoctorWorkspaceConfigModuleForApi.mockResolvedValue({ ok: true });
    fakes.buildAppDeps.mockReturnValue({
      bookingForm: {
        listAdminFields: fakes.listAdminFields,
        upsertAdminField: fakes.upsertAdminField,
        archiveAdminField: fakes.archiveAdminField,
      },
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('refuses lead-form reads when the leads workspace module is disabled', async () => {
    fakes.requireDoctorWorkspaceConfigModuleForApi.mockResolvedValue({
      ok: false,
      response: Response.json(
        { ok: false, error: 'workspace_module_disabled', module: 'leads' },
        { status: 403 },
      ),
    });

    const response = await GET(
      new Request('http://test/api/admin/booking-engine/form-fields?surface=leads'),
    );

    expect(response.status).toBe(403);
    expect(fakes.requireEntitlementForRead).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORGANIZATION_ID }),
      'leads',
    );
    expect(fakes.requireDoctorWorkspaceConfigModuleForApi).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ organizationId: ORGANIZATION_ID }),
      'leads',
    );
    expect(fakes.listAdminFields).not.toHaveBeenCalled();
  });

  it('refuses lead-form writes when the leads workspace module is disabled', async () => {
    fakes.requireDoctorWorkspaceConfigModuleForApi.mockResolvedValue({
      ok: false,
      response: Response.json(
        { ok: false, error: 'workspace_module_disabled', module: 'leads' },
        { status: 403 },
      ),
    });

    const response = await POST(request({ formSurface: 'leads' }));

    expect(response.status).toBe(403);
    expect(fakes.requireEntitlementForMutation).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORGANIZATION_ID }),
      'leads',
    );
    expect(fakes.upsertAdminField).not.toHaveBeenCalled();
  });

  // Архивация — третья экспортированная дверь той же поверхности. Без неё выключенный механик заявок
  // обходился бы через `DELETE`, и тест остался бы зелёным: §10b требует проверять настоящий
  // публичный handler, а не один из трёх.
  it('refuses lead-form archiving when the leads workspace module is disabled', async () => {
    fakes.requireDoctorWorkspaceConfigModuleForApi.mockResolvedValue({
      ok: false,
      response: Response.json(
        { ok: false, error: 'workspace_module_disabled', module: 'leads' },
        { status: 403 },
      ),
    });

    const response = await DELETE(
      new Request('http://test/api/admin/booking-engine/form-fields', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: '22222222-2222-4222-8222-222222222222',
          formSurface: 'leads',
        }),
      }),
    );

    expect(response.status).toBe(403);
    expect(fakes.requireDoctorWorkspaceConfigModuleForApi).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ organizationId: ORGANIZATION_ID }),
      'leads',
    );
    expect(fakes.archiveAdminField).not.toHaveBeenCalled();
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

  // Owner live pass 18.08 (L-4): the refusal reached the screen as the bare code `invalid_body`.
  it('carries a human explanation of a refused body, not only its code', async () => {
    const response = await POST(request({ fieldKey: 'Bad key' }));
    const body = (await response.json()) as { error?: string; message?: string };

    expect(response.status).toBe(400);
    // Предмет — что человек получил объяснение, а не голый код отказа. Формулировка живёт в
    // словаре текстов и здесь не переписывается.
    expect(body.error).toBe('invalid_body');
    expect(body.message?.trim()).toBeTruthy();
    expect(body.message).not.toContain('invalid_body');
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
