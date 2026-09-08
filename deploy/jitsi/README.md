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

  browser  ── HTTPS ──▶  nginx (existing host front door, new vhost, terminates TLS)
                              │  proxy_pass http://127.0.0.1:${HTTP_PORT} (plain HTTP — DISABLE_HTTPS=1)
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
| `bin/install.sh` | idempotent apply: preflight (incl. port collisions), fetch + hash-verify pinned release, create the CONFIG tree, render config from templates + secret store, dry-run the merged compose config, bring the stack up |
| `bin/render-secrets.sh` | generates/loads host-side Prosody/JVB/coturn secrets only (never the app JWT secret); every substitution is argv-safe and atomic |
| `bin/health-check.sh` | config + network proof: `prosodyctl check`, container + JVB REST health, mandatory credentialed TURN allocation over UDP and TLS |
| `bin/restart.sh` | restart in place (re-render config, recreate containers) |
| `bin/stop.sh` | plain compose `down` with full context — what the systemd unit's `ExecStop` calls |
| `bin/rollback.sh` | tear down to the exact pre-apply state by default (see "Design decisions") |
| `bin/probe-no-foreign-endpoints.sh` | DNS/egress capture proving no foreign runtime endpoint is contacted |
| `bin/check-latest-jitsi-tag.sh` | re-verify the pinned upstream tag against GitHub releases, and re-verify every pinned image digest against the registries for drift |

## Design decisions and why

- **Vendored, not hand-copied, upstream compose, with the base file listed first.** `bin/install.sh`
  downloads the official `jitsi/docker-jitsi-meet` release zip for the pinned tag — verifying the download
  against `ARCHIVE_SHA256` (recorded in `env/jitsi-test.env.example`/`VERSIONS.md`) before ever unzipping it
  — into a local, git-ignored `vendor/` directory, and every `docker compose` invocation in this package
  passes the vendored `docker-compose.yml` as `-f` before `docker-compose.override.test.yml`. We do not
  maintain a hand-transcribed copy of a large third-party compose file in this repo — that drifts silently
  across upstream releases and is exactly the kind of untracked fork the plan's "smallest officially
  supported topology" instruction is trying to avoid. `vendor/` is added to `.gitignore`; nothing under it
  is a reviewable artifact of this branch, only the override is. Compose resolves every *relative* bind-mount
  source against the directory of the first `-f` file by default — since that is always the vendored
  release here, every command that merges both files also passes `--project-directory` pointed at
  `deploy/jitsi/` itself, so the override's own `./config/...`/`./coturn/...` paths resolve to this
  package's files instead of a path inside the downloaded release (confirmed with `docker compose config`
  against a real vendored tree before landing this fix — an earlier version of this same override, before
  this flag existed, reproduced F1 with different symptoms).
- **`CONFIG` is a deterministic absolute path, not left to whatever directory happens to be current.**
  Upstream's own `docker-compose.yml` resolves every `${CONFIG}/...` volume source (web, prosody, jicofo,
  jvb each mount a subdirectory of it) against this one variable. Independent audit finding F1
  (`docs/audit/jitsi-coturn-test-package-2026-09-08.md`) was exactly a missing `CONFIG`: compose silently
  fell back to resolving those paths *inside the vendored release directory itself*, where none of this
  package's config files exist, so the stack could not reliably start and none of its overrides landed.
  `env/jitsi-test.env.example` now declares `CONFIG=/etc/bersoncarebot/jitsi-test/config` — same host
  convention as the secret store below — and `bin/install.sh` creates every subdirectory upstream's compose
  expects there before rendering or starting anything. Apply and rollback reject CONFIG/secret-store targets
  that resolve outside the package root, including `/`, `/etc`, `/etc/bersoncarebot` and sibling services.
