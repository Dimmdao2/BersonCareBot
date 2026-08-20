# D20 post-migration live gate fix — independent audit 2026-08-21

## Verdict

**PASS-code-with-named-post-land-live-gate.** Findings: **none**. Worker
`ece43484fa32d9e07262e21ad1193dac9349cb75` satisfies the D10b producer-cleanup authority and the D20 live-gate
repair brief against `feat/doctor-ui-rebuild` at `4dea7f9a9ac33879ed038a4607e9b89d420c3336`.

The preserved real-Postgres acceptance was not run and this audit does not claim 16/16. The audit branch migration
is not applied to named DEV, so the current live signature is stale by construction. The exact post-land migration,
16-test and zero-residue gate is recorded below.

No DEV/TEST/PROD database access, migration apply, privilege reconcile, deploy, push or full CI was performed. No
product code or acceptance test was changed by the auditor.

## Method and audited surface

- Migration/capability/privilege boundaries and the SQL fixture alias are one-off state: inspected by full diff,
  exact searches and executable structural gates under `AGENTS.md` §24.4.
- Producer cleanup is repeatable behavior already represented by the saved real-Postgres red acceptance. Its blind
  D10/D20 audit and fault injection were not repeated. No new behavioral branch was introduced by the worker.
- `git merge-base HEAD feat/doctor-ui-rebuild` returned
  `4dea7f9a9ac33879ed038a4607e9b89d420c3336`; `git rev-list --count
  feat/doctor-ui-rebuild..HEAD` returned `1` before this audit artifact.
- The complete 12-path worker diff was read. Strict TypeScript and the integrator infra boundary are preserved; no
  `any`, direct raw client call, new helper, second queue root or cross-layer import was added.

## Requirement results

### 1. Runtime privilege boundary — PASS

`public.outgoing_delivery_queue` still grants `app_operational_delivery_worker` table `SELECT` plus bounded-column
`UPDATE` only. Cleanup `DELETE` belongs to the existing `app_seam_delivery_scope_owner` definer surface; the runtime
role receives only EXECUTE on the root. The generated DEV and TEST grants show the same shape.

```text
rg -n 'GRANT DELETE ON TABLE "public"\."outgoing_delivery_queue" TO "app_operational_delivery_worker"' \
  deploy/postgres/generated/privileges.bcb_webapp_dev.sql \
  deploy/postgres/generated/privileges.bersoncarebot_test.sql
# exit 1, no match
```

The declaration diff changes only the enqueue function identity, typed transcript, purpose and its owner-side
relation surface. It does not add a direct queue grant, membership, runtime role or policy.

### 2. One producer root and exact cleanup — PASS

Both existing producer adapters now enter `runWithDbInfraPrincipal({ source: 'delivery-handler' }, async ...)`,
read `app.read_outgoing_delivery_reclaim_config()` inside that scope, and call the same literal eight-argument
`app.enqueue_integrator_outgoing_delivery(...)`. The SQL root validates `doneRetentionDays` as `1..365`, performs
the existing idempotent enqueue, then prunes expired `sent` rows. There is no parallel cleanup call.

The migrated DELETE retains exactly the two specialist-task exclusions:

```text
rg -n "kind = 'specialist_task_reminder'|payload_json \? 'successOutcome'|successOutcome,appliedAt|bookkeeping,botMarkerRequired|bookkeeping,botMarkerAppliedAt" \
  apps/webapp/db/drizzle-migrations/20260821T002100_move_outgoing_delivery_retention_to_producer_root.sql
# lines 67-74: the successOutcome/appliedAt and botMarkerRequired/botMarkerAppliedAt predicates
```

`notification_delivery_attempts` is absent from the forward migration. The old direct helper is absent from active
code:

```text
rg -n 'deleteExpiredSentOutgoingDeliveries' apps/integrator/src deploy/postgres/privileges
# exit 1, no match

rg -n 'notification_delivery_attempts' \
  apps/webapp/db/drizzle-migrations/20260821T002100_move_outgoing_delivery_retention_to_producer_root.sql
# exit 1, no match
```

