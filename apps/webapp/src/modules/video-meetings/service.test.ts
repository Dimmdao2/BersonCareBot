import { describe, expect, it, vi } from 'vitest';
import { createVideoMeetingsService } from './service';
import type {
  VideoMeetingInvitationNotification,
  VideoMeetingProvider,
  VideoMeetingStore,
} from './ports';

const ids = {
  organization: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  patient: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  specialist: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
} as const;

const meetingRecord = {
  id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  organizationId: ids.organization,
  patientUserId: ids.patient,
  specialistId: ids.specialist,
  providerRoomRef: 'opaque-room',
  status: 'active' as const,
  expiresAt: '2099-09-08T02:00:00.000Z',
};

function healthyProvider(): VideoMeetingProvider {
  return {
    health: vi.fn().mockResolvedValue({ ok: true }),
    issueJoinMaterial: vi.fn().mockResolvedValue({
      renderer: 'embedded_conference',
      endpoint: null,
      roomReference: 'room-ref',
      accessToken: 'token',
      expiresAt: '2099-09-08T02:00:00.000Z',
    }),
  };
}

function storeReturning(created: boolean): VideoMeetingStore {
  return {
    findOrCreateActive: vi.fn().mockResolvedValue({ meeting: meetingRecord, created }),
    rotateInvite: vi.fn().mockResolvedValue(true),
    revokeInvite: vi.fn().mockResolvedValue(true),
    findGuestMeeting: vi.fn().mockResolvedValue(null),
    findPatientMeeting: vi.fn().mockResolvedValue(null),
  };
}

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

describe('video meeting invitation notification dedup (ACC-05)', () => {
  it('enqueues exactly one invitation notification for a newly created meeting', async () => {
    // Failure: a resumed/retried meeting re-triggers the invitation, or a fresh meeting silently
    // sends none. Impact: the patient is spammed on every reconnect, or never learns about the call.
    const invitationNotification: VideoMeetingInvitationNotification = {
      enqueue: vi.fn().mockResolvedValue({
        status: 'queued',
        selectedChannels: ['telegram'],
        queuedChannels: ['telegram'],
        deduplicatedChannels: [],
      }),
    };
    const service = createVideoMeetingsService({
      store: storeReturning(true),
      provider: healthyProvider(),
      invitationNotification,
      resolvePatientPublicOrigin: vi.fn().mockResolvedValue('https://clinic.therapygo.ru'),
    });

    const result = await service.createOrResume({
      organizationId: ids.organization,
      patientUserId: ids.patient,
      specialistId: ids.specialist,
      specialistPlatformUserId: ids.specialist,
    });

    expect(invitationNotification.enqueue).toHaveBeenCalledTimes(1);
    expect(invitationNotification.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ids.organization,
        patientUserId: ids.patient,
        meetingId: meetingRecord.id,
        guestUrl: expect.stringMatching(/^https:\/\/clinic\.therapygo\.ru\/live#/),
      }),
    );
    expect(result.ok && result.notification?.status).toBe('queued');
  });

  it('does not enqueue a second invitation notification when the active meeting is resumed', async () => {
    const invitationNotification: VideoMeetingInvitationNotification = {
      enqueue: vi.fn().mockResolvedValue({
        status: 'queued',
        selectedChannels: ['telegram'],
        queuedChannels: ['telegram'],
        deduplicatedChannels: [],
      }),
    };
    const service = createVideoMeetingsService({
      store: storeReturning(false),
      provider: healthyProvider(),
      invitationNotification,
      resolvePatientPublicOrigin: vi.fn().mockResolvedValue('https://clinic.therapygo.ru'),
    });

    const result = await service.createOrResume({
      organizationId: ids.organization,
      patientUserId: ids.patient,
      specialistId: ids.specialist,
      specialistPlatformUserId: ids.specialist,
    });

    expect(invitationNotification.enqueue).not.toHaveBeenCalled();
    expect(result.ok && 'notification' in result).toBe(false);
  });

  it('keeps the copyable invite link and lifecycle intact when notification delivery throws', async () => {
    // Failure: a queue/channel/origin failure aborts meeting creation or hides the invite fragment.
    // Impact: the specialist loses the only copyable link because an unrelated delivery step failed
    // (GATE-04 bounded best-effort).
    const invitationNotification: VideoMeetingInvitationNotification = {
      enqueue: vi.fn().mockRejectedValue(new Error('queue unavailable')),
    };
    const service = createVideoMeetingsService({
      store: storeReturning(true),
      provider: healthyProvider(),
      invitationNotification,
      resolvePatientPublicOrigin: vi.fn().mockResolvedValue('https://clinic.therapygo.ru'),
    });

    const result = await service.createOrResume({
      organizationId: ids.organization,
      patientUserId: ids.patient,
      specialistId: ids.specialist,
      specialistPlatformUserId: ids.specialist,
    });

    expect(result.ok).toBe(true);
    expect(result.ok && result.inviteFragment).toEqual(expect.any(String));
    expect(result.ok && result.notification?.status).toBe('unavailable');
  });

  it('keeps the meeting startable when the branded patient origin cannot be resolved', async () => {
    // Failure: resolving the clinic's patient origin rejects (an organization with no public
    // directory projection on a deployment with distinct patient/staff hosts), and the rejection
    // escapes createOrResume — after the meeting row and its invite have already been written.
    // Impact: such a clinic can never start a video call at all; every retry writes another
    // invite and fails again. Before the branded-link change this same condition only degraded
    // the notification (ACC-05 / GATE-04 bounded best-effort), which is the oracle here and the
    // contract the neighbouring delivery-failure test already claims for an "origin failure".
    const service = createVideoMeetingsService({
      store: storeReturning(true),
      provider: healthyProvider(),
      invitationNotification: { enqueue: vi.fn() },
      resolvePatientPublicOrigin: vi
        .fn()
        .mockRejectedValue(new Error('patient_public_origin_unresolved')),
    });

    const result = await service.createOrResume({
      organizationId: ids.organization,
      patientUserId: ids.patient,
      specialistId: ids.specialist,
      specialistPlatformUserId: ids.specialist,
    });

    expect(result.ok).toBe(true);
    expect(result.ok && result.session).toBeTruthy();
  });
});

