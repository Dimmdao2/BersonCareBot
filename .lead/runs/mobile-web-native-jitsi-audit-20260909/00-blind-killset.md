# Blind kill-set — #915 native Jitsi web seam

Scope: committed M4-01/M4-04/M4-05 candidate after #1100 and NativeRuntime.
This kill-set was fixed before reading existing tests.

1. Browser/PWA and unavailable, malformed, or rejecting native plugins retain the landed iframe behavior without a crash, white screen, or authorization change; a trusted capable Android runtime selects native at the video-stage boundary.
2. Each of the three production entries retains one session contract. Native open receives the exact authorized endpoint, room reference, and access token once after an explicit user join; no product page makes a second fetch or call.
3. `joined`, `error`, and `terminated` produce the existing diagnostics/hangup behavior exactly once. Duplicate terminal events cannot double-hang up or strand the stage.
4. Retry, unmount, and session replacement remove listeners and hang up only their owned conference. A late event from an old room cannot affect a new room or reuse/leak its token.
5. Specialist native hangup returns through the existing encounter/notes path. Runtime capability cannot forge role, organization, room, or endpoint; browser behavior is unchanged.

Inspection kill-set:

- No server renderer-union change, second video/product page, external Jitsi/JaaS endpoint or secret, or unrelated surface mutation.
