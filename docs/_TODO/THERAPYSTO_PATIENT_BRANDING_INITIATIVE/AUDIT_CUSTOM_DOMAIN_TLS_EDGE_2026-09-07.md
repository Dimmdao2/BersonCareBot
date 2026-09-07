# Independent audit — custom-domain TLS edge (#787)

**Candidate:** `6253a346c` (`c8eb16f7a..6253a346c`).
**Verdict:** **FAIL — NOT FOR LAND.** No product/deploy code was changed by this audit; no acceptance test was added.

## Authority and scope read

Read before inspection: `AGENTS.md` §§1, 1b, 2, 3, 7, 9, 10, 10a, 10b, 24; `README.md`; `docs/ORCHESTRATION_BINDINGS.md`; `docs/ARCHITECTURE/SERVER CONVENTIONS.md`; `docs/ARCHITECTURE/LOCAL_DEV_AND_AGENT_TESTING.md`; `deploy/HOST_DEPLOY_README.md`; `IMPLEMENTATION_PLAN.md` §§1.1–1.2 and B7/B8/C5a; `CUSTOM_DOMAIN_TLS_RESEARCH_2026-07-26.md`; the candidate runbook; and existing blue/green scripts `deploy/host/prod/{bcb-bluegreen-lib.sh,setup-docker-bluegreen.sh}` plus `tools/deploy-prod-from-dev.sh`.

Canonical facts used: the new production topology has exactly one public IP, `135.106.187.95`, and nginx performs the blue/green upstream switch; 80/443 are already public there, while TEST/VPN stays on `151.241.228.122`. `B7` literally requires a certificate containing both `therapygo.ru` and `*.therapygo.ru`; B8/C5a require automatic TLS after approved DNS and a safe technical address until readiness.

## Blind kill-set and classification

This list was written before reading candidate tests (there are none in the candidate).

| Kill item | Test or view | Result / evidence |
| --- | --- | --- |
| One documented IP; no stale/second-host assumption | view | PASS: only `135.106.187.95` is encoded in `deploy/env/.env.caddy.prod.example`; no TEST/VPN file changes. |
| Platform hosts and blue/green nginx retain external Host, HTTPS scheme, and client chain | view | **FAIL:** `bcb-internal.conf.template` resets `X-Forwarded-Proto` to nginx's loopback `$scheme` (`http`) and `X-Real-IP` to Caddy's loopback peer. |
| On-demand issuance is approved-only and unavailable `ask` fails closed; contract can interoperate | view | FAIL: the Caddyfile cannot adapt; see F1. The absent app endpoint would otherwise deny, which is safe but not an interoperable end-to-end contract. |
| No tenant nginx/Certbot work; durable automatic certificates | view | PASS in the written design: one Caddy file store and no per-tenant script/config path. Runtime remains unexecuted. |
| HTTP-01 owns 80; public handoff/preflight/rollback is coherent | view | PARTIAL: the scripts provide preflight and a reachable rollback script, but the Caddyfile parser failure makes the cutover fail before a functional handoff. |
| B7 cannot create unbounded per-slug ACME pressure | view | **FAIL:** literal wildcard is absent; the runbook explicitly substitutes exact on-demand certificates per slug. |
| Edge health reads actual cert store and has a non-conflicting scheduler | view | PARTIAL/FAIL: the script targets Caddy's configured store, distinct from the app's external domain probe, but no canonical timer/unit or scheduling instruction is supplied. The existing typed manifest is the repository's sole source for scheduled jobs. |
| TEST/VPN/current servers unchanged by repository-only work | view | PASS: diff adds only repository files and names the new production host. No live command was run. |
| Examples are secret-free; application DNS values have one reachable source | view | PARTIAL/FAIL: no secrets are present, but `CADDY_EDGE_STABLE_IP` and `CADDY_PLATFORM_CNAME_TARGET` live only in Caddy's systemd env while the template says the application UI reads them. Exact code search found no app config consumer, so the UI cannot obtain the promised A/CNAME instructions and the source can drift. |

All are views under `AGENTS.md` §10a/§24.4: they concern a one-shot infrastructure/configuration installation or host fact. A source-text test would violate the canon; stable application behavior is outside the candidate scope. Therefore no acceptance test is appropriate.

## Commands and results

