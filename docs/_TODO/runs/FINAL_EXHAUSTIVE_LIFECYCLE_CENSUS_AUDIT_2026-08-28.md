# Final exhaustive lifecycle census audit — 2026-08-28

## Verdict

**FAIL, NOT FOR LAND**

Candidate: `603f5f7774d47e32dbc99453c0f15beb58111624`.

Oracle: stage 3 of `docs/_TODO/SYSTEMIC_RESIDUAL_AUDIT_AND_FIX_PLAN_2026-08-27.md`, plus F1–F3 and the blind kill-set in `docs/_TODO/runs/FINAL_SYSTEMIC_LIFECYCLE_AUDIT_2026-08-28.md`.

The candidate closes the old arbitrary-name/half-decision structural hole, and the concrete F1/F2 purge code is present. It does not establish the new semantic surface: several of the 164 structured decisions contradict live identifiers/FKs, the delivery owner-question omits two live person-key surfaces, organization purge is false for live rows, and the executable-window gate accepts a nonexistent dotted root.

## Blind kill-set

Written before opening the candidate lifecycle tests; full text is in `/home/dev/brain/runs/agent-port/final-exhaustive-lifecycle-census-audit-20260828.md`.

1. Arbitrary declared name must be red; no suffix/extra-name/second-registry/self-derived candidate set.
2. Missing, duplicate, overlap, bare, missing-user and missing-org decisions must be red.
3. Every decision must match FK, explicit purge and writer/reader facts; parent chains must reach a purged root.
4. F1/F2 entities and both accounting columns must have the promised physical account-purge result.
5. Copied/misleading user and organization identifiers must not escape the census.
6. Every decided window must name a real prune root, scheduler and health signal; unresolved policy stays an owner-question.
7. The existing rollback-only proof must exercise the production purge core on named DEV and restore it.
8. All six required injections must be run and reverted.

## Census completeness

The structural partition itself is complete:

```bash
apps/webapp/node_modules/.bin/tsx -e "import {declaration} from './deploy/postgres/privileges/declaration.ts'; import {JOURNAL_LIFECYCLE_REGISTRY as r,JOURNAL_LIFECYCLE_NON_JOURNAL_DECISIONS as n} from './deploy/postgres/privileges/journal-lifecycle-registry.ts'; const d=new Set(Object.values(declaration.databases).flatMap(db=>Object.keys(db.tables))); const a=r.map(x=>x.table), b=Object.keys(n), c=[...a,...b]; console.log(JSON.stringify({declared:d.size,registry:a.length,structured:b.length,combined:c.length,unique:new Set(c).size,missing:[...d].filter(x=>!c.includes(x)),undeclared:c.filter(x=>!d.has(x)),overlap:a.filter(x=>x in n)}))"
```

Result: `declared=222`, `registry=58`, `structured=164`, `combined=222`, `unique=222`, `missing=[]`, `undeclared=[]`, `overlap=[]`.

Both managed databases have the same live declared relation set. The declared-but-absent set consists of the explicit `absent-retired` relations verified below plus `public.user_email_setup_tokens`, which is declared but absent and incorrectly described as a live one-time-token store.

```bash
apps/webapp/node_modules/.bin/tsx -e "import {JOURNAL_LIFECYCLE_NON_JOURNAL_DECISIONS as d} from './deploy/postgres/privileges/journal-lifecycle-registry.ts'; for(const [t,x] of Object.entries(d)) if(x.userPurge.kind==='absent-retired') console.log(t)" | while IFS= read -r retired_table; do for audit_db in bcb_webapp_dev bersoncarebot_test; do sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d "$audit_db" -At -F '|' -c "SELECT current_database(), '$retired_table', to_regclass('$retired_table') IS NULL;"; done; done
```

Result: 13 table names × 2 managed databases, every result `t`.

## Findings

### F1. Delivery purge owner-question omits live raw person identifiers

`public.notification_delivery_attempts` says the **only** personal datum is `user_id`, and `OQ-DELIVERY-ATTEMPT-USER-PURGE` asks only whether that column is nulled or its row deleted. That statement is false:

- `apps/integrator/src/infra/db/repos/notificationDeliveryAttempts.ts` writes `userId`, `integratorUserId` and `metadata` independently and unchanged;
- `20260820T185707_the_delivery_journal_accepts_a_nonqueue_attempt.sql` copies `payload.intent.meta.userId` into `integrator_user_id` and embeds the complete nonqueue payload under `metadata.payload`;
- the account purge has no `notification_delivery_attempts` step.

