# Closing same-branch correction — #1100 Jitsi/coturn TEST package

Work only in the supplied clean clone and existing `wt/jitsi-test-infra-20260908` branch. The primary independent
audit is `304176fa25666d75ffb2e2e005c128e2d59058ec`; the first correction is
`50e9264d980163028bf46c9bc96e2e2d02fc88f1`. Read `AGENTS.md` map and full §1/1b, §§7/9/10 and §24, the accepted
plan, audit artifact and exact pinned upstream Compose before editing. This is the closing pass over three concrete
defects found by the lead while accepting the correction, not a new blind audit or a broader redesign.

Источник оракула: `docs/_TODO/VIDEO_MEETINGS_JITSI_2026-09.md` §4 — TEST apply is idempotent and rollback restores
the exact package-owned pre-apply state; health must prove JVB and TURN on the exact running Compose context.

Workers do not write or edit tests. Scope remains `deploy/jitsi/**`, its TEST systemd template and the existing
package docs only. Do not touch application code, DB, live DEV/TEST/PROD state, DNS/TLS/firewall/nginx/systemd,
secret stores, owner checkboxes or audit tests. Do not start containers, land, push or deploy.

## Three required fixes

1. `health-check.sh` constructs `COMPOSE_ARGS` but every container lookup still executes bare
   `docker compose -p bcb-jitsi-test ps ...`. From `deploy/jitsi/` there is no complete default Compose project, so
   the command cannot discover the exact upstream+override deployment and health can never prove the running
   containers. Use the full composed arguments for all container/runtime lookups, including web and Prosody.
2. The override applies `ports: !override` to JVB, which removes the upstream loopback Colibri mapping while
   `health-check.sh` requires `http://127.0.0.1:${JVB_COLIBRI_PORT}/about/health`. Verify the exact pinned upstream
   service and make the final merged config publish the required Colibri endpoint on loopback in addition to the
   intended media ports. The merged-render proof must assert it explicitly.
3. Preserve idempotent re-apply and make destructive rollback targets non-broad. A running package currently makes
   its own port-collision preflight fail, so a second `install.sh --apply` cannot be a safe no-op/update. Recognize
   the exact existing `bcb-jitsi-test` project while still failing closed on foreign listeners. Before any `rm -rf`,
   require resolved CONFIG and secret-store paths to be exact descendants of the documented
   `/etc/bersoncarebot/jitsi-test/` package root and refuse `/`, `/etc`, `/etc/bersoncarebot` or another broad path;
   do not trust merely “absolute”. Keep deletion limited to the package footprint.

## Validation and handoff

Run shell syntax/diff checks, a full isolated pinned upstream+override `docker compose config` assertion including
the loopback Colibri port, an isolated proof that an existing exact project is allowed while a foreign listener is
rejected, and rollback target-guard fault probes for `/`, `/etc`, `/etc/bersoncarebot`, the documented valid paths
and a sibling path. Do not run `up` or mutate shared host state. Commit only the explicit package paths (never
`git add -A`) with `#1100`, evidence and remaining DNS/TLS/live blockers. End with SHA and exact command results.
