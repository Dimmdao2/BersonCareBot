# Independent AUDITOR-LIVE — Berson Care TEST custom domain (#787)

**Candidate:** `941c632ea` · **Worker authority:** `e4322fa25` · **Audit date:** 2026-09-09  
**Verdict:** **FAIL — NO LAND**

## Authority, kill-set and finding

Oracle: plan §1.2a makes `test.bersoncare.ru` the Berson Care branded TEST custom domain, exact apex binding; `TPB-14` requires self-service custom-domain connection. Blind kill-set: K1 least-privilege INSERT inspection; K2 same-org rollback-only port save; K3 cross-org refusal; K4 TEST HTTPS proxy/TLS/VPN/YooKassa render; K5 no platform redirect; K6 active-document consistency.

### F1 — broad INSERT grant opens server-owned binding state

**Scenario/impact.** A caller with `app_staff` can name `id`, `created_at`, `updated_at`, `activated_at`, and `status_reason` in an INSERT to `public.org_custom_domain_bindings`. This lets a compromised/bypassing DB caller manufacture generated identity/timestamp/readiness state outside B2/B8/C5a's server-owned, fail-closed lifecycle.

**Violated requirement.** Audit acceptance item 1 and B2/B8/C5a.

**Evidence.** The only ordinary write, `apps/webapp/src/infra/repos/pgCustomDomainBinding.ts#setCustomDomainIntent`, supplies only `organization_id`, `base_domain`, `placement`, `subdomain_label`, `hostname`, `status='pending'`, and `created_by_platform_user_id`. Candidate `deploy/postgres/privileges/declaration.ts` adds INSERT on `id`, `status_reason`, `activated_at`, `created_at`, and `updated_at`. Drizzle may emit defaulted columns as `DEFAULT`, but granting them permits explicit caller values; parity is not least privilege.

`pnpm run check:db-privileges-generated` exited 0: all privilege, allowlist, and port-context artifacts match declaration byte-for-byte. `git diff e4322fa25 941c632ea -- apps/webapp/db/drizzle-migrations '*.tsv'` found no migration-local `GRANT`/`REVOKE` or historical TSV edit. Neither result cures F1.

## Named DEV behavior evidence

Added `apps/webapp/src/infra/repos/pgCustomDomainBinding.devDbProof.test.ts`: opt-in, real staff port-context plus `createPgCustomDomainBindingPort()`, with the successful call force-rolled back. Independent oracle: TPB-14/B2/B8; observable consequence: clinic save or tenant boundary failure; no fake or raw-SQL product path.

Command:

```text
set -a; source /home/dev/dev-projects/BersonCareBot/apps/webapp/.env.dev; set +a; USE_REAL_DATABASE=1 RUN_CUSTOM_DOMAIN_BINDING_DB=1 pnpm --dir apps/webapp exec vitest run src/infra/repos/pgCustomDomainBinding.devDbProof.test.ts
```

Both cases stopped before a write: `DEV requires an active staff membership and an organization without that membership`. No fixture/account/persistent row was created. Existing rollback-only proof `RUN_CLINIC_DOMAIN_WRITE_CONSTRAINTS_DB=1 node --test deploy/postgres/privileges/clinic-domain-write-constraints.devDbProof.test.mjs` returned 4/5 pass; duplicate-host stopped with `DEV fixture requires two organizations`. K2/K3 are therefore named-DEV data blockers, not passing evidence.

## TEST vhost render and injection

`bash deploy/host/apply-test-surface-domains.sh --dry-run` exited 0: checker OK and `test.bersoncare.ru -> TEST webapp (preserved Host)`. The operation only verifies host/certificate/wiring, renders to `mktemp`, invokes the checker and exits before backup/install/reload; no state changed. `node docs/_TODO/SAAS_FOUNDATION/scripts/check-saas-a2-nginx-forwarded-host.mjs --self-test` exited 0 (`4/4 faults rejected`). Render inspection confirmed `127.0.0.1:6300`, TEST VPN allowlist, TLS/maintenance, YooKassa ingress, `$host` for `Host`/`X-Forwarded-Host`, and no redirect.

Temporary faults were reverted before saving this artifact:

| Fault | Dry-run result |
| --- | --- |
| branded `Host $host` replaced by `test.therapysto.ru` | nonzero: `missing proxy header: Host $host` |
| `return 307 https://test.therapygo.ru$request_uri` inserted in branded HTTPS `location /` | nonzero: `required host test.bersoncare.ru must not redirect to a platform TEST hostname` |

No nginx, DNS, certificate, migration, TEST deploy, provider, or PROD action occurred.

## Documentation, open gates, validation

Exact inventory command: `rg -n -i -C 1 'test\.bersoncare\.ru|berson\.test\.therapygo\.ru' README.md docs/ARCHITECTURE docs/_TODO deploy --glob '*.md' --glob '*.sh' --glob '*.mjs'`. Active `README.md`, server conventions, plan and TEST render consistently distinguish branded `test.bersoncare.ru` from standard `berson.test.therapygo.ru`. Legacy wording is historical operational/audit/run evidence (`deploy/LOG.md`, dated `docs/_TODO/runs/**`) and was not rewritten. §1.2a's statement that the former transition host is no longer legacy is not contradictory.

B2/B8/C5a/D remain open: no actual TEST binding, DNS/TLS/readiness, owner settings journey, or patient journey was claimed.

Validation passed:

```text
pnpm run check:db-privileges-generated
pnpm --dir packages/db-principal run build
pnpm --dir packages/operator-db-schema run build
pnpm --dir packages/error-tracking run build
pnpm --dir packages/shared-contracts run build
pnpm --dir packages/platform-merge run build
pnpm --dir apps/webapp run typecheck
bash deploy/host/apply-test-surface-domains.sh --dry-run
node docs/_TODO/SAAS_FOUNDATION/scripts/check-saas-a2-nginx-forwarded-host.mjs --self-test
```

All listed validation commands exited 0. Full CI was not run: it cannot prove this DB privilege/runtime or nginx-render boundary; targeted gates do.