Read-only live measurement, columns after the DB name are: auth-key rows / client users, delivery `integrator_user_id` rows / client users, delivery `metadata` rows / client users, delivery `user_id` rows / client users.

```bash
sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -At -F '|' -v ON_ERROR_STOP=1 -c "WITH clients AS (SELECT id FROM public.platform_users WHERE role='client') SELECT current_database(), (SELECT count(*) FROM public.auth_rate_limit_events e WHERE EXISTS (SELECT 1 FROM clients c WHERE e.key LIKE '%'||c.id::text||'%')), (SELECT count(DISTINCT c.id) FROM clients c JOIN public.auth_rate_limit_events e ON e.key LIKE '%'||c.id::text||'%'), (SELECT count(*) FROM public.notification_delivery_attempts a WHERE EXISTS (SELECT 1 FROM clients c WHERE a.integrator_user_id=c.id::text)), (SELECT count(DISTINCT c.id) FROM clients c JOIN public.notification_delivery_attempts a ON a.integrator_user_id=c.id::text), (SELECT count(*) FROM public.notification_delivery_attempts a WHERE EXISTS (SELECT 1 FROM clients c WHERE a.metadata::text LIKE '%'||c.id::text||'%')), (SELECT count(DISTINCT c.id) FROM clients c JOIN public.notification_delivery_attempts a ON a.metadata::text LIKE '%'||c.id::text||'%'), (SELECT count(*) FROM public.notification_delivery_attempts a JOIN clients c ON a.user_id=c.id), (SELECT count(DISTINCT c.id) FROM clients c JOIN public.notification_delivery_attempts a ON a.user_id=c.id);"
```

DEV result: `bcb_webapp_dev|15|11|537|110|1956|41|7044|36`.

The identical read-only command with `-d bersoncarebot_test` returned `bersoncarebot_test|15|11|536|110|3616|44|11222|40`.

Search proving the absent purge path:

```bash
node /home/dev/brain/tools/code-search.mjs "notification delivery attempts account purge user id anonymise delete" --repo bcb -k 12
rg -n "notification_delivery_attempts" apps/webapp/src/infra/platformUserFullPurge.ts apps/webapp/src/infra/strictPlatformUserPurge.ts apps/webapp/src/infra/platformUserFullPurge.devDbProof.test.ts deploy/postgres/privileges/journal-lifecycle-registry.ts
```

Only the registry entry appears in the purge/proof set. Therefore either owner choice currently described still leaves raw account UUIDs in the 180-day journal. This violates the stage-3 requirement that full account purge leave no linked user fact outside an explicitly retained legal fact, and the brief's explicit copied/misleading-identifier census.

### F2. `not-user-scoped` and `via-parent` hide live account identities

#### `auth_rate_limit_events`

The registry declares `not-user-scoped` and says the limiter drops rows outside its window. `isChannelLinkStartRateLimited(userId)` uses the raw platform UUID as the key. The live function deletes expired rows only for the same `(scope,key)` unless a caller supplies `scopePrune`; `auth.channel_link_start` supplies none. After account deletion there is no next call for that key, so it is not bounded by its one-hour window and no purge step removes it. The live measurement in F1 found 15 DEV rows containing 11 client UUIDs, and the same 15/11 on TEST.

```bash
sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -Atc "SELECT pg_get_functiondef('app.auth_rate_limit_check_and_record(text,text,integer,integer,text,integer,integer)'::regprocedure);"
```

The function shows scope-wide pruning only under `p_scope_retention_ms IS NOT NULL`; otherwise it only deletes `WHERE event.scope=p_scope AND event.key=p_key`. `apps/webapp/src/modules/auth/authRateLimits.ts` configures `scopePrune` only for `patient.client_boot_report`, not `auth.channel_link_start`.

#### Specialist identity root

The structured map says `public.be_specialists` is `not-user-scoped`; its schedule tables say `via-parent` to branch/room. Live DEV has an active specialist whose `be_specialists.id` equals a `role='client'` platform UUID, plus schedule/appointment references. `be_specialists.id` has no FK to `platform_users`, and the account purge does not touch this root.

