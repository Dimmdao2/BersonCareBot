# Video guest tenant gate — lead fix evidence

Date: 2026-09-08
Audit: `0a0d51b57` (`MUST FIX`)

## Result

The shared `app.resolve_organization_mechanic_access(uuid,text)` remains an attested root for
`app_staff`, `app_patient`, `app_tenant_service`, and `app_integrator_tenant_service`. The guest
organization principal now enters through the exact
`app.resolve_current_organization_mechanic_access(text)` wrapper. That wrapper obtains the
organization only from accepted context and delegates to the shared resolver; it contains no tariff
calculation or direct relation access.

Generated DEV and TEST artifacts classify the wrapper as `exact` and the shared resolver as
`attested`. No webapp `tenant_service` relation capability was added.

## Migration rights analysis

Migration `20260908T135314_video_guest_reads_organization_access.sql` creates two functions and no
table, column, index, policy, trigger, or role:

1. `app.read_organization_doctor_workspace_composition()` is owned by
   `app_seam_settings_runtime_owner`, executes only for `app_tenant_service`, and reads only
   `key`, `scope`, `organization_id`, and `value_json` from `public.system_settings`. Its key and
   scope are fixed in the body; organization comes from `app.current_org_id()`.
2. `app.resolve_current_organization_mechanic_access(text)` is owned by
   `app_seam_org_commerce_owner`, executes only for `app_tenant_service`, and delegates to
   `app.resolve_organization_mechanic_access(uuid,text)`. It has an empty direct relation surface;
   the existing resolver remains the sole tariff evaluator.

Both function statements run under their declared seam owner and request only temporary schema
`app` create plus `plpgsql` usage from the owner-aware migration runner. The migration contains no
`GRANT`, `REVOKE`, role, or policy DDL. Function EXECUTE, owner, helper/delegation reachability, and
the settings columns are declaration-owned and are reconciled by the generated artifacts.

## Validation

- Webapp typecheck, focused ESLint, and the existing four-file/19-test route/repository suite: PASS.
- Privilege declaration strict TypeScript, generated artifacts `--check`, port-context `--check`,
  access census, and migration privilege checker: PASS.
- Owner-aware named DEV preflight from the exact candidate checkout: PASS; both functions were
  created under their declared owners and the transaction was rolled back (`pending=1`,
  `unapplied=0`).
- Generated DEV guard rows show the wrapper as exact for the guest organization capability and the
  shared resolver as attested for all four established runtime roles.

Verdict: the audit finding is fixed and the candidate is ready for landing and integration-runtime
verification.
