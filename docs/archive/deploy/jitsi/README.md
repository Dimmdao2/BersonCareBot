# Jitsi/coturn deployment package — two profiles (#1100 stream C)

Plan: [`docs/_TODO/VIDEO_MEETINGS_JITSI_2026-09.md`](../../docs/_TODO/VIDEO_MEETINGS_JITSI_2026-09.md), owner
requirements VM-01..06, infra side of VM-02/03/04, Wave 1 stream C. This package is the deployable artifact;
it does not apply itself to any host — see [Status and what remains](#status-and-what-remains).

This is a standalone infra package. It knows nothing about `system_settings`, `video-meetings` application
service, or any webapp route; it only stands up a self-hosted Jitsi Meet + coturn stack and proves it
behaves the way the plan requires. Streams A/B/D wire the application to it.

## Two profiles, one package

`JITSI_DEPLOYMENT` selects the profile and is resolved exactly once, in
[`bin/lib/profile.sh`](bin/lib/profile.sh), which every script under `bin/` sources. **There is no default
profile**: an absent or unknown value is a fatal error, because a package that guesses its own profile would
eventually render TEST hostnames on a production host (or the reverse) and report success. The value comes
from the process environment (`export`, systemd `Environment=`) or from the deployment env file, which
declares `JITSI_DEPLOYMENT=` as its first key.

| | `test` | `prod` |
| --- | --- | --- |
| Host | `151.241.228.122` (DEV/RELAY/TEST) | `135.106.187.95` (new production) |
| Meet host | `meet.test.therapysto.ru` | `meet.therapysto.ru` |
| TURN host | `turn.test.therapysto.ru` | `turn.therapysto.ru` |
| Package root | `/etc/bersoncarebot/jitsi-test` | `/etc/therapysto/jitsi-prod` |
| Jitsi env file | `/opt/env/bersoncarebot/jitsi.test` | `/etc/therapysto/env/video/jitsi.prod` |
| coturn env file | `/opt/env/bersoncarebot/jitsi-coturn.test` | `/etc/therapysto/env/video/jitsi-coturn.prod` |
| Env templates | `env/jitsi-test.env.example`, `env/coturn-test.env.example` | `env/jitsi-prod.env.example`, `env/coturn-prod.env.example` |
| nftables objects / source | own table `bcb_jitsi_test` / `nftables-bcb-jitsi-test.conf` | chains `therapysto_jitsi_prod_in`, `therapysto_jitsi_prod_fwd` inside the host's own `inet filter` / `nftables-therapysto-jitsi-prod.conf` |
| Boot unit | `../systemd/bersoncarebot-jitsi-test-network-policy.service` | `../systemd/therapysto-jitsi-prod-network-policy.service` |
| nginx template | `nginx/meet-test.vhost.template.conf` | `nginx/meet-prod.vhost.template.conf` |
| ACME lineage | `/etc/letsencrypt/live/bcb-jitsi-test` | `/etc/letsencrypt/live/therapysto-jitsi-prod` |
| Compose project | `bcb-jitsi-test` | `therapysto-jitsi-prod` |
| coturn container | `bcb-jitsi-test-coturn` | `therapysto-jitsi-prod-coturn` |
| Secret store | `/etc/bersoncarebot/jitsi-test/secrets` | `/etc/therapysto/jitsi-prod/secrets` |
| JWT app id / issuer / audience | `bcb-video-meetings-test` | `therapysto-video-meetings` |
| Log tag | `[jitsi-test]` | `[jitsi-prod]` |

**The prod column carries no `bersoncarebot`/`bcb` name anywhere** — owner ruling of 10.09.2026, recorded in
[`docs/ARCHITECTURE/SERVER CONVENTIONS.md`](../../docs/ARCHITECTURE/SERVER%20CONVENTIONS.md) §"Именование на
новом проде" (roots, systemd units, docker networks and compose projects, images, nginx files, tables). The
TEST host deliberately keeps the historical names it is already running under, so the two profiles no longer
share a name stem and `bin/lib/profile.sh` spells both sets out per profile instead of building them from
`bcb-jitsi-${JITSI_DEPLOYMENT}`. The IFNAMSIZ trap that document records (a kernel interface name may not
exceed 15 characters, which is why the host's bridges are `tsto-blue`/`tsto-green`) does not bite here:
this stack's compose file asks for no bridge name, so docker names the bridge `br-<hash>` and
`therapysto-jitsi-prod` is only ever a compose project/network name.

**The legacy production host `135.106.162.170` is refused under both profiles.** `jitsi_require_host()`
checks for that address first and fails with its own distinct message before it even looks at whether the
profile's own address is present, so no combination of `JITSI_DEPLOYMENT` and env files can point this
package at the old production box. Everything else the two profiles share verbatim: the pinned release and
archive hash, the image digests, the ports, the limits, the JWT/auth semantics, the TURN credential
semantics, and every security assertion.

## Architecture

```text
                         the profile's own host (151.241.228.122 on test, 135.106.187.95 on prod)

  browser  ── HTTPS ──▶  nginx (existing host front door, new vhost, terminates TLS)
                              │  proxy_pass http://127.0.0.1:${HTTP_PORT} (plain HTTP — DISABLE_HTTPS=1)
                              ▼
                       docker compose project (bcb-jitsi-test / therapysto-jitsi-prod; own bridge network, no host network mode)
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
| `NETWORK_POLICY.md` | profile table, port table, the two nftables shapes, DNS/TLS prerequisites |
| `RUNBOOK.md` | the six required proof scenarios |
| `bin/lib/profile.sh` | the one place that resolves `JITSI_DEPLOYMENT` into host/hostnames/paths/table/tag, and the shared fail-closed host gate (incl. the legacy-prod refusal) |
| `env/jitsi-test.env.example`, `env/jitsi-prod.env.example` | non-secret Jitsi/JVB/Prosody config templates, one per profile |
| `env/coturn-test.env.example`, `env/coturn-prod.env.example` | non-secret coturn config templates, one per profile |
| `config/web/custom-config.js`, `custom-interface_config.js` | minimal UI, no branding, no third-party requests |
| `coturn/turnserver.conf.template` | coturn shared-secret + TLS + relay-range config |
| `docker-compose.override.test.yml` | overlay shared by both profiles (ports, no host network, resource limits) over the vendored upstream compose file; keeps its historical `.test.` filename, everything profile-specific in it is interpolated |
| `nftables-bcb-jitsi-test.conf` | additive reject-table after the main chain on the ACCEPT-policy TEST host (`NETWORK_POLICY.md`) |
| `nftables-therapysto-jitsi-prod.conf` | raw-port policy for the drop-policy prod host: two regular chains added to the host's own `inet filter` table plus one jump from each base chain — coturn on `input`, DNAT'd JVB media on `forward` (`NETWORK_POLICY.md`) |
| `nginx/meet-test.vhost.template.conf`, `nginx/meet-prod.vhost.template.conf` | nginx vhost for the meet web endpoint, one per profile, same template style as the existing webapp vhost |
| `../systemd/bersoncarebot-jitsi-test.service` | wraps `docker compose` lifecycle the same way other TEST units wrap `node`; there is no prod equivalent yet (the prod trial is applied by hand) |
| `../systemd/bersoncarebot-jitsi-test-network-policy.service` | boot unit that installs the TEST profile's own nftables table |
| `../systemd/therapysto-jitsi-prod-network-policy.service` | boot unit that re-applies the prod chains after `nftables.service` has loaded the host ruleset, and before `docker.service` |
| `bin/install.sh` | idempotent apply: preflight (incl. port collisions), fetch + hash-verify pinned release, create the CONFIG tree, render config from templates + secret store, dry-run the merged compose config, bring the stack up |
| `bin/render-secrets.sh` | generates/loads host-side Prosody/JVB/coturn secrets only (never the app JWT secret); every substitution is argv-safe and atomic |
| `bin/reconcile-xmpp-service-credentials.sh` | updates Prosody's persisted focus/JVB accounts from container env over stdin, restarts the two clients and proves Jicofo authenticated |
| `bin/health-check.sh` | config + network proof: `prosodyctl check`, container + JVB REST health, mandatory credentialed TURN allocation over UDP and TLS |
| `bin/sync-coturn-tls.sh` | root-only hook: validate the profile's ACME certificate against every SAN it requires, atomically stage a private deploy-owned copy for non-root coturn, and restart coturn if running |
| `bin/apply-domain-cutover.sh` | root-only checked TEST-profile-only env cutover from legacy video names to canonical Therapysto names; refuses to run under the prod profile; secrets remain opaque |
| `bin/apply-nginx.sh` | checked apply for the profile's public meet vhost; validates nginx and restores the previous target if validation/reload fails |
| `bin/restart.sh` | restart in place (re-render config, recreate containers) |
| `bin/stop.sh` | plain compose `down` with full context — what the systemd unit's `ExecStop` calls |
| `bin/rollback.sh` | tear down to the exact pre-apply state by default (see "Design decisions") |
| `bin/probe-no-foreign-endpoints.sh` | DNS/egress capture proving no foreign runtime endpoint is contacted |
| `bin/check-latest-jitsi-tag.sh` | re-verify that both profiles' env templates carry the same pin, that the pinned upstream tag is still upstream's release, and that every pinned image digest still matches the registries |

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
- **Real preflight before mutation.** `bin/install.sh --check` also names a missing `unzip` before any
  download/unpack mutation (the package never installs host packages). `--apply` runs `docker compose ... config` against the
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
- **Ephemeral TURN credentials use pinned docker-jitsi-meet's global `external_services` configuration.** The
  env template supplies only our STUN, TURN/UDP and TURNS/TCP endpoints to the upstream Prosody container;
  `TURN_CREDENTIALS` is synchronized from the single coturn HMAC secret by `render-secrets.sh` and makes
  upstream generate short-lived TURN REST credentials for each XMPP session. `TURN_USERNAME` and
  `TURN_PASSWORD` remain unset, so no static credential can be put in served JavaScript. This must be the
  upstream *global* configuration rather than a module enabled only on the main VirtualHost: direct XEP-0215
  IQ uses the main host, while Jitsi's initial room metadata is assembled through
  `metadata.<XMPP_DOMAIN>`; both contexts must see the same three service records. `bin/health-check.sh`
  queries the upstream module for both hosts, asserts own STUN, TURN/UDP and TURNS/TCP records plus two
  generated username/password/expiry triplets without printing them, then retains the real credentialed
  coturn UDP and TLS allocation probes. A populated main host paired with an empty metadata host fails as
  the original split-context regression.
- **Secrets are rendered without ever appearing in a subprocess's argv.** Every substitution in
  `bin/render-secrets.sh` is bash's own `${var//pattern/repl}` string replacement or the `printf` builtin —
  never `sed -e "s#...#${secret}#"`, which puts the secret in a command line any same-host process can read
  via `/proc/<pid>/cmdline` (independent audit finding F3). Every rendered file is written to a temp file in
  its final directory, chmod'd `0600`, then renamed into place — a crash mid-render leaves the previous
  (or no) file, never a half-written one.
- **Persisted XMPP service accounts are reconciled on every apply/restart.** Upstream's registration helper
  creates `focus`/`jvb` only when missing; after a restored config tree or rotated internal secret it reports
  `User exists` without changing the password, leaving Jicofo in a `not-authorized` loop while every container
  still appears healthy. The package now sends each current password to `prosodyctl passwd` over container
  stdin, restarts only Jicofo/JVB, waits for Jicofo's authenticated `Connected.` state, and makes that state a
  mandatory health-check assertion. No credential is printed or placed in argv.
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
- **coturn stays non-root while retaining its private mounts.** The pinned image runs as the TEST deploy
  account's numeric UID/GID (`1000:1000`), which is also the account that runs `install.sh` and owns the
  0600 rendered `turnserver.conf`. Before `--check`/`--apply`, the certificate-renewal owner must stage a
  private copy at `${CONFIG}/coturn/tls/{fullchain,privkey}.pem`: directory `0700`, both files `0600`, all
  owned by `1000:1000`. Those are the TEST deploy account defaults; explicit env values remain supported.
  The root-owned `/etc/coturn/tls` source is never mounted into the container. The
  package creates private deploy-owned bind mounts for coturn logs and state, avoiding root-created named
  volumes that this non-root process could not write.
- **One ACME lineage, two consumers.** nginx reads `/etc/letsencrypt/live/bcb-jitsi-test` directly for
  `meet.test.therapysto.ru`; coturn cannot read that root-only tree and instead mounts a `0600` deploy-owned
  copy under `${CONFIG}/coturn/tls`. Run `bin/sync-coturn-tls.sh` once after issuance and install it as the
  certbot deploy hook so each successful renewal validates both SANs, atomically refreshes the copy and
  restarts only the TEST coturn container when it is already running.
- **One profile library, no per-script host literal.** Every script under `bin/` used to carry its own
  `[[ "$address" == 151.241.228.122 ]]` loop, its own `/opt/env/bersoncarebot/jitsi.test` default and its own
  `[jitsi-test]` log tag. A second host would have meant editing that idiom in nine places and hoping none
  was missed — the classic way a "prod-safe" package ends up half-converted. `bin/lib/profile.sh` is now the
  single source: it resolves the profile, exports every profile-derived value, and owns `jitsi_require_host`.
  The gate got *stronger* in the process (legacy-prod refusal), never weaker: the per-env assertions on
  `TURN_EXTERNAL_IP`, `STUN_HOST`, `TURN_HOST` and `TURNS_HOST` all remain, with the expected value now
  derived from the profile instead of written out as a literal.
- **Two nftables shapes, because the two hosts have opposite base policies.** TEST is `policy accept` and
  gets its own reject-table after the main chain. Prod's `/etc/nftables.conf` declares `inet filter` with
  `input` and `forward` at `policy drop`, and there an additive accept-table opens nothing at all: an
  `accept` ends evaluation of its own chain, not of the hook, so the packet still meets the drop-policy
  chain. The prod profile therefore owns no table — it adds two regular chains to the host's own
  `inet filter` and jumps into them from `input` (host-networked coturn) and `forward` (bridged, DNAT'd JVB
  media, which never reaches `input` at all). `/etc/nftables.conf` is never rewritten; the boot unit
  re-applies the chains after `nftables.service`, and `bin/apply-network-policy.sh` removes the jumps by
  handle before the chains on re-apply and then verifies both chains and both jumps exist.
  `NETWORK_POLICY.md` "Two base policies, two policy shapes" carries the full reasoning, the per-component
  port split, and why the media ports are open to any source while the web vhost stays trial-gated.
- **Single host, single nginx front door.** The TEST surfaces' existing IP-allowlist model (network
  policy lives in the nginx server block, not in a host firewall — see `NETWORK_POLICY.md`) is reused for the
  meet web vhost rather than opening a second, differently-secured entry point. The web container binds only
  `127.0.0.1:${HTTP_PORT}`; nginx is the only thing exposed on 443. This is a deliberate scope decision,
  not an oversight: TEST has no real external users (only the owner, from VPN-trusted subnets — see
  `docs/_TODO/VIDEO_MEETINGS_JITSI_2026-09.md` §6.7), so the guest `/live` proof the plan asks for runs from
  the owner's own VPN-connected browser context, same as every other TEST page. The prod vhost keeps the
  same shape with a trial-sized allow-list (`151.241.228.122`, `127.0.0.1`, `deny all`): during the trial
  the owner's VPN exit is the only intended client, and opening that vhost to the public internet is a
  separate, explicit owner decision.
- **JVB media (UDP `${JVB_PORT}`) and coturn (3478/udp+tcp, 5349/tcp-tls, relay range) bypass nginx
  entirely** — they are raw UDP/TCP, not HTTP, and are bound directly on the host, because
  ICE candidates must be reachable without an HTTP proxy in front of them. `NETWORK_POLICY.md` describes the
  versioned additive nftables table that restricts exactly this surface to each profile's trust boundary.

## Status and what remains

### `test` profile

The package is running on TEST. DNS, trusted TLS, nginx, Prosody/JVB/coturn and the additive raw-port policy
have passed live health checks. Canonical TEST video names are `meet.test.therapysto.ru` and
`turn.test.therapysto.ru`; BersonCare and TherapyGo video names remain temporary certificate-backed aliases.
**One migration step is required on the running TEST host.** `/opt/env/bersoncarebot/jitsi.test` and
`/opt/env/bersoncarebot/jitsi-coturn.test` must gain a `JITSI_DEPLOYMENT=test` line (the env templates now
carry it). Without it every script — including the certbot deploy hook `bin/sync-coturn-tls.sh`, which
inherits no environment from certbot — refuses to guess a profile and fails closed. Exporting
`JITSI_DEPLOYMENT=test` for a single interactive run works too, but the env-file line is what makes the
unattended paths (systemd unit, renewal hook) keep working.

### `prod` profile — **never run anywhere**

Nothing in the prod profile has been applied to `135.106.187.95` (or to any other host). The prod env
templates, `nftables-therapysto-jitsi-prod.conf`, `nginx/meet-prod.vhost.template.conf` and the prod boot unit are
reviewed and syntax-checked in the repository only. There is no host evidence for any of them, and this
document does not claim any. The prerequisites that are **not** part of this package are listed in
`NETWORK_POLICY.md` "Prod prerequisites this package does not own":

1. DNS A records for `meet.therapysto.ru` and `turn.therapysto.ru` → `135.106.187.95`.
2. A certificate lineage `/etc/letsencrypt/live/therapysto-jitsi-prod` covering both of those names.
3. The host's own `table inet filter` with `input`/`forward` base chains, loaded from `/etc/nftables.conf`
   at boot — that is what the prod policy adds its chains to. **No edit to `/etc/nftables.conf` is needed
   or performed**: the earlier "pairing" prerequisite belonged to the additive accept-table that has been
   replaced. `bin/apply-network-policy.sh --check` runs `nft -c -f` against the **live** ruleset, so a
   missing table or base chain fails there rather than after a green apply line.
4. A Selectel Security Group review for the same ports (SG exists in front of `135.x`, not `151.x`).
5. There is no `therapysto-jitsi-prod.service` compose lifecycle unit: the prod trial is meant to be
   applied by hand with `bin/install.sh --apply`, so the prod boot unit only installs the network policy.

### Both profiles

1. The package root's parent (`/etc/bersoncarebot` on TEST, `/etc/therapysto` on prod — parent of both the
   CONFIG tree and the secret store) must exist and be writable by
   whichever user runs `bin/install.sh` — same one-time root bootstrap the TEST host already needed for
   `/etc/bersoncarebot/postgres-mtls/` (`docs/ARCHITECTURE/SERVER CONVENTIONS.md` §mTLS). `bin/install.sh`
   fails closed with this exact message if it cannot create its subdirectories, rather than a raw
   permission-denied trace.
2. The JWT signing secret Jitsi verifies against must be copied from `system_settings` (stream A's table) into
   this package's `JWT_APP_SECRET` at apply time — this package treats it as an externally supplied input
   (see the profile's env template), not something it generates, reads from the DB, or stores independently.
3. Repeat the browser scenarios after the canonical names are switched in the application provider settings;
   health alone proves the stack, not a complete user call path.

## Validation performed in this worktree

- `bash -n` on every script in `bin/` (including `bin/lib/profile.sh`).
- Profile resolution exercised directly: absent `JITSI_DEPLOYMENT` fails closed, an unknown value fails
  closed, `test`/`prod` each export the expected host/hostnames/paths/table/tag, resolution from a
  deployment env file works, and `jitsi_require_host` refuses a host that does not own the profile's
  address.
- `docker compose ... config` on `docker-compose.override.test.yml` with each profile's env template:
  the compose project, `container_name` and the Prosody `extra_hosts` TURN mapping all render to that
  profile's values (`bcb-jitsi-test` / `bcb-jitsi-test-coturn` / `turn.test.therapysto.ru` and
  `therapysto-jitsi-prod` / `therapysto-jitsi-prod-coturn` / `turn.therapysto.ru`), with no change to the
  TEST rendering. Re-run after the prod rename: `container_name` now interpolates
  `${JITSI_COTURN_CONTAINER}` from `bin/lib/profile.sh` instead of rebuilding a `bcb-jitsi-` stem, and both
  profiles render the values above.
- `nftables-therapysto-jitsi-prod.conf` parsed by `nft -c`. NOTE: in this worktree `nft` cannot reach
  netlink, so it reports `Operation not permitted` for the prod file **and** for the already-live TEST file
  — this is a GRAMMAR-level check only (confirmed to be a real parse: a deliberately corrupted copy of the
  same file reports `syntax error` at the right line before the netlink message, the clean file reports
  none). The prod file adds chains to the host's *existing* `inet filter` table, so whether that table and
  its base chains exist can only be validated on the host, where `bin/apply-network-policy.sh --check` runs
  `nft -c -f` against the live ruleset.
- `systemd-analyze verify` on `../systemd/therapysto-jitsi-prod-network-policy.service` — clean.
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
