# Worker brief — split-surface activation configuration for the new PROD (#787)

Work only in `/home/dev/dev-projects/bcb-wt-branding-domain-prod-config-20260907` on
`wt/branding-domain-prod-config-20260907`. This is a bounded repository-configuration stage; it must
not touch any host, runtime env, DNS, firewall, service, certificate, database or deployed file.

Before every action follow the `AGENTS.md` heading-map gate. Read complete applicable §§1/1b, 2, 3,
7, 9, 10/10a/10b, 12 and 24; `README.md`; `docs/ORCHESTRATION_BINDINGS.md`;
`docs/ARCHITECTURE/SERVER CONVENTIONS.md`; `deploy/HOST_DEPLOY_README.md`; `deploy/env/README.md`;
`docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/IMPLEMENTATION_PLAN.md` §§1.1–1.2, B1/B3/B7/B8;
`SURFACE_AND_DOMAIN_MAP_2026-08-22.md`; and the accepted edge correction row in
`docs/_TODO/NIGHT_WAVE_AUDIT_QUEUE_2026-07-28.md`. Use code-search before blind grep.

## Outcome

Make the repository's canonical configuration/instructions truthful and sufficient for the new
trial production host's already-decided split surfaces:

- staff `APP_BASE_URL=https://therapysto.ru`;
- patient `PATIENT_APP_ORIGIN=https://therapygo.ru`;
- apex custom-domain instruction `CUSTOM_DOMAIN_EDGE_IP=135.106.187.95`;
- subdomain instruction `CUSTOM_DOMAIN_CNAME_TARGET=edge.therapygo.ru`.

Today the canonical production example still says `APP_BASE_URL=https://bersoncare.ru` and leaves the
patient origin commented, which would preserve the old single-host product if copied to the new PROD.
Inspect all example consumers and active docs before changing anything. Extend the existing canonical
example/source where possible; create no duplicate config abstraction. If old and new production
templates genuinely require distinct artifacts, prove that from the existing deployment paths before
adding one, and keep the old production state explicitly documented rather than silently rewriting a
runtime fact.

Preserve the existing TEST/dev one-host fallback: when `PATIENT_APP_ORIGIN` and custom-edge values are
absent, the current host continues to work. Do not force split domains into TEST, do not add an env
feature flag, and do not add tenant/BersonCare branches. `bersoncare.ru` remains the external first-
tenant landing; the app address is `app.bersoncare.ru` through the generic custom-domain lifecycle.

Review the new blue/green pipeline's `surface_host` derivation, Caddy platform-host list, canonical env
README and `tools/check-prod-domains.sh`. Change only files necessary for a copy-safe new-PROD setup and
validation. Do not modify the documented 443 exposure conflict by guessing: the topology table says
trial 443 is restricted to the dev-box while the network-policy section says 80/443 are public; report
that exact contradiction as an owner/live gate unless another later authoritative repo fact resolves it.

## Test and validation discipline

This is configuration/view work. Write no source-text, line/count, formatting, env-string-presence or
script-implementation tests. Reuse existing executable validators where they observe parsing/runtime
configuration behavior. If no behavior validator exists, inspect once and record the limit; do not add a
test that greps files.

Run the cheapest existing typed-env/config surface checks with the split values, relevant shell syntax,
existing Caddy/config validators if touched, scoped lint/typecheck only when code is touched, and
`git diff --check`. Do not run full CI without a named integration risk.

Commit explicit intended paths only, never `git add -A`; do not push or land. Update the audit queue with
a truthful `READY FOR INDEPENDENT VIEW AUDIT, NOT FOR LAND` row. Report exact commands/results and the
remaining owner-authorized live steps; do not claim PROD, DNS, TLS or firewall evidence.