```bash
sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -v ON_ERROR_STOP=1 -P pager=off -F '|' -At <<'SQL'
SELECT 'client_be_specialists', count(*), count(*) FILTER (WHERE s.is_active), count(DISTINCT s.id)
FROM public.be_specialists s JOIN public.platform_users u ON u.id=s.id WHERE u.role='client';
SELECT 'client_specialist_refs',
 (SELECT count(*) FROM public.be_working_hours x JOIN public.platform_users u ON u.id=x.specialist_id WHERE u.role='client'),
 (SELECT count(*) FROM public.be_specialist_service_availability x JOIN public.platform_users u ON u.id=x.specialist_id WHERE u.role='client'),
 (SELECT count(*) FROM public.be_appointments x JOIN public.platform_users u ON u.id=x.specialist_id WHERE u.role='client');
SQL
```

Result: `client_be_specialists|1|1|1`; related rows: `8|1|12`.

Reachable consequence: strict purge accepts that `role='client'` row, deletes the platform identity, and leaves the same raw UUID as an active specialist identity and schedule root. This violates the same stage-3 account-purge acceptance and the explicit `not-user-scoped`/parent-chain challenge in the brief.

### F3. Several `orgPurge: organization_id` decisions cannot perform organization purge

The exhaustive live FK check found these concrete organization paths:

- `outgoing_delivery_queue.organization_id`: no FK or explicit org-purge path; 117 live rows for 2 organizations;
- `media_playback_stats_hourly.organization_id`: no FK or explicit org-purge path; 10 live rows for 1 organization;
- `organization_slug_claims.organization_id`: `NO ACTION`; 5 live rows;
- `organization_slug_rename_events.organization_id`: `NO ACTION`; 2 live rows;
- `manual_patient_commands` also reaches the organization through a `NO ACTION` composite FK; it is currently empty, so it is not the live blocker in this measurement.

```bash
sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -v ON_ERROR_STOP=1 -P pager=off -F '|' -At <<'SQL'
SELECT 'org_raw_rows',
 (SELECT count(*) FROM public.outgoing_delivery_queue WHERE organization_id IS NOT NULL),
 (SELECT count(*) FROM public.media_playback_stats_hourly WHERE organization_id IS NOT NULL),
 (SELECT count(*) FROM public.user_phone_history WHERE organization_id IS NOT NULL),
 (SELECT count(*) FROM public.operator_health_failure_archive WHERE organization_id IS NOT NULL);
SELECT 'org_no_action_rows',
 (SELECT count(*) FROM public.manual_patient_commands WHERE organization_id IS NOT NULL),
 (SELECT count(*) FROM public.organization_slug_claims WHERE organization_id IS NOT NULL),
 (SELECT count(*) FROM public.organization_slug_rename_events WHERE organization_id IS NOT NULL);
SELECT 'org_distinct_raw',
 (SELECT count(DISTINCT organization_id) FROM public.outgoing_delivery_queue WHERE organization_id IS NOT NULL),
 (SELECT count(DISTINCT organization_id) FROM public.media_playback_stats_hourly WHERE organization_id IS NOT NULL),
 (SELECT count(DISTINCT organization_id) FROM public.user_phone_history WHERE organization_id IS NOT NULL),
 (SELECT count(DISTINCT organization_id) FROM public.operator_health_failure_archive WHERE organization_id IS NOT NULL);
SQL
```

Results: `org_raw_rows|117|10|91|23`, `org_no_action_rows|0|5|2`, `org_distinct_raw|2|1|1|1`.

FK evidence:

```bash
sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -At -F '|' -c "SELECT conrelid::regclass::text, conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE contype='f' AND conrelid IN ('public.outgoing_delivery_queue'::regclass,'public.media_playback_stats_hourly'::regclass,'public.user_phone_history'::regclass,'public.operator_health_failure_archive'::regclass,'public.organization_slug_claims'::regclass,'public.organization_slug_rename_events'::regclass,'public.manual_patient_commands'::regclass) ORDER BY 1,2;"
```

The first two tables have no listed FK; both slug relations show the default `NO ACTION`. `user_phone_history` and `operator_health_failure_archive` do cascade and therefore are behaviorally safe despite their own inaccurate `not-org-scoped` labels.

Reachable consequence: direct organization deletion is refused by live slug rows; if they are cleared first, queue/hourly rows retain the raw clinic UUID. That contradicts the stage-3 required organization purge fact and the candidate's `organization_id` declarations.

### F4. The executable-window gate accepts a nonexistent prune root

The contract considers any target containing `.` or `:` executable:

```ts
const rootOk = sweepTargets.has(target) || target.includes('.') || target.includes(':');
```

