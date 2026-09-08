# Audit: video guest tenant gate correction

Date: 2026-09-08  
Candidate: `552c7863f`  
Base: `7b41c42c1`  
Verdict: **MUST FIX**

## Gate result

| Requirement | Result | Evidence |
| --- | --- | --- |
| GATE-01: tariff access stays behind `requireEntitlementForRead/Mutation` | **FAIL** | The guest route still calls `requireEntitlementForRead`, but the generated privilege reconcile changes the shared mechanic resolver's guard from the four existing runtime roles to one exact `app_tenant_service` capability. Existing staff/patient/integrator calls retain their old non-named invocation and will be denied after reconcile. |
| GATE-02: named capability is exact-org and not relation-wide | **PASS for the guest path; blocked overall by GATE-01 regression** | The organization principal supplies the exact `organizationId` and mechanic transcript to the existing `resolveMechanicAccess` chokepoint. No relation-wide tenant capability was added. The underlying resolver retains its current-org equality wall. |
| Workspace composition boundary | **PASS** | The new root has no caller-controlled key or organization argument. It reads only `doctor_workspace_composition` / `doctor`, for `app.current_org_id()` or the global row, preferring the organization row. |
| Guest disclosure boundary | **PASS by inspection** | The route resolves the invite organization, installs that organization principal, performs entitlement and workspace checks, and only then mints a session. All refusal paths return the same `meeting_unavailable` 404; no patient/doctor record is returned. |
| VM-04 external runtime requests | **PASS for candidate delta** | The candidate changes only database ports, one migration, and generated privilege artifacts. It does not change Jitsi/JVB/client network configuration or add a third-party runtime request. Live network acceptance remains the orchestrator's post-landing oracle. |

## MUST FIX 1 — the named capability strands existing non-organization callers

Reachable sequence:

1. `deploy/postgres/privileges/declaration.ts` still declares EXECUTE on `app.resolve_organization_mechanic_access(uuid,text)` for `app_patient`, `app_staff`, `app_tenant_service`, and `app_integrator_tenant_service`.
2. The candidate adds one named capability for that same function identity, targeting only `app_tenant_service` with purpose `entitlement.organization-mechanic-access.read`.
3. The generated reconcile changes the function's runtime guard row from `attested` with all four roles to `exact` with only `app_tenant_service`. Its reconcile loop replaces an existing `require_attested_context_for_roles` statement with that exact gate by `overlay(...)` and recreates the function body.
4. `pgOrgEntitlements.resolveMechanicAccess` uses `runWebappNamedRoot` only when the in-process principal kind is `organization`; every patient/staff/integrator invocation continues through `runWebappSql`.
5. After privilege reconcile, an ordinary staff or patient entitlement check reaches the shared function under its existing role and is rejected by `require_accepted_context` before tariff resolution. The reachable user impact is failed protected doctor/patient surfaces (typically an API/RSC 500) even when the organization's entitlement is valid. Integrator tenant-service consumers are rejected for the same reason.

This violates the owner requirement that tariff access continue through the one existing entitlement chokepoint and violates §5's single-pass rule by making that shared pass unusable for its established principals. The correction must give the organization guest path a named admission boundary without replacing the shared resolver's valid guard for other declared callers. A narrow organization-only wrapper which delegates to the existing resolver is one possible shape; a second tariff evaluator or a broad relation capability is not.

Primary evidence:

- `apps/webapp/src/infra/repos/pgOrgEntitlements.ts:318-329`: named invocation is conditional on `principal.kind === 'organization'`; the other branch is plain `runWebappSql`.
- `deploy/postgres/privileges/declaration.ts:10049-10063,26977-26984`: base EXECUTE roles include patient/staff and are extended with tenant/integrator roles.
- `deploy/postgres/privileges/declaration.ts:25847-25850`: the new named descriptor targets only `app_tenant_service`.
- `deploy/postgres/generated/privileges.bcb_webapp_dev.sql:2468`: generated exact guard requires only `app_tenant_service` and the named transcript.
- `deploy/postgres/generated/privileges.bcb_webapp_dev.sql:7591`: EXECUTE remains granted to all four roles, so declaration shape and body admission disagree.
- Candidate diff command below shows the decisive change from `require_attested_context_for_roles(... four roles ...)` to the one-role exact gate.

## Named-root and §5 decisions

`resolveMechanicAccess` is the correct consolidation point: the candidate did not implement a second tariff evaluator, and it passes the exact organization and mechanic into the existing resolver. The selected database function identity is nevertheless not a valid one-role named root because it is already the shared tariff chokepoint for four runtime roles. This is the finding above.

`getByKey` is the correct consolidation point for workspace composition. The added branch is reachable only for an organization principal, the fixed key `doctor_workspace_composition`, scope `doctor`, and an explicitly requested organization equal to the accepted principal organization. The SQL root accepts no key/org arguments, obtains the organization from accepted context, and only permits the existing global fallback. It cannot select another setting or organization. Falling through on an organization mismatch does not create a bypass because `app_tenant_service` has no relation-wide `system_settings` capability.

The payment-specific settings root remains a separate boundary and must not be broadened to carry workspace composition.

