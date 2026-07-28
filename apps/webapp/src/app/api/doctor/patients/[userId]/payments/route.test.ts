import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';

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

import { GET, POST } from './route';

const ORG_ID = '10000000-0000-4000-8000-000000000001';
const DOCTOR_ID = '00000000-0000-4000-8000-00000000000d';
const PATIENT_ID = '00000000-0000-4000-8000-000000000001';
const CANONICAL_PATIENT_ID = '00000000-0000-4000-8000-000000000002';

describe('doctor patient payments route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireEntitlementMock.mockResolvedValue({ ok: true });
    requireDoctorWorkspaceApiContextMock.mockResolvedValue({
      ok: true,
      ctx: {
        organizationId: ORG_ID,
        session: { user: { userId: DOCTOR_ID, role: 'doctor' } },
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

  it('returns workspace gate response before resolving deps', async () => {
    requireDoctorWorkspaceApiContextMock.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json(
        { ok: false, error: 'doctor_workspace_membership_required' },
        { status: 403 },
      ),
    });

    const res = await GET(new Request('http://localhost'), {
      params: Promise.resolve({ userId: PATIENT_ID }),
    });

    expect(res.status).toBe(403);
    expect(buildAppDepsMock).not.toHaveBeenCalled();
  });

  it('rejects payment reads outside selected workspace', async () => {
    const getClientIdentityForOrganization = vi.fn().mockResolvedValue(null);
    const listPaymentsWithSummary = vi.fn();
    buildAppDepsMock.mockReturnValue({
      doctorClientsPort: { getClientIdentityForOrganization },
      patientPayments: { listPaymentsWithSummary },
    });

    const res = await GET(new Request('http://localhost'), {
      params: Promise.resolve({ userId: PATIENT_ID }),
    });

    expect(res.status).toBe(404);
    expect(getClientIdentityForOrganization).toHaveBeenCalledWith(PATIENT_ID, ORG_ID);
    expect(withDoctorWorkspacePrincipalMock).not.toHaveBeenCalled();
    expect(listPaymentsWithSummary).not.toHaveBeenCalled();
  });

  it('lists payments for canonical patient under selected workspace principal', async () => {
    const getClientIdentityForOrganization = vi
      .fn()
      .mockResolvedValue({ userId: CANONICAL_PATIENT_ID });
    const listPaymentsWithSummary = vi.fn().mockResolvedValue({ payments: [], totalPaidMinor: 0 });
    buildAppDepsMock.mockReturnValue({
      doctorClientsPort: { getClientIdentityForOrganization },
      patientPayments: { listPaymentsWithSummary },
    });

    const res = await GET(new Request('http://localhost'), {
      params: Promise.resolve({ userId: PATIENT_ID }),
    });

    expect(res.status).toBe(200);
    expect(listPaymentsWithSummary).toHaveBeenCalledWith(CANONICAL_PATIENT_ID);
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORG_ID }),
      expect.any(Function),
    );
  });

  it('does not create cash payment outside selected workspace', async () => {
    const getClientIdentityForOrganization = vi.fn().mockResolvedValue(null);
    const addCashPayment = vi.fn();
    buildAppDepsMock.mockReturnValue({
      doctorClientsPort: { getClientIdentityForOrganization },
      patientPayments: { addCashPayment },
    });

    const res = await POST(
      new Request('http://localhost', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ amountMinor: 1000 }),
      }),
      { params: Promise.resolve({ userId: PATIENT_ID }) },
    );

    expect(res.status).toBe(404);
    expect(addCashPayment).not.toHaveBeenCalled();
    expect(withDoctorWorkspacePrincipalMock).not.toHaveBeenCalled();
  });

  it('creates cash payment for canonical patient under selected workspace principal', async () => {
    const getClientIdentityForOrganization = vi
      .fn()
      .mockResolvedValue({ userId: CANONICAL_PATIENT_ID });
    const addCashPayment = vi.fn().mockResolvedValue({ id: 'payment-1' });
    buildAppDepsMock.mockReturnValue({
      doctorClientsPort: { getClientIdentityForOrganization },
      patientPayments: { addCashPayment },
    });

    const res = await POST(
      new Request('http://localhost', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ amountMinor: 1000, comment: 'cash' }),
      }),
      { params: Promise.resolve({ userId: PATIENT_ID }) },
    );

    expect(res.status).toBe(201);
    expect(requireEntitlementMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORG_ID }),
      'payments',
    );
    expect(addCashPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG_ID,
        patientUserId: CANONICAL_PATIENT_ID,
        amountMinor: 1000,
        comment: 'cash',
        createdBy: DOCTOR_ID,
      }),
    );
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORG_ID }),
      expect.any(Function),
    );
  });

  it('denies cash payment creation when the payments mechanic is disabled, after identity resolution', async () => {
    const order: string[] = [];
    const getClientIdentityForOrganization = vi.fn().mockImplementation(async () => {
      order.push('identity');
      return { userId: CANONICAL_PATIENT_ID };
    });
    const addCashPayment = vi.fn();
    requireEntitlementMock.mockImplementation(async () => {
      order.push('entitlement');
      return { ok: false, response: new Response(null, { status: 403 }) };
    });
    buildAppDepsMock.mockReturnValue({
      doctorClientsPort: { getClientIdentityForOrganization },
      patientPayments: { addCashPayment },
    });

    const res = await POST(
      new Request('http://localhost', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ amountMinor: 1000 }),
      }),
      { params: Promise.resolve({ userId: PATIENT_ID }) },
    );

    expect(res.status).toBe(403);
    expect(order).toEqual(['identity', 'entitlement']);
    expect(requireEntitlementMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORG_ID }),
      'payments',
    );
    expect(addCashPayment).not.toHaveBeenCalled();
    expect(withDoctorWorkspacePrincipalMock).not.toHaveBeenCalled();
  });
});