describe('createOrResume never rotates the invite on resume (ACC-08)', () => {
  it('does not rotate the invite and returns guestUrl=null when the active meeting already existed', async () => {
    // Failure: `createOrResume` calls `store.rotateInvite` unconditionally on every call, so a
    // plain resume (opening/re-opening the live page while a call is active) silently replaces
    // the already-delivered invite secret and hands back a fresh guestUrl.
    // Impact: the link the patient already received stops working the moment the specialist's
    // page re-renders or is reopened, without any explicit "Выпустить новую ссылку" action; raw
    // secrets are not stored, so a resumed session cannot legitimately reconstruct the original
    // guestUrl at all — it must come back as `null`.
    const store = storeReturning(false);
    const service = createVideoMeetingsService({
      store,
      provider: healthyProvider(),
      invitationNotification: { enqueue: vi.fn() },
      resolvePatientPublicOrigin: vi.fn().mockResolvedValue('https://clinic.therapygo.ru'),
    });

    const result = await service.createOrResume({
      organizationId: ids.organization,
      patientUserId: ids.patient,
      specialistId: ids.specialist,
      specialistPlatformUserId: ids.specialist,
    });

    expect(store.rotateInvite).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
    expect(result.ok && (result.guestUrl ?? null)).toBeNull();
  });

  it('still rotates the invite exactly once when a new meeting is created', async () => {
    // Guard for the fix above: refusing to rotate on every call is safe, refusing to ever issue
    // the first invite on create is not (ACC-08: "Invite выпускается ровно один раз при создании
    // встречи").
    const store = storeReturning(true);
    const service = createVideoMeetingsService({
      store,
      provider: healthyProvider(),
      invitationNotification: { enqueue: vi.fn().mockResolvedValue({ status: 'queued', selectedChannels: [], queuedChannels: [], deduplicatedChannels: [] }) },
      resolvePatientPublicOrigin: vi.fn().mockResolvedValue('https://clinic.therapygo.ru'),
    });

    const result = await service.createOrResume({
      organizationId: ids.organization,
      patientUserId: ids.patient,
      specialistId: ids.specialist,
      specialistPlatformUserId: ids.specialist,
    });

    expect(store.rotateInvite).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
    expect(result.ok && result.guestUrl).toEqual(expect.stringMatching(/^https:\/\/clinic\.therapygo\.ru\/live#/));
  });
});

describe('explicit rotate_invite follows the same notification contract as create (ACC-08)', () => {
  it('enqueues exactly one invitation notification through the ACC-07 contract when the specialist explicitly rotates the invite', async () => {
    // Failure: the standalone `rotateInvite` lifecycle action mints a new secret/guestUrl but
    // never calls the notification port, so "Выпустить новую ссылку" replaces the capability
    // without ever telling the patient the old link stopped working.
    // Impact: the specialist copies a fresh link that the patient was never notified about, or —
    // if the patient only had the original delivered link — has no way to learn it changed.
    const store = storeReturning(true);
    const invitationNotification: VideoMeetingInvitationNotification = {
      enqueue: vi.fn().mockResolvedValue({
        status: 'queued',
        selectedChannels: ['telegram'],
        queuedChannels: ['telegram'],
        deduplicatedChannels: [],
      }),
    };
    const service = createVideoMeetingsService({
      store,
      provider: healthyProvider(),
      invitationNotification,
      resolvePatientPublicOrigin: vi.fn().mockResolvedValue('https://clinic.therapygo.ru'),
    });

    const rotateInput = {
      meetingId: meetingRecord.id,
      organizationId: ids.organization,
      patientUserId: ids.patient,
      specialistId: ids.specialist,
      actorPlatformUserId: ids.specialist,
    };
    await service.rotateInvite(rotateInput);

    expect(invitationNotification.enqueue).toHaveBeenCalledTimes(1);
  });
});