The saved acceptance still calls the public `enqueueOutgoingDeliveryIfAbsent` adapter and asserts that an expired
sent row disappears, a recent sent row remains, and the count plus full content fingerprint of the entire attempt
journal are unchanged. That is the named behavioral oracle retained for the post-land gate.

### 3. Forward migration — PASS

The applied `20260821T001200_parameterize_integrator_outgoing_delivery_enqueue.sql` is byte-identical to `feat`:

```text
git diff --quiet feat/doctor-ui-rebuild...HEAD -- \
  apps/webapp/db/drizzle-migrations/20260821T001200_parameterize_integrator_outgoing_delivery_enqueue.sql
# exit 0

sha256sum apps/webapp/db/drizzle-migrations/20260821T001200_parameterize_integrator_outgoing_delivery_enqueue.sql
git show feat/doctor-ui-rebuild:apps/webapp/db/drizzle-migrations/20260821T001200_parameterize_integrator_outgoing_delivery_enqueue.sql | sha256sum
# both: 4143e15d93ba7fdecaa3a33b4b5670f678fd58c0b55306e87960a76890c6daae
```

Sorted active names place `20260821T002100_move_outgoing_delivery_retention_to_producer_root.sql` after
`20260821T001200...`. The forward file creates the eight-argument function, verifies that exact regprocedure, and
drops the superseded seven-argument signature in its second owner-marked statement. Its header order is exact:
owner → schema-create `app` → language-usage `plpgsql` → verify. The migration parser and order gate accept it.

```text
rg -n -i '(^|[^[:alnum:]_])(grant|revoke|create[[:space:]]+role|alter[[:space:]]+role|alter[[:space:]]+default[[:space:]]+privileges|create[[:space:]]+policy|alter[[:space:]]+policy|drop[[:space:]]+policy|enable[[:space:]]+row[[:space:]]+level|disable[[:space:]]+row[[:space:]]+level|force[[:space:]]+row[[:space:]]+level|no[[:space:]]+force[[:space:]]+row[[:space:]]+level)' \
  apps/webapp/db/drizzle-migrations/20260821T002100_move_outgoing_delivery_retention_to_producer_root.sql
# exit 1, no ACL/role/policy/RLS mutation
```

### 4. Identity convergence — PASS

Declaration capability, function declaration, both generated privilege artifacts, both generated port-context
capability artifacts, function census, callsite catalog and both production named-root literals agree on exactly:

```text
app.enqueue_integrator_outgoing_delivery(text,text,text,text,integer,timestamp with time zone,uuid,integer)
```

The old exact active identity search returned no match (historical creator and the forward DROP are intentionally
outside this active-surface query):

```text
rg -n -F "app.enqueue_integrator_outgoing_delivery(text,text,text,text,integer,timestamp with time zone,uuid)'" \
  apps/integrator/src deploy/postgres/privileges \
  deploy/postgres/generated/privileges.bcb_webapp_dev.sql \
  deploy/postgres/generated/privileges.bersoncarebot_test.sql \
  deploy/postgres/generated/port-context-capabilities.bcb_webapp_dev.sql \
  deploy/postgres/generated/port-context-capabilities.bersoncarebot_test.sql
# exit 1, no stale active identity
```

The callsite catalog discovers the literal in
`apps/integrator/src/infra/db/repos/outgoingDeliveryQueue.ts`; its mutation/missing/wrong/added/moved/removed
oracles remain green. No second cleanup helper or named root remains.

### 5. Audit SQL alias — PASS

The complete fixture diff is two substitutions: derived-table alias `attempt` → `attempt_row` in
`row_to_json(...)`/aggregate ordering and in `AS ...`. The selected columns, source table, `event_id` filter,
inner ordering, returned type and assertions are unchanged. PostgreSQL therefore receives the derived composite
row instead of resolving the same-named integer `attempt` column. Journal rows are neither filtered nor masked.

### 6. Typing, architecture and validation — PASS

Executed on worker SHA before adding this artifact:

```text
pnpm --dir apps/integrator exec vitest run \
  src/infra/db/repos/outgoingDeliveryQueue.namedRoot.unit.test.ts \
  src/infra/db/repos/outgoingDeliveryReclaimSettings.test.ts \
  src/infra/db/repos/operatorDeliveryAttempts.test.ts
# exit 0; 3 files, 8 tests passed

pnpm --dir apps/integrator typecheck
# exit 0

pnpm --dir apps/integrator exec eslint \
  src/infra/db/repos/operatorDeliveryAttempts.integration.test.ts \
  src/infra/db/repos/outgoingDeliveryQueue.namedRoot.unit.test.ts \
  src/infra/db/repos/outgoingDeliveryQueue.ts
# exit 0

node --test deploy/postgres/privileges/port-context-callsite-catalog.test.mjs
# exit 0; 5/5

node --test deploy/postgres/privileges/function-census.test.mjs
# exit 0; 19/19

node --test deploy/postgres/privileges/migration-order.test.mjs
# exit 0; 22/22

node --test deploy/postgres/privileges/migrate-local-parse.test.mjs
# exit 0; 6/6

node deploy/postgres/privileges/generate-cli.mjs --check
# exit 0; all generated artifacts byte-identical

node scripts/check-c4-migration-owned-function-bodies.mjs
# exit 0; OK

pnpm test:db-privileges
# exit 0; 154 passed, 29 skipped, 0 failed (183 total)

git diff --check feat/doctor-ui-rebuild...HEAD
# exit 0
```

## Named post-land live gate

After landing worker `ece43484fa32d9e07262e21ad1193dac9349cb75` into the integration checkout, apply pending
forward migrations and declaration reconcile only through the canonical named-DEV entrypoint:

```bash
cd /home/dev/dev-projects/BersonCareBot
bash deploy/host/migrate-dev.sh --preflight
bash deploy/host/migrate-dev.sh --execute
```

Then run the preserved suite in the foreground:

```bash
/home/dev/brain/host-orch/run-tests.sh "cd /home/dev/dev-projects/BersonCareBot && set -a && source .env && set +a && RUN_INTEGRATOR_SQL_PERMISSION_TEST=1 RUN_OUTGOING_DELIVERY_RECLAIM_TEST=1 RUN_OPERATOR_DELIVERY_ATTEMPT_TEST=1 RUN_REMINDER_RULES_RLS_TEST=1 USE_REAL_DATABASE=1 pnpm --dir apps/integrator exec vitest run src/infra/db/runIntegratorSql.integration.test.ts src/infra/db/repos/outgoingDeliveryQueue.reclaim.integration.test.ts src/infra/db/repos/operatorDeliveryAttempts.integration.test.ts src/infra/db/directPublic/writeReminderRulesDirect.rls.integration.test.ts"
```

Acceptance: exit `0`, **4 files / 16 tests passed**. The prior saved red was **9 passed / 7 failed**: six
`row_to_json(integer)` fixture failures and one producer cleanup permission failure. This audit does not replace
that oracle with a code-only claim.

Finally require zero residue on the same named DEV database:

```bash
sudo -n -u postgres psql -X -A -t -q -h /var/run/postgresql -p 5432 -d bcb_webapp_dev \
  -v ON_ERROR_STOP=1 -c "BEGIN READ ONLY; SELECT 'queue_test_rows=' || count(*) FROM public.outgoing_delivery_queue WHERE event_id LIKE 'd10b-%' OR event_id LIKE 'd987-%'; SELECT 'journal_test_rows=' || count(*) FROM public.notification_delivery_attempts WHERE event_id LIKE 'd987-%'; SELECT 'reminder_test_rows=' || count(*) FROM public.reminder_rules WHERE integrator_rule_id LIKE 'rls-it-%'; ROLLBACK;"
```

Acceptance: `queue_test_rows=0`, `journal_test_rows=0`, `reminder_test_rows=0`. Until both the 16/16 run and this
second census pass after the canonical migration/reconcile, the live gate remains open.
