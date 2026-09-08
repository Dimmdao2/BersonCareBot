import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type {
  VideoMeetingInvitationNotification,
  VideoMeetingInvitationNotificationResult,
  VideoMeetingProvider,
  VideoMeetingRecord,
  VideoMeetingStore,
} from './ports';

const MEETING_TTL_MS = 2 * 60 * 60 * 1000;
const INVITE_TTL_MS = 24 * 60 * 60 * 1000;

export type VideoMeetingServiceFailure =
  | 'provider_unconfigured'
  | 'provider_unhealthy'
  | 'meeting_unavailable';

function opaque(): string {
  return randomBytes(32).toString('base64url');
}

export function hashVideoMeetingInvite(value: string): string {
  return createHash('sha256').update(`video-meeting-invite:v1:${value}`).digest('hex');
}

function buildGuestUrl(patientPublicOrigin: string, inviteFragment: string): string {
  const url = new URL('/live', patientPublicOrigin);
  url.hash = inviteFragment;
  return url.toString();
}

function notificationUnavailable(): VideoMeetingInvitationNotificationResult {
  return {
    status: 'unavailable',
    selectedChannels: [],
    queuedChannels: [],
    deduplicatedChannels: [],
  };
}

/**
 * Lifecycle is deliberately the only module path that can mint join material. Entitlement is
 * applied by the existing route-level `requireEntitlementForRead/Mutation` chokepoints, not here.
 */
export function createVideoMeetingsService(deps: {
  store: VideoMeetingStore;
  provider: VideoMeetingProvider;
  invitationNotification?: VideoMeetingInvitationNotification;
  resolvePatientPublicOrigin?: (organizationId: string) => Promise<string>;
  logDiagnostic?: (payload: { meetingId: string; organizationId: string; role: 'specialist'; event: 'join' | 'error' | 'end'; durationMs?: number; transport?: 'p2p' | 'relay'; errorClass?: 'connection' | 'media' | 'provider' }) => void;
}) {
  async function requireProvider(): Promise<VideoMeetingServiceFailure | null> {
    const health = await deps.provider.health();
    return health.ok ? null : health.reason;
  }

  async function join(meeting: VideoMeetingRecord, role: 'specialist' | 'patient', subject: string) {
    if (meeting.status !== 'active' || Date.parse(meeting.expiresAt) <= Date.now()) {
      return { ok: false as const, error: 'meeting_unavailable' as const };
    }
    const failure = await requireProvider();
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
      const failure = await requireProvider();
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
      const inviteId = randomUUID();
      const inviteSecret = result.created ? opaque() : null;
      if (result.created && inviteSecret) {
        const inviteIssued = await deps.store.rotateInvite({
          id: inviteId, meetingId: result.meeting.id, organizationId: input.organizationId,
          secretHash: hashVideoMeetingInvite(inviteSecret), expiresAt: new Date(now + INVITE_TTL_MS).toISOString(),
          specialistId: input.specialistId, actorPlatformUserId: input.specialistPlatformUserId,
        });
        if (!inviteIssued) throw new Error('video_meeting_invite_issue_failed');
      }
      let guestUrl: string | null = null;
      try {
        guestUrl = deps.resolvePatientPublicOrigin
          && inviteSecret
          ? buildGuestUrl(await deps.resolvePatientPublicOrigin(input.organizationId), inviteSecret)
          : null;
      } catch {
        // A missing branded patient origin may withhold a copyable link and notification, never
        // the already-issued meeting or specialist session.
        guestUrl = null;
      }
      let notification: VideoMeetingInvitationNotificationResult | undefined;
      if (result.created) {
        if (!deps.invitationNotification || !guestUrl) {
          notification = notificationUnavailable();
        } else {
          try {
            notification = await deps.invitationNotification.enqueue({
              organizationId: input.organizationId,
              patientUserId: input.patientUserId,
              meetingId: result.meeting.id,
              inviteId,
              guestUrl,
            });
          } catch {
            // Meeting and invite have already been issued. Delivery availability must not change
            // their lifecycle or expose the fragment through an error/log payload.
            notification = notificationUnavailable();
          }
        }
      }
      const joined = await join(result.meeting, 'specialist', input.specialistPlatformUserId);
      if (!joined.ok) return joined;
      return {
        ...joined,
        resumed: !result.created,
        // Raw material remains inside the application service for the notification pipeline;
        // the doctor HTTP route deliberately serializes only the branded fragment URL.
        ...(inviteSecret ? { inviteFragment: inviteSecret } : {}),
        guestUrl,
        ...(notification ? { notification } : {}),
      };
    },

    async rotateInvite(input: { meetingId: string; organizationId: string; patientUserId: string; specialistId: string; actorPlatformUserId: string }) {
      const meeting = await deps.store.findSpecialistMeeting?.({
        meetingId: input.meetingId,
        organizationId: input.organizationId,
        specialistId: input.specialistId,
      });
      if (!meeting || meeting.patientUserId !== input.patientUserId) {
        return { ok: false as const, error: 'meeting_unavailable' as const };
      }
      const secret = opaque();
      const inviteId = randomUUID();
      const ok = await deps.store.rotateInvite({
        id: inviteId, meetingId: input.meetingId, organizationId: input.organizationId,
        secretHash: hashVideoMeetingInvite(secret), expiresAt: new Date(Date.now() + INVITE_TTL_MS).toISOString(),
        specialistId: input.specialistId, actorPlatformUserId: input.actorPlatformUserId,
      });
      if (!ok) return { ok: false as const, error: 'meeting_unavailable' as const };
      let guestUrl: string | undefined;
      try {
        guestUrl = deps.resolvePatientPublicOrigin
          ? buildGuestUrl(await deps.resolvePatientPublicOrigin(input.organizationId), secret)
          : undefined;
      } catch {
        guestUrl = undefined;
      }
      let notification: VideoMeetingInvitationNotificationResult | undefined;
      if (!deps.invitationNotification || !guestUrl) {
        notification = notificationUnavailable();
      } else {
        try {
          notification = await deps.invitationNotification.enqueue({
            organizationId: input.organizationId,
            patientUserId: input.patientUserId,
            meetingId: input.meetingId,
            inviteId,
            guestUrl,
          });
        } catch {
          notification = notificationUnavailable();
        }
      }
      return { ok: true as const, inviteFragment: secret, guestUrl: guestUrl ?? null, notification };
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

    async recordDiagnostic(input: {
      meetingId: string;
      organizationId: string;
      specialistId: string;
      event: 'join' | 'error' | 'end';
      durationMs?: number;
      transport?: 'p2p' | 'relay';
      errorClass?: 'connection' | 'media' | 'provider';
    }) {
      const meeting = await deps.store.findSpecialistMeeting?.(input);
      if (!meeting) return false;
      // This is a closed operational log vocabulary. Do not spread `input`: route callers can
      // carry lifecycle-only authorization fields at runtime that must never reach structured logs.
      deps.logDiagnostic?.({
        meetingId: input.meetingId,
        organizationId: input.organizationId,
        role: 'specialist',
        event: input.event,
        ...(input.durationMs !== undefined ? { durationMs: input.durationMs } : {}),
        ...(input.transport !== undefined ? { transport: input.transport } : {}),
        ...(input.errorClass !== undefined ? { errorClass: input.errorClass } : {}),
      });
      return true;
    },
  };
}

export type VideoMeetingsService = ReturnType<typeof createVideoMeetingsService>;
