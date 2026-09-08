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

export type VideoMeetingJoinMaterial = {
  provider: 'jitsi';
  conferenceUrl: string;
  capability: string;
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
    actorPlatformUserId: string;
  }): Promise<boolean>;
  revokeInvite(input: { meetingId: string; organizationId: string; actorPlatformUserId: string }): Promise<boolean>;
  findGuestMeeting(secretHash: string): Promise<VideoMeetingRecord | null>;
  findPatientMeeting(input: { meetingId: string; organizationId: string; patientUserId: string }): Promise<VideoMeetingRecord | null>;
};

export type VideoMeetingProvider = {
  health(): Promise<{ ok: true } | { ok: false; reason: 'provider_unconfigured' | 'provider_unhealthy' }>;
  issueJoinMaterial(input: { meeting: VideoMeetingRecord; role: VideoMeetingRole; subject: string }): Promise<VideoMeetingJoinMaterial>;
};

export type VideoMeetingOnlineGate = {
  isOnlineLocationActive(organizationId: string): Promise<boolean>;
};
