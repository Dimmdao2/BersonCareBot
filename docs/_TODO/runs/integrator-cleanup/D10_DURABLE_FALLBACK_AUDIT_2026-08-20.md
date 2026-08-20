# D10: independent auditor-live report for five durable fallbacks + F1

**Candidate:** `ec15393146444a864ac67c7810584fce49361192`

**Authority:** `WORK_ORDER.md` D10, rules 5.1.4 and 5.1.7. The five direct-public write failures must
remain durable and replayable without restoring the projection HTTP transport. Shared idempotency, delivery
queues, and unrelated service HTTP calls remain out of scope for removal.

**Verdict:** **FAIL**

Queue-ready verdict:

> **FAIL, one product blocker.** Commit `ec1539314` registers `worker:direct-public-write-retry-tick`, but its real replay boundary is unusable for all five new operations: under the registered infra source and the real Drizzle DB port, the three occurrence operations fail `42501 accepted port context required`, `reminder_delivery_log_append` fails `42501 permission denied for table reminder_delivery_events`, and `content_access_grant_upsert` fails `42501 permission denied for table content_access_grants_webapp`. `directPublicWriteRetryWorker.ts:40-75` re-enters only an organization principal; `writeReminderProjectionDirect.ts:50-102` then invokes a webapp-only capability or tables whose declared writes are `app_staff`-only (`declaration.ts:2806-2809`, `relation-access.ts:3050-3103,7046-7080`). Thus durable rows can be claimed but every replay is rescheduled/DLQ instead of delivered. Boundary coverage was strengthened to exact operation/org/idempotency/payload; two independent corruptions are now killed (`0 missed / 2 killed`). Generator `--check` and `--census` pass but faithfully generate the insufficient declaration. D10 zero-producer census is independently **YES** by content scenarios, both applications, and the required `code-search` query. **NOT DONE:** full claim-to-replay ticks on DEV, because `to_regclass('integrator.direct_public_write_retries')` is NULL and migrations were explicitly forbidden; no migration was applied and `feat/doctor-ui-rebuild` was not touched.

## Blind failure list

The following kill set was recorded before reading candidate tests:

1. Any of the five direct writers fails and no durable retry row is recorded.
2. Retry persistence receives the wrong operation, organization, idempotency key, or payload.
3. The registered retry worker reaches neither claim nor replay because its source/capability/privileges are
   incomplete.
4. Any of the seven durable operations does not cross the real `INSERT ... ON CONFLICT
   (idempotency_key) DO NOTHING` boundary with exact arguments.
5. The claimed zero-producer census misses a producer in content, either application, or semantic search.

## Finding F1 — all five new retries are unreplayable

The source itself is registered consistently:

- `apps/integrator/src/infra/db/withClient.ts:97,110` permits it and maps it to the delivery-worker role;
- `deploy/postgres/privileges/declaration.ts:2213` includes it in `INTEGRATOR_DELIVERY_SOURCES`;
- `apps/integrator/src/infra/runtime/worker/directPublicWriteRetryWorker.ts:83-87` enters that source before
  reclaim/claim.

The failure happens at the next boundary. `executeDirectPublicWriteRetry` wraps every replay only in
`runWithOrganizationPrincipal` (`directPublicWriteRetryWorker.ts:40-75`), then:

- occurrence sent/failed/expired call `app.record_reminder_occurrence_finalized_projection` through
  `runIntegratorSql` (`writeReminderProjectionDirect.ts:46-58`), while the declared capability is owned by the
  webapp port (`declaration.ts:2806-2809`);
- reminder delivery inserts `public.reminder_delivery_events` (`writeReminderProjectionDirect.ts:61-75`), but
  `relation-access.ts:7046-7080` declares INSERT only for `app_staff`;
- content grant inserts/updates `public.content_access_grants_webapp`
  (`writeReminderProjectionDirect.ts:78-102`), but `relation-access.ts:3050-3103` declares those writes only for
  `app_staff` (the tenant-service grant below that range updates only `platform_user_id`).

A one-off diagnostic harness used the normal `createDbPort`, Drizzle `sql`, the canonical DEV env, and the real
`worker:direct-public-write-retry-tick` infra principal. It was deleted after the run. Catalog evidence from
`bcb_webapp_dev` was:

```text
retry_table: null
occurrence_execute: true
delivery_insert: false
content_insert: false
```

The real executor outcomes for the five operations were:

```text
reminder_occurrence_sent_record    -> 42501 accepted port context required
reminder_occurrence_failed_record  -> 42501 accepted port context required
reminder_occurrence_expired_record -> 42501 accepted port context required
reminder_delivery_log_append       -> 42501 permission denied for table reminder_delivery_events
content_access_grant_upsert        -> 42501 permission denied for table content_access_grants_webapp
```

