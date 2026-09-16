# Worker brief — custom-domain TLS edge correction (#787)

You are the correction worker on candidate branch `wt/branding-domain-edge-20260907` in its existing isolated worktree. Current HEAD is `5de141275f20a0e2d6bb715c42153ab70b4d8b52`; product candidate `6253a346c` failed the one independent audit committed as `adef871d4`.

Read before editing:

- `AGENTS.md` route map, then §§1, 1b, 2, 3, 7, 9, 10, 10a, 10b, 24.
- `README.md`, `docs/ORCHESTRATION_BINDINGS.md`.
- `docs/ARCHITECTURE/SERVER CONVENTIONS.md`, `deploy/HOST_DEPLOY_README.md`.
- `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/IMPLEMENTATION_PLAN.md` §§1.1–1.2 and exact B7/B8/C5a.
- `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/AUDIT_CUSTOM_DOMAIN_TLS_EDGE_2026-09-07.md` in full. Its F1–F5 are the fixed kill-set. Do not invent a second audit or new scope.
- Existing edge candidate files and the existing blue/green setup/deploy scripts before changing them.

## Authority and exact outcome

Deliver one coherent correction that closes audit F1–F5 without touching PROD/TEST, DNS, services, firewall, databases, application schema, domain lifecycle/API/UI product code, or tests.

Owner requirements remain literal:

- B7 is one automatically renewed certificate containing both `therapygo.ru` and `*.therapygo.ru`; wildcard does not cover the apex. Exact per-slug certificates are not an accepted substitute.
- Arbitrary clinic domains use one common automatic Caddy edge with fail-closed on-demand permission; there is no per-tenant nginx edit or Certbot work.
- Existing nginx blue/green switching remains unchanged behind Caddy.
- Custom-domain public DNS instructions are `A @ -> 135.106.187.95` for apex or `CNAME app -> edge.therapygo.ru` for an existing-site case. They belong to webapp-facing runtime configuration, not to a Caddy-only env that falsely claims the app reads it.
- TEST remains unchanged. Do not deploy or probe either production host.

## Mandatory corrections

1. F1: fix the Caddyfile against one explicitly pinned Caddy version. Declare snippets before imports. Use the actual built-in `on_demand_tls { permission http <endpoint> }` syntax. Add/extend a repository validation entrypoint that builds or downloads the exact selected binary in a temporary location and runs `caddy validate` with non-secret placeholder env; do not install anything on the workstation and do not commit a binary.
2. F2: internal nginx must preserve Caddy's trusted external `Host`, HTTPS scheme, direct client identity, and forwarding chain instead of replacing them with loopback/http. The listener is loopback-only; state this trusted-proxy boundary explicitly. Keep blue/green upstream switching untouched.
3. F3: implement literal B7 through DNS-01. Current authoritative DNS is REG.RU. A currently available Caddy plugin is `github.com/heinwol/caddy-dns-regru`; if used, pin both Caddy and plugin version/commit and build a reproducible custom binary rather than installing an incompatible stock apt binary. Credentials are secrets in the root-owned Caddy env and must never be printed. Document the one-time REG.API enablement/IP allow-list/credential prerequisite honestly. Do not claim the repository can perform that owner credential step. Keep custom clinic domains on approved on-demand HTTP-01/TLS-ALPN, separate from the Therapygo wildcard.
4. F4: remove `CADDY_EDGE_STABLE_IP`/`CADDY_PLATFORM_CNAME_TARGET` and the false “UI reads Caddy env” claim from the Caddy-only env. Put these public values in the existing webapp production env template under typed, app-facing names following current config conventions, so the later B8 API/UI work has one reachable application source. Edge config must not duplicate values it does not consume. Do not implement the in-flight application binding module.
5. F5: make the edge health check actually schedulable by repository-owned systemd service/timer units and install/enable/verify those units in the edge cutover path. It must not use ad-hoc crontab and must remain separate from the application's external per-domain monitor. Rollback must account for the timer consistently.
6. Remove Berson-specific `app.bersoncare.ru` from static platform domains: it is the first ordinary custom binding and must go through the same ask/on-demand route as every clinic.
7. Make installation paths coherent: scripts executed from the installed pipeline must have every referenced edge template/script installed there by an existing setup path or an explicit repository-managed install step. Do not rely on `../../` paths that do not exist under `/opt/bersoncarebot/pipeline`.

The app-side permission endpoint will be implemented by the core/API stream. Configure the edge contract so an unavailable/non-2xx permission endpoint denies issuance. Do not create a second app implementation here. Update the existing edge runbook and historical audit queue by appending a `CORRECTION READY` entry; do not rewrite the independent FAIL artifact.

## Validation and delivery

- Worker does not write tests. This stage is one-shot infra/config view plus parser/runtime-script validation; source-text tests are forbidden by §§10a/10b.
- Run `bash -n` on every changed shell script.
- Run the exact pinned Caddy build/validation entrypoint and report the literal command/result. Use `mktemp -d` and leave no installed binary/toolchain changes.
- Render the nginx template safely and run a syntax check if the host has nginx; otherwise name the unexecuted gate.
- Run `git diff --check` and inspect the exact diff against `6253a346c` and the audit commit.
- Do not run full CI; it adds no signal for infra templates and would contend with other work.
- Stage only explicit task paths, never `git add -A`. Commit everything in this correction before ending. Commit message must mention `#787`, why, evidence, which B7/B8/C5a consequences it closes, and remaining live/owner gates.
- Do not push, land, deploy, access secrets, or finish while a foreground validation is still running.
