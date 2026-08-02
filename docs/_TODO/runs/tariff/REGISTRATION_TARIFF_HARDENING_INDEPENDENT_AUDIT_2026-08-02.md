# Registration tariff hardening — independent audit

Candidate: `8c7e5d9db` (`fix(saas): preserve configured registration tariff (#1057 #1069)`).

Authority: `AGENTS.md` §§1, 5, 10b, 24; `docs/_TODO/SAAS_FOUNDATION/TARIFFS_PAYMENTS_ADMIN_PLAN.md` §2.6a and §5а-0 Р-1/Р-7; `docs/_TODO/runs/briefs/REGISTRATION_TARIFF_HARDENING_BRIEF.md`.

## Blind kill-set (recorded before reading changed tests)

| Named fault | Required observable outcome |
| --- | --- |
| Remove the registration-policy check from `archiveTariff` | Archiving a tariff referenced by a non-NULL registration policy is refused. |
| Remove the registration-policy check from `updateTariff(..., { isActive: false })` | Deactivation of that referenced tariff is refused. |
| Allow concurrent policy set and tariff deactivate/archive without the DB serialization/locking protection | Both transactions cannot commit leaving the policy pointing at an inactive tariff. |
| Restore the provisioning policy's silent `INNER JOIN` collapse | A stale non-NULL reference raises `registration_tariff_policy_tariff_invalid`; the outer provisioning transaction rolls back organization, membership, and intent changes. |
| Treat a NULL registration policy as the stale-reference failure | NULL/missing registration policy remains legal and creates an organization without a tariff when there is no active trial policy. |
| Remove C5A `require_file` or apply from `deploy-prod.sh` | Static/deploy-script proof fails; C5A must be required and applied after specialist-owner and reference-catalog overlays in the stated working ordering. |
| Weaken an unrelated specialist-signup rollout guard | Current DB-backed settings path no longer preserves the required guard; any changed assertion requires direct runtime-contract evidence. |

No changed test body was read before this section was written. No product fix is authorized in this audit.

## Results

Verdict: **FAIL / red handoff**. Candidate preserves the sequential and provisioning contracts, but does not
serialize the concurrent policy-set and tariff-archive write path.

### Killed / missed

| Class | Evidence | Result |
| --- | --- | --- |
| Archive registration-policy guard removed | Temporarily removed the in-memory `archiveTariff` guard; `service.test.ts:75` failed because archive resolved. Restored before continuing. | Killed. |
| Deactivate registration-policy guard removed | Temporarily removed the in-memory `updateTariff(... isActive=false)` guard; `service.test.ts:78` failed because update resolved. Restored before continuing. | Killed. |
| Silent inactive-reference `INNER JOIN` restored | Temporarily joined registration policy to active tariff; private provisioning smoke failed with `broken non-NULL registration tariff policy unexpectedly provisioned an organization`. Restored. | Killed. |
| C5A `require_file` and apply removed | Temporarily removed both deploy lines; `--static-only` failed: `production deploy C5A post-migration overlay order: missing require_file ... C5A_PLATFORM_OPERATIONS_RUNTIME`. Restored. | Killed. |
| Concurrent `setRegistrationTariffPolicy(active)` + `archiveTariff` | New acceptance branch in the existing disposable smoke holds the policy row, runs two child processes that call the real `createPgPlatformEntitlementsPort`, and releases the interleaving only after archive has completed/blocked. Both current writes commit and final state is policy → inactive tariff. | **Missed by candidate; red acceptance handoff.** |

The race is reachable because `setRegistrationTariffPolicy` checks the active tariff and then upserts the policy
without a shared lock with `archiveTariff`; archive's policy lookup can observe the prior NULL row before the
set commits. The red command is:

```bash
node docs/_TODO/SAAS_FOUNDATION/scripts/smoke-phase3-specialist-signup-provisioning.mjs
```

Observed terminal assertion:

```text
concurrent registration policy set and tariff archive committed an inactive policy reference
```

The non-race portion is green with:

```bash
node docs/_TODO/SAAS_FOUNDATION/scripts/smoke-phase3-specialist-signup-provisioning.mjs --skip-registration-policy-race
```

It proves legal NULL/missing policy with disabled trial, stable stale-reference error, and rollback of intent,
organization and membership. It completed `OK` on the candidate.

### View checks

- `deploy/host/deploy-prod.sh` requires C5A before migrations and applies it after
  `SPECIALIST_OWNER_PROVISIONING_RLS` and before `REFERENCE_CATALOG_RLS`; no host, DEV, TEST, or PROD action ran.
- Candidate scope is the stated two ports, focused test, C5A overlay, deploy script, existing smoke, and worker
  report. This audit adds only this report and the intended acceptance branch in the existing smoke.
- The changed specialist-signup static assertion does not weaken the runtime guard: current
  `specialistSignupRollout.ts` still calls `getPublicRuntimeBool('specialist_signup_enabled')`, while
  `system-settings/registry.ts` declares it as DB-backed `runtime('admin', 'global', 'public', 'boolean', 'false')`.
  Removing the obsolete `runtimeConfig.ts` source-string assertion is therefore consistent with the current
  DB-backed contract.

### Green checks

```bash
pnpm --dir apps/webapp exec vitest run src/modules/org-entitlements/service.test.ts
# 48 passed
node docs/_TODO/SAAS_FOUNDATION/scripts/smoke-phase3-specialist-signup-provisioning.mjs --static-only
# static guards OK
bash -n deploy/host/deploy-prod.sh
node --check docs/_TODO/SAAS_FOUNDATION/scripts/smoke-phase3-specialist-signup-provisioning.mjs
pnpm --dir packages/platform-merge run build
pnpm --dir packages/error-tracking run build
pnpm --dir apps/webapp run typecheck
pnpm --dir apps/webapp exec eslint src/infra/repos/inMemoryPlatformEntitlements.ts src/infra/repos/pgPlatformEntitlements.ts src/modules/org-entitlements/service.test.ts
node scripts/check-no-new-raw-sql.mjs
# OK (integrator manifest files: 7; webapp manifest files: 21)
git diff --check
```

Limits: no product fix, migration, journal/schema change, DEV/TEST/PROD action, or new DB harness. The race uses
the existing private disposable PostgreSQL smoke and restores all temporary fault injections before exit.
