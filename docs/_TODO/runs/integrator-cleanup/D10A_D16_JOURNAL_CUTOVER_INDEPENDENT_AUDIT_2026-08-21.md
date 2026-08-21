# D10a/D16 journal-history cutover — independent audit — 2026-08-21

Candidate: `3d1ee9531edafdd001d0de3c646f3d104993a8ba`
Authority: `WORK_ORDER.md` §Р-D10a/D10a/D16; `AGENTS.md` §§1/1b/5/6/7/9/10/10a/10b/24;
the worker brief and its named DB privilege authority.

## Method split

- Repeatable canonical-journal and single-delivery-cycle behavior: existing acceptance tests plus one independent
  fault injection for each independent behavior class.
- One-shot history transfer, parity/provenance before DROP, reader/declaration/generated-artifact removal and
  privilege hygiene: exact diff/callgraph/migration inspection plus executable migration/order/generator/parity
  gates. No permanent source-string absence test.
- No live database writes, migration application, TEST, PROD, deploy, push or full CI. The only database access
  was the named DEV read-only census recorded below.

## Frozen blind kill-set

This list was written before reading the candidate diff or candidate tests.

| ID | Fault to kill | Required evidence |
| --- | --- | --- |
| K1 | A legacy row is lost, duplicated or maps non-deterministically; attempt, correlation, payload, source id, timestamp or provenance is not preserved in the canonical journal. | Executable migration/parity self-test and exact mapping inspection. |
| K2 | A partial or full rerun duplicates history or fails incorrectly; parity can pass with a missing, extra, duplicate or misprovenanced row. | Executable rerun/parity fault gates. |
| K3 | DROP precedes parity; an applied migration is edited; migration contains ACL/role/owner/RLS changes; generated SQL is hand-edited. | Migration/order/privilege/generator inspection and gates. |
| K4 | Current canonical writes regress for queue-backed or queue-independent attempts, fields can be forged across the queue seam, cross-org visibility/writes widen, or a second writer/journal appears. | Existing acceptance tests plus fault injection of queue-backed source dominance, queue-independent preservation and visibility/writer chokepoint classes. |
| K5 | A one-shot reader remains reachable, a release gate still invokes removed tooling, or a reader is redirected to the rejected semantically different `notification_delivery_attempts.event_id`. | Exact callgraph/package/release-gate inspection. |
| K6 | The legacy table/function/Drizzle declaration/access entry/backreference/generated artifact/test fixture remains active after DROP. | Exact repository/generated-artifact inspection and privilege/callsite/generator gates. |
| K7 | `outgoing_delivery_queue` gains a second consumer loop; cadence, retry or claim semantics change; journal cleanup becomes coupled to queue existence. | Exact loop/callgraph census and existing delivery-worker acceptance tests with a representative claim/dispatch fault. |
| K8 | New raw SQL appears outside migration or a low-level DB port; `any`, strictness weakening or an architecture-boundary bypass is introduced. | Candidate diff inspection, strict typechecks and raw-SQL/architecture gates. |
| K9 | Checklist claims environmental completion without named DEV post-land migration, parity and live evidence. | Checklist/report inspection; explicit post-land named-DEV gate. |

## Results

**FAIL — 3 MUST FIX findings. Fault injection: killed 6, not caught 0.**

The candidate's history migration itself is ordered and fail-closed, and the existing canonical writer and
single delivery loop still pass their acceptance tests. The cutover is nevertheless not landable: one active
Drizzle aggregate still imports the deleted declaration, and two active deployment families still require the
relation/function/sequence after the migration drops them.

## Findings

### F1 — MUST FIX — integrator strict typecheck is red on a remaining Drizzle backreference

Reachable scenario: build the workspace package declarations and run the integrator strict typecheck. It fails:

```text
apps/integrator/src/infra/db/integratorDrizzleSchema.ts(4,3): error TS2305:
Module '"./schema/integratorPublicProduct.js"' has no exported member 'deliveryAttemptLogs'.
```

`apps/integrator/src/infra/db/integratorDrizzleSchema.ts:4,20` still imports and exports
`deliveryAttemptLogs`, while the candidate removes that symbol from
`apps/integrator/src/infra/db/schema/integratorPublicProduct.ts`. Impact: the integrator cannot pass its required
strict build/type gate. This violates worker-brief result 2 (remove both Drizzle declarations and all remaining
product/runtime backreferences), K6, K8, and the repository strict-typing requirement.

