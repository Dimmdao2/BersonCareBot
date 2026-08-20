# D10 + D20 convergence — independent audit 2026-08-21

## Verdict

**PASS-code-with-named-post-land-live-gate.** No reachable product defect or authority violation was found in
`cfde2193aaeaf2db7f472e1e9833c3070f24447b...0d5280a3e16060f24c659c59562fa24064f21701`.
The code is ready to land. The preserved four-file real-Postgres acceptance is not a current live PASS: named DEV
has neither of the audited migrations nor the reconciled capability set. Applying them was forbidden by the audit
brief. After land, the named live gate is: apply the canonical migrations/reconciliation to `bcb_webapp_dev`, run
the preserved command below, require **16/16** and zero fixture residue.

No TEST/PROD access, migration, privilege reconciliation, full CI, push, merge, deploy, or product-code change was
performed.

## Audited object and method

- Branch: `wt/d20-portcontext-convergence-20260821`; audited HEAD
  `0d5280a3e16060f24c659c59562fa24064f21701`.
- Current `feat`: `cfde2193aaeaf2db7f472e1e9833c3070f24447b`; `git merge-base HEAD
  cfde2193aaeaf2db7f472e1e9833c3070f24447b` returned that same SHA.
- `git diff --name-only cfde2193aaeaf2db7f472e1e9833c3070f24447b...HEAD | wc -l` returned `33` paths.
- D10 was inspected mechanically by migration/diff/schema/generator/callsite evidence. Its already-recorded blind
  injection was not repeated.
- D20 repeatable behavior reused the preserved real-Postgres harness and kill-set. The current live schema was
  inspected read-only before deciding whether the opt-in suite was runnable.

## D10 result

`apps/webapp/db/drizzle-migrations/20260820T210709_retire_projection_outbox.sql` contains only:

1. owner marker `app_seam_delivery_scope_owner`, verify marker for the root, and
   `DROP FUNCTION IF EXISTS app.read_integrator_projection_health(integer)`;
2. owner marker `app_object_owner`, verify marker for the relation, and
   `DROP TABLE IF EXISTS integrator.projection_outbox`.

The exact migration search

```text
rg -n -i 'grant|revoke|create role|alter role|owner to|create policy|alter policy|drop policy|enable row level|disable row level|force row level|no force row level' \
  apps/webapp/db/drizzle-migrations/20260820T210709_retire_projection_outbox.sql
```

returned exit `1`, zero ACL/role/owner/RLS-policy operations.

The active-code search

```text
rg -n --hidden --glob '!.git/**' --glob '!node_modules/**' --glob '!dist/**' --glob '!docs/**' \
  --glob '!.cursor/plans/archive/**' --glob '!apps/webapp/db/drizzle-migrations/**' \
  --glob '!deploy/postgres/generated/prod-to-target/**' \
  'projection_outbox|projectionOutbox|read_integrator_projection_health' .
```

returned exit `1`. The same exact identifiers returned exit `1` in the active Drizzle schemas. Producer,
consumer, maintenance, and deploy backreferences are absent.

The neighboring-surface census was run with exact `rg -l` queries and returned:

- `integrator.idempotency_keys`: `13` files;
- `public.outgoing_delivery_queue`: `35` files;
- `integrator.direct_public_write_retries`: `9` files;
- `public.notification_delivery_attempts`: `17` files;
- `app.record_operator_delivery_attempt`: `16` files.

Diff inspection of the C4 and DEV-C7 declaration blocks found only the projection-outbox entries removed. The
idempotency and outgoing-delivery queue declarations remain. Direct-write retry and the canonical delivery-attempt
journal remain. No neighboring queue/table/root was retired.

## Combined privilege truth

The semantic capability census in `deploy/postgres/privileges/declaration.ts`, the two generated privilege SQL,
and the two generated port-context capability artifacts was:

```text
resolved canonical app.record_operator_delivery_attempt(...) capability=1
projection-outbox/root capability surface=0
```

The declaration and each port-context seed contain one `delivery.attempt-audit` row. Each privilege SQL contains
the same tuple twice by generator design—once in the replacement set and once in its expected-set verifier—so the
loaded catalog still resolves to one capability. `generate-cli.mjs --check` proves these are derived, not hand
edits. The immutable `deploy/postgres/generated/prod-to-target/**` source snapshots are not privilege-generator
outputs and intentionally retain the pre-forward production schema, as required by the D10 authority; the final
timestamp migration is what retires that historical surface.

The one canonical journal capability maps `app_integrator_request` to
`app_operational_delivery_worker`, class `service`, purpose `delivery.attempt-audit`, with the exact function
identity. The outgoing enqueue capability uses the same target role and exact accepted-context enforcement. No
`app_patient` queue grant, broad runtime table grant, or test-only capability was added.

