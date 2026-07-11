# DORMANT deploy to TEST — runbook (owner-executed)

**Status: READY.** `feat`=`saas`=`bdff8dfca`, full `pnpm run ci` green, all SaaS isolation is DORMANT.

## What this is (and is NOT)
This deploys the **dormant** multi-tenant isolation foundation to **test** and validates it does
**nothing** to runtime behavior. It is **safe, reversible, and does not touch prod**.

- **Does:** run the full migration chain (patient-wall RLS policies, C1 NOT NULL, org-aware settings)
  on a fresh prod-shaped test DB; optionally create the dormant `app_staff`/`app_patient` roles + grants.
- **Does NOT (this is the flip, a LATER step):** switch the app to connect as the new roles; enable
  `FORCE` RLS; change any behavior. The app still connects as the current owner role → RLS stays
  dormant/permissive → single-clinic behaves exactly as today.

**Why safe:** RLS policies are GUC/role-gated permissive + `app.org` unset ⇒ permit (dormant). The new
roles are created with no login credential and nothing connects as them. Test DB is restored from a prod
dump, so the whole thing is re-runnable / throwaway.

## Preconditions
- Fresh prod dump exists (hourly): `bcb-prod:/opt/backups/postgres/hourly/unified_bcb_webapp_prod_*.dump`
  (verified present, ~hourly). Use the newest.
- Test host access (151.x). *(Note: I have SSH to prod `bcb-prod`, not confirmed to the test host — you run the test-side steps.)*

## Steps
1. **Refresh test DB from a fresh prod dump.** Your existing flow:
   `sudo -u postgres bash /tmp/bcb-test-setup/restore-test-db.sh` (recreates `bersoncarebot_test` from
   the prod hourly dump — pull the newest dump first).
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
+ re-add 2 patient columns), **B7** shadow-run, **B8** flip plan. I'll hand a separate flip runbook then.
