# DORMANT deploy to TEST — historical runbook (superseded)

> **SUPERSEDED 2026-08-15.** Do not execute the commands below. The only supported fresh TEST restore is the
> owner-gated `deploy/host/deploy-test-full-reset.sh`; its internal repo-tracked restore primitive is
> `deploy/host/restore-test-db-from-dump.sh`. This file remains only as history of the dormant rollout.

**Status: READY.** `feat`=`saas`=`bdff8dfca`, full `pnpm run ci` green, all SaaS isolation is DORMANT.

## What this is (and is NOT)

This deploys the **dormant** multi-tenant isolation foundation to **test** and validates it does
**nothing** to runtime behavior. It is **safe, reversible, and does not touch prod**.

- **Does:** run the full migration chain (patient-wall RLS policies, C1 NOT NULL, org-aware settings)
  on a fresh prod-shaped test DB; optionally create the dormant `app_staff`/`app_patient` roles + grants.
- **Does NOT (this is the flip, a LATER step):** switch the app to connect as the new roles; enable
  `FORCE` RLS; change any behavior. The app still connects as the current owner role → RLS stays
  dormant/permissive → single-clinic behaves exactly as today.

**Safety note (2026-07-12 Phase 0 audit):** the old shorthand "GUC/role-gated permissive + `app.org`
unset ⇒ permit" is only true for the org wall. It is not true for the current patient wall: 0169-0175
are fail-closed on unset patient context, and `FORCE ROW LEVEL SECURITY` is already present in the
dormant migration chain. The run remains behavior-safe only while the live runtime still connects through
the current owner/BYPASSRLS path and does not use the dormant `app_staff`/`app_patient` credentials. Before
any real role switch, the flip plan must move/neutralize FORCE, add dormant symmetry or an equivalent
compatibility mode, and prove locked patient/integrator identity labels.

## Preconditions

- Fresh prod dump exists (hourly): `bcb-prod:/opt/backups/postgres/hourly/unified_bcb_webapp_prod_*.dump`
  (verified present, ~hourly). Use the newest.
- Test host access (151.x). _(Note: I have SSH to prod `bcb-prod`, not confirmed to the test host — you run the test-side steps.)_

## Steps

1. **Historical only:** refresh was formerly a separate step. It is now owned by the guarded full-reset wrapper
   named above; do not restore or continue this sequence by hand.
2. **Deploy `feat` (`bdff8dfca`) to test** via your test deploy script (bundles branch → build →
   `pnpm migrate` with test env → restart test units). This applies migrations up to `0175` on the test DB.
3. **(Dormant, optional-but-recommended) create the roles + grants** on the test DB — validates the SQL
   runs clean; nothing uses them yet:
   ```
   psql "<test-db-url>" -v ON_ERROR_STOP=1 -f deploy/postgres/p0-5b-role-split-staff-patient.sql
   psql "<test-db-url>" -v ON_ERROR_STOP=1 -f deploy/postgres/p0-5b-grants.sql
   ```
4. **Verify NO behavior change:** test health checks pass; log in as doctor + patient; open patient
   card, schedule, messages; confirm everything works exactly as today (RLS dormant). No `permission
denied`, no empty lists.

## Rollback

Re-run step 1 (restore test DB from the prod dump). Roles: re-run the role script with `-v p0_5b_down=1`.
Nothing on prod is affected at any point.

## After this passes → the FLIP (separate, still owner-gated, NOT yet ready)

Still needed before the flip can be commanded: **B4-fanout** (app connects patient sessions as
`app_patient`, staff/workers as `app_staff`, sets the GUCs), **#664** (RLS `WITH CHECK` value-enforcement

- re-add 2 patient columns), **B7** shadow-run, **B8** flip plan. I'll hand a separate flip runbook then.
