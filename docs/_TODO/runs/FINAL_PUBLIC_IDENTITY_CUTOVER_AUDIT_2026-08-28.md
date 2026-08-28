# Final independent audit — public identity cutover (#987)

## Verdict

**FAIL, NOT FOR LAND**

Audited implementation `212c7d6e83473799b23c9e6bdd25bfd9cf945113`, integration anchor `c297911a67e26cc8b8e7ad42e0baa8cce1ef6289`, checkout `ac1e2a0615ac5f3ad2e1f0d44ce3121902990504`.

Exact identity command:

```bash
git rev-parse HEAD c297911a6
git show --format=fuller --no-patch 212c7d6e83473799b23c9e6bdd25bfd9cf945113
```

The candidate mechanically migrates and its targeted tests are mostly green, but the final product claim is false: canonical reminder ownership remains nullable; installed callback roots cannot act as the canonical person; live support/account paths still treat the retired id as identity; and a signed numeric retired-id token is accepted.

## Blocking findings

### F1 — Telegram/MAX reminder callbacks do not have one reachable canonical authorization root

Reachable consequence: an existing canonical user can press done/skip/snooze/mute/topic-disable/settings in Telegram or MAX and receive `forbidden`, `not_found`, or a privilege failure even when the exact channel binding is correct; the same path still falls back to the retired id for several mutations.

Evidence:

- `getReminderOccurrenceOwnerPlatformUserId` directly selects `reminder_occurrence_history.platform_user_id` (`apps/integrator/src/infra/db/repos/reminders.ts:366`), while callbacks execute under `app_integrator_request`.
- Installed DEV policy `rev10_direct_business_164` returns `false` for that role. Column privilege is true, table privilege is false, so FORCE RLS makes the direct precheck see no row.
- Installed `patient_done_reminder_occurrence` reads `current_integrator_user_id`; skip/snooze do the same when passed NULL. The TypeScript adapter passes `NULL::uuid` at `apps/integrator/src/infra/adapters/remindersWritesPort.ts:25` and `:41`.
- Installed mute/topic/settings roots read the retired principal and are not executable by `app_integrator_request`.

Exact DEV command:

```bash
sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -v ON_ERROR_STOP=1 -P pager=off -F $'\t' -A <<'SQL'
BEGIN READ ONLY;
SELECT p.proname, pg_get_function_identity_arguments(p.oid),
       has_function_privilege('app_integrator_request', p.oid, 'EXECUTE'),
       pg_get_functiondef(p.oid) LIKE '%current_integrator_user_id%',
       pg_get_functiondef(p.oid) LIKE '%integrator_user_id%'
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='app' AND p.proname IN
('patient_done_reminder_occurrence','patient_skip_reminder_occurrence',
 'patient_snooze_reminder_occurrence','patient_set_reminder_mute',
 'patient_disable_reminder_messenger_topic','patient_reminder_notification_settings')
ORDER BY p.proname, pg_get_function_identity_arguments(p.oid);
SELECT polname, polroles::regrole[]::text, pg_get_expr(polqual, polrelid)
FROM pg_policy WHERE polrelid='public.reminder_occurrence_history'::regclass ORDER BY polname;
SELECT has_column_privilege('app_integrator_request','public.reminder_occurrence_history','platform_user_id','SELECT'),
       has_table_privilege('app_integrator_request','public.reminder_occurrence_history','SELECT');
ROLLBACK;
SQL
```

This violates the owner decisions that callback ownership is the canonical UUID and that a canonical user without a retired id must work.

Minimal §5-compliant correction: parameterize the existing `app.patient_*reminder*` roots with the canonical UUID already resolved from the exact channel binding; pass that UUID instead of NULL; enforce UUID + organization + occurrence atomically inside each root; declare `app_integrator_request` execution and exact relation surfaces in the existing privilege declaration; regenerate and reconcile. No migration-local `GRANT` or `REVOKE` is needed. The direct relation precheck is not a second useful root and should not be the authorization boundary.

