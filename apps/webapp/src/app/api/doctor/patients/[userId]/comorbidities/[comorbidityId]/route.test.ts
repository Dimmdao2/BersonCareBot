import { beforeEach, describe, expect, it, vi } from 'vitest';

const buildAppDepsMock = vi.hoisted(() => vi.fn());
const requireDoctorWorkspaceApiContextMock = vi.hoisted(() => vi.fn());
const requireEntitlementMock = vi.hoisted(() => vi.fn());
const withDoctorWorkspacePrincipalMock = vi.hoisted(() =>
  vi.fn((_: unknown, sourceOrFn: string | (() => unknown), maybeFn?: () => unknown) => {
    const fn = typeof sourceOrFn === 'function' ? sourceOrFn : maybeFn;
    if (!fn) throw new Error('principal_callback_required');
    return fn();
  }),
);

vi.mock('@/app-layer/guards/requireRole', () => ({
  requireDoctorWorkspaceApiContext: () => requireDoctorWorkspaceApiContextMock(),
}));

vi.mock('@/app-layer/guards/requireEntitlement', () => ({
  requireEntitlementForMutation: (...args: unknown[]) => requireEntitlementMock(...args),
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

import { DELETE, PATCH } from './route';

const ORG_ID = '10000000-0000-4000-8000-000000000001';
const PATIENT_ID = '00000000-0000-4000-8000-000000000001';
const CANONICAL_PATIENT_ID = '00000000-0000-4000-8000-000000000002';
const COMORBIDITY_ID = '00000000-0000-4000-8000-0000000000cc';

describe('doctor patient comorbidity item route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireEntitlementMock.mockResolvedValue({ ok: true });
    requireDoctorWorkspaceApiContextMock.mockResolvedValue({
      ok: true,
      ctx: {
        organizationId: ORG_ID,
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
  });

  it('rejects comorbidity updates outside selected workspace', async () => {
    const getClientIdentityForOrganization = vi.fn().mockResolvedValue(null);
    const editText = vi.fn();
    buildAppDepsMock.mockReturnValue({
      doctorClientsPort: { getClientIdentityForOrganization },
      patientComorbidities: { editText },
    });

    const res = await PATCH(
      new Request('http://localhost', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: 'Астма' }),
      }),
      { params: Promise.resolve({ userId: PATIENT_ID, comorbidityId: COMORBIDITY_ID }) },
    );

    expect(res.status).toBe(404);
    expect(getClientIdentityForOrganization).toHaveBeenCalledWith(PATIENT_ID, ORG_ID);
    expect(withDoctorWorkspacePrincipalMock).not.toHaveBeenCalled();
    expect(editText).not.toHaveBeenCalled();
  });

  it('edits comorbidity for canonical patient under selected workspace principal', async () => {
    const getClientIdentityForOrganization = vi
      .fn()
      .mockResolvedValue({ userId: CANONICAL_PATIENT_ID });
    const editText = vi.fn().mockResolvedValue(true);
    buildAppDepsMock.mockReturnValue({
      doctorClientsPort: { getClientIdentityForOrganization },
      patientComorbidities: { editText },
    });

    const res = await PATCH(
      new Request('http://localhost', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: 'Астма', since: 'с 2018' }),
      }),
      { params: Promise.resolve({ userId: PATIENT_ID, comorbidityId: COMORBIDITY_ID }) },
    );

    expect(res.status).toBe(200);
    expect(editText).toHaveBeenCalledWith({
      patientUserId: CANONICAL_PATIENT_ID,
      comorbidityId: COMORBIDITY_ID,
      text: 'Астма',
      since: 'с 2018',
    });
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORG_ID }),
      expect.any(Function),
    );
  });

  it('restores comorbidity for canonical patient under selected workspace principal', async () => {
    const getClientIdentityForOrganization = vi
      .fn()
      .mockResolvedValue({ userId: CANONICAL_PATIENT_ID });
    const restore = vi.fn().mockResolvedValue(true);
    buildAppDepsMock.mockReturnValue({
      doctorClientsPort: { getClientIdentityForOrganization },
      patientComorbidities: { restore },
    });

    const res = await PATCH(
      new Request('http://localhost', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'restore' }),
      }),
      { params: Promise.resolve({ userId: PATIENT_ID, comorbidityId: COMORBIDITY_ID }) },
    );

    expect(res.status).toBe(200);
    expect(restore).toHaveBeenCalledWith(CANONICAL_PATIENT_ID, COMORBIDITY_ID);
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORG_ID }),
      expect.any(Function),
    );
  });

  it('removes comorbidity for canonical patient under selected workspace principal', async () => {
    const getClientIdentityForOrganization = vi
      .fn()
      .mockResolvedValue({ userId: CANONICAL_PATIENT_ID });
    const markRemoved = vi.fn().mockResolvedValue(true);
    buildAppDepsMock.mockReturnValue({
      doctorClientsPort: { getClientIdentityForOrganization },
      patientComorbidities: { markRemoved },
    });

    const res = await DELETE(new Request('http://localhost', { method: 'DELETE' }), {
      params: Promise.resolve({ userId: PATIENT_ID, comorbidityId: COMORBIDITY_ID }),
    });

    expect(res.status).toBe(200);
    expect(markRemoved).toHaveBeenCalledWith(CANONICAL_PATIENT_ID, COMORBIDITY_ID);
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORG_ID }),
      expect.any(Function),
    );
  });

  it('maps principal mismatch errors to not_found', async () => {
    const getClientIdentityForOrganization = vi
      .fn()
      .mockResolvedValue({ userId: CANONICAL_PATIENT_ID });
    const editText = vi.fn().mockRejectedValue(new Error('organization_principal_mismatch'));
    buildAppDepsMock.mockReturnValue({
      doctorClientsPort: { getClientIdentityForOrganization },
      patientComorbidities: { editText },
    });

    const res = await PATCH(
      new Request('http://localhost', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: 'Астма' }),
      }),
      { params: Promise.resolve({ userId: PATIENT_ID, comorbidityId: COMORBIDITY_ID }) },
    );

    expect(res.status).toBe(404);
  });

  it('denies both edit and restore branches after identity resolution without calling either service', async () => {
    const order: string[] = [];
    const getClientIdentityForOrganization = vi.fn().mockImplementation(async () => {
      order.push('identity');
      return { userId: CANONICAL_PATIENT_ID };
    });
    const editText = vi.fn();
    const restore = vi.fn();
    requireEntitlementMock.mockImplementation(async () => {
      order.push('entitlement');
      return { ok: false, response: new Response(null, { status: 403 }) };
    });
    buildAppDepsMock.mockReturnValue({
      doctorClientsPort: { getClientIdentityForOrganization },
      patientComorbidities: { editText, restore },
    });

    const editResponse = await PATCH(
      new Request('http://localhost', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: 'Астма' }),
      }),
      { params: Promise.resolve({ userId: PATIENT_ID, comorbidityId: COMORBIDITY_ID }) },
    );
    const restoreResponse = await PATCH(
      new Request('http://localhost', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'restore' }),
      }),
      { params: Promise.resolve({ userId: PATIENT_ID, comorbidityId: COMORBIDITY_ID }) },
    );

    expect(editResponse.status).toBe(403);
    expect(restoreResponse.status).toBe(403);
    expect(order).toEqual(['identity', 'entitlement', 'identity', 'entitlement']);
    expect(editText).not.toHaveBeenCalled();
    expect(restore).not.toHaveBeenCalled();
  });

  it('denies soft removal after identity resolution and preserves the existing record', async () => {
    const order: string[] = [];
    const getClientIdentityForOrganization = vi.fn().mockImplementation(async () => {
      order.push('identity');
      return { userId: CANONICAL_PATIENT_ID };
    });
    const markRemoved = vi.fn();
    requireEntitlementMock.mockImplementation(async () => {
      order.push('entitlement');
      return { ok: false, response: new Response(null, { status: 403 }) };
    });
    buildAppDepsMock.mockReturnValue({
      doctorClientsPort: { getClientIdentityForOrganization },
      patientComorbidities: { markRemoved },
    });

    const res = await DELETE(new Request('http://localhost', { method: 'DELETE' }), {
      params: Promise.resolve({ userId: PATIENT_ID, comorbidityId: COMORBIDITY_ID }),
    });

    expect(res.status).toBe(403);
    expect(order).toEqual(['identity', 'entitlement']);
    expect(markRemoved).not.toHaveBeenCalled();
  });
});
