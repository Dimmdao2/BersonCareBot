import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';

const buildAppDepsMock = vi.hoisted(() => vi.fn());
const requireClinicManagementApiContextMock = vi.hoisted(() => vi.fn());
const requireEntitlementMock = vi.hoisted(() => vi.fn());
const sendEmailSetupLinkViaIntegratorMock = vi.hoisted(() => vi.fn());
const getAppBaseUrlMock = vi.hoisted(() => vi.fn());
const runtimeEnv = vi.hoisted(() => ({
  NODE_ENV: 'development' as 'development' | 'test' | 'production',
  ALLOW_DEV_AUTH_BYPASS: true,
}));

vi.mock('@/app-layer/guards/requireRole', () => ({
  requireClinicManagementApiContext: () => requireClinicManagementApiContextMock(),
}));

vi.mock('@/app-layer/guards/requireEntitlement', () => ({
  requireEntitlementForRead: (...args: unknown[]) => requireEntitlementMock(...args),
  requireEntitlementForMutation: (...args: unknown[]) => requireEntitlementMock(...args),
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: buildAppDepsMock,
}));

vi.mock('@/infra/integrations/email/integratorEmailAdapter', () => ({
  sendEmailSetupLinkViaIntegrator: (...args: unknown[]) =>
    sendEmailSetupLinkViaIntegratorMock(...args),
}));

vi.mock('@/modules/system-settings/integrationRuntime', () => ({
  getAppBaseUrl: () => getAppBaseUrlMock(),
}));

vi.mock('@/config/env', () => ({ env: runtimeEnv }));

import { GET, POST } from './route';

