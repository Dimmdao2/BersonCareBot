// Bind-mounted into the Jitsi web container's ${CONFIG}/web/ (docker-jitsi-meet appends any
// custom-config.js it finds there to the generated config.js on every container start — this is the
// documented, supported override point, unlike editing the generated config.js itself which is regenerated
// on every start and would silently lose hand edits).
//
// Minimal controls only (VM-06): camera, microphone, hangup. No Jitsi conference toolbar beyond that.
config.toolbarButtons = ['microphone', 'camera', 'hangup'];

// No third-party requests of any kind (VM-04).
config.disableThirdPartyRequests = true;
config.analytics = { disabled: true, rtcstatsEnabled: false };
config.deploymentInfo = undefined;
config.googleApiApplicationClientID = undefined;
config.microsoftApiApplicationClientID = undefined;
config.dropbox = undefined;
config.liveStreaming = { enabled: false };
config.recordingService = { enabled: false, sharingEnabled: false };
config.fileRecordingsServiceEnabled = false;
config.transcribingEnabled = false;
config.enableCalendarIntegration = false;
config.disableInviteFunctions = true;
config.enableInsecureRoomNameWarning = false; // secure-domain/JWT already gates room creation

// P2P first, our coturn only as fallback, our JVB as last resort (VM-03/VM-04). No entry here duplicates a
// default Jitsi/Google STUN — the only entries come from P2P_STUN_SERVERS at render time.
config.p2p = {
    enabled: true,
    useStunTurn: true,
    iceTransportPolicy: 'all', // 'all' so direct P2P is tried before relay; 'relay' would force TURN always
};
config.useStunTurn = true;

// No third-party avatar/Gravatar (VM-04) — the app's own UI, not Jitsi's, renders participant identity.
config.disableThirdPartyRequests = true;
config.gravatar = { disabled: true };

// No lobby, breakout, polls, or other conference-only features (VM-05/VM-06); these mirror the compose-level
// ENABLE_LOBBY=0/ENABLE_BREAKOUT_ROOMS=0/DISABLE_POLLS=1 so the client-side UI never even offers them if a
// server-side toggle is ever missed.
config.lobby = { autoKnock: false };
config.breakoutRooms = { hideAddRoomButton: true };

// Two-participant room only; JVB last-N/tile-view tuning is irrelevant at N=2 but pinned low so nothing in
// this config accidentally assumes a larger conference.
config.channelLastN = 2;
config.startAudioMuted = 10;
config.startVideoMuted = 10;
