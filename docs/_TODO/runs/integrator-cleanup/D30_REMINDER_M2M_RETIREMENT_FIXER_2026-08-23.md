# D30 — closing pass on reminder-rule M2M retirement (2026-08-23, fixer 2)

## Starting point

`d2cce69b3` (producer/consumer removal) + `2a5b45e3d` (health/admin/archive dependencies, declaration.ts
cleanup, dependency-safe migration draft) were already on the branch, plus a merge (`c208deffc`) and three
docs-only commits. **No further code work had happened since `2a5b45e3d`** — the docs commits only copied
the brief text into `docs/_TODO/runs/briefs/`. This pass is the first real re-verification of that handoff
against a full test run, and found the handoff was not safe to land: two accidentally-dropped imports in
`writePort.ts` broke every direct-public write at runtime, one test file imported a deleted module, and the
generated privilege artifacts were stale.

## What was actually broken (found by running the suite, not by reading code)

1. **`apps/integrator/src/infra/db/writePort.ts` — two missing imports, real runtime break.** The 122-line
   removal of the `reminders.rule.upsert` case in `d2cce69b3` also deleted three import lines that other,
   unrelated cases in the same `switch` still use:
   - `getCurrentDbPrincipalOrganizationId` (from `@bersoncare/db-principal`) — used at the top of every
     `writeDb` call (line ~199) and by `reminders.occurrence.markSent` (line ~312).
   - `enqueueDirectPublicWriteRetry` (from `./repos/directPublicWriteRetry.js`) — used by
     `reminders.occurrence.markSent`, `markFailed`, `expireOrphanedPending` fallback paths.
   - `recordOperatorFailureIncident` — used by the reminder-delivery-log fallback path.
   - `projectionIdempotencyKey`, `hashPayload` (from `./repos/projectionKeys.js`) — used by three other
     direct-public-write fallback paths.
   These would be `ReferenceError`s at call time in production the moment a direct-public write failed and
   fell back to the retry queue — every one of `markSent`/`markFailed`/`expireOrphanedPending`/delivery-log
   fallback paths. Caught by running `apps/integrator`'s vitest suite, which failed with exactly these
   `ReferenceError`s once the workspace packages were installed/built (the repo had no `node_modules` at all
   in this worktree before this pass — see "Commands run" below — so the very first test run failed on an
   unrelated `Cannot find package '@bersoncare/db-principal'` error that masked this one; typecheck was not
   run until after these imports were already restored, so it cannot confirm whether `tsc --noEmit` alone
   would have caught this on the pre-fix tree). Fixed: restored all five imports.
2. **`apps/integrator/src/infra/db/directPublic/canonWritersUseNamedRoots.behaviour.test.ts`** imported
   `upsertReminderRuleDirect` from `./writeReminderRulesDirect.js`, a file `d2cce69b3` deleted. Removed the
   reminder-rule `describe` block and its `reminderRuleInput` helper (the brief names this file explicitly:
   "только reminder-rule cases из ... named-root writer tests"); kept the delivery-event/support/notification
   blocks untouched. The last `describe('D17 — выбор возможности под корень')` block also used the retired
   root as its only worked example — replaced with the still-live
   `app.integrator_append_reminder_delivery_event` root, using its real declared capability
   (`targetRole: app_operational_delivery_worker`, `contextClass: service`, signature verified against
   `deploy/postgres/privileges/declaration.ts:2710`) rather than inventing new data.
3. **`apps/integrator/src/integrations/bersoncare/deliveryIdempotency.route.test.ts`** imported
   `registerBersoncareReminderRulesRoute` from the deleted `./reminderRulesRoute.js`. Removed the one
   reminder-rule idempotency test case; kept the SMS-route idempotency case (unrelated to this seam).
4. **Migration file syntax gap** (`migrate-local-parse.test.mjs`): the `read_curated_system_health_pre_0196`
   `CREATE OR REPLACE FUNCTION` statement had `LANGUAGE sql STABLE SECURITY DEFINER` on one line, which the
   repo's per-statement language-metadata parser requires split (`LANGUAGE sql` alone, then
   `STABLE SECURITY DEFINER PARALLEL UNSAFE`) with a `-- BCB-MIGRATION-LANGUAGE-USAGE: sql` marker, matching
   every other `sql`-language statement in the repo's recent migrations. Fixed the statement shape; no logic
   change.