Exact reproducer:

```bash
bash /home/dev/brain/host-orch/run-tests.sh "pnpm --dir packages/operator-db-schema build && pnpm --dir packages/db-principal build && pnpm --dir packages/platform-merge build && pnpm --dir packages/error-tracking build && pnpm --dir apps/integrator typecheck"
```

Result: exit `2`; package builds passed, then exactly the TS2305 above remained.

### F2 — MUST FIX — strict post-migration closure still requires the dropped table and sequence

Reachable scenario: after this migration has dropped `integrator.delivery_attempt_logs`, run the active strict
TEST closure through `deploy-test.sh --post-migration-closure` or the owner-gated full-reset entrypoint. The closure
calls `install_p0_5b_runtime_wall` at `deploy/host/deploy-test-saas.sh:2051-2053`; its grant inventory still contains
the dropped table at `deploy/postgres/p0-5b-grants.sql:56-59` and emits an unconditional table `GRANT` through
`:399-402`. With `ON_ERROR_STOP`, PostgreSQL stops on the absent relation. If that were removed, the same closure
then calls `install_integrator_server_runtime_config_overlay` at
`deploy/host/deploy-test-saas.sh:2062`; `deploy/postgres/integrator-server-runtime-config.sql:128-133` unconditionally
revokes table/sequence access, and its closing assertion at `:945-953` resolves both dropped objects again.

Impact: the documented post-migration closure exits red before it can establish and verify the runtime privilege
state. This is an active deploy path, not an archived reference. It violates worker-brief results 2 and 4 and K6's
requirement that legacy access/backreferences be gone after DROP.

### F3 — MUST FIX — the supported A→B/full-reset cutover recreates and consumes the retired journal

Reachable scenario: refresh the target snapshot from post-migration DEV and run the supported A→B cutover used by
the owner-gated full reset. `deploy/postgres/prod-to-target-cutover.sql:56-75` installs `schema-pre.sql` and then
runs `prod-to-target-cutover-data.sql`. Today the generated snapshot still creates the legacy function, table and
sequence (`generated/prod-to-target/schema-pre.sql:16772-16827,22246-22285,27022-27025`) and its post-data artifact
adds the table's constraints/RLS/policies. After the required post-land snapshot refresh these objects disappear,
but `prod-to-target-cutover-data.sql:1636-1640,1659` still reads the target legacy table, and
`prod-to-target-cutover-finish.sql:234-238,454` still asserts/reports it. Phase P03/P07 will therefore fail with an
absent relation. Without the refresh, the cutover instead recreates the forbidden second journal and writer.

Impact: either the generated target is stale and violates the D10a oracle, or refreshing it makes the supported
cutover/full-reset path non-executable. This violates worker-brief results 2 and 5 and K6, including its explicit
generated-artifact/backreference clause.

## Kill-set verdict

| ID | Verdict | Evidence |
| --- | --- | --- |
| K1 | PASS | Exact migration inspection plus the parity self-test cover deterministic identity, row count, distinct provenance, all mapped fields and DROP order. Named DEV read-only census found 6,280 rows, 6,280 distinct legacy ids, 0 null payloads, 0 orphan organizations and 0 deterministic-id collisions. |
| K2 | PASS | The sanctioned runner wraps all four statements and the ledger insert in one transaction; a partial failure rolls back. A completed run is skipped by its unique ledger tag. Deterministic ids, `ON CONFLICT (id) DO NOTHING`, provenance counts, distinct legacy ids and FULL OUTER field parity close missing/extra/duplicate/misprovenanced rows. |
| K3 | PASS | New timestamp-forward file; no applied migration edited. Migration order/marker/privilege tests passed; no ACL/role/owner/RLS repair appears in the migration. Generated artifacts matched the declaration byte-for-byte, and a hand-edit injection was killed. |
| K4 | PASS | Canonical writer acceptance tests passed; routing and payload-sanitization injections went red. Candidate product changes in this path are comments only. Generated privilege surfaces retain the one canonical root and do not widen tenant visibility. |
| K5 | PASS | Both one-shot scripts, both package registrations and the only stage6 invoker are removed; exact package/app/script search found no reachable invocation or semantic redirection. |
| K6 | **FAIL** | F1, F2 and F3: active Drizzle, strict-closure, A→B and generated snapshot backreferences remain. |
| K7 | PASS | Production callgraph has one `runOutgoingDeliveryWorkerTick` invocation (`worker/main.ts:67`) and one implementation (`outgoingDeliveryWorker.ts:1167`). No production `.claimDueJobs(` caller exists; the compatibility method is not a consumer loop. Existing worker tests passed and the claim-counter fault was killed. |
| K8 | **FAIL** | No new `any` or raw SQL outside the migration was found and the raw-SQL gate passed, but F1 makes strict integrator typing red. Webapp typecheck passed. |
| K9 | PASS | WORK_ORDER says `CODE PREPARED` and explicitly does not claim DEV/TEST completion. The named post-land gate below is still mandatory; no checklist item may close before it passes. |

