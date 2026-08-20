# D10: independent replay-principal privilege/RLS audit

**Candidate:** `1cfaf113b5975ff3e7716e07096da75d6484fda1`

**Authority:** `WORK_ORDER.md` D10 and rule 5.1.4; `AGENTS.md` §5, §6, §24.4–24.5 and
the rule that migrations never grant or revoke privileges.

**Verdict:** **FAIL**

Queue-ready verdict:

> **FAIL, delivery replay no longer has a tenant backstop on three new targets.** `DirectPublicWriteRetryRow` stores `organizationId` separately from `payload`, but claim/replay never verifies equality; all three new replay branches pass the payload directly to their writer. The declared policies then permit `app_operational_delivery_worker` unconditionally on `public.reminder_delivery_events` and `public.content_access_grants_webapp`, including cross-tenant INSERT and content-grant UPDATE/SELECT. A new DB-free acceptance test supplies retry org A with payload org B: all three cases incorrectly resolve and call the writer (`3 failed / 3 passed`). The occurrence `SECURITY DEFINER` checks only that payload `(platform_user_id, organization_id)` is an active enrollment; it does not bind that organization to the durable retry row or verify occurrence↔organization. The sibling pattern is mixed: `outgoing_delivery_queue` is deliberately cross-tenant for this role, while `notification_delivery_attempts` writes use org-scoped `app_tenant_service`; therefore the candidate matches the queue worker pattern but expands it onto product tables without the queue/payload consistency wall required by D10/5.1.4. **NOT DONE:** post-reconcile own-org/foreign-org PostgreSQL proof: DEV reports the migration tag absent and zero new delivery-worker column grants, so both diagnostic variants still fail `42501`; no migration or reconcile was applied.

## Blind failure list

Recorded before reading candidate tests:

1. A forged payload organization must not let a claimed retry read or write another tenant; RLS must remain an
   independent backstop if application validation is absent.
2. Compare the new policies with `outgoing_delivery_queue` and `notification_delivery_attempts` for the same
   delivery flow.
3. Column-limited `SELECT(platform_user_id)` must not become an all-tenant row read.
4. The occurrence `SECURITY DEFINER` must validate the business relationship, not merely accept the new context.
5. Independently distinguish own-org success from foreign-org rejection on the live DB, without applying the
   pending migration.
6. Two occurrence named-context descriptors are acceptable only if their role/context partition cannot be one
   parameterized descriptor.

Items 1, 3–5 are repeatable access behavior. Items 2 and 6 are declaration/architecture inspection.

## Finding F1 — retry/payload organization mismatch reaches cross-tenant writers

This is a reachable access-boundary defect, not style:

- `directPublicWriteRetry.ts:28-36,60-100` loads `retry.organizationId` and `retry.payload` independently and casts
  the JSON payload without validation.
- `directPublicWriteRetryWorker.ts:60-78` sends occurrence, delivery-log and content-grant payloads directly to
  the writers and never compares their `organizationId` with `retry.organizationId`.
- `writeReminderProjectionDirect.ts:74-115` writes `input.organizationId`. The content upsert can also change
  `organization_id` on conflict, so a foreign `integrator_grant_id` can move/update an existing row.
- `declaration.ts:7131-7132` emits `THEN true` for the delivery role on both tables. Generated DEV SQL grants
  `SELECT(platform_user_id)`, INSERT and UPDATE on content grants, and INSERT on reminder delivery events.

The permanent acceptance test added to `directPublicWriteRetryWorker.test.ts` uses retry org
`a000…001` with payload org `a000…002`. Command:

```bash
pnpm --dir apps/integrator exec vitest run src/infra/runtime/worker/directPublicWriteRetryWorker.test.ts
```

Result: exit `1`; `6 tests`, `3 failed / 3 passed`. Each foreign occurrence/delivery/content replay resolved
instead of rejecting and reached its writer. This failing test is the handoff oracle; no product fix was made.

### RLS backstop answer

**Hole.** For the new two direct-table policies, RLS proves only that the accepted service capability is active;
it no longer relates the row's `organization_id` to the durable retry row. Application code also has no equality
check. Consequently neither layer rejects payload org B after claiming a retry belonging to org A.

### Sibling answer

- `outgoing_delivery_queue`: same role, deliberately cross-tenant. Generated policy is
  `current_user = 'app_operational_delivery_worker'`; its declaration says the worker claims cross-tenant queue
  rows. The candidate matches this operational-queue pattern.
- `notification_delivery_attempts`: it grants no direct access to `app_operational_delivery_worker`; the
  `app_tenant_service` INSERT/SELECT policies require `organization_id = current_org_id()` (and patient/member
  checks for INSERT). The candidate does not match this tenant writer.

Thus the siblings do not establish one universal org-scoped worker pattern. They do show the missing boundary:
cross-tenant access is established for claiming an operational queue, while product-table writes previously used
the explicit org principal required by 5.1.4. Extending the queue privilege shape to mutable product rows without
checking retry org versus payload org is the defect.

## Content-grant SELECT surface

