# Independent audit — new PROD split-surface configuration (#787)

**Candidate:** `a9ec7ff8e9c603bee18529ed12bd7133dc6f8d60`.
**Verdict:** **FAIL — NOT FOR LAND.** This audit changed only this artifact and the audit-queue verdict. It did not access or mutate any host, runtime environment, DNS, firewall, service, certificate, database, or deployed file.

## Classification and blind kill-set

The whole candidate is one-time repository configuration/documentation work. Before reading tests, all
seven requested kill items were classified as **view** work: source/consumer inspection and narrow existing
configuration behaviour checks are appropriate; source-text, line-count, formatting, and exact-env-string tests
are not. No acceptance test was added.

| Kill item | Verdict | Evidence |
| --- | --- | --- |
| 1. New PROD expresses the staff/patient pair and both custom-domain DNS values through typed consumers | **FAIL** | `APP_BASE_URL` and `PATIENT_APP_ORIGIN` are parsed by `parseWebappEnv`, but its Zod schema has no `CUSTOM_DOMAIN_EDGE_IP` or `CUSTOM_DOMAIN_CNAME_TARGET`. The parser silently strips both values. The template and its B8 documentation therefore promise app-facing DNS instructions that no current typed runtime consumer can receive. |
| 2. DEV/TEST retain the absent-value one-host fallback | PASS | Existing `parseWebappEnv` fallback resolves an absent `PATIENT_APP_ORIGIN` to `APP_BASE_URL`; candidate adds split values only to the new-PROD copy source. |
| 3. BersonCare apex remains external and `app.bersoncare.ru` generic | PASS | The new target documentation keeps `bersoncare.ru` as external landing and names `app.bersoncare.ru` a generic custom-domain lifecycle value; candidate changes no resolver or tenant-routing code. |
| 4. Blue/green health host, Caddy platform hosts, DNS instructions, and domain checker share the surface model | PASS | `bcb-bluegreen-lib.sh` derives `BCB_SURFACE_HOST` through `webapp-health-host.mjs` from the copied `APP_BASE_URL`; the target yields `therapysto.ru`. Caddy carries `therapygo.ru, *.therapygo.ru` separately from `CADDY_PLATFORM_DOMAINS`; `tools/check-prod-domains.sh` checks staff, patient, branded/custom, and old-prod surfaces with the same names. No duplicate app-facing DNS source is active in Caddy. |
| 5. Legacy state is distinguishable from the new target | PASS | `deploy/env/README.md`, `README.md`, `SERVER CONVENTIONS.md`, and `HOST_DEPLOY_README.md` identify `135.106.162.170`/BersonCare as legacy and limit `deploy/env/.env.webapp.prod.example` to the new `135.106.187.95` blue/green copy path. |
| 6. Trial-443 contradiction remains a named gate | PASS | The queue entry preserves the contradiction between the trial dev-box-only 443 statement and the broader network-policy statement as an unresolved live/owner gate; this audit does not guess a resolution. |
| 7. No live operation or live-success claim | PASS | Inspection and local parsing/syntax checks only; no host, DNS, TLS, deploy, database, or service command was issued. |

## Finding

### F1 — custom-domain DNS configuration is not available to the promised typed application consumer

`deploy/env/.env.webapp.prod.example` now sets `CUSTOM_DOMAIN_EDGE_IP=135.106.187.95` and
`CUSTOM_DOMAIN_CNAME_TARGET=edge.therapygo.ru`. `deploy/env/README.md` states that the later B8 API/UI reads
these values from the webapp runtime template. But `apps/webapp/src/config/env.ts` passes only declared Zod
properties through `parseWebappEnv`; neither key is declared or read from `process.env`.

Reachable scenario: the B8 binding UI is implemented according to this candidate's documented contract and asks
the existing typed runtime config for its apex/CNAME instruction. It receives neither value, so it cannot render
the required `A @ → 135.106.187.95` / `CNAME app → edge.therapygo.ru` instructions from this configuration.
The configuration can also drift without any typed consumer noticing. This violates kill item 1 and the B8
single app-facing source claim.

Required follow-up: a scoped implementation worker must add the two values to the existing typed webapp runtime
configuration seam and wire the B8 consumer to that same typed value; do not add a file-content/env-string test.
The existing fallback behaviour must remain unchanged when those values are absent outside the new target.

## Commands and results

| Command | Result |
| --- | --- |
| `git diff --check a9ec7ff8e9c603bee18529ed12bd7133dc6f8d60^ a9ec7ff8e9c603bee18529ed12bd7133dc6f8d60` | exit `0` |
| `pnpm --dir apps/webapp exec vitest run src/config/envDatabaseRuntime.unit.test.ts -t 'uses APP_BASE_URL for the patient origin when PATIENT_APP_ORIGIN is absent|keeps an explicitly configured patient origin'` | exit `0`; 1 file passed, 2 passed, 17 skipped |
| `VITEST_WORKER_ID=1 pnpm --dir apps/webapp exec tsx -e "…parseWebappEnv({ APP_BASE_URL: 'https://therapysto.ru', PATIENT_APP_ORIGIN: 'https://therapygo.ru', CUSTOM_DOMAIN_EDGE_IP: '135.106.187.95', CUSTOM_DOMAIN_CNAME_TARGET: 'edge.therapygo.ru' })…"` | exit `0`; typed origins accepted and both custom DNS keys absent from `EnvParsed` |
| `bash -n deploy/env/.env.webapp.prod.example tools/check-prod-domains.sh deploy/host/prod/bcb-bluegreen-lib.sh` | exit `0` |
| `APP_BASE_URL=https://therapysto.ru node deploy/host/webapp-health-host.mjs` | exit `0`; `therapysto.ru` |

No full CI is warranted: this audit artifact changes neither product code nor the build/test graph, and its
configuration evidence is covered by the targeted parser/syntax checks above.

## Lead disposition after core integration

The finding was a dependency-order failure, not a need for a second env implementation. After merging the
accepted domain core (`dc23b5ff5`), the existing `parseWebappEnv` schema and process-env projection preserve
both `CUSTOM_DOMAIN_EDGE_IP` and `CUSTOM_DOMAIN_CNAME_TARGET`; the binding service consumes those same typed
values to produce the DNS instruction. No configuration/product fix was added in this branch.

Post-integration evidence: the two existing patient-origin cases pass; a direct typed parse of the four
new-PROD surface/domain values returns both custom-domain values unchanged; shell/diff checks from the audit
remain applicable because the configuration commit is unchanged. The integrated repository verdict is
**PASS AFTER DEPENDENCY INTEGRATION, FOR LAND**. Live host, DNS, TLS, firewall, Caddy cutover and 443 policy
remain owner-authorized gates.