## Named DEV pre-apply census

Executed read-only; no migration or write was performed:

```bash
sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -v ON_ERROR_STOP=1 -qAt <<'SQL'
BEGIN READ ONLY;
SELECT jsonb_build_object(
  'database', current_database(),
  'legacyRelation', to_regclass('integrator.delivery_attempt_logs'),
  'legacyFunction', to_regprocedure('app.record_operational_delivery_attempt_audit(text,text,text,uuid,text,text,integer,text,text,timestamp with time zone)'),
  'cutoverLedgerRows', (SELECT count(*) FROM drizzle.__drizzle_migrations WHERE tag = '20260821T003000_cut_over_delivery_attempt_history')
);
SELECT jsonb_build_object(
  'legacyRows', count(*), 'distinctLegacyIds', count(DISTINCT id),
  'nullPayloadRows', count(*) FILTER (WHERE payload_json IS NULL),
  'minOccurredAt', min(occurred_at), 'maxOccurredAt', max(occurred_at)
) FROM integrator.delivery_attempt_logs;
SELECT jsonb_build_object(
  'existingCutoverRows', count(*),
  'distinctCutoverLegacyIds', count(DISTINCT metadata->>'legacyId')
) FROM public.notification_delivery_attempts
WHERE metadata->>'legacySource' = 'integrator.delivery_attempt_logs';
ROLLBACK;
SQL
```

Exact result:

```json
{"database":"bcb_webapp_dev","legacyRelation":"integrator.delivery_attempt_logs","legacyFunction":"app.record_operational_delivery_attempt_audit(text,text,text,uuid,text,text,integer,text,text,timestamp with time zone)","cutoverLedgerRows":0}
{"legacyRows":6280,"distinctLegacyIds":6280,"nullPayloadRows":0,"minOccurredAt":"2026-03-04T16:10:12.632+03:00","maxOccurredAt":"2026-08-19T11:42:55.52+03:00"}
{"existingCutoverRows":0,"distinctCutoverLegacyIds":0}
```

The collision/FK preflight used the same `BEGIN READ ONLY` boundary and the migration's exact deterministic UUID
expression:

```bash
sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -v ON_ERROR_STOP=1 -qAt <<'SQL'
BEGIN READ ONLY;
WITH legacy AS (
  SELECT l.*,
    (substr(md5('integrator.delivery_attempt_logs:' || l.id::text), 1, 8) || '-' ||
     substr(md5('integrator.delivery_attempt_logs:' || l.id::text), 9, 4) || '-' ||
     substr(md5('integrator.delivery_attempt_logs:' || l.id::text), 13, 4) || '-' ||
     substr(md5('integrator.delivery_attempt_logs:' || l.id::text), 17, 4) || '-' ||
     substr(md5('integrator.delivery_attempt_logs:' || l.id::text), 21, 12))::uuid AS canonical_id
  FROM integrator.delivery_attempt_logs AS l
)
SELECT jsonb_build_object(
  'orphanOrganizationRows', count(*) FILTER (
    WHERE legacy.organization_id IS NOT NULL AND organization.id IS NULL
  ),
  'deterministicIdCollisions', count(*) FILTER (WHERE canonical.id IS NOT NULL),
  'distinctDeterministicIds', count(DISTINCT legacy.canonical_id),
  'legacyRows', count(*)
)
FROM legacy
LEFT JOIN public.be_organizations AS organization ON organization.id = legacy.organization_id
LEFT JOIN public.notification_delivery_attempts AS canonical ON canonical.id = legacy.canonical_id;
ROLLBACK;
SQL
```

Exact result:

```json
{"legacyRows":6280,"orphanOrganizationRows":0,"distinctDeterministicIds":6280,"deterministicIdCollisions":0}
```

