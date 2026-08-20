# D10a / D16 consolidation census — 2026-08-20

Authority: `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md`, D10a and D16 (including their 20.08 notes).

## Result

`integrator.delivery_attempt_logs` is **not ready to drop**. There is one active application writer and two
registered, live CLI readers. The readers are outside this worker's allowed file scope (`apps/webapp/src/**`
only), so redirecting them would require an orchestrator scope change. No migration was created: preparing a
DROP migration while these consumers remain would violate D10a's explicit zero-producer/zero-reader gate.

## Producer census

### Legacy table: one active application path

| Path | Evidence | Result |
| --- | --- | --- |
| `apps/integrator/src/infra/db/repos/messageLogs.ts:77-96` | `insertDeliveryAttemptLog()` invokes the existing named root `app.record_operational_delivery_attempt_audit(text,text,text,uuid,text,text,integer,text,text,timestamp with time zone)`. | **Writer 1.** |
| `deploy/postgres/generated/prod-to-target/schema-pre.sql:16775-16827` | The named root validates the input and executes `INSERT INTO integrator.delivery_attempt_logs`. | Confirms the destination of writer 1. |
| `apps/integrator/src/infra/db/writePort.ts:19, 900-1000` | The `delivery.attempt.log` branch calls `insertDeliveryAttemptLog()` before the separate support-delivery projection/fallback path. | The writer is reachable from production write handling. |

`deploy/postgres/c4-operational-runtime.sql:926-996` also defines a different nine-argument overload of
`app.record_operational_delivery_attempt_audit` which inserts into the old relation and grants it to the delivery
worker. `deploy/host/provision-c4-operational-runtime.sh` provisions that overlay. It is not called by an
`apps/integrator/src` caller found in this census, but it can reintroduce a legacy writer whenever that overlay is
provisioned. It is outside the permitted file scope and must be reconciled with the ten-argument named-root
contract before a DROP is applied.

### Already-canonical path (not a legacy writer)

`apps/integrator/src/infra/db/repos/operatorDeliveryAttempts.ts:19-21` calls
`app.record_operator_delivery_attempt(...)`. Its generated target definition at
`deploy/postgres/generated/prod-to-target/schema-pre.sql:16830-16915` writes
`public.notification_delivery_attempts` after resolving the matching
`public.outgoing_delivery_queue` row. This is the existing consolidation point named in D10a's 05.08 note; it
does not write `integrator.delivery_attempt_logs`.

## Reader census and field coverage

### Runtime dashboards

No `apps/webapp/src/**` or `apps/integrator/src/**` query reads `integrator.delivery_attempt_logs` directly.
The operator notification-health reader is already canonical:

- `apps/webapp/src/infra/repos/pgNotificationDeliveryAttempts.ts:74-172` reads
  `public.notification_delivery_attempts` for `channel`, `status`, `created_at`,
  `provider_status_code`, `reason`, `error_message`, `topic_code`, `recipient_ref`, and `user_id`.
- `apps/webapp/db/schema/notificationDeliveryAttempts.ts:15-54` declares each of those fields.

Thus every field read by the live alerting/operator-health dashboard is present in the public relation. The
old writer's extra audit facts (`attempt`, `correlation_id`, `payload_json`, and the original `occurred_at`) are
not dashboard inputs. A future redirect of that writer must preserve them in canonical `metadata` and set
`created_at` from `occurred_at`; creating a second writer/wrapper would violate the existing-consolidation-point
rule.

### Registered CLI readers — blocking

| Path | Legacy fields read | Why this is live |
| --- | --- | --- |
| `apps/webapp/scripts/backfill-communication-history.mjs:298-302` | `id`, `intent_event_id`, `correlation_id`, `channel`, `status`, `attempt`, `reason`, `payload_json`, `occurred_at` | Registered as `backfill-communication-history` in `apps/webapp/package.json:28`; referenced by `deploy/DATA_MIGRATION_CHECKLIST.md:29`. |
| `apps/webapp/scripts/reconcile-communication-domain.mjs:128-134` | `intent_event_id` | Registered in `apps/webapp/package.json:30`; `scripts/stage6-release-gate.mjs:44-46` runs it. |