Required injection: replace the operator archive target with `app.audit_missing_prune_target`, keeping the real registered job. The suite remained green:

```bash
pnpm --dir apps/webapp exec vitest run src/modules/db-retention/journalLifecycleRegistry.contract.test.ts
```

Result under the injection: 1 file passed, 9 tests passed, exit 0. The injection was reverted.

The candidate already contains the same class of false statement: it names `app.archive_operator_health_failures` as the 30-day prune root, while the installed pruning call is `app.prune_operator_health_failure_archive(integer)`; the archive root moves live failures into the archive and does not prune the archive.

```bash
sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -At -F '|' -c "SELECT to_regprocedure('app.archive_operator_health_failures(text,integer,uuid)') IS NOT NULL, to_regprocedure('app.prune_operator_health_failure_archive(integer)') IS NOT NULL;"
rg -n "health\.operator_health_critical\.tick|pruneArchivedOlderThanDays|operator_health_failure_archive" apps/webapp/src/modules/operator-health apps/webapp/src/app-layer apps/webapp/src/infra/repos
```

Result: both functions exist; the scheduler calls `pruneArchivedOlderThanDays`, which calls the latter. The product sweep currently runs, but the registry fact is false and a future nonexistent dotted root is silently accepted. This is exactly the repeatable silent failure the required fault injection must block, and violates the stage-3 requirement for a real named prune root, scheduler and health signal.

### F5. The rollback proof does not audit the 164-decision surface or FK-free anonymisation

`platformUserFullPurge.devDbProof.test.ts` constructs behavioral surfaces from the live FK graph plus `CONTENT_TABLES`. It does not import `JOURNAL_LIFECYCLE_NON_JOURNAL_DECISIONS`. Its `explicit-anonymise` check only compares the registry string to membership in `ANONYMISE_ON_PURGE_COLUMNS`; FK-free anonymisation columns are not added to before/after surfaces. Consequently F1–F3 above are invisible to the proof, and `specialist_tasks`, `be_payments` and `be_payment_history_events` are not physically asserted.

The candidate code does contain the intended F1/F2 mechanics:

- explicit delete: `manual_patient_commands.platform_user_id`, `patient_diary_day_snapshots.platform_user_id`, `patient_practice_completions.user_id`;
- explicit anonymise: `specialist_tasks.patient_user_id`, `be_payments.platform_user_id`, `be_payment_history_events.platform_user_id`.

Live DEV has rows to prove two of the three anonymisation targets, but the existing proof does not choose/measure them:

```bash
sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -At -F '|' -c "SELECT 'explicit_anonymise_client_rows', (SELECT count(*) FROM public.specialist_tasks t JOIN public.platform_users u ON u.id::text=t.patient_user_id::text WHERE u.role='client'), (SELECT count(*) FROM public.be_payments p JOIN public.platform_users u ON u.id::text=p.platform_user_id::text WHERE u.role='client'), (SELECT count(*) FROM public.be_payment_history_events p JOIN public.platform_users u ON u.id::text=p.platform_user_id::text WHERE u.role='client');"
```

Result: `explicit_anonymise_client_rows|3|0|3`.

The existing proof was temporarily redirected from its hard-coded TEST database to named DEV, run in the foreground, and reverted. No TEST write occurred; each production-core execution used `BEGIN`/`ROLLBACK`.

```bash
RUN_PLATFORM_USER_PURGE_DB=1 pnpm --dir apps/webapp exec vitest run src/infra/platformUserFullPurge.devDbProof.test.ts
```

Result: 11 tests, 9 passed, 2 failed. One red is the proof's own `platform_users.merged_into_id` total-row assertion (`304 → 303`, expected for deletion of the chosen root); the other is the already-recorded five-entry registry divergence set (`media_files`, `message_log`, and three staff-authored `NO ACTION` FKs). It must not be reported green. A temporary extension adding FK-free anonymisation surfaces still selected only `platform_users.merged_into_id` and `product_analytics_events_recent.user_id`; it did not exercise either live accounting/specialist target. That extension was also reverted.

Reachable consequence: the required acceptance can stay green while the exact new structured decision surface is false, as demonstrated by F1–F3. This violates the brief's instruction that a registry statement is not evidence for itself and that the candidate's 164 decisions are the sole new audit surface.

## Previous F1/F2 paths

Code inspection confirms the candidate added the promised operations to the single purge core. The baseline targeted suites are green:

```bash
pnpm --dir apps/webapp exec vitest run src/modules/db-retention/journalLifecycleRegistry.contract.test.ts src/infra/platformUserFullPurge.collectPurgeArtifactKeys.test.ts src/infra/platformUserFullPurge.retiredIntegratorProjections.unit.test.ts
```

Result: 3 files passed, 12 tests passed.

This confirms the structural gate and existing unit contracts, not the live behavior of all named rows. The live blocker scan in the DEV proof passed; `manual_patient_commands` no longer refuses the tested account purge. The code path deletes both diary tables, retains `specialist_tasks` while nulling `patient_user_id`, and retains both accounting tables while nulling `platform_user_id`. The last two accounting consequences remain unexercised live because DEV has no matching `be_payments` row and the existing probe does not select the three `be_payment_history_events` rows.

## Fault-injection matrix

All mutations were applied one at a time and reverted before the next one. The same exact command ran each case:

```bash
pnpm --dir apps/webapp exec vitest run src/modules/db-retention/journalLifecycleRegistry.contract.test.ts
```

| Injection | Result |
|---|---|
| declared `public.bcb_probe_sms_deliveries`, no decision | red: undecided table named exactly |
| bare non-lifecycle decision | red: non-structured exception |
| missing `userPurge` | red: missing account-purge semantics |
| missing `orgPurge` | red: missing organization-purge semantics |
| registry/non-lifecycle duplicate | red: table classified both ways |
| nonexistent dotted decided prune root | **green: 9/9; missed** |

Baseline after reversion: 9/9 green. Injections planted: 6; caught: 5; missed: 1; remaining in the tree: 0. The exact command above produced each result.

## Complete kill-set result

| Class | Result | Missed class |
|---|---|---|
| arbitrary-name census | PASS | none |
| exact-once / bare / missing-side structure | PASS | none |
| semantic `userPurge` / parent / copied-id decisions | **FAIL** | delivery alternate columns/JSON, auth raw key, client specialist root |
| prior F1/F2 concrete code paths | PARTIAL | accounting/specialist live consequence not exercised by existing proof |
| independent FK-free/misleading identifier search | **FAIL** | same reachable classes in F1/F2 |
| decided retention executability | **FAIL** | nonexistent dotted target and false current operator target name |
| organization purge | **FAIL** | raw queue/hourly IDs survive; slug rows refuse deletion |
| rollback-only account purge proof | **FAIL baseline** | 164 structured decisions and FK-free anonymisation not measured; known red gate remains red |
| absent-retired | PASS | none |
| remaining staff-authored values inspected | PASS for current live values | no additional reachable client reference found beyond the specialist root reported above |
| all injections reverted | PASS | none |

## Remaining owner-questions

No owner policy was invented. The current registry reports:

```bash
pnpm --dir apps/webapp exec tsx -e "import {JOURNAL_LIFECYCLE_REGISTRY as r} from '../../deploy/postgres/privileges/journal-lifecycle-registry.ts'; for(const e of r){if(e.userPurge.kind==='owner-question') console.log('USER|'+e.table+'|'+e.userPurge.id+'|'+e.userPurge.column); if(e.retention.kind==='owner-question') console.log('RETENTION|'+e.table+'|'+e.retention.id)}"
```

- `OQ-DELIVERY-ATTEMPT-USER-PURGE` — still a real product choice, but must cover `user_id`, `integrator_user_id` and raw person identifiers in `metadata`, not only `user_id`;
- `OQ-REMINDER-HISTORY-WINDOW`;
- `OQ-TERMINAL-UPLOAD-SESSION-WINDOW`;
- `OQ-WEBHOOK-ERROR-EVENTS-WINDOW`;
- `OQ-SAAS-ISOLATION-EVENTS-WINDOW` (shared by three isolation relations).

Earlier recorded OQ2–OQ5 remain: `message_log` delete vs anonymise, media post-commit deletion vs anonymise, raw post-purge admin audit, and the three staff-only `NO ACTION` actor FKs. They were not expanded into work here.

## Validation and boundaries

- Full CI: not run, as required.
- TEST: read-only catalog/data measurements only.
- DEV: read-only measurements plus the existing production-core rollback-only proof; no transaction committed.
- Product code/test changes retained: none.
- Fault injections retained: none.
- PROD, domains, deploy, UI, env, taskdb and other branches: untouched.

**FAIL, NOT FOR LAND**
