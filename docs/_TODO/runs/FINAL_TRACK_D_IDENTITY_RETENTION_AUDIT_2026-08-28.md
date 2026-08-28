# Final independent audit — Track D identity + lifecycle/retention (#987)

## Verdict

**FAIL, NOT FOR LAND**

Candidate `abed46559bb9db24d7b5dcfc22d23034f2433178` on `wt/fix-lifecycle-purge-census-20260828`
(contains `feat/doctor-ui-rebuild` `9889cfe27` and the identity/lifecycle/retention packages).

```bash
git rev-parse HEAD                 # abed46559bb9db24d7b5dcfc22d23034f2433178
git status --porcelain             # empty, before and after this audit
```

The identity half of this candidate is genuinely finished: the retired public integrator id is gone
from every live person path, the bot creates nothing, reminder/support/account paths run on the
canonical UUID. The retention half is not: it ships a CI step that is red on this exact SHA, a
maintenance grant that the database can never satisfy, and an account-purge statement that writes a
column this same branch's migration drops.

## Blocking findings

### F1 — `pnpm test:db-privileges` is red on the candidate SHA

Reachable consequence: the CI step `test:db-privileges` (`package.json:30`, part of
`ci:resume:after-typecheck`) exits 1 on a clean checkout of this candidate. Landing it puts a
permanently red gate on `feat/doctor-ui-rebuild`.

Exact command and result on the clean tree:

```bash
flock /tmp/bcb-agent-tests.lock pnpm run test:db-privileges
# tests 315 · pass 173 · fail 1 · skipped 141 · ELIFECYCLE exit code 1
flock /tmp/bcb-agent-tests.lock node --test deploy/postgres/privileges/relation-access.test.mjs
# tests 45 · pass 44 · fail 1
```

The failing assertion is `relation-access.test.mjs:1267`, inside "patient page relations have exact
self/current-clinic access and published content walls":

```
Expected values to be strictly equal:
+ 'direct'          (actual)
- 'named-seams'     (expected)
```

Cause is the candidate's own declaration change: `76a6796e1` turned
`'public.media_playback_client_events'` from `grants: []` into a direct maintenance grant
(`deploy/postgres/privileges/declaration.ts:7775-7784`), which flips that relation's access kind from
`named-seams` to `direct`, and the patient-page wall asserts `named-seams`.

Proof that the candidate causes it (temporary edit, reverted immediately):

```bash
# only the client-events maintenance grant reverted to `grants: []`
flock /tmp/bcb-agent-tests.lock node --test deploy/postgres/privileges/relation-access.test.mjs
# tests 45 · pass 45 · fail 0
```

The commit message for `76a6796e1` names "targeted retention and lifecycle Vitest (11/11); privilege
generator --check" as its evidence. Neither of those runs this gate, so the break was never seen.

### F2 — the maintenance role can never touch `media_playback_resolution_events`, so the whole playback retention tick raises instead of pruning

Reachable consequence: after the candidate's generated privileges are applied, every
`POST /api/internal/media-playback-stats/retention` — including `?dryRun=1` — raises SQLSTATE 42501
inside `db.transaction`, so the transaction rolls back. The 90-day hourly sweep that works today
stops working, the 400-day raw windows are never applied, and the tick records `success: false`
forever. Owner decision 5 (one existing job prunes all three playback stores on those windows) is not
delivered by this candidate; it is regressed.

The chain, all on this SHA:

- the job runs under `app_operational_maintenance`: source
  `api/internal/media-playback-stats/retention:POST` is in `WEBAPP_MAINTENANCE_SOURCES`
  (`declaration.ts:2635`), which is the `runtimeSources` list of `webapp_maintenance_relation`
  (`declaration.ts:3290-3292`, `targetRole: 'app_operational_maintenance'`, `contextClass: 'service'`).
- the generated artifact grants that role `SELECT, DELETE` on the table
  (`deploy/postgres/generated/privileges.bcb_webapp_dev.sql:14397`) but gives it only ONE permissive
  policy, `rev10_saas_org_dormant_p0_8_3` (same file, line 14429), whose predicate is
  `(current_user = 'app_staff' AND (SELECT app.current_org_id()) IS NOT NULL AND …) OR
  (app.current_patient_user_id() IS NOT NULL AND …)`.