`20260821T001200_parameterize_integrator_outgoing_delivery_enqueue.sql` defines the replacement root with exact
`require_accepted_context(...)`, typed-argument hash, accepted kinds `inbound_reply`/`operator_alert`, accepted
channels `telegram`/`max`, and writes only `public.outgoing_delivery_queue`; it then drops the superseded
`app.enqueue_integrator_inbound_reply(...)`. It contains no GRANT/REVOKE/role/policy operation. Production
callsite inspection found the inbound-reply route through `jobQueuePort` and operator-alert routes for Telegram/MAX;
no bypass around the named root was found.

Generator and structural checks:

```text
node deploy/postgres/privileges/generate-cli.mjs --check
# exit 0; privilege and allowlist artifacts byte-identical

node deploy/postgres/privileges/generate-cli.mjs --all --port-context-only --check
# exit 0; both port-context capability artifacts byte-identical

node scripts/check-c4-migration-owned-function-bodies.mjs
# exit 0

node --test deploy/postgres/privileges/function-census.test.mjs
# exit 0; 19/19

node --test deploy/postgres/privileges/port-context-callsite-catalog.test.mjs
# exit 0; 5/5

node --test deploy/postgres/privileges/migration-order.test.mjs
# exit 0; 22/22

pnpm test:db-privileges
# exit 0; 154 passed, 29 skipped, 0 failed (183 total)
```

The catalog test itself exercises changed/missing/wrong/added/moved/removed descriptor oracles. The worker's
temporary canonical-journal identity mutation produced exit `1` before regeneration and is restored:
`git diff --quiet -- apps/integrator/src deploy/postgres apps/webapp/db/drizzle-migrations` returned `0` before
this report was created.

## D20 fixture and application-boundary result

The common harness requires the requested context mode and accepts only `bcb_webapp_dev` or a database identifier
ending in `_test`. Its admin fixture socket is unavailable until `assertTestDatabases()` succeeds, and then invokes
the existing local PostgreSQL admin socket for the already-resolved database name. Port-context fixture work uses
`app_tenant_service`; runtime delivery work uses `app_operational_delivery_worker`.

The three changed live suites use per-run UUID-derived identifiers (`d10b-${randomUUID()}` or
`d987-${randomUUID()}`), guarded setup, and `afterAll` cleanup. Product enqueue/reclaim/claim and journal writes go
through the real application adapters/write ports under accepted port-context; setup and cleanup alone use the
guarded admin socket. No runtime INSERT/DELETE grant or test-only function/capability is present. The preserved D4
suite now gates on `DB_PRINCIPAL_CONTEXT_MODE=port-context` and exercises the actual application boundary.

Targeted checks:

```text
pnpm --dir apps/integrator typecheck
# exit 0

pnpm --dir apps/webapp exec tsc --noEmit
# exit 0

pnpm --dir apps/integrator exec vitest run \
  src/infra/db/repos/messageLogs.deliveryAttemptAudit.test.ts \
  src/infra/db/repos/operatorDeliveryAttempts.test.ts \
  src/infra/runtime/worker/operatorDeliveryAttemptWritePort.test.ts \
  src/infra/db/repos/outgoingDeliveryQueue.namedRoot.unit.test.ts
# exit 0; 4 files, 15 tests passed

pnpm --dir apps/integrator exec eslint \
  src/infra/db/realPostgresIntegrationTestHarness.ts \
  src/infra/db/runIntegratorSql.integration.test.ts \
  src/infra/db/repos/outgoingDeliveryQueue.reclaim.integration.test.ts \
  src/infra/db/repos/operatorDeliveryAttempts.integration.test.ts \
  src/infra/db/directPublic/writeReminderRulesDirect.rls.integration.test.ts \
  src/infra/db/repos/outgoingDeliveryQueue.namedRoot.unit.test.ts \
  src/infra/db/repos/jobQueue.ts src/infra/db/repos/outgoingDeliveryQueue.ts
# exit 0

git diff --check cfde2193aaeaf2db7f472e1e9833c3070f24447b...HEAD
# exit 0
```

## Preserved kill-set

- D10 mechanical drop kill-set: **killed 1, missed 0**, accepted from the recorded independent audit and not
  repeated per brief.
- D20 privilege/principal kill-set K1–K5: **killed 5, missed 0**. Current code removes the rejected patient grant,
  uses the delivery-worker accepted context, preserves the tenant boundary, keeps generated truth derived, and
  converts the four live suites to guarded port-context execution.
- D10a canonical-journal behavioral kill-set: **killed 3, missed 0**; the three focused unit files remain green.
- Convergence callsite-catalog mutation: **killed 1, missed 0**; exit `1` on the mutation, then restored and 5/5.