const ORG_ID = 'ed63b540-3fb6-499d-897c-f52227ea5dd8';
const OTHER_ORG_ID = '11111111-1111-4111-8111-111111111111';
const CREATOR_ID = '22222222-2222-4222-8222-222222222222';

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/clinic/invites', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('clinic invites route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireClinicManagementApiContextMock.mockResolvedValue({
      ok: true,
      ctx: {
        organizationId: ORG_ID,
        session: { user: { userId: CREATOR_ID, role: 'doctor' } },
      },
    });
    getAppBaseUrlMock.mockResolvedValue('http://127.0.0.1:6300');
    sendEmailSetupLinkViaIntegratorMock.mockResolvedValue({ ok: true });
    requireEntitlementMock.mockResolvedValue({ ok: true });
    runtimeEnv.NODE_ENV = 'development';
    runtimeEnv.ALLOW_DEV_AUTH_BYPASS = true;
  });

  const defaultClinicSeats = {
    getSeatStatus: vi.fn().mockResolvedValue({ limit: 0, used: 0, available: 0 }),
  };

  it('returns the clinic-management guard response before resolving deps', async () => {
    requireClinicManagementApiContextMock.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 }),
    });

    const res = await GET();

    expect(res.status).toBe(403);
    expect(buildAppDepsMock).not.toHaveBeenCalled();
  });

  it('creates an invite in the guard organization and ignores body organizationId', async () => {
    const createInvite = vi.fn().mockResolvedValue({
      ok: true,
      token: 'raw-token',
      invite: {
        id: '33333333-3333-4333-8333-333333333333',
        invitedEmail: 'newdoc-r1@example.com',
        invitedRole: 'doctor',
        expiresAt: '2026-07-20T00:00:00.000Z',
        organizationTitle: 'Clinic',
      },
    });
    buildAppDepsMock.mockReturnValue({
      organizationInvites: { createInvite },
      clinicSeats: defaultClinicSeats,
    });

    const res = await POST(
      makeRequest({
        organizationId: OTHER_ORG_ID,
        email: 'NewDoc-R1@Example.com',
        role: 'doctor',
      }),
    );

    expect(res.status).toBe(200);
    expect(createInvite).toHaveBeenCalledWith({
      organizationId: ORG_ID,
      email: 'NewDoc-R1@Example.com',
      role: 'doctor',
      createdByPlatformUserId: CREATOR_ID,
    });
    const data = (await res.json()) as Record<string, unknown>;
    expect(data.inviteUrl).toBe('http://127.0.0.1:6300/app/clinic/invites/accept?token=raw-token');
  });

  it('rejects unsupported invited role before creating an invite', async () => {
    const createInvite = vi.fn();
    buildAppDepsMock.mockReturnValue({
      organizationInvites: { createInvite },
      clinicSeats: defaultClinicSeats,
    });

    const res = await POST(makeRequest({ email: 'owner@example.com', role: 'owner' }));

    expect(res.status).toBe(400);
    expect(createInvite).not.toHaveBeenCalled();
  });

  it('maps already-active member rejection to 409', async () => {
    const createInvite = vi.fn().mockResolvedValue({ ok: false, code: 'already_member' });
    buildAppDepsMock.mockReturnValue({
      organizationInvites: { createInvite },
      clinicSeats: defaultClinicSeats,
    });

    const res = await POST(makeRequest({ email: 'member@example.com', role: 'admin' }));

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({ ok: false, error: 'already_member' });
  });

  it('maps the atomic seat_limit_reached denial from the service (not just the pre-check) to 409', async () => {
    // The best-effort assertSeatAvailableForInvite pre-check can pass under a race and the
    // authoritative, transaction-atomic check inside createInvite can still deny — the route must
    // surface that denial the same way as the pre-check's.
    const createInvite = vi.fn().mockResolvedValue({ ok: false, code: 'seat_limit_reached' });
    buildAppDepsMock.mockReturnValue({
      organizationInvites: { createInvite },
      clinicSeats: defaultClinicSeats,
    });

    const res = await POST(makeRequest({ email: 'doctor-race@example.com', role: 'doctor' }));

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({ ok: false, error: 'seat_limit_reached' });
  });

  it('allows a same-email replacement at the exact limit without a route-level pre-check rejecting it first', async () => {
    // Regression for the C4A re-audit P1: a route-level best-effort seat pre-check does not know
    // a same-email request replaces (not adds to) its own prior reservation, and would wrongly
    // reject it at the limit. The route must defer entirely to createInvite's atomic, org-locked
    // result, which does know about same-email replacement (pgOrganizationInvites.ts).
    const createInvite = vi.fn().mockResolvedValue({
      ok: true,
      token: 'raw-token',
      invite: {
        id: '44444444-4444-4444-8444-444444444444',
        invitedEmail: 'same-email-replacement@example.com',
        invitedRole: 'doctor',
        expiresAt: '2026-07-27T00:00:00.000Z',
        organizationTitle: 'Clinic',
      },
    });
    buildAppDepsMock.mockReturnValue({
      organizationInvites: { createInvite },
      clinicSeats: defaultClinicSeats,
    });

    const res = await POST(
      makeRequest({ email: 'same-email-replacement@example.com', role: 'doctor' }),
    );

    expect(res.status).toBe(200);
    expect(createInvite).toHaveBeenCalledWith({
      organizationId: ORG_ID,
      email: 'same-email-replacement@example.com',
      role: 'doctor',
      createdByPlatformUserId: CREATOR_ID,
    });
  });

  it('preserves the TEST-only invite preview when delivery is stubbed', async () => {
    runtimeEnv.NODE_ENV = 'test';
    const createInvite = vi.fn().mockResolvedValue({
      ok: true,
      token: 'test-preview-token',
      invite: {
        id: '55555555-5555-4555-8555-555555555555',
        invitedEmail: 'test-preview@example.com',
        invitedRole: 'doctor',
        expiresAt: '2026-07-27T00:00:00.000Z',
        organizationTitle: 'Clinic',
      },
    });
    buildAppDepsMock.mockReturnValue({
      organizationInvites: { createInvite },
      clinicSeats: defaultClinicSeats,
    });

    const response = await POST(makeRequest({ email: 'test-preview@example.com', role: 'doctor' }));
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body.inviteUrl).toBe(
      'http://127.0.0.1:6300/app/clinic/invites/accept?token=test-preview-token',
    );
  });

  it('does not expose an invite token in production even if the dev flag is true', async () => {
    runtimeEnv.NODE_ENV = 'production';
    runtimeEnv.ALLOW_DEV_AUTH_BYPASS = true;
    const createInvite = vi.fn().mockResolvedValue({
      ok: true,
      token: 'must-not-leak',
      invite: {
        id: '66666666-6666-4666-8666-666666666666',
        invitedEmail: 'prod@example.com',
        invitedRole: 'doctor',
        expiresAt: '2026-07-27T00:00:00.000Z',
        organizationTitle: 'Clinic',
      },
    });
    buildAppDepsMock.mockReturnValue({
      organizationInvites: { createInvite },
      clinicSeats: defaultClinicSeats,
    });

    const response = await POST(makeRequest({ email: 'prod@example.com', role: 'doctor' }));
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body).not.toHaveProperty('inviteUrl');
  });

  it('does not suppress a production delivery failure when the dev flag is true', async () => {
    runtimeEnv.NODE_ENV = 'production';
    runtimeEnv.ALLOW_DEV_AUTH_BYPASS = true;
    sendEmailSetupLinkViaIntegratorMock.mockResolvedValueOnce({ ok: false });
    const createInvite = vi.fn().mockResolvedValue({
      ok: true,
      token: 'must-not-leak',
      invite: {
        id: '77777777-7777-4777-8777-777777777777',
        invitedEmail: 'prod-failed@example.com',
        invitedRole: 'doctor',
        expiresAt: '2026-07-27T00:00:00.000Z',
        organizationTitle: 'Clinic',
      },
    });
    buildAppDepsMock.mockReturnValue({
      organizationInvites: { createInvite },
      clinicSeats: defaultClinicSeats,
    });

    const response = await POST(makeRequest({ email: 'prod-failed@example.com', role: 'doctor' }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ ok: false, error: 'email_send_failed' });
  });
});