- `app.current_org_id()` **raises** `42501 accepted organization context required` for any role
  outside `app_staff, app_clinic_billing, app_patient, app_integrator_request,
  app_integrator_tenant_service, app_tenant_service, app_worker` — `app_operational_maintenance` is
  not in that list, and a service-class context cannot put it there.
- the sibling table `media_playback_stats_hourly` got the correct shape
  (`rev10_direct_business_108`, `USING (current_user = 'app_operational_maintenance'::name)`), and
  `media_playback_client_events` got explicit `rev10_playback_client_event_maintenance_{select,delete}_106`
  policies (`declaration.ts:8511-8527`). `media_playback_resolution_events` got the grant and no
  matching policy.

Live rollback-only proof on named DEV (`bcb_webapp_dev`), one transaction, `ROLLBACK` at the end.
Only the permissive policy is installed, because a RESTRICTIVE policy can only subtract:

```bash
sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -P pager=off -F $'\t' -A <<'SQL'
BEGIN;
INSERT INTO public.media_playback_resolution_events (organization_id, user_id, media_id, delivery, resolved_at)
SELECT (SELECT id FROM public.be_organizations LIMIT 1), (SELECT id FROM public.platform_users LIMIT 1),
       (SELECT id FROM public.media_files LIMIT 1), 'hls', now() - interval '500 days';
DROP POLICY rev10_fail_closed_107 ON public.media_playback_resolution_events;
GRANT SELECT, DELETE ON TABLE public.media_playback_resolution_events TO app_operational_maintenance;
CREATE POLICY "rev10_saas_org_dormant_p0_8_3" ON "public"."media_playback_resolution_events" AS PERMISSIVE FOR ALL TO "app_operational_maintenance" USING (((current_user = 'app_staff'::name AND ((SELECT app.current_org_id()) IS NOT NULL AND "organization_id" = (SELECT app.current_org_id()))) OR (app.current_patient_user_id() IS NOT NULL AND "organization_id" = (SELECT app.current_org_id()) AND "user_id" = app.current_patient_user_id())));
SAVEPOINT a;
SET LOCAL ROLE app_operational_maintenance;
WITH d AS (DELETE FROM public.media_playback_resolution_events WHERE resolved_at < now() - interval '400 days' RETURNING id) SELECT count(*) FROM d;
ROLLBACK TO SAVEPOINT a; RESET ROLE;
DROP POLICY "rev10_saas_org_dormant_p0_8_3" ON public.media_playback_resolution_events;
CREATE POLICY "rev10_like_hourly_direct_business" ON public.media_playback_resolution_events AS PERMISSIVE FOR ALL TO app_operational_maintenance USING ((current_user = 'app_operational_maintenance'::name));
SAVEPOINT b;
SET LOCAL ROLE app_operational_maintenance;
WITH d AS (DELETE FROM public.media_playback_resolution_events WHERE resolved_at < now() - interval '400 days' RETURNING id) SELECT count(*) FROM d;
ROLLBACK TO SAVEPOINT b; RESET ROLE;
ROLLBACK;
SQL
```

Result:

```
A-candidate-policy-deleted      → ERROR:  accepted organization context required
                                  CONTEXT: PL/pgSQL function current_org_id() line 7 at RAISE
B-hourly-style-policy-deleted   → 1
after-rollback-policies         → 3   (DEV unchanged: the original rev10_fail_closed_107 set)
```

RLS really applies to this role and table — neither is exempt:

```bash
sudo -n -u postgres psql … -c "SELECT rolname, rolbypassrls, rolsuper FROM pg_roles WHERE rolname='app_operational_maintenance';"
# app_operational_maintenance  f  f
sudo -n -u postgres psql … -c "SELECT relname, pg_get_userbyid(relowner), relrowsecurity, relforcerowsecurity FROM pg_class … "
# media_playback_resolution_events  app_object_owner  t  t
```