## Acceptance and executable gates

Baseline repeatable behavior:

```bash
bash /home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/integrator exec vitest run src/infra/db/repos/operatorDeliveryAttempts.test.ts src/infra/runtime/worker/operatorDeliveryAttemptWritePort.test.ts src/infra/db/repos/messageLogs.deliveryAttemptAudit.test.ts src/infra/runtime/worker/outgoingDeliveryWorker.finalize.test.ts src/infra/runtime/worker/outgoingDeliveryWorker.scope.test.ts"
```

Result: exit `0`; 5 files, 38 tests passed.

Migration/privilege/callsite/generator gates:

```bash
bash /home/dev/brain/host-orch/run-tests.sh "node --test deploy/postgres/privileges/migration-order.test.mjs deploy/postgres/privileges/migrate-local-parse.test.mjs deploy/postgres/privileges/function-census.test.mjs deploy/postgres/privileges/relation-access.test.mjs deploy/postgres/privileges/port-context-callsite-catalog.test.mjs && node deploy/postgres/privileges/generate-cli.mjs --check && node scripts/check-no-new-raw-sql.mjs && node scripts/check-c4-migration-owned-function-bodies.mjs && bash apps/webapp/scripts/check-drizzle-migration-order.sh"
node scripts/check-migration-privileges.mjs
node scripts/check-migration-privileges.mjs --self-test
```

Results: 93/93 node tests passed; callsite catalog passed; generated DEV/TEST privileges and allowlists matched
byte-for-byte; raw-SQL gate passed with production debt 0; C4 body gate and migration layout/order passed;
migration privilege gate passed for 19 files; its self-test caught 7 red fixtures and accepted 1 green fixture.
An initial combined command used the nonexistent path `apps/webapp/scripts/check-migration-privileges.mjs` and
exited `1` after all preceding gates passed; the two corrected root commands above are the reported evidence.

Strict types:

```bash
bash /home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp typecheck"
bash /home/dev/brain/host-orch/run-tests.sh "pnpm --dir packages/operator-db-schema build && pnpm --dir packages/db-principal build && pnpm --dir packages/platform-merge build && pnpm --dir packages/error-tracking build && pnpm --dir apps/integrator typecheck"
```

Results: webapp exit `0`; integrator exit `2` with F1's single TS2305 after package builds passed.

Exact active callgraph/reader census:

```bash
rg -n "backfill-communication-history|reconcile-communication-domain|stage6-gate|stage6-release-gate" apps scripts package.json pnpm-lock.yaml
rg -n --glob '!**/*.test.ts' --glob '!**/*.spec.ts' "runOutgoingDeliveryWorkerTick\(" apps/integrator/src
rg -n --glob '!**/*.test.ts' --glob '!**/*.spec.ts' "\.claimDueJobs\(" apps/integrator/src
rg -n --glob '!**/*.test.ts' --glob '!**/*.spec.ts' "record_operational_delivery_attempt_audit|insertDeliveryAttemptLog|deliveryAttemptLogs" apps/integrator/src apps/webapp/src apps/webapp/db/schema
```

Results: the reader/release-gate search returned no matches in all listed active roots; the worker-tick search
returned exactly the definition and `worker/main.ts:67` invocation; `.claimDueJobs(` returned no production
caller; the legacy runtime/declaration search returned only F1's two `integratorDrizzleSchema.ts` lines.

The one-off parser/parity gate loaded the migration with `splitStatements`, asserted exactly four ordered
statements, deterministic insert/`ON CONFLICT`, count/distinct/FULL OUTER parity, exact mapped fields, then
DROP-function and DROP-table owner boundaries. Clean result: `journal cutover parity/order self-test: PASS`.

## Blind fault injection

All mutations were applied to the candidate only for the named command and restored immediately.