The reconciliation reader can map `intent_event_id` to canonical `event_id`. The backfill reader cannot be
blindly redirected: the canonical relation has no legacy numeric id, separate `correlation_id`, `attempt`, or
`payload_json` columns (only `metadata`), so its existing support-history projection semantics need an explicit
redesign. These files are excluded by the brief's `apps/webapp/src/**` file guard. No unrequested change was made.

## D16: independent delivery-cycle census

PASS for the stated condition: there is one polling delivery consumer of
`public.outgoing_delivery_queue`.

- `apps/integrator/src/infra/runtime/worker/main.ts:83-102` is the only loop that calls
  `runOutgoingDeliveryWorkerTick`; its principal source is `worker:outgoing-delivery-tick`.
- `apps/integrator/src/infra/runtime/worker/outgoingDeliveryWorker.ts:1218-1223` is the only production path
  found that claims due outgoing-delivery rows (`claimDueOutgoingDeliveries`).
- `apps/integrator/src/infra/db/repos/jobQueue.ts:115-123` retains a compatibility diagnostic helper, but its
  comment and implementation delegate to the same queue helper; no production caller was found.

The other worker loops are not a second delivery cycle: `projectionOutboxLoop`
(`worker/main.ts:59-70`) polls `integrator.projection_outbox`, and `directPublicWriteRetryLoop`
(`worker/main.ts:71-81`) polls `integrator.direct_public_write_retries`. The scheduler loop at
`apps/integrator/src/infra/runtime/scheduler/main.ts:141-159` runs `lockedTick.runTick()` and does not claim the
outgoing-delivery queue.

## Commands and outputs

```text
node /home/dev/brain/tools/code-search.mjs 'integrator delivery_attempt_logs' --repo bcb -k 80
node /home/dev/brain/tools/code-search.mjs 'notification_delivery_attempts' --repo bcb -k 80
node /home/dev/brain/tools/code-search.mjs 'outgoing delivery worker outgoing_delivery_queue polling' --repo bcb -k 80
```

Those searches located the delivery-attempt repositories, the canonical notification relation, and the outgoing
worker. Exact follow-up searches produced the decisive results:

```text
rg -n -i '\\b(insert into|update|delete from|select .* from|from)\\s+(integrator\\.)?delivery_attempt_logs\\b' apps/integrator apps/webapp -g '*.ts' -g '*.mjs' -g '*.sql'
apps/webapp/scripts/reconcile-communication-domain.mjs:130: SELECT intent_event_id FROM delivery_attempt_logs ...
apps/webapp/scripts/backfill-communication-history.mjs:302: FROM delivery_attempt_logs ORDER BY occurred_at ...

rg -n -C 4 'record_operational_delivery_attempt_audit' apps/integrator/src/infra/db/repos/messageLogs.ts apps/integrator/src/infra/db/writePort.ts
apps/integrator/src/infra/db/repos/messageLogs.ts:81: app.record_operational_delivery_attempt_audit(...)
apps/integrator/src/infra/db/repos/messageLogs.ts:94: SELECT app.record_operational_delivery_attempt_audit(...)

rg -n -C 8 'while \\(true\\)' apps/integrator/src -g '*.ts'
apps/integrator/src/infra/runtime/worker/main.ts:60: while (true)  # projection
apps/integrator/src/infra/runtime/worker/main.ts:72: while (true)  # direct-public retry
apps/integrator/src/infra/runtime/worker/main.ts:84: while (true)  # outgoing delivery
apps/integrator/src/infra/runtime/scheduler/main.ts:141: while (true) # scheduler
```

## NOT DONE

- No `apps/webapp/db/drizzle-migrations/YYYYMMDDTHHMMSS_*.sql` DROP migration was prepared, and
  `migrate-dev.sh --execute` was **not** run. The migration condition is false until the writer, both registered
  CLI readers, and the C4 overlay are reconciled.
- No `deploy/postgres/privileges/declaration.ts` or relation-access declaration was changed; removing the
  declaration before the table can safely be dropped would make privilege reconciliation inconsistent.
- No deploy, grant/RLS change, database operation, or migration application was performed.
