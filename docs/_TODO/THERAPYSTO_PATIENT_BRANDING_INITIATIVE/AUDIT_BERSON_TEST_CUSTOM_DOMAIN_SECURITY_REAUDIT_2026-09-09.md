# Independent security re-audit — Berson Care TEST custom domain (#787)

**Candidate:** `7e8a32b32cd0e74d50954285e03dffcb7dfc6e57`  
**Date:** 2026-09-09  
**Verdict:** **BLOCKED — NOT FOR LAND (the corrected live proof reaches candidate deployment state, but named DEV has not executed the candidate forward migration; no reachable product finding was observed).**

## Authority and classification before tests

Authority: active `IMPLEMENTATION_PLAN.md` §1.2/§1.2a, `B2`, `B8`, `C5a` and owner decisions; prior audit `AUDIT_BERSON_TEST_CUSTOM_DOMAIN_2026-09-09.md`.

| Acceptance item | Test or view | Oracle / observable consequence |
| --- | --- | --- |
| No direct staff lifecycle writes | View | A compromised ordinary staff DB path must not manufacture identity, timestamps, readiness or activation. |
| One staff intent root derives tenant/lifecycle state | Test | A clinic save either creates its own pending intent or refuses; browser input cannot select another tenant or server-owned state. |
| Same-org save; cross-org spoof/hostname capture refusal | Test | A clinic can save its own intent; a foreign tenant cannot acquire its binding or hostname. |
| Quarantine, retry, supersede, clear, lock preservation | Test | A released/superseded hostname cannot be silently reassigned and legitimate retry remains possible. |
| Owner/grant/generated declaration/repository seam | View | Only the declared root has mutation authority; DEV and TEST projections agree byte-for-byte. |
| Migration rights and owner-aware preflight | View + rollback-only behavior | No local migration ACL; candidate DDL compiles under declared owners and ends in rollback. |

No new test was written: the existing real-port DEV proof already has the independent oracle (TPB-14/B2/B8), costly silent failures (tenant takeover or an unusable clinic save), and observable DB result. It was reused before considering any new test.

## View results

1. `app_staff` has `SELECT` only on `public.org_custom_domain_bindings` in both generated declarations. It has no direct `INSERT` or `UPDATE`, including `id`, `created_at`, `updated_at`, `activated_at`, `status`, or `status_reason`.
2. The only ordinary staff mutation root is `app.save_custom_domain_binding_intent(text,uuid,text,text)`, declared in both DEV/TEST port-context catalogs with `app_staff`/`staff` context and exact purpose `branding.custom-domain.intent.save`. The UUID is checked against `app.current_org_id()` after accepted context attestation; it cannot choose an organization. Hostname and subdomain label are derived server-side, while `id`, timestamps, readiness and activation are absent from its input and write surface.
3. The root owner is `app_seam_custom_domain_owner`, separate from ordinary staff and from the worker-only transition root. Its exact table authority is only the binding lifecycle seam: INSERT of `organization_id`, normalized domain/placement/derived hostname, `pending`, and actor; UPDATE of `status`, `status_reason`, `updated_at` (plus the separately declared worker activation surface). Forced RLS and the owner gate remain generated.
4. The repository calls only that named root for set and clear. Direct staff table access remains the read binding state path. The procedure keeps the advisory transaction lock, failed→pending retry, quarantine-before-supersede, clear→quarantine, and permanent hostname uniqueness. A duplicate returns `hostname_taken` without a competing row.

`pnpm run check:db-privileges-generated` passed: declaration, privilege, allowlist and port-context projections match byte-for-byte for `bcb_webapp_dev` and `bersoncarebot_test`.

## Migration and validation

- `node scripts/check-migration-privileges.mjs` → `OK (152 migration files)`.
- `git diff --check 7e8a32b32^ 7e8a32b32` → exit 0.
- `git diff --no-ext-diff --unified=0 7e8a32b32^ 7e8a32b32 -- apps/webapp/db/drizzle-migrations/20260909T200000_custom_domain_staff_intent_door.sql | rg '^[+-].*\\b(GRANT|REVOKE)\\b'` → no result. The migration contains no local `GRANT`/`REVOKE`.
- `bash deploy/host/migrate-dev.sh --preflight --runtime-env-root /home/dev/dev-projects/BersonCareBot` → PASS; owner-aware named `bcb_webapp_dev` compiled `pending=2 total=151`, then explicit `ROLLBACK`. No migration was applied.
- `RUN_CLINIC_DOMAIN_WRITE_CONSTRAINTS_DB=1 node --test deploy/postgres/privileges/clinic-domain-write-constraints.devDbProof.test.mjs` → 4 pass / 1 fail. The only failed case aborts before a write with `DEV fixture requires two organizations`.
- `set -a; source /home/dev/dev-projects/BersonCareBot/apps/webapp/.env.dev; set +a; USE_REAL_DATABASE=1 RUN_CUSTOM_DOMAIN_BINDING_DB=1 pnpm --dir apps/webapp exec vitest run src/infra/repos/pgCustomDomainBinding.devDbProof.test.ts` → could not start: `Command "vitest" not found` in this worktree. No DB operation occurred.

## Corrected live-evidence boundary

The earlier assertion that this real-port proof needed a second DEV organization was false. The auditor-owned proof now discovers only one existing active staff membership, keeps that verified staff principal and its own organization context, force-rolls back the same-organization save, and calls the public port with a random different `organizationId`. It creates no fixture, organization, or persistent binding.

The opt-in proof was run through the host test lock with the canonical DEV env and the candidate declaration's generated, in-memory port capability manifest:

```text
/home/dev/brain/host-orch/run-tests.sh 'set -a; source /home/dev/dev-projects/BersonCareBot/apps/webapp/.env.dev; set +a; eval "$(node deploy/postgres/privileges/generate-cli.mjs --env dev --db bcb_webapp_dev --port-context-env webapp)"; USE_REAL_DATABASE=1 RUN_CUSTOM_DOMAIN_BINDING_DB=1 pnpm --dir apps/webapp exec vitest run src/infra/repos/pgCustomDomainBinding.devDbProof.test.ts'
```

Both cases reached the real port-context path, but stopped at SQLSTATE `42883`: `app.save_custom_domain_binding_intent(text,uuid,text,text)` is absent from named DEV. This is the candidate's pending forward migration, not a same-/cross-organization data precondition and not a product finding. The required owner-aware rollback-only check proves the exact candidate DDL/function body compiles under its declared owner and leaves DEV unchanged:

```text
bash deploy/host/migrate-dev.sh --preflight --runtime-env-root /home/dev/dev-projects/BersonCareBot
```

Result: `migrate-dev preflight: PASS` with `pending=2 total=151` and explicit `ROLLBACK`. The brief forbids executing the migration, so the successful own-save and `42501` spoof observations cannot be honestly claimed and this audit is not PASS FOR LAND.

Supporting checks passed:

```text
pnpm run check:db-privileges-generated
node scripts/check-migration-privileges.mjs
pnpm --dir apps/webapp typecheck
pnpm --dir apps/webapp exec eslint src/infra/repos/pgCustomDomainBinding.devDbProof.test.ts
git diff --check
```

The old duplicate-host proof still needs two existing organizations, but it is not this intent-door oracle. TEST/PROD, DNS, TLS, nginx, `:5200`, and all persistent DEV state were untouched.