- **Plain HTTP on the loopback port, not a self-signed 8443.** `DISABLE_HTTPS=1` was already set, but the
  override previously still published `${HTTPS_PORT}:8443` and nginx proxied to it with
  `proxy_ssl_verify off` — a false path, since the pinned tag's own nginx template (verified directly,
  `web/rootfs/defaults/default`) compiles the `listen 8443 ssl` block out entirely when `DISABLE_HTTPS=1`;
  nothing ever listens there. The override now publishes only `127.0.0.1:${HTTP_PORT}:8000` (the container's
  real plain-HTTP listener in this mode), and the nginx vhost template proxies to that over plain HTTP.
- **Real preflight before mutation.** `bin/install.sh --apply` runs `docker compose ... config` against the
  full merged upstream+override tree from a hash-verified temporary unpack when the release is not cached,
  before vendor/CONFIG/secrets are written, and fails closed on any merge error. It separately checks every exact host
  port/range this package owns (loopback web, JVB UDP/TCP, TURN UDP/TCP/TLS, the relay range) for an
  existing listener before downloading, rendering, or starting anything — independent audit finding F4.
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
  (`turn_external` is added to `XMPP_MODULES` on the main VirtualHost). The template also sets
  `turn_external_tls_port` (verified directly against `mod_turn_external`'s own source and
  `https://prosody.im/doc/modules/mod_turn_external`) so a UDP-restricted client is actually handed a
  `turns:` candidate for TLS fallback on 5349 — independent audit finding F2 was that only the UDP entry was
  ever advertised, so a client that could not use UDP had no advertised fallback to try even though coturn's
  TLS listener was already configured. `bin/health-check.sh` runs the upstream-documented
  `prosodyctl check turn`, greps the *rendered* config inside the running container for both the secret/host
  lines and `turn_external_tls_port`, and performs a real ephemeral-credential TURN allocation over both UDP
  and TLS (`turnutils_uclient -W`) before declaring the stack healthy — this package does not trust its own
  assumption about Prosody's file layout or protocol behavior without checking it against the live
  container, and fails closed if the override did not land where expected or an allocation is rejected.
- **Secrets are rendered without ever appearing in a subprocess's argv.** Every substitution in
  `bin/render-secrets.sh` is bash's own `${var//pattern/repl}` string replacement or the `printf` builtin —
  never `sed -e "s#...#${secret}#"`, which puts the secret in a command line any same-host process can read
  via `/proc/<pid>/cmdline` (independent audit finding F3). Every rendered file is written to a temp file in
  its final directory, chmod'd `0600`, then renamed into place — a crash mid-render leaves the previous
  (or no) file, never a half-written one.
- **Images are pinned by digest, not tag alone**, and the vendored source archive's SHA-256 is verified
  before it is ever unzipped (`ARCHIVE_SHA256`). `bin/check-latest-jitsi-tag.sh` re-fetches the live digest
  for the currently pinned tag from GHCR/Docker Hub on every run and fails if it no longer matches what
  `docker-compose.override.test.yml` pins — independent audit finding F6 was that a re-published tag or a
  tampered archive would be silently trusted under the old tag-only scheme.
- **`bin/rollback.sh` restores the exact pre-apply state by default.** Its previous shape kept vendor files,
  volumes and rendered config by default and only removed them behind an opt-in `--purge` — backwards from
  "pre-apply state," which had none of those (independent audit finding F4). The default now removes
  containers, the project network, this package's named volumes, the vendored release, rendered config, and
  the secret store; `--keep-cache` is an explicit, clearly-non-default opt-out for fast local iteration.
  Correspondingly, the systemd unit's `ExecStop` now calls `bin/stop.sh` (same two-compose-file + env-file
  context as every other command in this package) instead of a bare `docker compose -p bcb-jitsi-test down`,
  which has no compose file to resolve the project definition from.
- **coturn is a separate, independently pinned image**, not part of the jitsi-meet release — the plan's own
  wording ("collective coturn") matches upstream's own turn.md, which assumes an externally-run TURN server.
  `docker-compose.override.test.yml` adds it as an additional service in the same compose project so
  `docker compose ps`/`down`/`restart` cover it together with the Jitsi containers.
