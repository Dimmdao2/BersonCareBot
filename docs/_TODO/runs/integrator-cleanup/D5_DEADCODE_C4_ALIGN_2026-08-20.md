# D5 / D10a — dead support mirror and stale C4 declaration — 2026-08-20

Authority: `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md`, D20 (closed 20.08, item 2) and D10a (finding measured 20.08). This pass made no deployment, provisioning, migration, or database write. The two catalog inspections below used `BEGIN READ ONLY` followed by `ROLLBACK`.

## Item A — `mirrorPatientUserMessageToWebapp`

All three required sources prove that the mirror has no caller.

1. Exact source-name search across `*.ts` / `*.tsx` / `*.mjs`, excluding `dist` and `node_modules`:

   ```text
   $ rg -n --glob '*.{ts,tsx,mjs}' --glob '!**/dist/**' --glob '!**/node_modules/**' '\\bmirrorPatientUserMessageToWebapp\\b' .
   ./apps/integrator/src/kernel/domain/support/webappSupportSync.ts:25:export async function mirrorPatientUserMessageToWebapp(
   ```

   The only match was its export declaration.

2. Meaning-based repository search:

   ```text
   $ node /home/dev/brain/tools/code-search.mjs "mirrorPatientUserMessageToWebapp caller support user message mirror" --repo bcb -k 30
   # code-search: «mirrorPatientUserMessageToWebapp caller support user message mirror» · репо bcb · лексический BM25
   • bcb/apps/integrator/src/kernel/domain/support/webappSupportSync.ts:1-50
   • bcb/apps/integrator/src/kernel/domain/support/webappSupportSync.ts:41-90
   • bcb/apps/integrator/src/infra/db/directPublic/writeSupportQuestionsDirect.ts:1-50
   ```

   The only result for the mirror itself was the declaration/body. The remaining ranked support-write results are direct canonical support code, not a call path to this function.

3. Indirect reachability (barrel/re-export/dynamic import/dispatch string):

   ```text
   $ rg -n --glob '*.{ts,tsx,mjs}' --glob '!**/dist/**' --glob '!**/node_modules/**' 'from .*(webappSupportSync|webappSupportSync\\.js)|import\\(.+webappSupportSync|require\\(.+webappSupportSync|webappSupportSync' apps
   (no matches)

   $ rg -n --glob '*.{ts,tsx,mjs}' --glob '!**/dist/**' --glob '!**/node_modules/**' 'sync-user-message|syncSupportUserMessage|support/sync' apps
   apps/integrator/src/infra/adapters/webappEventsClient.ts:245:        path: '/api/integrator/support/sync-user-message',
   apps/integrator/src/kernel/domain/support/webappSupportSync.ts:40:  const sync = deps.webappEventsPort?.syncSupportUserMessage;
   apps/integrator/src/kernel/contracts/ports.ts:394:  /** Единый webapp-thread: сообщение пациента из бота (POST /api/integrator/support/sync-user-message). */
   apps/webapp/src/app/api/integrator/support/sync-user-message/route.ts:13: * POST /api/integrator/support/sync-user-message — M2M: сообщение пациента из бота → единый webapp-thread.
   ```

The additional exact check for the port method had only these three locations before deletion — interface, adapter implementation, and the removed mirror's property lookup:

```text
$ rg -n --glob '*.{ts,tsx,mjs}' --glob '!**/dist/**' --glob '!**/node_modules/**' '\\bsyncSupportUserMessage\\b' .
./apps/integrator/src/infra/adapters/webappEventsClient.ts:238:    async syncSupportUserMessage(...)
./apps/integrator/src/kernel/domain/support/webappSupportSync.ts:40:  const sync = deps.webappEventsPort?.syncSupportUserMessage;
./apps/integrator/src/kernel/contracts/ports.ts:395:  syncSupportUserMessage?(...)
```

Removed:

- `mirrorPatientUserMessageToWebapp` from `webappSupportSync.ts`;
- the now-orphaned `WebappEventsPort.syncSupportUserMessage` declaration;
- its `createWebappEventsPort` adapter method and signed HTTP path.

Deliberately left: `apps/webapp/src/app/api/integrator/support/sync-user-message/route.ts`, per this pass's scope. Live neighbouring support port methods remain untouched.

## Item B — C4 vs privilege generator

All four checks agree on the ten-argument, organization-scoped function.