No temporary injection remains. No additional blind D10 audit was invented.

## Named post-land live gate

The read-only command used to classify the live state was:

```text
sudo -n -u postgres psql -X -A -F '|' -h /var/run/postgresql -p 5432 \
  -d bcb_webapp_dev -v ON_ERROR_STOP=1 -c "BEGIN READ ONLY; SELECT current_database() AS database_name, current_user AS database_user; SELECT to_regclass('integrator.projection_outbox') IS NOT NULL AS projection_outbox_present, to_regprocedure('app.read_integrator_projection_health(integer)') IS NOT NULL AS projection_root_present, to_regprocedure('app.enqueue_integrator_inbound_reply(text,text,text,integer,uuid)') IS NOT NULL AS old_enqueue_present, to_regprocedure('app.enqueue_integrator_outgoing_delivery(text,text,text,text,integer,timestamp with time zone,uuid)') IS NOT NULL AS new_enqueue_present, to_regprocedure('app.record_operator_delivery_attempt(text,text,text,uuid,text,text,integer,text,text,timestamp with time zone)') IS NOT NULL AS canonical_journal_present; SELECT count(*) AS audited_migration_rows FROM integrator.schema_migrations WHERE version IN ('20260820T210709','20260821T001200'); SELECT count(*) FILTER (WHERE function_identity = to_regprocedure('app.read_integrator_projection_health(integer)')) AS old_projection_capabilities, count(*) FILTER (WHERE function_identity = to_regprocedure('app.enqueue_integrator_outgoing_delivery(text,text,text,text,integer,timestamp with time zone,uuid)')) AS new_enqueue_capabilities FROM app_ext.port_context_capabilities; ROLLBACK;"
```

It returned exit `0`, database `bcb_webapp_dev`, user `postgres`. Exact catalog/ledger results:

- `integrator.projection_outbox`: present;
- `app.read_integrator_projection_health(integer)`: present;
- `app.enqueue_integrator_inbound_reply(...)`: present;
- `app.enqueue_integrator_outgoing_delivery(...)`: absent;
- `app.record_operator_delivery_attempt(...)`: present;
- ledger rows for `20260820T210709` and `20260821T001200`: `0`;
- active old projection-root capability: `1`; active new outgoing-enqueue capability: `0`.

The host identity command `hostname -I` returned an address beginning `151.241.228.122`, the documented DEV/TEST
host. This is the canonical-migration-not-yet-applied case named in the brief, so running the four suites would
measure the old schema rather than the audited product. It is a post-land live gate, not a product PASS or a new
product finding.

After the normal land and sanctioned DEV migration/reconciliation, run in the foreground:

```text
/home/dev/brain/host-orch/run-tests.sh "cd /home/dev/dev-projects/bcb-wt-d20-portcontext-convergence-20260821 && set -a && source /home/dev/dev-projects/BersonCareBot/.env && set +a && RUN_INTEGRATOR_SQL_PERMISSION_TEST=1 RUN_OUTGOING_DELIVERY_RECLAIM_TEST=1 RUN_OPERATOR_DELIVERY_ATTEMPT_TEST=1 RUN_REMINDER_RULES_RLS_TEST=1 USE_REAL_DATABASE=1 pnpm --dir apps/integrator exec vitest run src/infra/db/runIntegratorSql.integration.test.ts src/infra/db/repos/outgoingDeliveryQueue.reclaim.integration.test.ts src/infra/db/repos/operatorDeliveryAttempts.integration.test.ts src/infra/db/directPublic/writeReminderRulesDirect.rls.integration.test.ts"
```

Acceptance is exit `0`, **4 files / 16 tests passed**, followed by an admin-socket residue census for the generated
`d10b-*`/`d987-*` event IDs and reminder fixture rows returning **0**:

```text
sudo -n -u postgres psql -X -A -t -q -h /var/run/postgresql -p 5432 -d bcb_webapp_dev \
  -v ON_ERROR_STOP=1 -c "BEGIN READ ONLY; SELECT 'queue_test_rows=' || count(*) FROM public.outgoing_delivery_queue WHERE event_id LIKE 'd10b-%' OR event_id LIKE 'd987-%'; SELECT 'journal_test_rows=' || count(*) FROM public.notification_delivery_attempts WHERE event_id LIKE 'd987-%'; SELECT 'reminder_test_rows=' || count(*) FROM public.reminder_rules WHERE integrator_rule_id LIKE 'rls-it-%'; ROLLBACK;"
```

This census was also run now and returned exit `0`, `queue_test_rows=0`, `journal_test_rows=0`, and
`reminder_test_rows=0`; it proves the audit left no fixture residue. Until the 16/16 command and a second zero
census pass on the migrated named DEV, the live gate remains open.