5. **`deploy/postgres/privileges/function-census.ts`** still declared `public.integrator_push_outbox` as a
   `relationSurfaces` entry of `app.read_curated_system_health_pre_0196()` — stale because the migration's
   `CREATE OR REPLACE` body no longer touches that table (item 3 of the brief: rewrite the two health-root
   bodies before dropping the table). Removed the stale entry; `public.outgoing_delivery_queue` was already
   declared for this function and needed no change.
6. **Generated privilege artifacts were never regenerated** after `declaration.ts` was cleaned in `2a5b45e3d`:
   `deploy/postgres/generated/privileges.bcb_webapp_dev.sql` and `.bersoncarebot_test.sql` still carried the
   full GRANT/REVOKE block for `public.integrator_push_outbox` (23 lines each) and the two retired functions.
   Regenerated with `node deploy/postgres/privileges/generate-cli.mjs --all`; `--check` now passes
   byte-identical.
7. **`deploy/postgres/generated/port-context-capabilities.{bcb_webapp_dev,bersoncarebot_test}.sql`** — the
   `integrator.reminder-rule.upsert` capability seed row (pointing at the now-dropped
   `app.integrator_upsert_reminder_rule(...)`) was still present. Regenerated with
   `node deploy/postgres/privileges/generate-cli.mjs --all --port-context-only` (1 line removed per file).
8. **Frontend `syncWarning` plumbing (the "human gap" the brief names explicitly)** — `service.ts` had
   already stopped returning `syncWarning`, but five callers still read/forwarded/displayed it:
   `app/api/patient/reminders/[id]/route.ts`, `app/api/patient/reminders/create/route.ts`,
   `app/app/patient/reminders/actions.ts` (server actions + `ToggleResult`/`UpdateScheduleResult` types),
   `app/app/patient/reminders/{LegacyReminderScheduleDialog,ReminderRulesClient}.tsx`, and
   `modules/reminders/components/{ReminderCreateDialog,ReminderScheduleForm}.tsx`. This was a real
   `tsc --noEmit` failure (`Property 'syncWarning' does not exist`), not a style choice — left in place it
   would either break the build or (if the property were kept on the type) silently never populate, so the
   warning UI would just always be empty, which is different from "removed the false warning" the brief
   asks for. Removed the field from both result types and every consumer/display path end-to-end.
9. **Dead code left by the original removal**: `asNullableIntegerMinute` and `asFiniteNumber` in
   `writePort.ts` were only used by the deleted `reminders.rule.upsert` case. `pnpm exec eslint` on the
   touched files caught both as unused; removed.
10. **Two runbook/doc paragraphs** (`deploy/HOST_DEPLOY_README.md`, `apps/webapp/src/app/api/api.md`)
    described the system-health-guard tick as "classifying `integrator_push_outbox`" and named the old
    function `runIntegratorPushOutboxHealthGuardTick`, and one paragraph documented the retired
    `pnpm run integrator-push-outbox-tick` script and the retired `integrator_push_outbox` value of the
    `health-failure-archive/clear` `probe` enum (the live route's `z.enum` only accepts
    `outgoing_delivery`/`outgoing_reminder_dispatch` — confirmed by reading
    `app/api/admin/health-failure-archive/clear/route.ts`). Updated both to the current shape and added a
    dated note recording the retirement, per brief item 7 ("Обнови active deploy checks/runbooks").

## What was already correct and left untouched

- `declaration.ts`: fully clean of `integrator_push_outbox`/`enqueue_current_reminder_rule_push`/
  `integrator_upsert_reminder_rule`/`reminder_rule_upsert` — `2a5b45e3d`'s 68-line removal was complete.