### F2 — canonical reminder ownership is still nullable and the generated capability surface still owns the retired column

Reachable consequence: the two orphan rules have no canonical owner and can never satisfy a canonical account/reminder contract. Future deletion can create more ownerless rows because the FK remains `ON DELETE SET NULL`. The generated privilege layer still permits active reminder writers to insert/update `integrator_user_id`, so the retired column remains an authoritative writable surface.

Exact DEV measurement:

```bash
sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -v ON_ERROR_STOP=1 -P pager=off -F $'\t' -A <<'SQL'
BEGIN READ ONLY;
SELECT count(*) FROM public.reminder_rules;
SELECT count(*) FROM public.reminder_rules WHERE platform_user_id IS NULL;
SELECT count(*) FROM public.reminder_rules rr
WHERE rr.platform_user_id IS NULL AND rr.integrator_user_id IS NOT NULL
AND NOT EXISTS (SELECT 1 FROM public.platform_users pu WHERE pu.integrator_user_id=rr.integrator_user_id);
SELECT count(*) FROM public.reminder_rules rr
WHERE rr.platform_user_id IS NULL AND rr.integrator_user_id IS NOT NULL
AND 1=(SELECT count(*) FROM public.platform_users pu WHERE pu.integrator_user_id=rr.integrator_user_id);
SELECT count(DISTINCT integrator_user_id) FROM public.reminder_rules WHERE platform_user_id IS NULL;
SELECT is_nullable FROM information_schema.columns
WHERE table_schema='public' AND table_name='reminder_rules' AND column_name='platform_user_id';
SELECT rc.delete_rule FROM information_schema.referential_constraints rc
JOIN information_schema.key_column_usage kcu USING (constraint_catalog,constraint_schema,constraint_name)
WHERE kcu.table_schema='public' AND kcu.table_name='reminder_rules' AND kcu.column_name='platform_user_id';
ROLLBACK;
SQL
```

Result: total `46`; NULL canonical owner `2`; retired-only orphan `2`; uniquely backfillable `0`; distinct retired ids among NULL owners `1`; nullable `YES`; delete action `SET NULL`.

Generated-right evidence:

```bash
rg -n "reminder_rules.*integrator_user_id|integrator_user_id.*reminder_rules" \
  deploy/postgres/privileges/declaration.ts \
  deploy/postgres/generated/privileges.bcb_webapp_dev.sql
```

The output includes active SELECT/INSERT/UPDATE surfaces for `app_seam_patient_self_actions_owner`, `app_staff`, `app_tenant_service`, materialization and patient reminder owners. Byte parity is green, but the declaration is semantically stale relative to the replacement function.

Safe deterministic consequence: do not delete or guess the rows. Keep them untouched, obtain the owner's disposition (archive/delete/explicit canonical assignment), then use a forward migration that closes NULL ownership and chooses a non-null-compatible delete action. Until then the cutover is not final.

### F3 — support conversations still resolve, write, expose and merge by the retired id

Reachable consequence: projection upsert resolves `platform_users.id` by `platform_users.integrator_user_id` before channel binding, writes the retired id into `support_conversations`, exposes it in messaging ports/admin rows, and `mergeLegacySupportConversations` can absorb a conversation through the retired equality. A stale or disagreeing projection can therefore associate/merge support history with the wrong canonical account.

Code evidence: `apps/webapp/src/infra/repos/pgSupportCommunication.ts:189-210,232-255`, `apps/webapp/src/infra/repos/mergeLegacySupportConversations.ts:88-107`, and `apps/webapp/src/modules/messaging/ports.ts:60-66,122-147`.

Exact DEV measurement:

```bash
sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -v ON_ERROR_STOP=1 -P pager=off -F $'\t' -A <<'SQL'
BEGIN READ ONLY;
SELECT count(*) FROM public.support_conversations;
SELECT count(*) FROM public.support_conversations WHERE integrator_user_id IS NOT NULL;
SELECT count(*) FROM public.support_conversations WHERE integrator_user_id IS NOT NULL AND platform_user_id IS NULL;
SELECT count(*) FROM public.support_conversations sc
JOIN public.platform_users pu ON pu.id=sc.platform_user_id
WHERE sc.integrator_user_id IS NOT NULL AND pu.integrator_user_id IS DISTINCT FROM sc.integrator_user_id;
ROLLBACK;
SQL
```

Result: total `261`; retired id present `26`; retired-only `11`; disagreement with the canonical projection `4`.

This violates the explicit owner decision that no live support-conversation lookup/projection uses the retired public id.

### F4 — live account/merge paths still treat retired identity as account identity

Reachable consequence: the doctor merge UI/search can find, rank, block or route an account merge by `integrator_user_id`; the merge engine carries the retired id into the surviving account and treats two values as a conflict; messenger phone bind can write/realign it. These are current API/UI/runtime callers, not archived migration evidence.

Exact evidence command:

```bash
rg -n "integrator_user_id|integratorUserId" \
  apps/webapp/src/infra/platformUserMergePreview.ts \
  apps/webapp/src/infra/platformUserNameMatchHints.ts \
  apps/webapp/src/infra/manualMergeIntegratorGate.ts \
  apps/webapp/src/infra/repos/pgUserByPhone.ts \
  packages/platform-merge/src/messengerPhonePublicBind.ts \
  packages/platform-merge/src/pgPlatformUserMerge.ts
```

Examples include merge-preview search/equality and hard blockers, `pgPlatformUserMerge` conflict/carry writes, and `messengerPhonePublicBind` lookup/realignment writes. This violates the owner decision to remove the retired public id completely from live account paths. It is not the acceptable internal process/request principal.

### F5 — numeric retired-id tokens are accepted, and missing exact bindings can be created from a token hint

Reachable consequence 1: a correctly signed token containing `integratorUserId: 987654` and a Telegram binding is classified as a valid Telegram token instead of rejected. `parseIntegratorToken` casts arbitrary JSON to the TypeScript type and never rejects the retired field (`apps/webapp/src/modules/auth/service.ts:261-288`). The added acceptance gate is red with received value `telegram`.

Exact command:

```bash
pnpm --dir apps/webapp exec vitest --run \
  src/infra/repos/pgIdentityResolution.resolveOnly.acceptance.test.ts \
  src/modules/auth/service.publicIdentityCutover.acceptance.test.ts
```

Result: `1` pass, `1` fail; failure is `expected 'telegram' to be null`.

Reachable consequence 2: when an exact binding is missing, `pgIdentityResolution` accepts a canonical UUID/phone hint, inserts a new channel binding, and authenticates it (`apps/webapp/src/infra/repos/pgIdentityResolution.ts:103-167`). Thus the signed-entry path is not “exact existing channel binding only”; a stale or mismatched token can attach the external channel to the hinted account.

Generic bot account creation itself is removed and the new resolve-only acceptance passes; restoring the account INSERT makes it red. Phone proof/login-code seams were not removed. The defect is rejection/binding authority, not account creation in the current baseline.

## Exhaustive retired-id census

Whole audited-checkout occurrence count (stable against this report being added):

```bash
git grep -n -E 'integrator_user_id|integratorUserId' \
  ac1e2a0615ac5f3ad2e1f0d44ce3121902990504 -- . | wc -l
```

Result: `1940` tracked occurrences (includes history, docs, tests, migrations and generated SQL).

Production-runtime census:

```bash
runtime_files=$(rg -l 'integrator_user_id|integratorUserId' apps/integrator/src apps/webapp/src packages \
  --glob '!**/*.test.ts' --glob '!**/*.test.tsx' --glob '!**/*.spec.ts' \
  --glob '!**/test/**' --glob '!**/dist/**' | sort)
printf '%s\n' "$runtime_files" | sed '/^$/d' | wc -l
rg -n 'integrator_user_id|integratorUserId' apps/integrator/src apps/webapp/src packages \
  --glob '!**/*.test.ts' --glob '!**/*.test.tsx' --glob '!**/*.spec.ts' \
  --glob '!**/test/**' --glob '!**/dist/**' | wc -l
```

Result: `59` files, `262` occurrences. Every runtime occurrence falls into these classes:

| Classification | Files / families | Decision |
| --- | --- | --- |
| Internal process/request principal | both `portContextRuntime.ts`; `organizationPrincipal.ts`; Telegram/MAX/VK webhook principal setup; `packages/db-principal/src/{index,portContext}.ts`; context plumbing in `app-layer/db/drizzle.ts` | Allowed only as the integrator process/request identity; traced values install `app_integrator_request` context and are not returned as a patient UUID. |
| Delivery-attempt diagnostic | `notificationDeliveryAttempts.ts`, `pgNotificationDeliveryAttempts.ts`, notification-delivery types, the matching schema/write-port fields | Write-only diagnostic in inspected callers; no patient authorization/read lookup found. DEV has a legacy population but the column lacks an explicit DB comment. It is not used as authority, so not a blocker by itself. |
| Reminder patient identity | integrator reminder repo/schema/handler/delivery-phone; webapp reminder stats/in-memory/projection/topic/web-push files; reminder schema/ports/docs | Blocker where live roots/writers/read surfaces still use the retired id; covered by F1/F2. |
| Support patient identity | `pgSupportCommunication.ts`, `mergeLegacySupportConversations.ts`, support ports and in-memory support | Blocker; covered by F3. |
| Account identity / merge / purge / realignment | merge-preview/name-hints/routes/UI, manual merge gate/resolution, user projection/by-phone/canonical lookup/channel claim, full purge/reconcile/realignment, platform-merge package, identity ports and incident dedup | Blocker for active lookup/projection/write/conflict behavior; covered by F4. Pure telemetry labels/comments do not cure the active callers. |
| Retired contract comments/types | auth service/identity port comments, API/module markdown, compatibility row shapes | A comment is non-authoritative, but the numeric-token behavior behind the auth comment is a blocker (F5). |
| Historical/one-time/generated outside runtime census | timestamp migrations, audit/backfill/recovery scripts, old bootstrap/cutover SQL, tests/docs | Historical references may remain. Current generated privileges are live and therefore classified separately under F2; migration SQL under the migration section below. |

No unclassified runtime file remains after the `59`-file command above. The internal principal is never accepted as a patient UUID in the inspected callers. Diagnostic delivery attempts remain non-authoritative; all patient/account/reminder/support authority uses are blockers, not waved through as compatibility.

## Migration and privilege preflight

Host identity command:

```bash
hostname
hostname -I
```

Result: DEV host address includes `151.241.228.122`; PROD `135.106.162.170` was not touched.

Rollback-only named DEV preflight:

```bash
bash deploy/host/migrate-dev.sh --preflight --runtime-env-root /home/dev/dev-projects/BersonCareBot
```

Result: exit `0`; validated and rolled back `pending=9 total=102`. The target migration's backfill produced `UPDATE 0`; no migration was applied.

Migration inspection:

- Backfill and assertion are marked `BCB-MIGRATION-BACKFILL`; the runner executes these under reset role/session authorization, so FORCE RLS does not hide rows.
- The function statement names `BCB-MIGRATION-OWNER: app_seam_patient_self_actions_owner`, schema `app`, language `plpgsql`, and verifies that the installed body contains no retired-id reference.
- Timestamp/order/statement-breakpoints and `CREATE OR REPLACE` signature are valid.
- No privilege mutation exists. Exact command `rg -n '\b(GRANT|REVOKE)\b' apps/webapp/db/drizzle-migrations/20260828T160000_reminder_rules_belong_to_the_canonical_person.sql | wc -l` → `0`.
- Generated artifact parity is byte-green: `node deploy/postgres/privileges/generate-cli.mjs --check` → all managed DEV/TEST privilege and allowlist artifacts match.
- Product completeness still fails: the assertion deliberately excludes ownerless orphans; the column/FK remain nullable; and the declaration/generated rights still include the retired reminder column. Mechanical preflight PASS cannot promote the product verdict.

## Blind kill-set and missed classes

The blind list was written to `/home/dev/brain/runs/agent-port/final-public-identity-cutover-audit-20260828.md` before candidate tests were opened. Candidate-suite misses are classes `1, 2, 6, 7, 12, 13, 14`. Exact blind-list count command after the report was written:

```bash
rg -c '^([0-9]+)\.' /home/dev/brain/runs/agent-port/final-public-identity-cutover-audit-20260828.md
# 15
```

Classes 10/11 are inspection classes by construction, not test misses. No blind class was omitted from the audit.

Deleted `channelUsers.namedRoot.unit.test.ts` covered the intentionally removed retired resolver; tracing found no remaining caller of that deleted module. The active behavior it used to protect is replaced by the canonical reader tests. No deleted test hid a still-required retired behavior. However, the candidate added SQL-string assertions in `pgReminderProjection.pg.test.ts`; those catch one mutation but violate AGENTS §10a and do not exercise DB/RLS behavior.

## Fault injection

| Required mutation | Gate result |
| --- | --- |
| Restore bot-side `INSERT INTO platform_users` on missing binding | New resolve-only acceptance red: `1/1` failed (`called 2 times`, expected 1). |
| Accept numeric retired-id token | Already present in candidate baseline; new acceptance red: `1/1` failed, received `telegram`. |
| Authorize callback through retired owner query | Existing skip/settings handlers red: `6/6` failed on unexpected `reminders.occurrence.ownerUserId`. |
| Replace one canonical reminder read with retired column | Candidate reminder projection file red: `1/5` failed. This gate is mechanical SQL-text inspection, not DB proof. |
| Widen clinic-required broadcast to platform sender | Dispatch gate red: `2/17` failed; clinic credential disappeared and missing clinic credential no longer failed closed. |
| Remove canonical function relation right from declaration | `relation-access`/`function-census` alone stayed green (`59/59`), but `node deploy/postgres/privileges/generate-cli.mjs --check` went red for `2` generated privilege artifacts. |

Exact fault-injection commands (each run while only its named temporary mutation was present):

```bash
pnpm --dir apps/webapp exec vitest --run src/infra/repos/pgIdentityResolution.resolveOnly.acceptance.test.ts
pnpm --dir apps/webapp exec vitest --run src/modules/auth/service.publicIdentityCutover.acceptance.test.ts
pnpm --dir apps/integrator exec vitest --run src/kernel/domain/executor/handlers/reminders.skip.d21a.test.ts src/kernel/domain/executor/handlers/reminders.notifSettings.d22.test.ts
pnpm --dir apps/webapp exec vitest --run src/infra/repos/pgReminderProjection.pg.test.ts
pnpm --dir apps/integrator exec vitest --run src/infra/adapters/dispatchPort.test.ts
node --test deploy/postgres/privileges/relation-access.test.mjs deploy/postgres/privileges/function-census.test.mjs
node deploy/postgres/privileges/generate-cli.mjs --check
```

Every temporary production/declaration mutation was reverted. `git diff` over the four injected product files plus the privilege declaration was empty before report authoring.

## Baseline validation

The fresh clone initially had no built workspace-package `dist`. Exact failing command:

```bash
pnpm --dir apps/integrator exec vitest --run \
  src/infra/db/repos/platformUserReaders.namedRoot.unit.test.ts \
  src/infra/db/repos/recipientResolution.test.ts \
  src/infra/runtime/worker/doctorBroadcastIntentMenu.test.ts \
  src/integrations/webappEntryToken.test.ts \
  src/kernel/domain/executor/handlers/reminders.notifSettings.d22.test.ts \
  src/kernel/domain/executor/handlers/reminders.skip.d21a.test.ts
```

It failed before tests on unresolved `@bersoncare/db-principal`; this is the clean-clone fixture, not a candidate behavior failure. Exact fixture commands:

```bash
pnpm install --frozen-lockfile
pnpm --dir packages/db-principal run build
pnpm --dir packages/platform-merge run build
pnpm --dir packages/operator-db-schema run build
```

After that, the exact candidate commands were:

```bash
flock /tmp/bcb-agent-tests.lock pnpm --dir apps/integrator exec vitest --run \
  src/infra/db/repos/platformUserReaders.namedRoot.unit.test.ts \
  src/infra/db/repos/recipientResolution.test.ts \
  src/infra/runtime/worker/doctorBroadcastIntentMenu.test.ts \
  src/integrations/webappEntryToken.test.ts \
  src/kernel/domain/executor/handlers/reminders.notifSettings.d22.test.ts \
  src/kernel/domain/executor/handlers/reminders.skip.d21a.test.ts
# 51 passed in 6 files

flock /tmp/bcb-agent-tests.lock pnpm --dir apps/webapp exec vitest --run \
  src/infra/repos/pgReminderProjection.pg.test.ts \
  src/modules/integrator/deliveryTargetsApi.d21.test.ts \
  src/modules/reminders/service.idempotency.test.ts \
  src/modules/reminders/service.mechanicWriteClearance.test.ts
# 18 passed in 4 files

flock /tmp/bcb-agent-tests.lock node --test \
  deploy/postgres/privileges/relation-access.test.mjs \
  deploy/postgres/privileges/function-census.test.mjs
# 59 passed

flock /tmp/bcb-agent-tests.lock pnpm --dir apps/integrator exec vitest --run \
  src/integrations/bersoncare/sendOtpRoute.route.test.ts \
  src/kernel/domain/executor/phoneMessengerBindCodeDelivery.audit.test.ts \
  src/infra/adapters/dispatchPort.test.ts
# 26 passed in 3 files: Telegram/MAX login-code delivery, platform/clinic ordinary routing,
# clinic-required broadcast routing and platform-broadcast fail-closed behavior

node deploy/postgres/privileges/generate-cli.mjs --check
# all four managed privilege/allowlist artifacts match byte-for-byte

pnpm --dir apps/webapp exec eslint \
  src/infra/repos/pgIdentityResolution.resolveOnly.acceptance.test.ts \
  src/modules/auth/service.publicIdentityCutover.acceptance.test.ts
# exit 0

flock /tmp/bcb-agent-tests.lock pnpm --dir apps/webapp run typecheck
# first run stopped before source checking on missing clean-clone @bersoncare/error-tracking dist
pnpm --dir packages/error-tracking run build
flock /tmp/bcb-agent-tests.lock pnpm --dir apps/webapp run typecheck
# exit 0 after the existing workspace package was built
```

The resolve-only acceptance is green. The exact two-file acceptance command under F5 remains intentionally red with `1` pass and `1` fail because it proves the current numeric-token defect.

Full CI was not run: the brief forbids it and no uncovered integration risk would make it authoritative over the live blockers above. TEST/PROD, taskdb, UI, env and deployments were not touched.

## Genuine owner decision remaining

The owner must choose the disposition of the two ownerless reminder-rule rows: archive/delete them or explicitly assign a known canonical person. There is no deterministic account to infer on DEV, so the audit did not mutate them. This question does not soften the verdict: until the rows are resolved and canonical ownership is made non-null, the public identity cutover is not final.

**FAIL, NOT FOR LAND**
