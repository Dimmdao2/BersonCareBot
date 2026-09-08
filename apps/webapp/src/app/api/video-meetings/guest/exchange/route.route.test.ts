import { beforeEach, describe, expect, it, vi } from 'vitest';

const bearer = 'a'.repeat(48);
const organizationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const fakes = vi.hoisted(() => ({
  stampBootstrapPrincipal: vi.fn(),
  buildAppDeps: vi.fn(),
  requireEntitlementForRead: vi.fn(),
}));

vi.mock('@/app-layer/principal/bootstrapPrincipal', () => ({
  stampBootstrapPrincipal: fakes.stampBootstrapPrincipal,
}));
vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: fakes.buildAppDeps }));
vi.mock('@/app-layer/guards/requireEntitlement', () => ({
  requireEntitlementForRead: fakes.requireEntitlementForRead,
}));

import { POST } from './route';

describe('guest video-meeting exchange entitlement gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not mint a guest join capability after the organization loses video_meetings entitlement', async () => {
    // Failure: a still-valid guest bearer joins after the clinic's video entitlement is disabled.
    // Impact: a guest bypasses GATE-01/02 and receives a live meeting capability.
    const exchangeGuest = vi.fn().mockResolvedValue({
      ok: true,
      meetingId: '11111111-1111-4111-8111-111111111111',
      join: {
        provider: 'jitsi',
        conferenceUrl: 'https://meet.example',
        capability: 'short-lived-capability',
        expiresAt: '2026-09-08T00:10:00.000Z',
      },
    });
    fakes.buildAppDeps.mockReturnValue({
      videoMeetings: {
        resolveGuestOrganization: vi.fn().mockResolvedValue({ organizationId }),
        exchangeGuest,
      },
    });
    fakes.requireEntitlementForRead.mockResolvedValue({ ok: false });

    const response = await POST(
      new Request('https://clinic.example/api/video-meetings/guest/exchange', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ bearer }),
      }),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ ok: false, error: 'meeting_unavailable' });
    expect(exchangeGuest).not.toHaveBeenCalled();
  });
});