The existing integrator writer contains no explicit `SELECT ... FROM content_access_grants_webapp` that returns
`platform_user_id`; exact `rg` and the required `code-search` found only the upsert. However that upsert already
reads the conflicting row's `platform_user_id` through
`COALESCE(EXCLUDED.platform_user_id, content_access_grants_webapp.platform_user_id)`. More importantly, the
declared column grant plus unconditional RLS physically authorizes an arbitrary accepted delivery-worker relation
query to read `platform_user_id` across all organizations. This is an expanded database attack surface even though
the current code has no exfiltrating SELECT callsite.

Search evidence:

```bash
node /home/dev/brain/tools/code-search.mjs "content_access_grants_webapp platform_user_id SELECT integrator delivery worker" --repo bcb -k 20
rg -n "content_access_grants_webapp|contentAccessGrantsWebapp" apps/integrator/src apps/webapp/src packages --glob '!**/*.test.*'
```

## Occurrence root and descriptor consolidation

The pending function body still performs an active `org_enrollments` check for the payload
`(p_platform_user_id, p_organization_id)`. It does not inspect `integrator.user_reminder_occurrences`, bind
`p_integrator_occurrence_id` to an organization, or see the durable retry row. A valid patient+foreign-org tuple
therefore passes this inner check even when the claimed retry belongs to another organization.

The two integrator descriptors are **not** a §5 duplicate. They share one function identity and one call adapter,
`runIntegratorNamedRoot`; `integratorPortContextPrincipal` selects exactly one descriptor by principal kind and
context class. Foreground organization calls require `app_tenant_service / tenant_service`; durable infra replay
requires `app_operational_delivery_worker / service`. One descriptor cannot encode both target roles/context
classes, so the split is the declared parameter partition of the single root.

## Migration and privilege ownership

The migration changes only the function body. This exact command returned no matches:

```bash
rg -n "GRANT|REVOKE|CREATE ROLE|ALTER ROLE|ALTER DEFAULT PRIVILEGES|CREATE POLICY" \
  apps/webapp/db/drizzle-migrations/20260820T112313_reminder_occurrence_delivery_capability.sql
```

Grants and policies are declared in `declaration.ts` / `relation-access.ts` and rendered by the privilege
generator, so the candidate follows the rule that migrations never change rights.

## Validation

Candidate suite, before adding the acceptance test:

```bash
pnpm --dir apps/integrator exec vitest run \
  src/infra/db/repos/directPublicWriteRetry.unit.test.ts \
  src/infra/db/writePort.directProjectionFallback.test.ts \
  src/infra/db/writePort.reminderOccurrenceHistory.test.ts \
  src/infra/runtime/worker/directPublicWriteRetryWorker.test.ts \
  src/infra/runtime/worker/directPublicWriteRetryWorker.principal.unit.test.ts
```

Result: exit `0`; `5 files / 17 tests passed`.

```bash
node --test deploy/postgres/privileges/*.test.mjs
```

Result: exit `0`; `176 tests`, `151 passed / 25 skipped`. The candidate's declaration test explicitly accepts
the unconditional worker predicate; it does not test tenant behavior.

```bash
node deploy/postgres/privileges/generate-cli.mjs --check
node deploy/postgres/privileges/generate-cli.mjs --census
```

Result: exit `0`; generated DEV/TEST artifacts match byte-for-byte; census checked `219 ACTIVE relations across
3325 source files` in each database target.

```bash
pnpm --dir apps/integrator exec eslint \
  src/infra/runtime/worker/directPublicWriteRetryWorker.test.ts
pnpm --dir apps/integrator typecheck
```

Result: both exit `0`.

## Live diagnostic and NOT DONE

Read-only DEV catalog command (administrative socket, explicit database) reported:

```bash
sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev \
  -v ON_ERROR_STOP=1 -Atc "SELECT 'current_database=' || current_database()
  UNION ALL SELECT 'retry_table=' || COALESCE(
    to_regclass('integrator.direct_public_write_retries')::text, 'null')
  UNION ALL SELECT 'migration_applied=' || EXISTS (
    SELECT 1 FROM drizzle.__drizzle_migrations
    WHERE tag = '20260820T112313_reminder_occurrence_delivery_capability')::text
  UNION ALL SELECT 'new_worker_column_grants=' || count(*)::text
  FROM information_schema.column_privileges
  WHERE grantee = 'app_operational_delivery_worker'
    AND table_schema = 'public'
    AND table_name IN ('content_access_grants_webapp', 'reminder_delivery_events');"
```

```text
current_database = bcb_webapp_dev
retry_table = null
migration_applied = false
new app_operational_delivery_worker column grants on the two tables = 0 rows
```

An independent one-off TypeScript harness then used the real `createDbPort`, the exact
`worker:direct-public-write-retry-tick` delivery capability, and a transaction that rolls back any successful
write. It was deleted after the run. Current DEV results:

```text
delivery own organization                 -> 42501 permission denied for table reminder_delivery_events
delivery foreign payload organization     -> 42501 permission denied for table reminder_delivery_events
content own organization                  -> 42501 permission denied for table content_access_grants_webapp
content foreign payload organization      -> 42501 permission denied for table content_access_grants_webapp
```

**NOT DONE:** post-reconcile PostgreSQL proof that own-org succeeds and foreign-org rejects/succeeds. The checked-in
new grants/policies and migration are not installed on DEV, and the brief forbids applying the migration. No
migration, reconcile, PROD/TEST action, or product fix was performed. Full CI was not run because targeted
integrator and complete privilege-generator suites already isolate the finding.
