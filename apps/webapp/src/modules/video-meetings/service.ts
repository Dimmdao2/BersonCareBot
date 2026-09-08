import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { VideoMeetingOnlineGate, VideoMeetingProvider, VideoMeetingRecord, VideoMeetingStore } from './ports';

const MEETING_TTL_MS = 2 * 60 * 60 * 1000;
const INVITE_TTL_MS = 24 * 60 * 60 * 1000;

export type VideoMeetingServiceFailure =
  | 'online_location_inactive'
  | 'provider_unconfigured'
  | 'provider_unhealthy'
  | 'meeting_unavailable';

function opaque(): string {
  return randomBytes(32).toString('base64url');
}

export function hashVideoMeetingInvite(value: string): string {
  return createHash('sha256').update(`video-meeting-invite:v1:${value}`).digest('hex');
}

/**
 * Lifecycle is deliberately the only module path that can mint join material. Entitlement is
 * applied by the existing route-level `requireEntitlementForRead/Mutation` chokepoints, not here.
 */
export function createVideoMeetingsService(deps: {
  store: VideoMeetingStore;
  provider: VideoMeetingProvider;
  onlineGate: VideoMeetingOnlineGate;
}) {
  async function requireOnlineAndProvider(organizationId: string): Promise<VideoMeetingServiceFailure | null> {
    if (!(await deps.onlineGate.isOnlineLocationActive(organizationId))) return 'online_location_inactive';
    const health = await deps.provider.health();
    return health.ok ? null : health.reason;
  }

  async function join(meeting: VideoMeetingRecord, role: 'specialist' | 'patient', subject: string) {
    if (meeting.status !== 'active' || Date.parse(meeting.expiresAt) <= Date.now()) {
      return { ok: false as const, error: 'meeting_unavailable' as const };
    }
    const failure = await requireOnlineAndProvider(meeting.organizationId);
    if (failure) return { ok: false as const, error: failure };
    try {
      return { ok: true as const, meetingId: meeting.id, session: await deps.provider.issueJoinMaterial({ meeting, role, subject }) };
    } catch {
      return { ok: false as const, error: 'provider_unhealthy' as const };
    }
  }

  return {
    async createOrResume(input: {
      organizationId: string;
      patientUserId: string;
      specialistId: string;
      specialistPlatformUserId: string;
      appointmentId?: string | null;
    }) {
      const failure = await requireOnlineAndProvider(input.organizationId);
      if (failure) return { ok: false as const, error: failure };
      const now = Date.now();
      const result = await deps.store.findOrCreateActive({
        id: randomUUID(),
        organizationId: input.organizationId,
        patientUserId: input.patientUserId,
        specialistId: input.specialistId,
        appointmentId: input.appointmentId ?? null,
        providerRoomRef: opaque(),
        expiresAt: new Date(now + MEETING_TTL_MS).toISOString(),
      });
      const inviteSecret = opaque();
      const inviteIssued = await deps.store.rotateInvite({
        id: randomUUID(), meetingId: result.meeting.id, organizationId: input.organizationId,
        secretHash: hashVideoMeetingInvite(inviteSecret), expiresAt: new Date(now + INVITE_TTL_MS).toISOString(),
        specialistId: input.specialistId, actorPlatformUserId: input.specialistPlatformUserId,
      });
      if (!inviteIssued) throw new Error('video_meeting_invite_issue_failed');
      const joined = await join(result.meeting, 'specialist', input.specialistPlatformUserId);
      if (!joined.ok) return joined;
      return { ...joined, resumed: !result.created, inviteFragment: inviteSecret };
    },

    async rotateInvite(input: { meetingId: string; organizationId: string; specialistId: string; actorPlatformUserId: string }) {
      const secret = opaque();
      const ok = await deps.store.rotateInvite({
        id: randomUUID(), meetingId: input.meetingId, organizationId: input.organizationId,
        secretHash: hashVideoMeetingInvite(secret), expiresAt: new Date(Date.now() + INVITE_TTL_MS).toISOString(),
        specialistId: input.specialistId, actorPlatformUserId: input.actorPlatformUserId,
      });
      return ok ? { ok: true as const, inviteFragment: secret } : { ok: false as const, error: 'meeting_unavailable' as const };
    },

    revokeInvite: (input: { meetingId: string; organizationId: string; specialistId: string; actorPlatformUserId: string }) => deps.store.revokeInvite(input),

    endMeeting: (input: { meetingId: string; organizationId: string; specialistId: string; actorPlatformUserId: string }) =>
      deps.store.endMeeting?.(input) ?? Promise.resolve(false),

    async exchangeGuest(secret: string) {
      if (secret.length < 32) return { ok: false as const, error: 'meeting_unavailable' as const };
      const meeting = await deps.store.findGuestMeeting(hashVideoMeetingInvite(secret));
      if (!meeting) return { ok: false as const, error: 'meeting_unavailable' as const };
      return join(meeting, 'patient', `guest:${meeting.id}`);
    },

    async resolveGuestOrganization(secret: string) {
      if (secret.length < 32) return null;
      const meeting = await deps.store.findGuestMeeting(hashVideoMeetingInvite(secret));
      return meeting ? { organizationId: meeting.organizationId } : null;
    },

    async joinAuthenticatedPatient(input: { meetingId: string; organizationId: string; patientUserId: string }) {
      const meeting = await deps.store.findPatientMeeting(input);
      if (!meeting) return { ok: false as const, error: 'meeting_unavailable' as const };
      return join(meeting, 'patient', input.patientUserId);
    },
  };
}

export type VideoMeetingsService = ReturnType<typeof createVideoMeetingsService>;