1. Read-only `pg_proc` catalog inspections:

   ```text
   $ sudo -n -u postgres psql -X -d bcb_webapp_dev -v ON_ERROR_STOP=1 -c "BEGIN READ ONLY; ...; ROLLBACK;"
    schema |                  proname                  | arguments
   --------+-------------------------------------------+-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
    app    | record_operational_delivery_attempt_audit | p_intent_type text, p_intent_event_id text, p_correlation_id text, p_organization_id uuid, p_channel text, p_status text, p_attempt integer, p_reason text, p_payload_text text, p_occurred_at timestamp with time zone
   (1 row)

   $ sudo -n -u postgres psql -X -d bersoncarebot_test -v ON_ERROR_STOP=1 -c "BEGIN READ ONLY; ...; ROLLBACK;"
    schema |                  proname                  | arguments
   --------+-------------------------------------------+-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
    app    | record_operational_delivery_attempt_audit | p_intent_type text, p_intent_event_id text, p_correlation_id text, p_organization_id uuid, p_channel text, p_status text, p_attempt integer, p_reason text, p_payload_text text, p_occurred_at timestamp with time zone
   (1 row)
   ```

2. Generator output contains only the ten-argument signature:

   ```text
   $ rg -n --only-matching "app\\.record_operational_delivery_attempt_audit\\([^']+\\)" deploy/postgres/generated/privileges.bcb_webapp_dev.sql deploy/postgres/generated/port-context-capabilities.bcb_webapp_dev.sql
   deploy/postgres/generated/privileges.bcb_webapp_dev.sql:1034:app.record_operational_delivery_attempt_audit(text,text,text,uuid,text,text,integer,text,text,timestamp with time zone)
   deploy/postgres/generated/port-context-capabilities.bcb_webapp_dev.sql:41:app.record_operational_delivery_attempt_audit(text,text,text,uuid,text,text,integer,text,text,timestamp with time zone)

   $ rg -n --fixed-strings 'app.record_operational_delivery_attempt_audit(text,text,text,text,text,integer,text,jsonb,timestamptz)' deploy/postgres/generated/privileges.bcb_webapp_dev.sql deploy/postgres/generated/port-context-capabilities.bcb_webapp_dev.sql
   (no matches)
   ```

3. Application call site:

   ```text
   $ rg -n --only-matching "app\\.record_operational_delivery_attempt_audit\\([^']+\\)" apps/integrator/src/infra/db/repos/messageLogs.ts
   apps/integrator/src/infra/db/repos/messageLogs.ts:81:app.record_operational_delivery_attempt_audit(text,text,text,uuid,text,text,integer,text,text,timestamp with time zone)
   ```

4. Generated target schema:

   ```text
   $ rg -n --only-matching "app\\.record_operational_delivery_attempt_audit\\([^']+\\)" deploy/postgres/generated/prod-to-target/schema-pre.sql
   deploy/postgres/generated/prod-to-target/schema-pre.sql:16775:app.record_operational_delivery_attempt_audit(p_intent_type text, p_intent_event_id text, p_correlation_id text, p_organization_id uuid, p_channel text, p_status text, p_attempt integer, p_reason text, p_payload_text text, p_occurred_at timestamp with time zone)
   deploy/postgres/generated/prod-to-target/schema-pre.sql:16782:app.record_operational_delivery_attempt_audit(text,text,text,uuid,text,text,integer,text,text,timestamp with time zone)
   ```

Removed from `deploy/postgres/c4-operational-runtime.sql`: the stale nine-argument function declaration writing `integrator.delivery_attempt_logs`, its `ALTER FUNCTION`, both `REVOKE`s, `GRANT EXECUTE`, and its capability-list row. No `DROP FUNCTION` was added.

## Validation

```text
$ pnpm --dir apps/integrator typecheck
integrator_typecheck_exit=2

$ pnpm --dir apps/integrator lint
integrator_lint_exit=1
```

Both commands were executed after the final code correction. They cannot run in this worktree because `apps/integrator/node_modules` is absent: typecheck reports missing Node/package declarations across the project and lint stops at `sh: 1: eslint: not found`. The initial typecheck exposed a locally introduced missing `randomUUID` import; it was restored before the final run. The final output has no unresolved deleted-symbol error; the remaining `node:crypto` diagnostic is the expected missing Node type declaration.

## NOT DONE

- The webapp route remains for a separately scoped decision/removal.
- No migration, deployment, provisioning, database write, or `DROP FUNCTION` was run or added. Removing a pre-existing nine-argument function from environments that have one requires a separately reviewed migration.
- Green integrator typecheck/lint are not available in this worktree until dependencies are installed; installation was outside this bounded cleanup scope.