| Command | Exact result |
| --- | --- |
| `git diff --stat c8eb16f7a..6253a346c` | 7 added files, 641 lines. |
| `bash -n deploy/host/prod/cutover-edge-to-caddy.sh deploy/host/prod/rollback-edge-to-nginx.sh deploy/host/prod/check-caddy-edge-health.sh` | exit `0`. |
| `git diff --check c8eb16f7a..6253a346c` | exit `0`. |
| Official Caddy `v2.10.2` binary, with the candidate env values: `caddy validate --config deploy/caddy/Caddyfile.template --adapter caddyfile` | exit `1`: `File to import not found: edge_common, at deploy/caddy/Caddyfile.template:57`. |
| Same parser on a process-substitution copy with only `import edge_common` removed | exit `1`: `parsing caddyfile tokens for 'on_demand_tls': wrong argument count or unexpected line ending after 'http', at /dev/fd/63:39`. |
| Official Caddy `v2.11.0` source inspection (`modules/caddytls/ondemand.go`, `caddyconfig/httpcaddyfile/options.go`) | `PermissionByHTTP.UnmarshalCaddyfile` requires one positional endpoint (`d.AllArgs(&p.Endpoint)`); it does not accept the candidate's `endpoint { ... }` block. |

The Caddy binary was downloaded to a `mktemp -d` directory and executed only as `validate`; it was not installed, started, or pointed at a live host. The second parser view used process substitution only. No production file was fault-injected or edited, so there was nothing to revert; `git diff --check` remained clean before this artifact was added.

## MUST FIX

1. **F1 — the published edge cannot load.** `Caddyfile.template` imports `(edge_common)` before the snippet is declared, and its `permission http` syntax is invalid for the built-in module. Scenario: an operator follows `cutover-edge-to-caddy.sh`; its mandatory preflight `caddy validate` exits non-zero and Caddy is never cut over. Impact: B8/C5a automatic custom-domain TLS cannot be deployed. Requirement: B8's automatic edge with approved `ask`; candidate runbook promises config validation before nginx changes. Fix the Caddyfile against the selected shipped Caddy version and add a real local parser validation gate before declaring it ready.
2. **F2 — the Caddy→nginx hop destroys the external scheme and direct-client identity.** Scenario: `https://clinic.example` reaches Caddy, which sends the original scheme/client headers, then the internal nginx template overwrites them with loopback request values (`X-Forwarded-Proto: http`, `X-Real-IP: 127.0.0.1`). Impact: the application does not receive the required original HTTPS/client chain; origin/CSRF and client-IP/rate-limit behavior may be wrong. Requirement: this audit's owner-required consequence #2 and the edge runbook's Host/origin contract. Preserve trusted forwarded values through the internal hop with an explicit trusted-proxy policy.
3. **F3 — B7 is not met and the fallback admits per-slug certificate growth.** Scenario: every new `<slug>.therapygo.ru` reaches the on-demand block; after an `ask` implementation it requests a separate HTTP-01 certificate. Impact: this is neither the B7 certificate SAN `therapygo.ru` + `*.therapygo.ru` nor a bounded registered-domain issuance strategy. Requirement: literal B7. The runbook correctly records the missing DNS-01/provider decision, but a named blocker is not land-ready evidence. Obtain an owner supersession or implement the required wildcard DNS-01 path.
4. **F4 — app-facing DNS instructions have no reachable canonical source.** Scenario: the future B8 UI needs the apex IP/CNAME target; they exist only in `/opt/bersoncarebot/env/caddy.prod`, loaded exclusively into Caddy, while no webapp config consumes them. Impact: the required self-service DNS instructions cannot be rendered from this candidate and duplicate values can drift. Requirement: B8/C5a plus `AGENTS.md` §3 one source appropriate to the consumer. Put the platform DNS values in the canonical typed application/deploy configuration (or another owner-approved single source) and make the edge consume that same value.
5. **F5 — edge expiry monitoring is not schedulable through a repository-defined mechanism.** Scenario: after cutover, `check-caddy-edge-health.sh` remains an uncalled file; adding an ad-hoc cron would contradict the documented single scheduler/manifest discipline. Impact: certificate-store loss/expiry can remain undetected despite the claimed signal. Requirement: audit consequence #7 and `HOST_DEPLOY_README.md` “Host scheduled jobs”. Supply an explicit, non-duplicating timer/manifest-backed schedule and its install/verify path; keep the app's external domain-health probe separate.

## Remaining live and owner gates

After all MUST FIX items: validate the exact shipped Caddy binary with the real non-secret env, execute cutover and rollback once on the new production host with explicit owner authorization, prove HTTP-01 for a platform name and an approved custom name, and observe renewal. The unimplemented `ask` endpoint, hostname lifecycle/readiness, and settings UI remain separate B-stage application work. No PROD/TEST/DNS/firewall/service/cron operation was performed by this audit.
