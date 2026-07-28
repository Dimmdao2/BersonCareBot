/**
 * Unit tests for GET /api/integrator/web-push/subscriptions (PLAN S13 Model β).
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const assertMock = vi.hoisted(() => vi.fn());
const enterOrganizationPrincipalMock = vi.hoisted(() => vi.fn().mockReturnValue(true));
const hasActiveEnrollmentMock = vi.hoisted(() => vi.fn().mockResolvedValue(true));
const hasActiveMembershipMock = vi.hoisted(() => vi.fn().mockResolvedValue(false));
vi.mock('@/app-layer/integrator/assertIntegratorGetRequest', () => ({
  assertIntegratorGetRequest: assertMock,
}));
vi.mock('@/app-layer/principal/integratorOrganizationPrincipal', () => ({
  enterVerifiedIntegratorOrganizationPrincipal: enterOrganizationPrincipalMock,
}));

const mockListActiveByUserId = vi.hoisted(() => vi.fn().mockResolvedValue([]));
// buildAppDeps creates the port at module level, so we must mock the whole thing
// rather than just the factory function.
vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({
    organizationMembership: { hasActiveMembership: hasActiveMembershipMock },
    patientOrganization: { hasActiveEnrollment: hasActiveEnrollmentMock },
    webPushSubscriptions: {
      listActiveByUserId: mockListActiveByUserId,
    },
  }),
}));

import { GET } from './route';
import {
  integratorGetSignedHeadersOk,
  wireDefaultAssertIntegratorGetForRouteTests,
} from '../../testUtils/wireAssertIntegratorGetForRouteTests';

const STUB_SUBSCRIPTION = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/stub-endpoint',
  expirationTime: null,
  keys: { p256dh: 'p256dh-value', auth: 'auth-value' },
};
const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const signedUrl = (userId: string) =>
  `http://localhost/api/integrator/web-push/subscriptions?userId=${userId}&organizationId=${ORGANIZATION_ID}`;

describe('GET /api/integrator/web-push/subscriptions', () => {
  beforeEach(() => {
    wireDefaultAssertIntegratorGetForRouteTests(assertMock);
    enterOrganizationPrincipalMock.mockReset().mockReturnValue(true);
    hasActiveEnrollmentMock.mockReset().mockResolvedValue(true);
    hasActiveMembershipMock.mockReset().mockResolvedValue(false);
    mockListActiveByUserId.mockReset().mockResolvedValue([]);
  });

  it('returns 400 when missing webhook headers', async () => {
    const res = await GET(new Request('http://localhost/api/integrator/web-push/subscriptions'));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json).toMatchObject({ ok: false, error: expect.any(String) });
  });

  it('returns 401 when signature invalid', async () => {
    const res = await GET(
      new Request('http://localhost/api/integrator/web-push/subscriptions?userId=user-1', {
        headers: { 'x-bersoncare-timestamp': '1700000000', 'x-bersoncare-signature': 'bad' },
      }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 when userId is missing', async () => {
    const res = await GET(
      new Request('http://localhost/api/integrator/web-push/subscriptions', {
        headers: integratorGetSignedHeadersOk,
      }),
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('userId');
  });

  it('returns 200 with empty subscriptions when user has none', async () => {
    mockListActiveByUserId.mockResolvedValue([]);
    const res = await GET(
      new Request(signedUrl('user-with-no-subs'), {
        headers: integratorGetSignedHeadersOk,
      }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ ok: true, subscriptions: [] });
  });

  it('returns 200 with subscriptions for user', async () => {
    mockListActiveByUserId.mockResolvedValue([STUB_SUBSCRIPTION]);
    const res = await GET(
      new Request(signedUrl('user-uuid-123'), {
        headers: integratorGetSignedHeadersOk,
      }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.subscriptions).toHaveLength(1);
    expect(json.subscriptions[0].endpoint).toBe(STUB_SUBSCRIPTION.endpoint);
    expect(json.subscriptions[0].keys.p256dh).toBe(STUB_SUBSCRIPTION.keys.p256dh);
    expect(json.subscriptions[0].keys.auth).toBe(STUB_SUBSCRIPTION.keys.auth);
    expect(mockListActiveByUserId).toHaveBeenCalledWith('user-uuid-123');
  });

  it('calls listActiveByUserId with the provided userId', async () => {
    const res = await GET(
      new Request(signedUrl('specific-user-id'), {
        headers: integratorGetSignedHeadersOk,
      }),
    );
    expect(res.status).toBe(200);
    expect(mockListActiveByUserId).toHaveBeenCalledWith('specific-user-id');
  });

  it('returns 403 when the user is outside the verified organization', async () => {
    hasActiveEnrollmentMock.mockResolvedValue(false);
    const res = await GET(
      new Request(signedUrl('outside-user'), { headers: integratorGetSignedHeadersOk }),
    );
    expect(res.status).toBe(403);
    expect(mockListActiveByUserId).not.toHaveBeenCalled();
  });

  it('returns subscriptions for active staff in the exact organization', async () => {
    hasActiveEnrollmentMock.mockResolvedValue(false);
    hasActiveMembershipMock.mockResolvedValue(true);
    const res = await GET(
      new Request(signedUrl('staff-user'), { headers: integratorGetSignedHeadersOk }),
    );
    expect(res.status).toBe(200);
    expect(hasActiveMembershipMock).toHaveBeenCalledWith('staff-user', ORGANIZATION_ID);
  });
});