This is the exact class the declaration itself already documents and removed once
(`declaration.ts:7792-7799`, `media_transcode_jobs`: "гранты … были мертвы: единственная разрешающая
политика этой роли на таблице (`rev10_saas_org_dormant_p0_8_4`) собрана из арендаторских веток, обе
зовут `app.current_org_id()`, а та роль воркера не принимает"). The same mistake is reintroduced here.

### F3 — account purge writes a column this branch's own migration drops

Reachable consequence: once `20260828T170000_retire_public_integrator_identity.sql` is applied, every
run of the platform-user purge aborts with `42703` in `clearPlatformUserDeleteBlockers`, before it
deletes anything. The dormant purge machinery this stage exists to make correct and fail-closed is
left broken, and the DEV proof that guards it goes red the moment DEV catches up with HEAD.

- `apps/webapp/src/infra/platformUserFullPurge.ts:149-154` declares
  `{ table: 'notification_delivery_attempts', column: 'user_id', alsoNullColumns: ['integrator_user_id'], scrubJsonColumns: ['metadata'] }`.
- `anonymisePurgedUserReferences` (`same file:246-268`) builds one unconditional
  `UPDATE notification_delivery_attempts SET … integrator_user_id = … WHERE … OR integrator_user_id::text = $1 …`
  for that entry; there is no column-existence guard.
- `apps/webapp/db/drizzle-migrations/20260828T170000_retire_public_integrator_identity.sql:563`
  is `ALTER TABLE public.notification_delivery_attempts DROP COLUMN integrator_user_id;`, and the
  migration's own `BCB-MIGRATION-VERIFY` block (same file:573-577) fails the migration if ANY column
  named `integrator_user_id` still exists in `public`.

Live rollback-only proof on named DEV:

```bash
sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -P pager=off -A \
  -v uid="'00000000-0000-0000-0000-000000000000'" <<'SQL'
BEGIN;
ALTER TABLE public.notification_delivery_attempts DROP COLUMN integrator_user_id;
UPDATE notification_delivery_attempts SET user_id = CASE WHEN user_id::text = :uid THEN NULL ELSE user_id END, integrator_user_id = CASE WHEN integrator_user_id::text = :uid THEN NULL ELSE integrator_user_id END, metadata = replace(metadata::text, :uid, 'purged-user')::jsonb WHERE user_id::text = :uid OR integrator_user_id::text = :uid OR position(:uid in metadata::text) > 0;
ROLLBACK;
SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='notification_delivery_attempts' AND column_name='integrator_user_id';
SQL
```

Result: `ERROR: column "integrator_user_id" does not exist`; after `ROLLBACK`, DEV still has the
column (`1`), i.e. nothing was changed.

Why the existing proof is green anyway: DEV's ledger is behind HEAD, so the column is still there.

```bash
flock /tmp/bcb-agent-tests.lock env RUN_PLATFORM_USER_PURGE_DB=1 pnpm --dir apps/webapp exec vitest --run src/infra/platformUserFullPurge.devDbProof.test.ts
# 1 file passed, 16 passed
bash deploy/host/migrate-dev.sh --preflight --runtime-env-root /home/dev/dev-projects/BersonCareBot
# PASS: validated and rolled back for "bcb_webapp_dev": pending=11 total=104 reapplied=0 … unapplied=0
```

Eleven migrations are pending on DEV; the drop is one of them.

### F4 — two declared retention windows in the registry are false, and the owner's HLS decision is not recorded

Reachable consequence: the lifecycle registry is the census the whole workstream produces. Owner
decision 5 says HLS errors are kept 90 days; the registry says 30. In the same commit an unrelated
store's true window was overwritten with a false one.

- `deploy/postgres/privileges/journal-lifecycle-registry.ts:362-373` —
  `public.media_hls_proxy_error_events`, `days: 30`, while
  `apps/webapp/src/app-layer/media/hlsProxyErrorEvents.ts:10` is
  `MEDIA_HLS_PROXY_ERROR_RETENTION_DAYS_DEFAULT = 90` and the plan records the owner's answer as 90.
- `journal-lifecycle-registry.ts:227-236` — `public.outgoing_delivery_queue` was changed from
  `days: 30` to `days: 90` by `76a6796e1`, while the entry's own `basis` string still reads
  "sent 30d by sent_at, dead 180d by dead_at" and the implementation is
  `OUTGOING_DELIVERY_QUEUE_SENT_RETENTION_DAYS_DEFAULT = 30`
  (`apps/webapp/src/modules/db-retention/journalRetention.ts:13`).

```bash
git show 76a6796e1 -- deploy/postgres/privileges/journal-lifecycle-registry.ts | grep -n 'days:'
# -      days: 30   +      days: 90    (outgoing_delivery_queue)
# -      days: 400  +      days: 90    (media_playback_stats_hourly)
# +      days: 400  ×2                 (both raw playback stores)
```

`docs/_TODO/SYSTEMIC_RESIDUAL_AUDIT_AND_FIX_PLAN_2026-08-27.md` was edited by the same commit to
claim "`media_playback_stats_hourly` и `media_hls_proxy_error_events` хранятся 90 дней". Half of that
claim is not in the registry; the 90 landed on the delivery queue instead.

Nothing catches it: the contract test verifies that a window has a reachable prune root, a registered
job and a staleness signal, but never compares `days` to the module constant that implements it
(`apps/webapp/src/modules/db-retention/journalLifecycleRegistry.contract.test.ts:257-324`).

### F5 — two required fault injections do not colour any gate

Owner decisions 5 and 6 name exactly these behaviours ("the existing job prunes all three stores",
"the dedup ledger is not touched", "per-store counts are not mixed"). Neither is protected.

| Injection (temporary, reverted) | Gate run | Result |
| --- | --- | --- |
| drop the `media_playback_client_events` delete from `purgeStalePlaybackHourlyStats`, keep the declared branch | `vitest --run src/modules/db-retention/ src/app/api/internal/media-playback-stats/` | **GREEN** 4 files / 18 tests |
| add a delete of the lifetime dedup ledger `media_playback_user_video_first_resolve` to the same sweep | same command, plus `node --test deploy/postgres/privileges/relation-access.test.mjs`, `check-db-chokepoint` | **GREEN** on the retention gates |

A store can silently stop being pruned, or the "did this person ever watch it" ledger can start being
deleted, and every retention gate in the repository stays green. This is the same blindness that let
F2 through: no test observes what the job actually removes, per store.

## What is correct in this candidate (checked, not assumed)

**Retired public identity — exhaustive census.** Whole tracked tree
`git grep -n -E 'integrator_user_id|integratorUserId' abed46559 -- . | wc -l` → `1384`.
Production-runtime surface:

```bash
grep -rl -E 'integrator_user_id|integratorUserId' apps/integrator/src apps/webapp/src packages \
  --include='*.ts' --include='*.tsx' --include='*.mjs' --include='*.js' \
  | grep -v -E '\.test\.|\.spec\.|/test/|/dist/' | sort
```

→ `6` files, `43` occurrences, and every one of them is classified:

| File | Class | Verdict |
| --- | --- | --- |
| `packages/db-principal/src/{index,portContext}.ts` | internal request principal: the `app.integrator_user_id` GUC for `app_integrator_request` | allowed — never returned as a person |
| `apps/integrator/src/infra/db/portContextRuntime.ts:270`, `apps/webapp/src/infra/db/portContextRuntime.ts:351` | same principal plumbing | allowed |
| `apps/webapp/src/app-layer/db/drizzle.ts:55-62` | `set_config('app.integrator_user_id', …)` transport whitelist | allowed |
| `apps/webapp/src/infra/platformUserFullPurge.ts:152` | purge target, not a lookup | **F3** |

No live patient lookup, reminder owner/callback, support conversation or account merge reaches the
retired id. Live generated artifacts are clean:
`grep -o "[a-z_]*integrator_user_id[a-z_()]*" deploy/postgres/generated/privileges.bcb_webapp_dev.sql | sort | uniq -c`
→ `16 current_integrator_user_id()` and nothing else. The remaining `128` migration and `140`
generated-SQL occurrences are timestamp migrations and the `prod-to-target` snapshots — history, not
live contract.

**Bot creates zero accounts.** `app.integrator_upsert_channel_identity` installed on DEV ends with
`RETURN;` on a lookup miss and its INSERT branch is gone (read-only `pg_get_functiondef`);
`writePort.ts:140-178` discards the result; `pgIdentityResolution.resolveByChannelBinding` is
resolve-only and returns `null` with a single query. Restoring bot-side creation is caught:
`pgIdentityResolution.resolveOnly.acceptance.test.ts` → `1/1` failed.

**Both bot types keep login and phone proof; broadcasts stay branded-only.**

```bash
flock /tmp/bcb-agent-tests.lock pnpm --dir apps/integrator exec vitest --run \
  src/integrations/bersoncare/sendOtpRoute.route.test.ts \
  src/kernel/domain/executor/phoneMessengerBindCodeDelivery.audit.test.ts \
  src/infra/db/messengerPhonePublicBind0380.unit.test.ts src/integrations/webappEntryToken.test.ts
# 4 files, 26 passed
```

Broadcast widening (`clinic_required` downgraded to `platform_required` without a credential) reds
`dispatchPort.test.ts` → `1` failed / `16` passed.

**Reminder CRUD/list/history/callbacks run on the canonical UUID.** Routes reject a numeric payload
with `400` via `isPlatformUserUuid` and enforce `hasActiveEnrollment`
(`app/api/integrator/reminders/{rules,rules/by-category,history}/route.ts`,
`patient-notifications/web-push/route.ts:89-96`); the rewritten `app.patient_*_reminder_*` roots take
`p_platform_user_id uuid`. Injecting a numeric retired owner into
`resolveCanonicalPlatformUserId` reds `reminders.skip.d21a` + `reminders.notifSettings.d22` →
`4` failed / `2` passed.

**Token shape.** `contracts/webapp-entry-token.json` is `additionalProperties: false` and
`service.ts:288` enforces the key-set subset against `CANONICAL_ENTRY_TOKEN_FIELDS`, so a signed
token carrying `integratorUserId` is refused as a shape.

**Migrations.** Four added on this branch. No privilege statement in any of them
(`grep -cE '^\s*(GRANT|REVOKE|CREATE POLICY|DROP POLICY|ALTER POLICY|CREATE ROLE|ALTER ROLE|DROP ROLE)\b'`
→ `0` in each); owner markers `2/10/1/32`; `BCB-MIGRATION-VERIFY` blocks `2/2/2/1`;
`node scripts/check-migration-privileges.mjs` → `OK (105 migration files)`. Rollback-only preflight
on named DEV passes with `pending=11 total=104 … unapplied=0`.

**Declaration/generated parity.**

```bash
node deploy/postgres/privileges/generate-cli.mjs --all --check                     # byte-identical (4 artifacts)
node deploy/postgres/privileges/generate-cli.mjs --all --port-context-only --check # byte-identical (2 artifacts)
```

Removing the maintenance `SELECT, DELETE` right, or the two maintenance RLS policies, from the
declaration reds it: `--check: расхождений 2` in both cases.

**No privilege widening for people-facing roles.** Machine diff of every `GRANT` line changed between
the merge base and HEAD in `privileges.bcb_webapp_dev.sql`: `6` new-or-widened entries — two are the
re-signed `app.integrator_record_notification_delivery_attempt` / `app.read_integrator_delivery_target_snapshot`
after the bigint parameter was dropped, two are the intentional maintenance grants (F1/F2), two add
columns to the seam owner `app_seam_reminder_patient_owner`. `app_patient` on `platform_users` only
lost `integrator_user_id`; `app_staff`, `app_tenant_service` and clinic roles gained nothing new.

**Single lifecycle/retention roots.** One playback job (`media.playback_stats.retention`, one
scheduler entry, one route), one journal retention tick, one purge core; no parallel cleaner, queue,
scheduler or journal was added. The playback purge is a single `db.transaction`, dry-run only counts,
per-store counts are reported separately as `deletedByStore`, the dedup ledger is not in the sweep,
and the delete filters (`bucket_hour`, `resolved_at`, `created_at`) each have a matching index
(`schema.ts:2090-2245`). The route passes `throwErrors: true` and records `success: false` + `500` on
failure — injecting `ok: true` into its catch reds `retention/route.unit.test.ts` (`1` failed).

**Other gates green on the clean tree:**

```bash
node scripts/check-no-new-raw-sql.mjs                        # OK (production debt: 0)
node scripts/check-c4-migration-owned-function-bodies.mjs    # OK
node scripts/check-db-chokepoint.mjs                         # OK
node scripts/check-queue-port-boundary.mjs                   # OK
node --test deploy/postgres/privileges/{function-census,retired-db-security-oracles,tenant-predicate-invariant,migration-order}.test.mjs   # 53 pass, 0 fail
pnpm --dir apps/webapp exec vitest --run src/modules/db-retention/journalLifecycleRegistry.contract.test.ts \
  src/app/api/internal/media-playback-stats/retention/route.unit.test.ts src/infra/strictPlatformUserPurge.unit.test.ts \
  src/modules/auth/service.publicIdentityCutover.acceptance.test.ts src/infra/repos/pgIdentityResolution.resolveOnly.acceptance.test.ts
# 5 files, 17 passed
pnpm --dir apps/integrator exec vitest --run src/infra/adapters/dispatchPort.test.ts \
  src/infra/runtime/worker/doctorBroadcastIntentMenu.test.ts src/kernel/domain/executor/handlers/reminders.skip.d21a.test.ts \
  src/kernel/domain/executor/handlers/reminders.notifSettings.d22.test.ts src/infra/db/bootstrapChannelIdentityRoot.unit.test.ts
# 5 files, 29 passed
```

The dead `public.user_email_setup_tokens` declaration is gone (only prose and the historical cutover
SQL still name it), and the `auth.channel_link_start` limiter carries the `scopePrune` window
(`authRateLimits.ts:86-95`).

## Blind kill-set and missed classes

The blind list (`K01`–`K33`) was written to
`/home/dev/brain/runs/agent-port/final-track-d-identity-retention-audit-20260828.md` before any
candidate test file was opened.

```bash
grep -c '^K[0-9][0-9] ' /home/dev/brain/runs/agent-port/final-track-d-identity-retention-audit-20260828.md
# 33
```

Classes the candidate's own suite does **not** catch — `4`:

- `K25` wrong retention window (registry number vs module constant) → F4;
- `K30`/`K31` a skipped store and an included dedup ledger → F5 (both injections green);
- `K32` maintenance right present but unusable → F2 (only the declaration/artifact drift is gated,
  never the resulting database behaviour).

Every other blind class is either closed by the candidate with a gate that reds under injection, or
is an inspection class by construction (`K11`–`K15`, `K23`, `K33`). No blind class was dropped.

## Fault injections

| Required injection | Gate | Result |
| --- | --- | --- |
| restore bot-side account creation | `pgIdentityResolution.resolveOnly.acceptance.test.ts` | RED `1/1` |
| numeric retired reminder owner | `reminders.skip.d21a` + `reminders.notifSettings.d22` | RED `4` failed / `2` passed |
| widen broadcasts past branded-only | `dispatchPort.test.ts` | RED `1` failed / `16` passed |
| hide the retention failure (catch → `ok: true`) | `media-playback-stats/retention/route.unit.test.ts` | RED `1` failed / `1` passed |
| skip one raw store | all retention + lifecycle gates | **GREEN — F5** |
| include the dedup ledger in the sweep | all retention + lifecycle gates | **GREEN — F5** |
| remove the maintenance right | `generate-cli.mjs --all --check` | RED, `расхождений 2` |
| remove the maintenance RLS policies | `generate-cli.mjs --all --check` | RED, `расхождений 2` |

Two further temporary edits were used purely as proofs and are described above: reverting only the
client-events grant (proves F1's cause) and dropping `throwErrors: true` from the retention route
(stays green — the route unit test mocks the module, so this variant is a coverage note, not a
separate finding, because the required behaviour itself is gated).

Every injection was reverted by restoring a byte-identical backup and verified with `sha256sum -c`;
after each one `git status --porcelain` was empty. Final state:

```bash
git status --porcelain   # empty
git diff --stat          # empty
git rev-parse HEAD       # abed46559bb9db24d7b5dcfc22d23034f2433178 (unchanged)
```

## Scope

Named DEV `bcb_webapp_dev` only, every live run inside `BEGIN … ROLLBACK`; no migration applied, no
deploy, TEST and PROD untouched. No disposable database was created. Full CI was not run — the brief
forbids it, and the CI step that matters here (`pnpm test:db-privileges`) was run directly and is
red. No product code, UI, env, taskdb, domain or other branch was modified. No new acceptance test
was added: the classes that need one (F5) are not "assert the text is absent" tests but a DB-behaviour
gate that belongs to the fix, not to the audit.

**FAIL, NOT FOR LAND**
