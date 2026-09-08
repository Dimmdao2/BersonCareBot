# Jitsi/coturn TEST deployment package (#1100 stream C)

Plan: [`docs/_TODO/VIDEO_MEETINGS_JITSI_2026-09.md`](../../docs/_TODO/VIDEO_MEETINGS_JITSI_2026-09.md), owner
requirements VM-01..06, infra side of VM-02/03/04, Wave 1 stream C. This package is the deployable artifact;
it does not apply itself to any host and has not been run against TEST by this worker — see
[Status and what remains](#status-and-what-remains).

This is a standalone infra package. It knows nothing about `system_settings`, `video-meetings` application
service, or any webapp route; it only stands up a self-hosted Jitsi Meet + coturn stack on TEST and proves it
behaves the way the plan requires. Streams A/B/D wire the application to it.

## Architecture

```text
                         151.241.228.122 (DEV/RELAY/TEST host — the only host this package targets)

  browser  ── HTTPS ──▶  nginx (existing host front door, new vhost)
                              │  proxy_pass 127.0.0.1:${WEB_HTTPS_PORT}
                              ▼
                       docker compose project "bcb-jitsi-test" (own bridge network, no host network mode)
                       ┌────────────────────────────────────────────────────────────┐
                       │  web (ghcr.io/jitsi/web)            127.0.0.1 only          │
                       │  prosody (ghcr.io/jitsi/prosody)    internal bridge only    │
                       │  jicofo  (ghcr.io/jitsi/jicofo)     internal bridge only    │
                       │  jvb     (ghcr.io/jitsi/jvb)         UDP ${JVB_PORT} public │
                       │  coturn  (coturn/coturn)             UDP/TCP 3478,          │
                       │                                       TLS 5349, relay range │
                       └────────────────────────────────────────────────────────────┘

  ICE order for the 2-participant room: direct P2P first → coturn (UDP, TLS fallback) → JVB (non-P2P
  fallback, e.g. more than 2 ICE candidates fail or a client forces multi-stream). No external STUN/TURN is
  ever in the candidate list (VM-03/VM-04).
```

## What this package does NOT include (owner scope, VM-05/VM-06)

No Jibri, no Jigasi, no recording/transcription/dial-in/SIP container or route, no Etherpad, no
rtcstats/analytics/callstats, no calendar/Google/Dropbox/Giphy integration, no lobby/breakout/polls UI, no
Jitsi branding or conference toolbar beyond camera/mic/hangup. Every one of those is either absent from the
compose file entirely or explicitly `0`/unset in the env template — see
[`env/jitsi-test.env.example`](env/jitsi-test.env.example) and
[`config/web/custom-interface_config.js`](config/web/custom-interface_config.js).

## Files in this package

| Path | Purpose |
| --- | --- |
| `VERSIONS.md` | pinned image tags + how to re-verify/bump them |
| `NETWORK_POLICY.md` | port table, proposed nftables diff, DNS/TLS prerequisites |
| `RUNBOOK.md` | the six required TEST proof scenarios |
| `env/jitsi-test.env.example` | non-secret Jitsi/JVB/Prosody config template |
| `env/coturn-test.env.example` | non-secret coturn config template |
| `config/web/custom-config.js`, `custom-interface_config.js` | minimal UI, no branding, no third-party requests |
| `config/prosody/conf.d/00-turn-external.cfg.lua.template` | Prosody core `mod_turn_external` (XEP-0215) wiring |
| `coturn/turnserver.conf.template` | coturn shared-secret + TLS + relay-range config |
| `docker-compose.override.test.yml` | TEST-only overlay (ports, no host network, resource limits) over the vendored upstream compose file |
| `nginx/meet-test.vhost.template.conf` | new nginx vhost for the meet web endpoint, same template style as the existing webapp vhost |
| `../systemd/bersoncarebot-jitsi-test.service` | wraps `docker compose` lifecycle the same way other TEST units wrap `node` |
| `bin/install.sh` | idempotent apply: fetch pinned release, render config from templates + secret store, bring the stack up |
| `bin/render-secrets.sh` | generates/loads host-side Prosody/JVB/coturn secrets only (never the app JWT secret) |
| `bin/health-check.sh` | config + network proof: `prosodyctl check`, container health, TURN allocate probe |
| `bin/restart.sh`, `bin/rollback.sh` | restart in place / tear down to pre-apply state |
| `bin/probe-no-foreign-endpoints.sh` | DNS/egress capture proving no foreign runtime endpoint is contacted |
| `bin/check-latest-jitsi-tag.sh` | re-verify the pinned upstream tag against GitHub releases |

## Design decisions and why

- **Vendored, not hand-copied, upstream compose.** `bin/install.sh` downloads the official
  `jitsi/docker-jitsi-meet` release zip for the pinned tag (checksum-verified against the tag's published
  source archive) into a local, git-ignored `vendor/` directory and layers
  `docker-compose.override.test.yml` on top of *upstream's own* `docker-compose.yml`. We do not maintain a
  hand-transcribed copy of a large third-party compose file in this repo — that drifts silently across
  upstream releases and is exactly the kind of untracked fork the plan's "smallest officially supported
  topology" instruction is trying to avoid. `vendor/` is added to `.gitignore`; nothing under it is a
  reviewable artifact of this branch, only the override is.
- **`MAX_PARTICIPANTS=2` is the occupancy enforcement (VM-02), not a hand-rolled Prosody module.** Confirmed
  by reading the pinned tag's actual Prosody template
  (`prosody/rootfs/defaults/conf.d/jitsi-meet.cfg.lua` in `stable-11146-2`): when `MAX_PARTICIPANTS` is set,
  docker-jitsi-meet itself enables Prosody's `mod_muc_max_occupants` (shipped in the image, source at
  `jitsi/jitsi-meet` `resources/prosody-plugins/mod_muc_max_occupants.lua`) on the MUC component and sets
  `muc_max_occupants = "2"`, with `muc_access_whitelist` covering only the `focus@auth.<domain>` service
  account (so Jicofo's own management presence never counts against the two human slots). The module hooks
  `muc-occupant-pre-join` and counts live XMPP occupants (distinct resources), not JWT subjects — a second
  tab/device reusing the same JWT `sub` still opens a second XMPP resource and is counted, so a duplicate
  subject cannot create a third occupant once two are present. This is upstream, version-shipped behavior;
  we do not bind-mount a custom Lua plugin for this requirement. Proof is a live third-context join attempt
  in `RUNBOOK.md`, not just the rendered config value — a config string is not evidence that Prosody enforced
  it against a live `muc-occupant-pre-join` event.
- **Ephemeral TURN credentials via Prosody's own core `mod_turn_external` (XEP-0215), not docker-jitsi-meet's
  `TURN_HOST`/`TURN_PORT`/`TURN_CREDENTIALS` env vars.** Those upstream env vars render a *static* TURN
  entry into the web client's `config.js` `p2p.stunServers` list — exactly the "static browser credentials"
  the plan forbids. `mod_turn_external` is a Prosody core module since 0.12 (the community `mod_turncredentials`
  it obsoletes is explicitly marked obsolete by its own doc page); it signs short-lived HMAC credentials
  per session per XEP-0215 and hands them to the client over the authenticated XMPP session, never as a
  fixed value in a served JS file. docker-jitsi-meet's template has no built-in hook for
  `turn_external_secret/host/port`, so `config/prosody/conf.d/00-turn-external.cfg.lua.template` is dropped
  into the same `conf.d/` directory the generated `jitsi-meet.cfg.lua` lives in, filename-prefixed to sort
  and load before it, setting these as global Prosody options that the module picks up wherever it's enabled
  (`turn_external` is added to `XMPP_MODULES` on the main VirtualHost). `bin/health-check.sh` runs the
  upstream-documented `prosodyctl check turn` and greps the *rendered* config inside the running container
  for the literal secret/host lines before declaring the stack healthy — this package does not trust its own
  assumption about Prosody's file layout without checking it against the live container, and fails closed if
  the override did not land where expected.
- **coturn is a separate, independently pinned image**, not part of the jitsi-meet release — the plan's own
  wording ("collective coturn") matches upstream's own turn.md, which assumes an externally-run TURN server.
  `docker-compose.override.test.yml` adds it as an additional service in the same compose project so
  `docker compose ps`/`down`/`restart` cover it together with the Jitsi containers.
- **Single host, single nginx front door.** `test.bersoncare.ru`'s existing IP-allowlist model (network
  policy lives in the nginx server block, not in a host firewall — see `NETWORK_POLICY.md`) is reused for the
  meet web vhost rather than opening a second, differently-secured entry point. The web container binds only
  `127.0.0.1:${WEB_HTTPS_PORT}`; nginx is the only thing exposed on 443. This is a deliberate scope decision,
  not an oversight: TEST has no real external users (only the owner, from VPN-trusted subnets — see
  `docs/_TODO/VIDEO_MEETINGS_JITSI_2026-09.md` §6.7), so the guest `/live` proof the plan asks for runs from
  the owner's own VPN-connected browser context, same as every other TEST page.
