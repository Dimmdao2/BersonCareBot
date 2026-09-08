# Same-branch correction brief — #1100 Jitsi/coturn TEST package

Work in the supplied clean clone and existing `wt/jitsi-test-infra-20260908` branch. Product candidate is
`ed653358fe0bd08fc6f85a1f30596183652c46ee`; retained independent audit artifact is
`304176fa25666d75ffb2e2e005c128e2d59058ec`. Read `AGENTS.md` map and full §1/1b server/security, §§7/9/10 and
§24, then `docs/ARCHITECTURE/SERVER CONVENTIONS.md`, `deploy/HOST_DEPLOY_README.md`,
`docs/_TODO/VIDEO_MEETINGS_JITSI_2026-09.md` VM-01..06 + runtime contract and
`docs/audit/jitsi-coturn-test-package-2026-09-08.md`. Official Jitsi Docker/Prosody TURN/coturn docs are protocol
authority; verify the exact pinned release rather than relying on comments.

Источник оракула: `docs/_TODO/VIDEO_MEETINGS_JITSI_2026-09.md` §4 — «Собственный STUN/TURN — единственный ICE
list» and «TURN использует time-limited credentials … UDP и TLS fallback».

Workers do not write/edit tests. This stream may edit only its deploy package, corresponding TEST-only systemd/nginx
templates, ignore entry and its audit/runbook docs. Do not touch application code, DB, DEV/TEST/PROD runtime, DNS,
TLS provider, firewall, nginx live config, systemd live state or secret stores. Do not start containers or shared
services. Do not push/land/deploy or change owner checkboxes.

## Required correction, one coherent pass

1. Make the full upstream+override Compose render executable before any mutation. Set a deterministic absolute
   `CONFIG` tree and mount package files from paths that resolve correctly when the upstream compose is the first
   file. Web must bind loopback host `${HTTP_PORT}` to the actual upstream container port `80` when
   `DISABLE_HTTPS=1`; host nginx must proxy plain HTTP to that loopback port. Remove the false 8443/self-signed path.
   Add a real preflight `docker compose ... config` against the pinned upstream tree before `up`.
2. Mount trusted coturn certificate/key from the documented host TLS path actually checked by preflight; do not mount
   an empty named TLS volume. Prosody/XEP-0215 must explicitly advertise both own-RF UDP TURN and `turns` TCP/TLS
   fallback on 5349 according to the exact supported Prosody version. Remove any coturn setting that disables the
   required fallback. Static browser TURN username/password remains forbidden.
3. Render secrets without interpolating secret values into process argv, logs or committed files. Keep rendered
   modes `0600`, generation idempotent, and make failure atomic (temp file then rename). The app JWT secret remains an
   explicit external matching input and must not be printed/read from DB by this package.
4. Before downloading, rendering or starting anything, fail on collisions for every exact host surface this package
   owns: loopback web, JVB UDP/TCP, TURN UDP/TCP/TLS and relay range as applicable. Document operator prerequisites
   separately from package mutations. Default rollback must restore the package's exact pre-apply state (containers,
   networks, package-created volumes/vendor/rendered config/secrets); it must not pretend external DNS/TLS/nginx/
   firewall were changed. Systemd `ExecStop` must use the same complete compose context, not bare compose discovery.
5. Make service health fail closed using the same compose files/env as install: require container health where
   available, actual JVB health, mandatory TURN/STUN/credential allocation probes with no silent host-tool skip, and
   validation of the rendered/runtime endpoint policy. Keep the live two-browser/third-occupant/ICE-stats/network
   capture as a separately named acceptance command/runbook stage; a basic health PASS must not claim that unrun proof.
6. Pin every Jitsi/coturn image by immutable digest and verify the downloaded upstream archive against a recorded
   SHA-256 before unzip. Version-update tooling/docs must update tag+digest+archive hash together and reject drift.
7. Preserve server-enforced `MAX_PARTICIPANTS=2`, P2P-first, own JVB fallback, no external STUN/telemetry/branding,
   no Jibri/Jigasi/recording/transcription and minimal toolbar. Expand known-host literal scans into rendered merged
   config/runtime proof; do not promise geography of direct peer routing.
8. Keep DNS A records and trusted TLS for `meet.test.bersoncare.ru`/`turn.test.bersoncare.ru` as exact external
   blockers named by `--check`. The corrected package must be statically/dry-run verifiable without weakening those
   gates or mutating the host.

## Validation and handoff

Run `bash -n` over all scripts, JS syntax checks, `git diff --check`, immutable pin/hash checks, isolated secret-render
proof, off-host/prerequisite/port-collision fail-closed probes and a full upstream+override `docker compose config`
render in a temporary directory. Do not run `up`. Reuse the audit's official protocol comparison. Commit with explicit
path staging, never `git add -A`; message includes `#1100`, why, evidence, Wave 1 C and exact DNS/TLS/live blockers.
End with SHA, files, commands/results and remaining external gates. Do not finish while a foreground command runs.
