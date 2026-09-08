# TEST runbook — Jitsi/coturn proof (#1100 stream C)

Prerequisite: `bin/install.sh --apply` has run and `bin/health-check.sh` returns `RESULT: PASS`. None of this
has been executed by the worker that wrote this package — see `README.md` "Status and what remains". Each
scenario below names the exact command/observation that counts as evidence; "page returned 200" is never
sufficient on its own (repo convention, `AGENTS.md` §3a).

All scenarios use synthetic media (`getUserMedia` fake device flags), not the owner's real camera/mic, unless
noted — that is sufficient proof per the plan's §6.8 explicit allowance.

## 1. Two synthetic browser contexts complete a call

1. Issue two short-lived join capabilities for the same room (one specialist-role, one client-role) via
   whatever stream A's session/invite API exposes on TEST at that point — this package only provides the
   room/JWT endpoint, not the app API.
2. Open two separate browser contexts (two profiles/two incognito windows so cookies/local storage don't
   collide), each with `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream`, and join with the
   two tokens.
3. **Evidence:** both contexts show `iceConnectionState: connected` in `chrome://webrtc-internals` (or
   Playwright's `page.evaluate` reading `RTCPeerConnection.getStats()`), and each context's remote video
   element receives frames (`readyState` and `videoWidth/Height` non-zero, sampled twice a second apart to
   rule out a frozen first frame).

## 2. Third participant is refused server-side (VM-02)

1. While the two contexts from scenario 1 are still connected, attempt a third join: reuse the **same** JWT
   subject as one of the two already-connected participants from a third browser context (this is the
   "duplicate subject" case the owner requirement calls out explicitly), and separately attempt a fresh
   subject/role.
2. **Evidence:** both third-join attempts receive an XMPP `<error type="cancel"><service-unavailable/>` (or
   the equivalent client-visible join failure) — capture the raw XMPP stanza (browser devtools → WS frames on
   the BOSH/WebSocket connection) showing `service-unavailable`, not just a generic UI error message. Cross
   check against `docker logs <prosody container>` for the `"Attempt to enter a maxed out room"` log line
   `mod_muc_max_occupants.lua` emits — this is the actual server-side event, not an app-layer guess.

## 3. Direct P2P ICE stats (VM-03)

1. With exactly the two contexts from scenario 1 on the same network path (no artificial NAT symmetric
   restriction), inspect each side's `RTCPeerConnection.getStats()` for the selected candidate pair.
2. **Evidence:** `candidate-pair.state === "succeeded"` with both local and remote candidate `candidateType`
   in `{host, srflx}` — i.e., no `relay` candidate selected. Confirms P2P-first without going through
   coturn/JVB when direct connectivity exists.

## 4. Forced TURN / TLS fallback (VM-03/VM-04)

1. Force ICE to exclude host/srflx candidates for one context (e.g. Chrome's `--force-webrtc-ip-handling-policy=disable_non_proxied_udp` or a network namespace that blocks direct UDP between the two contexts but allows UDP/TCP to `turn.test.bersoncare.ru`).
2. **Evidence:** selected candidate pair's type is `relay`, and the relay candidate's IP matches
   `151.241.228.122` (our coturn), never a foreign relay address. Separately, block UDP to port 3478 only
   (leave 5349/tcp reachable) and confirm the client falls back to TURN-over-TLS: relay candidate present via
   the TLS listener, connection still completes.
3. Cross-check server side: `docker logs <coturn container>` shows an `ALLOCATE` for the session's ephemeral
   username (a timestamp-prefixed value per XEP-0215, not a static credential) and a `REFRESH`/`CREATE
   PERMISSION` sequence consistent with relayed media, not just a STUN binding.

## 5. JVB fallback path (VM-01/VM-03)

1. Force a client to prefer multistream (Jitsi's own "more than 2 codecs/simulcast" or explicit
   `config.p2p.enabled = false` override via a scenario-only test flag, or force a third silent observer to
   push the room off P2P) so the call routes through JVB instead of P2P/TURN-relayed-P2P.
2. **Evidence:** `docker logs <jvb container>` shows a `Conference` created for the room and both endpoints'
   ICE stats show the selected remote candidate as the JVB's `JVB_ADVERTISE_IPS` address
   (`151.241.228.122`), confirming our own JVB is the non-P2P fallback and not any external bridge.

## 6. DNS/network capture proving no foreign runtime endpoint (VM-04)

1. `bin/probe-no-foreign-endpoints.sh start` before opening either browser context.
2. Run scenario 1 end to end (join, short call, hangup).
3. `bin/probe-no-foreign-endpoints.sh stop` — **evidence** is its own `RESULT: PASS` line, i.e. every
   observed remote IP on the monitored TURN/JVB/HTTPS/DNS ports resolved to `151.241.228.122` or a
   loopback/RFC1918 address belonging to the test browser contexts themselves.
4. Separately, inspect each browser context's `chrome://net-export` or devtools Network panel for the whole
   session and confirm zero requests to `meet-jit-si-turnrelay.jitsi.net`, `stun.l.google.com`,
   `*.callstats.io`, `*.jitsi.net`, `*.8x8.vc`, `*.gravatar.com`, or any Google/Microsoft calendar/analytics
   host — this is the client-side complement to the server-side capture in step 3, since a leaked default
   STUN entry in the web bundle would show up here even if it never actually contacts our nftables-visible
   surface.

## Health / restart / rollback proof (deliverable requirement, independent of the call scenarios)

- `bin/health-check.sh` → `RESULT: PASS`.
- `bin/restart.sh` then `bin/health-check.sh` again → still `RESULT: PASS`, and an in-progress call (scenario
  1) is expected to drop on `--force-recreate` — note this as a known limitation (no graceful drain), not a
  defect, since the plan does not ask for zero-downtime restart of a video stack.
- `bin/rollback.sh` → `docker compose -p bcb-jitsi-test ps` shows no containers; `bin/rollback.sh --purge`
  additionally removes the secret store; a subsequent `bin/install.sh --apply` comes back up clean with newly
  generated internal passwords (confirm old `jicofo-auth-password` file content differs from the new one,
  without printing either value — `diff <(stat -c%Y old) <(stat -c%Y new)` or a checksum comparison, never a
  value comparison in a terminal that gets logged).
