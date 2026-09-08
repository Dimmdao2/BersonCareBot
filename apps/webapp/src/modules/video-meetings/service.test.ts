import { describe, expect, it, vi } from 'vitest';
import { createVideoMeetingsService } from './service';
import type { VideoMeetingProvider, VideoMeetingStore } from './ports';

const ids = {
  organization: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  patient: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  specialist: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
} as const;

describe('video meeting provider health gate', () => {
  it('does not create a meeting while the configured provider is unhealthy', async () => {
    // Failure: a provider outage still creates a meeting and returns unusable join material.
    // Impact: the specialist receives a successful start flow for a call that cannot connect (GATE-04).
    const store = {
      findOrCreateActive: vi.fn().mockResolvedValue({
        meeting: {
          id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
          organizationId: ids.organization,
          patientUserId: ids.patient,
          specialistId: ids.specialist,
          providerRoomRef: 'opaque-room',
          status: 'active',
          expiresAt: '2026-09-08T02:00:00.000Z',
        },
        created: true,
      }),
      rotateInvite: vi.fn().mockResolvedValue(true),
      revokeInvite: vi.fn().mockResolvedValue(true),
      findGuestMeeting: vi.fn().mockResolvedValue(null),
      findPatientMeeting: vi.fn().mockResolvedValue(null),
    } satisfies VideoMeetingStore;
    const provider = {
      health: vi.fn().mockResolvedValue({ ok: false as const, reason: 'provider_unhealthy' as const }),
      issueJoinMaterial: vi.fn(),
    } satisfies VideoMeetingProvider;
    const service = createVideoMeetingsService({
      store,
      provider,
      onlineGate: { isOnlineLocationActive: vi.fn().mockResolvedValue(true) },
    });

    await expect(
      service.createOrResume({
        organizationId: ids.organization,
        patientUserId: ids.patient,
        specialistId: ids.specialist,
        specialistPlatformUserId: ids.specialist,
      }),
    ).resolves.toEqual({ ok: false, error: 'provider_unhealthy' });
    expect(store.findOrCreateActive).not.toHaveBeenCalled();
  });
});