- The forward migration's two-phase shape (rewrite live function bodies via `CREATE OR REPLACE` first, then
  `DROP FUNCTION`/`DROP TABLE`, then narrow the CHECK) was already correct in `2a5b45e3d` — only the one
  statement-language formatting bug needed fixing (item 4 above). Verified the narrowed CHECK
  (`support_delivery_attempt_append`, `reminder_occurrence_sent_record/failed_record/expired_record`,
  `reminder_delivery_log_append`, `content_access_grant_upsert`) matches exactly the prior CHECK
  (`20260820T122628_direct_public_write_retry_org_invariant.sql`) minus `reminder_rule_upsert`.
  `content_access_grant_upsert` has no TS-side enqueue call in `directPublicWriteRetry.ts`'s operation union
  by design — it's written by a DB-side named root
  (`20260822T110200_the_content_access_grant_gets_a_named_root.sql`), unrelated to this seam; left as is.
- `apps/webapp/scripts/integrator-schema-cleanup/01_audit.ts` still names `integrator_push_outbox` in its
  table list, but the file's own header says `HISTORICAL ONE-SHOT TOOL ... not a live runtime workflow`; not
  wired into any package script. Left as historical evidence per brief guidance (classify, don't touch
  history).
- `deploy/postgres/generated/prod-to-target/{schema-pre,schema-post}.sql` still show
  `integrator_push_outbox`/`reminder_rule_upsert` — these are literal `pg_dump` snapshots of the current
  live `bcb_webapp_dev` database (refreshed only by `pnpm run refresh:prod-to-target-cutover`, which requires
  DB access). Per the brief: "Generated schema-B snapshot не refresh-ить до применения forward migration на
  named DEV: он остаётся pre-forward input, новый forward удаляет объект." Correctly left untouched — this
  is an explicit hard-boundary item for the next gate, not a gap in this pass.
- `deploy/postgres/privileges/name-census.json` key `b0ForwardArtifactRoots` still lists
  `app.enqueue_current_reminder_rule_push`. Checked: this key is not read by `assertNameCensus(...)` anywhere
  in the current `.mjs`/`.test.mjs` files (`grep -rln "b0ForwardArtifactRoots"` only matches the JSON file
  itself) — it is orphaned evidence data, not an active gate. Left untouched rather than hand-editing a
  generated/evidence file outside its actual regeneration mechanism (`BCB_UPDATE_NAME_CENSUS=1`), since
  nothing currently depends on it and touching it would be scope creep with zero functional effect.
- All other `integrator_push_outbox`/`reminder_rule_upsert`/`integrator-push-outbox` matches are historical
  plan/evidence/report docs under `docs/_TODO/`, `docs/archive/`, `docs/ARCHITECTURE/DB_DUMPS/`,
  `docs/INTEGRATOR_DRIZZLE_MIGRATION/` — none are active runtime, deploy, or check surfaces.

## Migration rights analysis (AGENTS.md §1)

File: `apps/webapp/db/drizzle-migrations/20260823T160000_retire_reminder_rule_m2m.sql` (forward-only, no
`CASCADE`, no `GRANT`/`REVOKE`/`POLICY`).

| # | statement | object | owner marker | why this owner |
|---|---|---|---|---|
| 1 | `CREATE OR REPLACE FUNCTION app.archive_operator_health_failures(text,integer,uuid)` | function | `app_seam_telemetry_operator_owner` | matches the function's already-declared owner in `declaration.ts:6899` (`rev10Function` block) — rewriting the body does not change who owns the object |
| 2 | `CREATE OR REPLACE FUNCTION app.read_curated_system_health_pre_0196()` | function | `saas_system_health_owner` | matches declared owner (`function-census.ts` entry, `"owner": "saas_system_health_owner"`) |
| 3 | `DROP FUNCTION IF EXISTS app.enqueue_current_reminder_rule_push(text)` | function | `app_seam_reminder_patient_owner` | this was the function's owner before retirement (declaration.ts no longer declares it, but DROP must run as the role that currently owns the live object, which the SQL comment's owner marker records for audit) |
| 4 | `DROP FUNCTION IF EXISTS app.integrator_upsert_reminder_rule(...)` | function | `app_seam_reminder_patient_owner` | same reasoning as #3 — this was the M2M write root's owner |
| 5 | `DROP TABLE IF EXISTS public.integrator_push_outbox` | table | `app_object_owner` | table owner per the retired GRANT block that was in `privileges.*.sql` (`ALTER TABLE ... OWNER TO "app_object_owner"`, now removed by regeneration) |
| 6 | `ALTER TABLE integrator.direct_public_write_retries DROP/ADD CONSTRAINT ...check` | table (CHECK only) | `app_object_owner` | CHECK constraints are owned by the table owner; no data, no privilege change — narrows the allowed `operation` enum by one value |

