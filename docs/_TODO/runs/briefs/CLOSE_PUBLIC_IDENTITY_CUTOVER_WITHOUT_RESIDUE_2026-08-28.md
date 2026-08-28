# Worker brief — close public identity cutover without active residue

## Authority

Owner, 2026-08-28: after the cutover, clean every active file so no old public integrator-ID residue remains.
The distinct internal technical integrator request/process principal stays, but it must never identify a public
person, own a reminder/support/content row, create an account, or resolve a messenger login.

Work in the existing clean candidate clone and branch:

- clone: `/home/dev/dev-projects/bcb-wt-retire-public-integrator-id-runtime-20260828`
- branch: `wt/retire-public-integrator-id-runtime-20260828`
- accepted starting commit: `ab890e1b3`

Read `AGENTS.md` heading map before every action and the applicable migration/privilege, DB, test and orchestration
sections. This is one coherent correction pass after two independent FAIL audits. Do not invent a second identity
path or return the retired path under another name.

## Required result

Close every finding below in one package.

1. `deploy/postgres/port-context/contract.sql` must not validate the internal technical principal through
   `public.platform_users.integrator_user_id`. Keep the internal principal only as a request/process context.
   Prefer deleting now-dead messenger-human principal wiring over creating a replacement public lookup. Preserve
   tenant/organization isolation and do not broaden staff/doctor table access.
2. Bring `declaration.ts`, `relation-access.ts`, `function-census.ts`, name census and generated privilege SQL to
   the post-cutover function/column set. Reconcile after the migration must succeed; it may not ALTER/GRANT old
   overloads or dropped columns/functions.
3. Fix the wrong dropped overload: the live retired mute function uses `timestamptz`; remove that actual overload.
   Ensure the new mute function has exactly the relation access its body needs, including the ID predicate, without
   giving a runtime role broad table access.
4. Remove the public person copy from both remaining active tables:
   `content_access_grants_webapp.integrator_user_id` (including index/schema/grants) and
   `notification_delivery_attempts.integrator_user_id` (schema, types, both writers, named-root signature/body,
   declaration and grants). Existing delivery-attempt facts remain; only the retired person copy disappears.
   DEV measurement before this pass: content grants 0 rows; delivery attempts 18,700 rows, 11,296 old-ID values.
5. Remove or rewrite all active operational scripts/modules that query or update retired public columns, including
   the named findings:
   `apps/webapp/src/infra/ops/webappIntegratorUserProjectionRealignment.ts`,
   `apps/webapp/src/infra/reconcilePersonDomain.ts`,
   `apps/webapp/scripts/backfill-reminders-domain.mjs`,
   `apps/webapp/scripts/realign-webapp-integrator-user-projection.ts`,
   `apps/webapp/scripts/reconcile-person-domain.mjs`, and the retired branch in
   `apps/webapp/scripts/user-phone-admin.ts`. Remove their package commands, imports and privilege codePaths when
   no valid canonical work remains. Do not keep dead wrappers merely for compatibility.
6. `contracts/webapp-entry-token.json` must describe the actual canonical UUID/channel-binding token and must not
   permit the retired numeric field. Replace the field-specific legacy rejection in auth with the existing strict
   canonical contract/unknown-key rejection so old signed shapes remain rejected without keeping the retired public
   field in active code.
7. Remove active stale merge/reminder/Web Push/API documentation and comments that claim the old ID/path still
   exists. Historical migrations, `docs/archive/**`, completed audit/evidence records remain immutable history.
   Active architecture/API/contracts must describe only UUID, phone/contact and channel-binding ownership.
8. Exhaustively classify the final exact and semantic census across source, schema, scripts, contracts, active docs,
   privilege sources and generated privilege artifacts. Allowed survivors are only:
   - immutable historical migrations/archive/evidence; and
   - the internal technical principal in `packages/db-principal/**`, port-context attestation storage and
     `app.current_integrator_user_id()` plumbing, provided none of it resolves a public human.
   Everything else is removed or renamed to its actual canonical meaning.

`deploy/postgres/generated/prod-to-target/schema-pre.sql` and `schema-post.sql` are refreshed only from the named
DEV database by `scripts/refresh-prod-to-target-cutover.mjs` after the migration is executed. Do not hand-edit them
and do not execute the migration in this worker. Make source/migration changes so the orchestrator can land,
execute on named DEV, refresh those artifacts, and prove the final zero-residue state afterward.

## Migration/rights discipline

- Extend the existing `20260828T170000_retire_public_integrator_identity.sql`; do not create a competing cutover.
- Migration changes schema/functions/data only, never GRANT/REVOKE.
- Perform and record the mandatory privilege analysis from AGENTS.md §1 for every changed/created function/table.
- Use the existing declaration/generator/reconcile system; do not hand-patch generated privilege SQL.
- No disposable DB, no TEST/PROD, no deploy, no push, no full CI.
- Named DEV may be used only read-only or rollback-only via canonical scripts.

## Validation and completion

Run the cheapest complete target set once after the coherent edit, not after each line:

- existing public identity acceptance tests and affected reminder/auth/merge/delivery tests;
- webapp/integrator/platform-merge typecheck and targeted lint;
- privilege relation/function census tests and generator byte check;
- migration order/privilege gates;
- `bash deploy/host/migrate-dev.sh --preflight` (rollback-only);
- a dry/check of post-migration reconcile if an existing supported rollback-only route exists; do not invent a new
  framework.

Write one report at `docs/_TODO/runs/PUBLIC_IDENTITY_NO_RESIDUE_FIX_2026-08-28.md` with findings closed, exact
census commands/counts, mandatory privilege analysis, validation output and the explicit post-land DEV refresh
step. Stage only explicit task paths, commit everything before ending, leave a clean tree, and report the SHA.
Do not stop waiting for a background process; long commands stay foreground or use the repository's detached-host
mechanism with a separate short verification run.
