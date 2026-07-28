import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';
import { PlatformUserContactValidationError } from '@/modules/platform-user-contacts/types';

const buildAppDepsMock = vi.hoisted(() => vi.fn());
const requireDoctorWorkspaceApiContextMock = vi.hoisted(() => vi.fn());
const withDoctorWorkspacePrincipalMock = vi.hoisted(() =>
  vi.fn((_: unknown, sourceOrFn: string | (() => unknown), maybeFn?: () => unknown) => {
    const fn = typeof sourceOrFn === 'function' ? sourceOrFn : maybeFn;
    if (!fn) throw new Error('principal_callback_required');
    return fn();
  }),
);
const getClientIdentityForOrganizationMock = vi.hoisted(() => vi.fn());

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

vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: buildAppDepsMock,
}));

const uid = 'a0000000-0000-4000-8000-000000000001';
const contactId = 'b0000000-0000-4000-8000-000000000002';
const organizationId = 'd0000000-0000-4000-8000-000000000001';

describe('doctor supplementary-contacts routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireDoctorWorkspaceApiContextMock.mockResolvedValue({
      ok: true,
      ctx: {
        organizationId,
        session: { user: { userId: 'doc-1', role: 'doctor' } },
      },
    });
    withDoctorWorkspacePrincipalMock.mockImplementation(
      (_: unknown, sourceOrFn: string | (() => unknown), maybeFn?: () => unknown) => {
        const fn = typeof sourceOrFn === 'function' ? sourceOrFn : maybeFn;
        if (!fn) throw new Error('principal_callback_required');
        return fn();
      },
    );
    getClientIdentityForOrganizationMock.mockResolvedValue({
      userId: uid,
      phone: '+79001112233',
      email: 'identity@example.com',
    });
    buildAppDepsMock.mockReturnValue({
      doctorClientsPort: {
        getClientIdentityForOrganization: getClientIdentityForOrganizationMock,
      },
      platformUserContacts: {
        listForPlatformUser: vi.fn().mockResolvedValue([
          {
            id: contactId,
            platformUserId: uid,
            contactType: 'phone',
            value: '+79004445566',
            valueNormalized: '+79004445566',
            source: 'doctor',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
          {
            id: 'c2',
            platformUserId: uid,
            contactType: 'phone',
            value: '+79001112233',
            valueNormalized: '+79001112233',
            source: 'booking',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ]),
        upsertIfNotIdentityDuplicate: vi.fn().mockResolvedValue({
          id: 'c3',
          contactType: 'email',
          value: 'alt@example.com',
          source: 'doctor',
        }),
        deleteContact: vi.fn().mockResolvedValue(true),
        deleteStaffManagedContact: vi.fn().mockResolvedValue(true),
      },
    });
  });

  it('GET returns contacts without identity duplicates', async () => {
    const { GET } = await import('./route');
    const res = await GET(new Request('http://localhost'), {
      params: Promise.resolve({ userId: uid }),
    });
    const json = (await res.json()) as { ok?: boolean; contacts?: { id: string }[] };
    expect(res.status).toBe(200);
    expect(json.contacts?.map((c) => c.id)).toEqual([contactId]);
    expect(getClientIdentityForOrganizationMock).toHaveBeenCalledWith(uid, organizationId);
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId }),
      expect.any(Function),
    );
  });

  it('GET returns workspace gate response when doctor workspace is unavailable', async () => {
    requireDoctorWorkspaceApiContextMock.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json(
        { ok: false, error: 'doctor_workspace_membership_required' },
        { status: 403 },
      ),
    });

    const { GET } = await import('./route');
    const res = await GET(new Request('http://localhost'), {
      params: Promise.resolve({ userId: uid }),
    });

    expect(res.status).toBe(403);
    expect(buildAppDepsMock).not.toHaveBeenCalled();
  });

  it('POST returns 404 when client is outside selected organization', async () => {
    getClientIdentityForOrganizationMock.mockResolvedValueOnce(null);

    const { POST } = await import('./route');
    const res = await POST(
      new Request('http://localhost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactType: 'email', value: 'alt@example.com' }),
      }),
      { params: Promise.resolve({ userId: uid }) },
    );

    expect(res.status).toBe(404);
    expect(
      buildAppDepsMock().platformUserContacts.upsertIfNotIdentityDuplicate,
    ).not.toHaveBeenCalled();
  });

  it('POST rejects identity duplicate', async () => {
    const deps = buildAppDepsMock();
    deps.platformUserContacts.upsertIfNotIdentityDuplicate.mockRejectedValue(
      new PlatformUserContactValidationError('matches_identity'),
    );
    const { POST } = await import('./route');
    const res = await POST(
      new Request('http://localhost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactType: 'phone', value: '+79001112233' }),
      }),
      { params: Promise.resolve({ userId: uid }) },
    );
    const json = (await res.json()) as { ok?: boolean; error?: string };
    expect(res.status).toBe(400);
    expect(json.error).toBe('matches_identity');
    expect(getClientIdentityForOrganizationMock).toHaveBeenCalledWith(uid, organizationId);
  });

  it('DELETE removes contact', async () => {
    const { DELETE } = await import('./[contactId]/route');
    const res = await DELETE(new Request('http://localhost'), {
      params: Promise.resolve({ userId: uid, contactId }),
    });
    const json = (await res.json()) as { ok?: boolean };
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(getClientIdentityForOrganizationMock).toHaveBeenCalledWith(uid, organizationId);
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId }),
      expect.any(Function),
    );
    expect(buildAppDepsMock().platformUserContacts.deleteStaffManagedContact).toHaveBeenCalled();
  });

  it('DELETE returns 404 when client is outside selected organization', async () => {
    getClientIdentityForOrganizationMock.mockResolvedValueOnce(null);

    const { DELETE } = await import('./[contactId]/route');
    const res = await DELETE(new Request('http://localhost'), {
      params: Promise.resolve({ userId: uid, contactId }),
    });

    expect(res.status).toBe(404);
    expect(
      buildAppDepsMock().platformUserContacts.deleteStaffManagedContact,
    ).not.toHaveBeenCalled();
  });

  it('DELETE rejects auto-saved contacts', async () => {
    const deps = buildAppDepsMock();
    deps.platformUserContacts.deleteStaffManagedContact.mockRejectedValue(
      new PlatformUserContactValidationError('delete_not_allowed'),
    );
    const { DELETE } = await import('./[contactId]/route');
    const res = await DELETE(new Request('http://localhost'), {
      params: Promise.resolve({ userId: uid, contactId }),
    });
    const json = (await res.json()) as { ok?: boolean; error?: string };
    expect(res.status).toBe(403);
    expect(json.error).toBe('delete_not_allowed');
  });
});