No statement grants, revokes, or touches roles/policies. Runtime relations affected: `public.reminder_rules`
(unchanged, still webapp-owned canonical storage), `public.outgoing_delivery_queue` (unchanged, still the
sole delivery queue), `public.integrator_push_outbox` (dropped), `integrator.direct_public_write_retries`
(CHECK narrowed only). `declaration.ts` was already updated (in `2a5b45e3d`) to match this end state before
this migration was finished, so no further declaration change was needed in this pass — only the
regeneration of the two artifacts that declaration change should have produced (items 6–7 above).

## Commands run and results (this pass)

```
pnpm install --frozen-lockfile                                          # workspace deps were not installed
pnpm --dir packages/{operator-db-schema,db-principal,platform-merge,error-tracking} run build
node --test deploy/postgres/privileges/*.test.mjs                       # 162 passed / 0 failed / 120 skipped
node deploy/postgres/privileges/generate-cli.mjs --all                  # regenerated privileges + org-allowlist
node deploy/postgres/privileges/generate-cli.mjs --check                # byte-identical, 4/4 ok
node deploy/postgres/privileges/generate-cli.mjs --gaps                 # gaps=0, unresolved=0 (both DBs)
node deploy/postgres/privileges/generate-cli.mjs --census               # 216 ACTIVE relations across 3239 files, both DBs ok
node deploy/postgres/privileges/generate-cli.mjs --all --port-context-only  # regenerated capability seeds
pnpm --dir apps/integrator run typecheck                                # clean
pnpm --dir apps/integrator exec vitest run --no-coverage                # 569 passed / 2 expected-fail / 1 skipped (113 files)
pnpm --dir apps/webapp run typecheck                                    # clean
pnpm --dir apps/webapp exec vitest run --project=unit --project=route --project=ui
                                                                         # 1403 passed / 326 files
node scripts/check-c4-migration-owned-function-bodies.mjs               # OK
node scripts/check-db-chokepoint.mjs                                    # OK
node scripts/check-no-new-raw-sql.mjs                                   # OK (no new debt)
node scripts/check-queue-port-boundary.mjs                              # OK
pnpm exec eslint <touched integrator files>                             # 0 problems after removing dead code
pnpm --dir apps/webapp exec eslint <touched webapp files>                # 0 problems
git diff --check                                                        # clean (no whitespace errors)
```

`test:db-privileges` is exactly `node --test deploy/postgres/privileges/*.test.mjs` per `package.json`; ran
it directly to see individual failures rather than the aggregate script.

## Not checked (deferred to the named gates the brief calls out)

- **Named DEV/TEST preflight** — this migration has never been applied to any live database. No DB
  connection was available or attempted in this pass.
- **Full `pnpm run ci`** — explicitly out of scope for this pass per the brief; the integration leader runs
  it at the multi-app boundary.
- **Live delivery proof** — no live provider send, no live scheduler tick observed. The behavioral claim
  "canonical `reminder_rules` write path and `outgoing_delivery_queue` delivery path are unaffected" rests on
  the unit/route test suites above and on the call-graph read in the "already correct" section, not on a
  live run.
- **Independent adversarial audit** — not performed by this worker; the brief reserves this for a separate
  gate before landing.

## Commit

Staged only the 18 files listed in the diff below (integrator writePort + two test files, webapp reminder
routes/actions/dialogs/form, two docs, migration file, function-census.ts, four generated privilege
artifacts). Nothing else in the tree was touched; no `git add -A`.
