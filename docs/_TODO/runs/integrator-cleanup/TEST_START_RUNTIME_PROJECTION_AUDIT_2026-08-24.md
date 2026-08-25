# TEST start runtime projection — independent audit (2026-08-24)

Candidate: `b25d18428` over `c4cb3967f` (`feat/doctor-ui-rebuild`). Acceptance-test commit: `137f9a2a3`.

## Pre-test classification and blind kill-set

This list was recorded before existing tests were read.

| # | Method | Blind fault class |
|---|---|---|
| K1 | test | The reviewed safe projection is rejected by the public runtime port and startup returns 500 again. |
| K2 | test + look | A restricted source, secret, or unknown key reaches SQL. |
| K3 | rollback-only DEV + look | The DB reads or creates a physical `public_sms_fallback_enabled` row instead of deriving from `sms_fallback_enabled`. |
| K4 | rollback-only DEV | Global admin source wins over the global doctor source. |
| K5 | rollback-only DEV | A missing source throws or enables the capability instead of returning `false`. |
| K6 | rollback-only DEV | A malformed source throws, falls through to admin, or enables the capability instead of returning `false`. |
| K7 | test + rollback-only DEV | An existing public runtime key changes resolver or result. |
| K8 | rollback-only DEV + look | The named pre-session gate, SECURITY DEFINER owner, EXECUTE wall, or declared relation surface is lost. |
| K9 | look | The candidate changes domains, address routing, Therapysto cutover, routes, or UI. |

## Result

**PASS.** No reachable violation of the authority or repository rules was found. TEST and PROD were not deployed or mutated; every DEV fixture and candidate function replacement used below ended in `ROLLBACK`.

| Scope item | Status | Evidence |
|---|---|---|
| 1. Safe projection admitted; restricted/secret/unknown rejected | PASS | The added unit scenario returns the reviewed projection through `app.read_public_runtime_setting(text,text)`. `sms_fallback_enabled`, `smsc_api_key`, and an unknown key return `null` before either SQL adapter is called. Fault injection disabling `safeProjection` mapping made the projection assertion fail with received `null`. |
| 2. One physical source | PASS | The rollback-only DEV probe returned `physical_projection_rows=0`. Candidate SQL reads only global `sms_fallback_enabled` rows and returns the requested key `public_sms_fallback_enabled`; it does not insert/update a projection row. |
| 3. Precedence and fail-closed parsing | PASS | The exact candidate function under a real named context returned `doctor_precedence=true` for doctor=true/admin=false, `malformed_doctor=false` for malformed doctor/admin=true, and `missing_source=false`. |
| 4. Existing public keys unchanged | PASS | The same transaction returned `existing_public_key=auth_email_enabled:true`; the ordinary public auth-surface unit scenario also remained green. The candidate's non-projection SELECT is byte-for-byte the previous body except removal of `public_sms_fallback_enabled` from the physical-row allowlist. |
| 5. Context, owner, relation access, and migration rights | PASS | A call without context failed with `accepted port context required`; owner-aware migration preflight passed. Live catalog row was `app_seam_settings_runtime_owner|t|s|r|t|f|t|t|t|t`: SECURITY DEFINER, stable/restricted, EXECUTE for `app_pre_session`, not PUBLIC, and SELECT on exactly `key/scope/organization_id/value_json`. Declaration/census tests passed. Migration-order and privilege gates passed, including the privilege-gate self-test. |
| 6. No routing/domain/Therapysto/UI scope | PASS | `git diff --name-status c4cb3967f b25d18428` contains only the runtime repository and the new forward migration. No route, proxy, domain, address, cutover, or UI file changed. |

## Migration and rights analysis

Migration `20260824T150500_derive_public_sms_fallback_at_read.sql` replaces one existing function, `app.read_public_runtime_setting(text,text)`. It creates, alters, or drops no relation, role, policy, or grant.

- Statement owner and function owner: `app_seam_settings_runtime_owner`.
- Runtime caller: `app_pre_session` through the existing named capability `config.runtime.public.read`.
- Function properties: `SECURITY DEFINER`, `STABLE`, `PARALLEL RESTRICTED`, fixed search path.
- Body relation access: SELECT only on `public.system_settings(key, scope, organization_id, value_json)`; this is the existing declaration/census surface and the live owner has all four column privileges.
- New required rights: none. The signature, owner seam, caller and relation/columns are unchanged.
- The migration contains no `GRANT`, `REVOKE`, role DDL, policy DDL, or RLS flags. `node scripts/check-migration-privileges.mjs` reported `OK (77 migration files)` and its self-test caught all seven red fixtures.

## Fault injection

Temporary production mutation: changed the registry projection comparison from `candidate.safeProjection === key` to an impossible audit-only name. The command

```bash
pnpm --dir apps/webapp exec vitest --run --project unit src/infra/repos/pgAppRuntimeSettings.unit.test.ts
```

went red at the new projection assertion (`public_sms_fallback_enabled` received `null`). The temporary production change was reverted before all final checks. Uncaught test-class faults: 0.

## Validation

- `pnpm --dir apps/webapp exec vitest --run --project unit src/infra/repos/pgAppRuntimeSettings.unit.test.ts` — one file, six tests PASS on the restored candidate.
- `bash deploy/host/migrate-dev.sh --preflight --runtime-env-root /home/dev/dev-projects/BersonCareBot` — PASS; exact named `bcb_webapp_dev`, owner-aware, `pending=1`, transaction rolled back.
- One stdin-fed transaction on `bcb_webapp_dev` installed the exact candidate function, exercised K3–K8 through the generated named capability, returned the values recorded above, and executed `ROLLBACK`.
- A separate no-context candidate call exited with status 3 and the expected accepted-context denial; its transaction rolled back on connection close.
- `node --test deploy/postgres/privileges/migration-order.test.mjs` — 24/24 PASS.
- `node scripts/check-migration-privileges.mjs` and `node scripts/check-migration-privileges.mjs --self-test` — PASS.
- `node --test deploy/postgres/privileges/relation-access.test.mjs deploy/postgres/privileges/function-census.test.mjs` — 56/56 PASS.
- Full CI and deploy were intentionally not run. One initially malformed file-filter command accidentally began broad Vitest collection; its isolated process group was terminated, and none of that incomplete output is used as evidence.