- **Single host, single nginx front door.** `test.bersoncare.ru`'s existing IP-allowlist model (network
  policy lives in the nginx server block, not in a host firewall — see `NETWORK_POLICY.md`) is reused for the
  meet web vhost rather than opening a second, differently-secured entry point. The web container binds only
  `127.0.0.1:${HTTP_PORT}`; nginx is the only thing exposed on 443. This is a deliberate scope decision,
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

1. Nothing in this package has been run against a real host yet — `bin/health-check.sh`'s Prosody/JVB/TURN
   checks (grep for `turn_external_secret`/`turn_external_tls_port` inside the running container, the
   Colibri `/about/health` probe, the credentialed TURN allocation probes) are the actual, live-container
   assertions that the CONFIG tree and overrides landed where expected; a human has not yet watched them
   pass on real TEST.
2. DNS + TLS prerequisites in `NETWORK_POLICY.md` (new `meet.` / `turn.` subdomains) must exist before
   `bin/install.sh` can request a real certificate; until then `install.sh --check` stops at that gate and
   names exactly what is missing.
3. `/etc/bersoncarebot` (parent of both the CONFIG tree and the secret store) must exist and be writable by
   whichever user runs `bin/install.sh` — same one-time root bootstrap this host already needed for
   `/etc/bersoncarebot/postgres-mtls/` (`docs/ARCHITECTURE/SERVER CONVENTIONS.md` §mTLS). `bin/install.sh`
   fails closed with this exact message if it cannot create its subdirectories, rather than a raw
   permission-denied trace.
4. The JWT signing secret Jitsi verifies against must be copied from `system_settings` (stream A's table) into
   this package's `JWT_APP_SECRET` at apply time — this package treats it as an externally supplied input
   (see `env/jitsi-test.env.example`), not something it generates, reads from the DB, or stores independently.
5. Full `RUNBOOK.md` execution (two synthetic browser contexts, third-participant refusal, forced-TURN and
   JVB-fallback ICE stats, DNS/network capture) is unrun — it needs the stack actually up. This is a
   separate, explicitly-named acceptance stage from `bin/health-check.sh` passing: a health `PASS` proves
   the stack is configured and individually-functional (container health, rendered config, credentialed TURN
   allocation), never that two real browsers completed a call — see `RUNBOOK.md`'s own framing.

## Validation performed in this worktree

- `bash -n` on every script in `bin/`.
- `node -e` syntax parse of `config/web/custom-config.js` and `config/web/custom-interface_config.js` (not
  executable Node modules — Jitsi config fragments — so `node --check` does not apply to them directly).
- `git diff --check` (no trailing whitespace/conflict markers).
- `bin/check-latest-jitsi-tag.sh` run live: confirms the pinned tag is upstream's current release and that
  every pinned image digest (web/prosody/jicofo/jvb/coturn) still matches what GHCR/Docker Hub report for
  that tag right now — no drift.
- The pinned upstream archive was downloaded and hashed live; it matches `ARCHIVE_SHA256`.
- **Full upstream+override `docker compose config` render**, isolated under `/tmp` (own `-p`, own `CONFIG`
  under `/tmp`, no real host paths, no containers started): the vendored `stable-11146-2` release was
  extracted, merged with `docker-compose.override.test.yml` and a synthetic env file
  (`JWT_APP_SECRET` replaced with a placeholder, `CONFIG` pointed at the temp dir) using the same
  `--project-directory`-qualified command every script in this package now runs. The merge succeeded with
  no warnings; every service resolved to its pinned digest; `web` published only
  `127.0.0.1:8000->8000`; `jicofo` published no ports; `jvb` published `10000/udp`, `4443/tcp` and the
  required `127.0.0.1:8080->8080` Colibri health endpoint; every `${CONFIG}/...` volume resolved under the synthetic CONFIG root; the package's own
  `./config/...`/`./coturn/...` bind sources resolved to `deploy/jitsi/`, not into the vendored release
  directory. This is the same check `bin/install.sh --apply` now runs as a preflight before `up`, exercised
  here without mutating any host. `up`/`docker compose ... up` was never run.
