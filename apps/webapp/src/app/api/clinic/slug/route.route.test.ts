import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  buildAppDeps: vi.fn(),
  requireClinicManagementApiContext: vi.fn(),
  setOrganizationSlug: vi.fn(),
  getSlugManagementState: vi.fn(),
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: fakes.buildAppDeps }));
vi.mock('@/app-layer/guards/requireRole', () => ({
  requireClinicManagementApiContext: fakes.requireClinicManagementApiContext,
}));

import { POST } from './route';

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';

function request(slug = 'nova-clinic') {
  return new Request('http://test/api/clinic/slug', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ slug, irreversibleRenameConfirmed: true }),
  });
}

describe('clinic-owner slug mutation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakes.requireClinicManagementApiContext.mockResolvedValue({
      ok: true,
      ctx: { organizationId: ORGANIZATION_ID },
    });
    fakes.buildAppDeps.mockReturnValue({
      clinicDirectory: {
        setOrganizationSlug: fakes.setOrganizationSlug,
        getSlugManagementState: fakes.getSlugManagementState,
      },
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('persists only the current organization and returns authoritative readback state', async () => {
    fakes.setOrganizationSlug.mockResolvedValue({ ok: true, slug: 'nova-clinic' });
    fakes.getSlugManagementState.mockResolvedValue({
      organizationId: ORGANIZATION_ID,
      slug: 'nova-clinic',
      canRename: false,
    });

    const response = await POST(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      slug: 'nova-clinic',
      state: { organizationId: ORGANIZATION_ID, slug: 'nova-clinic', canRename: false },
    });
    expect(fakes.setOrganizationSlug).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      slug: 'nova-clinic',
      irreversibleRenameConfirmed: true,
      initiatedBy: 'clinic',
    });
    expect(fakes.getSlugManagementState).toHaveBeenCalledWith(ORGANIZATION_ID);
  });

  it('исчерпанное право на смену — отдельный отказ, а не «имя занято»', async () => {
    fakes.setOrganizationSlug.mockResolvedValue({
      ok: false,
      code: 'self_rename_allowance_spent',
    });

    const response = await POST(request('another-name'));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'self_rename_allowance_spent',
    });
  });

  it('клиника не может объявить себя админом через тело запроса', async () => {
    // Гейт маршрута — кабинет клиники. Если бы `initiatedBy` приходил из тела, клиника обошла бы
    // единственную самостоятельную смену, назвавшись платформенным админом.
    const req = new Request('http://localhost/api/clinic/slug', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug: 'nova-clinic',
        irreversibleRenameConfirmed: true,
        initiatedBy: 'platform_admin',
      }),
    });

    const result = await POST(req);

    expect(result.status).toBe(400);
    await expect(result.json()).resolves.toEqual({ ok: false, error: 'invalid_body' });
    expect(fakes.setOrganizationSlug).not.toHaveBeenCalled();
  });

  it('returns a safe unique-slug conflict', async () => {
    fakes.setOrganizationSlug.mockResolvedValue({ ok: false, code: 'slug_unavailable' });

    const response = await POST(request('occupied'));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ ok: false, error: 'slug_unavailable' });
    expect(fakes.getSlugManagementState).not.toHaveBeenCalled();
  });

  it('maps a missing exact capability without exposing relation details', async () => {
    fakes.setOrganizationSlug.mockRejectedValue({ code: '42501', detail: 'secret relation' });

    const response = await POST(request());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'directory_capability_unavailable',
    });
  });

  it('cannot choose a different organization through the body', async () => {
    fakes.setOrganizationSlug.mockResolvedValue({ ok: true, slug: 'nova-clinic' });
    fakes.getSlugManagementState.mockResolvedValue({ slug: 'nova-clinic' });

    await POST(
      new Request('http://test/api/clinic/slug', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          slug: 'nova-clinic',
          irreversibleRenameConfirmed: true,
          organizationId: '22222222-2222-4222-8222-222222222222',
        }),
      }),
    );

    expect(fakes.setOrganizationSlug).not.toHaveBeenCalled();
  });
});
