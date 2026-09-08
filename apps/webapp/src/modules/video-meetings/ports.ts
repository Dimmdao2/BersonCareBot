export type VideoMeetingRole = 'specialist' | 'patient';
export type VideoMeetingRecord = {
  id: string;
  organizationId: string;
  patientUserId: string;
  specialistId: string;
  providerRoomRef: string;
  status: 'active' | 'ended' | 'revoked';
  expiresAt: string;
};

/**
 * Renderer/session hand-off. Pages only consume this stable shape; adapter-specific token claims
 * and transport negotiation remain behind VideoMeetingProvider.
 */
export type VideoMeetingRenderSession = {
  renderer: 'embedded_conference' | 'peer_connection';
  endpoint: string | null;
  roomReference: string;
  accessToken: string;
  expiresAt: string;
};

export type VideoMeetingStore = {
  findOrCreateActive(input: {
    id: string;
    organizationId: string;
    patientUserId: string;
    specialistId: string;
    appointmentId: string | null;
    providerRoomRef: string;
    expiresAt: string;
  }): Promise<{ meeting: VideoMeetingRecord; created: boolean }>;
  rotateInvite(input: {
    id: string;
    meetingId: string;
    organizationId: string;
    secretHash: string;
    expiresAt: string;
    specialistId: string;
    actorPlatformUserId: string;
  }): Promise<boolean>;
  revokeInvite(input: {
    meetingId: string;
    organizationId: string;
    specialistId: string;
    actorPlatformUserId: string;
  }): Promise<boolean>;
  endMeeting?(input: { meetingId: string; organizationId: string; specialistId: string; actorPlatformUserId: string }): Promise<boolean>;
  findGuestMeeting(secretHash: string): Promise<VideoMeetingRecord | null>;
  findPatientMeeting(input: { meetingId: string; organizationId: string; patientUserId: string }): Promise<VideoMeetingRecord | null>;
};

export type VideoMeetingProvider = {
  health(): Promise<{ ok: true } | { ok: false; reason: 'provider_unconfigured' | 'provider_unhealthy' }>;
  issueJoinMaterial(input: { meeting: VideoMeetingRecord; role: VideoMeetingRole; subject: string }): Promise<VideoMeetingRenderSession>;
};

export type VideoMeetingOnlineGate = {
  isOnlineLocationActive(organizationId: string): Promise<boolean>;
};

/**
 * Product-notification boundary for a freshly issued guest invite. It receives only stable app
 * identifiers and the branded guest link; provider session material never crosses this boundary.
 */
export type VideoMeetingInvitationNotificationResult = {
  status: 'queued' | 'partially_queued' | 'skipped' | 'unavailable';
  selectedChannels: readonly ('telegram' | 'max' | 'email' | 'web_push')[];
  queuedChannels: readonly ('telegram' | 'max' | 'email' | 'web_push')[];
  deduplicatedChannels: readonly ('telegram' | 'max' | 'email' | 'web_push')[];
};

export type VideoMeetingInvitationNotification = {
  enqueue(input: {
    organizationId: string;
    patientUserId: string;
    meetingId: string;
    guestUrl: string;
  }): Promise<VideoMeetingInvitationNotificationResult>;
};