| ID | Injected break | Exact command | Red oracle |
| --- | --- | --- | --- |
| FI1 | Route `delivery.attempt.log` into tenant writer instead of canonical writer. | `bash /home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/integrator exec vitest run src/infra/runtime/worker/operatorDeliveryAttemptWritePort.test.ts"` | exit 1; 3/3 principal cases failed because canonical writer had 0 calls. |
| FI2 | Serialize a scalar payload into the journal instead of sanitizing it to `{}`. | `bash /home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/integrator exec vitest run src/infra/db/repos/operatorDeliveryAttempts.test.ts"` | exit 1; expected `{}`, received the scalar JSON string. |
| FI3 | Remove `attempt_count + 1` from the canonical queue claim. | `bash /home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/integrator exec vitest run src/infra/runtime/worker/outgoingDeliveryWorker.finalize.test.ts"` | exit 1; exact claim SQL oracle rejected the missing increment. |
| FI4 | Add a table `GRANT` to the cutover migration. | `bash /home/dev/brain/host-orch/run-tests.sh "node --test deploy/postgres/privileges/migration-order.test.mjs"` | exit 1; statement 4 named `GRANT is forbidden in an active migration`. |
| FI5 | Hand-edit the generated DEV privilege artifact. | `bash /home/dev/brain/host-orch/run-tests.sh "node deploy/postgres/privileges/generate-cli.mjs --check"` | exit 1; exact artifact and first differing line named. |
| FI6 | Remove `event_id` field parity from the migration. | One-off `node --input-type=module` parity script described above. | exit 1; missing `canonical.event_id IS DISTINCT FROM legacy.intent_event_id` assertion. |

**Killed 6; not caught 0.** Restoration proof:

```bash
git diff --quiet -- apps/integrator/src/infra/runtime/worker/operatorDeliveryAttemptWritePort.ts apps/integrator/src/infra/db/repos/operatorDeliveryAttempts.ts apps/integrator/src/infra/db/repos/outgoingDeliveryQueue.ts apps/webapp/db/drizzle-migrations/20260821T003000_cut_over_delivery_attempt_history.sql deploy/postgres/generated/privileges.bcb_webapp_dev.sql
```

Result: exit `0`.

## Mandatory post-land named-DEV gate

Do not execute this candidate until F1-F3 are fixed and re-audited. From the landed canonical main tree, the lead
must preserve the pre-apply count, apply through the sanctioned wrapper, prove the ledger/drop/provenance count,
refresh and verify the supported target snapshot, then run the live canonical-writer acceptance test:

```bash
cutover_legacy_rows="$(sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -v ON_ERROR_STOP=1 -qAtc "BEGIN READ ONLY; SELECT count(*) FROM integrator.delivery_attempt_logs; ROLLBACK;")"
test "$cutover_legacy_rows" -gt 0
bash deploy/host/migrate-dev.sh --preflight
bash deploy/host/migrate-dev.sh --execute
sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -v ON_ERROR_STOP=1 -v expected_legacy_rows="$cutover_legacy_rows" <<'SQL'
BEGIN READ ONLY;
SELECT 1 / (EXISTS (
  SELECT 1 FROM drizzle.__drizzle_migrations
  WHERE tag = '20260821T003000_cut_over_delivery_attempt_history'
))::int AS ledger_applied;
SELECT 1 / (to_regclass('integrator.delivery_attempt_logs') IS NULL)::int AS legacy_table_dropped;
SELECT 1 / (to_regprocedure('app.record_operational_delivery_attempt_audit(text,text,text,uuid,text,text,integer,text,text,timestamp with time zone)') IS NULL)::int AS legacy_function_dropped;
SELECT 1 / ((SELECT count(*) FROM public.notification_delivery_attempts
  WHERE metadata->>'legacySource' = 'integrator.delivery_attempt_logs') = :'expected_legacy_rows'::bigint)::int AS provenance_count_matches;
SELECT 1 / ((SELECT count(DISTINCT metadata->>'legacyId') FROM public.notification_delivery_attempts
  WHERE metadata->>'legacySource' = 'integrator.delivery_attempt_logs') = :'expected_legacy_rows'::bigint)::int AS provenance_ids_match;
ROLLBACK;
SQL
node scripts/refresh-prod-to-target-cutover.mjs --confirm-local-dev-target-refresh
pnpm run check:prod-to-target-cutover
bash /home/dev/brain/host-orch/run-tests.sh "cd /home/dev/dev-projects/BersonCareBot && set -a && source .env && set +a && RUN_OPERATOR_DELIVERY_ATTEMPT_TEST=1 USE_REAL_DATABASE=1 pnpm --dir apps/integrator exec vitest run src/infra/db/repos/operatorDeliveryAttempts.integration.test.ts"
```

The migration's in-transaction FULL OUTER JOIN is the field-parity proof before DROP; the post-land queries prove
that the committed named DEV state still carries the same row/provenance cardinality and no legacy door. Checklist
completion remains forbidden until every command above is green and its actual outputs are recorded.