## Migration rights analysis

Changed/created objects:

- One new function only: `app.read_organization_doctor_workspace_composition()`. No table, column, index, trigger, policy, or RLS change is introduced.
- The migration is timestamp-forward and marks `app_seam_settings_runtime_owner` as owner, plus the required temporary `CREATE` on schema `app` and `USAGE` on `plpgsql` for the migration runner.
- The function is `SECURITY DEFINER`, `STABLE`, `PARALLEL RESTRICTED`, with `search_path=pg_catalog`.

Runtime and rights:

- Runtime target/EXECUTE role: only `app_tenant_service`; PUBLIC and every other runtime/login role are revoked by the generated privilege artifact.
- Physical webapp staff login receives only the declared named context for purpose `workspace.organization-composition.read` and the zero-argument function identity.
- Function body dependencies are `app.current_org_id()`, `app.require_accepted_context`, `app.hash_port_typed_args`, and SELECT of `public.system_settings(key, scope, organization_id, value_json)`.
- The declaration contains the exact four-column SELECT relation surface and the generated artifact grants the owner the corresponding function-body rights. No caller receives relation-wide SELECT.
- The migration itself contains no `GRANT` or `REVOKE`; privileges remain declaration-owned.
- No new hot column or relation exists, so §1's same-change index requirement is not applicable.

Declaration completeness for the new workspace root is **PASS**. Declaration correctness for the modified existing mechanic root is **FAIL** for the role-admission mismatch described in MUST FIX 1.

Owner-aware rollback preflight against named DEV (`bcb_webapp_dev`) created the one pending function inside a transaction and rolled it back: `pending=1`, `total=149`, `unapplied=0`, final result `migrate-dev preflight: PASS`. No migration was executed persistently.

## Test-or-look decision

No acceptance test was added. Named-capability shape, generated guard ownership, and migration rights are one-time declaration state and are proven more directly by inspection, generated output, census, and rollback preflight. A test that reads TypeScript or SQL text would violate §10a. The repeatable route denial contract is already covered by the existing route test; the confirmed TEST 500 and the orchestrator's post-fix live retry are the cheaper oracle for the database/runtime admission path.

Blind kill-set fixed before reading tests: accepted guest org must traverse the existing entitlement guard; org substitution and relation-wide access must fail; workspace lookup must be fixed-key/current-org with global fallback; no second tariff evaluator/private data path may appear; declaration access must remain named-function-only.

## Commands and results

- `git diff --check 7b41c42c1..552c7863f` — PASS.
- `rg -n -i '^\s*(GRANT|REVOKE)\b' apps/webapp/db/drizzle-migrations/20260908T135314_video_guest_reads_organization_access.sql` — no matches; PASS.
- `node deploy/postgres/privileges/generate-cli.mjs --check` and `node deploy/postgres/privileges/generate-cli.mjs --all --check --port-context-only` — DEV/TEST privilege and capability artifacts match the declaration byte-for-byte; PASS.
- `node deploy/postgres/privileges/generate-cli.mjs --census` — exit 0; each DEV/TEST census checked `213 ACTIVE relations` across `3395 source files`; the patient-only module census reached `117 relations` from `400 modules` through the patient door.
- `pnpm --dir /home/dev/dev-projects/BersonCareBot exec tsc --noEmit --strict -p /home/dev/dev-projects/bcb-wt-video-guest-tenant-gate-20260908/deploy/postgres/privileges` — PASS.
- `bash deploy/host/migrate-dev.sh --preflight --runtime-env-root /home/dev/dev-projects/BersonCareBot` — rollback-only PASS; `pending=1 total=149 unapplied=0`.
- `pnpm --dir packages/operator-db-schema run build && pnpm --dir packages/db-principal run build && pnpm --dir packages/shared-contracts run build && pnpm --dir packages/platform-merge run build && pnpm --dir packages/error-tracking run build` — PASS.
- `pnpm --dir apps/webapp typecheck` — PASS after the required workspace packages were built. The first environment-only attempt before building those package artifacts failed on unresolved `@bersoncare/*` modules and is not candidate evidence.
- `pnpm --dir apps/webapp exec eslint src/infra/repos/pgOrgEntitlements.ts src/infra/repos/pgSystemSettings.ts src/app/api/video-meetings/guest/exchange/route.ts` — PASS.
- `pnpm --dir apps/webapp exec vitest run src/app/api/video-meetings/guest/exchange/route.route.test.ts src/infra/repos/pgOrgEntitlements.test.ts src/infra/repos/pgSystemSettings.preauth.unit.test.ts src/infra/db/runWebappSql.unit.test.ts` — PASS: `4` files, `19` tests.
- `git diff --unified=2 7b41c42c1..552c7863f -- deploy/postgres/generated/privileges.bcb_webapp_dev.sql | rg -n -C 2 "resolve_organization_mechanic_access|read_organization_doctor_workspace_composition"` — shows the existing mechanic guard changing from the four-role attested gate to the one-role exact gate; MUST FIX evidence.

No fault injection was left in the tree. No deployment, persistent migration, PROD access, secret inspection, or disposable database was performed.