- **JVB media (UDP `${JVB_PORT}`) and coturn (3478/udp+tcp, 5349/tcp-tls, relay range) bypass nginx
  entirely** — they are raw UDP/TCP, not HTTP, and are bound directly on the host's public interface, because
  ICE candidates must be reachable without an HTTP proxy in front of them. `NETWORK_POLICY.md` proposes an
  explicit port allowlist for exactly this surface.

## Status and what remains

Built and reviewed in a clean worktree; **not applied to any host by this worker** (brief explicitly forbids
provisioning DNS, opening ports, starting shared services, or touching DEV/TEST/PROD from here). Everything in
[Validation performed](#validation-performed-in-this-worktree) below is static/syntax-level. Before this
package is "done" against the plan:

1. Confirm the exact TEST-host bind path docker-jitsi-meet mounts for `${CONFIG}/prosody/config/conf.d/` on
   the pinned tag (`bin/install.sh` asserts this at apply time and refuses to continue silently if the
   override file isn't visible inside the running Prosody container — see its `assert_turn_override_mounted`
   step — but a human has not yet watched that assertion pass on real TEST).
2. DNS + TLS prerequisites in `NETWORK_POLICY.md` (new `meet.` / `turn.` subdomains) must exist before
   `bin/install.sh` can request a real certificate; until then `install.sh --check` stops at that gate and
   names exactly what is missing.
3. The JWT signing secret Jitsi verifies against must be copied from `system_settings` (stream A's table) into
   this package's `JWT_APP_SECRET` at apply time — this package treats it as an externally supplied input
   (see `env/jitsi-test.env.example`), not something it generates, reads from the DB, or stores independently.
4. Full `RUNBOOK.md` execution (two synthetic browser contexts, third-participant refusal, forced-TURN and
   JVB-fallback ICE stats, DNS/network capture) is unrun — it needs the stack actually up.

## Validation performed in this worktree

- `bash -n` on every script in `bin/`.
- `docker compose -f docker-compose.override.test.yml config` (upstream base file not vendored here, so this
  validates override YAML syntax/interpolation only — full merge validation happens in `install.sh --check`
  once the base file is fetched).
- `node --check` is not applicable (no `.mjs`/`.js` shipped as executable Node — `config/web/*.js` are Jitsi
  config fragments, checked with `node -e` syntax parse instead, see commit message).
- `git diff --check` (no trailing whitespace/conflict markers).