The real worker tick passed the source allowlist and reached PostgreSQL, then stopped before claim with `42P01`
because `integrator.direct_public_write_retries` is absent on DEV. This environment gap is not the finding: the
five executor failures above reproduce against existing objects and match the checked-in privilege declaration.
The achievable impact is that each claimed durable row retries until DLQ without completing its public write.

## Boundary test and fault injection

The candidate repository boundary test covers all seven operations using the actual Drizzle statement and checks
both SQL text (`INSERT` plus `ON CONFLICT (idempotency_key) DO NOTHING`) and exact parameter order
`[operation, organizationId, idempotencyKey, JSON.stringify(payload)]`.

The candidate write-port test did not initially verify exact keys or payloads: two independent product mutations
both stayed green:

1. replace the delivery-log stable id with `audit-corrupt-id`;
2. replace the content-grant `contentId` before enqueue with `audit-corrupt-content`.

The audit permanently strengthened `writePort.directProjectionFallback.test.ts` to calculate and assert the exact
operation, organization, idempotency key, and complete payload for all five new fallbacks. With the same two
mutations re-applied, exactly two parameterized cases failed; both production mutations were then reverted.

Final mutation score for the independently exercised pair: **0 missed / 2 killed**.

## D10 zero-producer census (rule 5.1.7)

**YES — no active producer remains outside the transport scheduled for D10 removal.** The three independent
sources were checked as follows:

1. Content scenarios:

   ```bash
   rg -n 'emit|projection|outbox|enqueue' apps/integrator/src/content --glob '*.json' --glob '*.md' | wc -l
   # 0
   ```

2. Code of both applications: exact searches for `.emit(`, `enqueueProjectionEvent(`,
   `tryEmitWebappProjectionThenEnqueue(`, imports from `projectionFanout`, and references to
   `projection_outbox` found only the transport definitions/worker. After excluding
   `projectionFanout.ts`, `projectionOutbox.ts`, and `projectionWorker.ts`, the sole textual match was a retired
   path mentioned in a comment in `writeSupportQuestionsDirect.ts`; there was no executable call or import.

3. Required lexical/semantic inventory command:

   ```bash
   node /home/dev/brain/tools/code-search.mjs "webapp events emit projection outbox" --repo bcb -k 20
   ```

   Its live-code results were `projectionWorker.ts`, `projectionFanout.ts`, and the webapp ingest error
   classifier; the other hits were archive documentation. No producer outside the remaining transport appeared.

This census permits moving to the D10 transport-removal stage. It does not make the five durable replay paths
acceptable: they are explicitly preserved infrastructure and currently fail as described in F1.

## Other boundaries

- `git diff-tree --no-commit-id --name-only -r ec1539314 | rg 'migrations/|drizzle-migrations/'` found no
  migration file. No migration command was executed.
- New database access is Drizzle `sql` through `runIntegratorSql`/`DbPort`; the candidate diff contains no new
  `.query(` raw PostgreSQL path.
- `git branch --contains ec1539314` listed only `wt/d10-transport-removal-20260820`;
  `feat/doctor-ui-rebuild` remained at `d509c4fd1da2a3e61bf0aa11a35ba5b76356c3a1` and was not checked out,
  merged, pushed, or modified.
- Shared idempotency, delivery queues, and unrelated service HTTP calls were not removed.

## Validation executed by auditor

- Candidate suite:
  `pnpm --dir apps/integrator exec vitest run src/infra/db/repos/directPublicWriteRetry.unit.test.ts
  src/infra/db/writePort.directProjectionFallback.test.ts
  src/infra/db/writePort.reminderOccurrenceHistory.test.ts
  src/infra/runtime/worker/directPublicWriteRetryWorker.test.ts
  src/infra/runtime/worker/directPublicWriteRetryWorker.principal.unit.test.ts` — **5 files, 16 tests passed**.
- Final write-port plus real INSERT boundary suite:
  `pnpm --dir apps/integrator exec vitest run src/infra/db/writePort.directProjectionFallback.test.ts
  src/infra/db/repos/directPublicWriteRetry.unit.test.ts` — **2 files, 12 tests passed** without mutations;
  with both audit mutations, **2 cases failed and 3 passed** in the write-port file; after restoration both files
  returned green.
- `node deploy/postgres/privileges/generate-cli.mjs --check` — **PASS**, DEV/TEST generated privilege artifacts
  match the declarations byte-for-byte.
- `node deploy/postgres/privileges/generate-cli.mjs --census` — **PASS**, checked 219 ACTIVE relations across
  3325 source files.
- `pnpm --dir apps/integrator typecheck` — **PASS**.

**NOT DONE:** a full real claim-to-replay tick for each queued operation. The named DEV database has no
`integrator.direct_public_write_retries` relation, and the brief forbids applying migrations. The real tick and
all five executor boundaries were still exercised far enough to distinguish the missing-table blocker from the
independent five-operation `42501` product failure. No product fix was made by the auditor.
