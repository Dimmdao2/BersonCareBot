# Test or view classification — independent split-surface configuration audit (#787)

Audit candidate `a9ec7ff8e9c603bee18529ed12bd7133dc6f8d60`. Audit only the repository configuration/documentation candidate
from `wt/branding-domain-prod-config-20260907`; do not inspect or mutate any host, runtime env, DNS,
firewall, service, certificate, database or deployed file.

Before every action follow the `AGENTS.md` heading-map gate. Read complete applicable §§1/1b, 2, 3,
7, 9, 10/10a/10b, 12 and 24; `README.md`; `docs/ORCHESTRATION_BINDINGS.md`;
`docs/ARCHITECTURE/SERVER CONVENTIONS.md`; `deploy/HOST_DEPLOY_README.md`; `deploy/env/README.md`;
`docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/IMPLEMENTATION_PLAN.md` §§1.1–1.2, B1/B3/B7/B8;
the surface/domain map; accepted edge correction row; worker brief; and candidate diff.

Before reading tests, classify the whole kill-set. This is one-time deploy/config view work: source,
line/count, formatting and exact env-string tests are forbidden. Use existing behavior validators only
where they genuinely parse/consume the configuration; do not add tests that grep files. You may commit
only an audit artifact/queue verdict and a genuinely missing stable behavior test; never fix product or
configuration code.

## Kill-set

1. A copy-safe new-PROD configuration expresses staff `https://therapysto.ru`, patient
   `https://therapygo.ru`, custom apex edge `135.106.187.95` and custom subdomain target
   `edge.therapygo.ru` through the existing typed consumers; it does not leave the new PROD in the old
   BersonCare single-host product.
2. Existing TEST/dev keeps the one-host fallback when patient/custom-edge values are absent; no new flag,
   tenant branch or BersonCare product branch exists.
3. `bersoncare.ru` remains an external landing and `app.bersoncare.ru` remains a generic custom binding;
   no app resolver starts serving the apex as a tenant surface.
4. Existing new-PROD blue/green health-host derivation, Caddy platform host set, custom-domain DNS
   instructions and `tools/check-prod-domains.sh` agree with the same surface model. No duplicate active
   source silently drifts.
5. Old production's factual current state remains explicitly distinguishable from the new target. A
   repository example must not silently masquerade as both if their paths/contracts differ.
6. The documented contradiction about trial 443 exposure is not resolved by guessing. It remains a named
   live/owner gate unless later authoritative repository evidence proves one side.
7. No host/DNS/TLS/deploy/DB action or live-success claim occurred.

Run the relevant existing typed-env/config behavior checks with split values, validators touched by the
candidate, shell syntax where applicable and `git diff --check`. Record exact commands/results and one
binary PASS/FAIL with only reachable/config-execution findings. Commit explicit artifact/queue paths only,
never `git add -A`; do not push or land.
