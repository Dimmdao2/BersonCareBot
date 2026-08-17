# Patient reminder materializer: named DEV 500 forensic (2026-08-17)

## Scope and result

Read-only forensic against named DEV after the scheduler wake-contract correction at
`11f8541411d33ee65fe778b207f822d32c16959a`. No TEST/PROD access, external delivery, database mutation, server
restart, migration, or product-code change was made.

The scheduler now reaches the signed webapp route with the valid short wake shape, but materialization returns
500 before its first SQL statement. The immediate exception is:

```text
Missing declared webapp port capability: tenant_service
```

The failure is in the runtime boundary between the verified integrator organization principal and
`createPgPatientReminderMaterializationPort().listEnabledRules()`. It is not caused by reminder calculation,
delivery, or an invalid wake payload.

## Runtime evidence

The common DEV log was inspected with:

```bash
rg -n "POST /api/integrator/patient-reminders/materialize-wake 500|POST /api/integrator/patient-reminders/materialize-wake 400" /tmp/bcb-common-dev-20260817.log | tail -n 12
```

It shows the contract transition from 400 to application 500. Relevant lines include:

```text
856: ... POST /api/integrator/patient-reminders/materialize-wake 500 in 46s (... application-code: 1333ms)
1040: ... POST /api/integrator/patient-reminders/materialize-wake 500 in 557ms (... application-code: 510ms)
1072: ... POST /api/integrator/patient-reminders/materialize-wake 500 in 1006ms (... application-code: 948ms)
```

The diagnostic wake contained no credential. Its measured shape was obtained with:

```bash
node -e "const organizationId='a0000000-0000-4000-8000-000000000001'; const wake='sch:50000000-0000-4000-8000-000000000817'; const key='patient-reminder-materialize:'+organizationId+':'+wake; console.log(JSON.stringify({organizationId,wake,wakeLength:wake.length,idempotencyKeyLength:key.length}))"
```

Output:

```json
{"organizationId":"a0000000-0000-4000-8000-000000000001","wake":"sch:50000000-0000-4000-8000-000000000817","wakeLength":40,"idempotencyKeyLength":106}
```

The direct application-port reproduction was run from `apps/webapp` after loading the same DEV environment:

```bash
NODE_ENV=development pnpm exec tsx -e "void (async()=>{ await import('./src/config/loadEnv.ts'); const { runWithDbOrganizationPrincipal } = await import('@bersoncare/db-principal'); const { createPgPatientReminderMaterializationPort } = await import('./src/infra/repos/pgPatientReminderMaterialization.ts'); const sanitize=(value,depth=0)=>depth>5?null:value instanceof Error?{name:value.name,message:value.message,cause:sanitize(value.cause,depth+1)}:value; try { await runWithDbOrganizationPrincipal('a0000000-0000-4000-8000-000000000001',()=>createPgPatientReminderMaterializationPort().listEnabledRules('a0000000-0000-4000-8000-000000000001')); } catch (error) { console.log(JSON.stringify(sanitize(error),null,2)); } })()"
```

Sanitized result:

```text
Failed query: select ... from "reminder_rules" where
  ("reminder_rules"."organization_id" = $1 and "reminder_rules"."is_enabled" = $2)
cause: Missing declared webapp port capability: tenant_service
```

This is a pre-query exception: `webappPortContextPrincipal()` maps an organization principal to descriptor name
`tenant_service`, then `capabilityFor()` rejects it before pool checkout because no such generic descriptor exists.

The descriptor census was measured without printing secrets:

```bash
NODE_ENV=development pnpm exec tsx -e "void (async()=>{ await import('./src/config/loadEnv.ts'); const raw=process.env.WEBAPP_PORT_CONTEXT_CAPABILITIES_JSON; const caps=JSON.parse(raw??'{}'); console.log(JSON.stringify({count:Object.keys(caps).length,hasTenantService:Object.hasOwn(caps,'tenant_service'),tenantNamed:Object.entries(caps).filter(([,v])=>v&&typeof v==='object'&&v.contextClass==='tenant_service').map(([name,v])=>({name,purpose:v.purpose,functionIdentity:v.functionIdentity??null}))},null,2)); })()"
```

Measured result: 176 webapp descriptors, no generic `tenant_service` descriptor, and four exact named
tenant-service roots. This is intentional: `deploy/postgres/privileges/port-context-catalog.test.mjs` explicitly
asserts `webapp.tenant_service === undefined`, alongside the absence of generic `pre_session` and `service`
relation fallbacks.

## Exact source path

The failing path is:

1. `apps/webapp/src/app/api/integrator/patient-reminders/materialize-wake/route.ts` verifies the signed request and
   enters an organization principal.
2. `apps/webapp/src/app-layer/reminders/runPatientReminderMaterializationWake.ts` calls the materialization port.
3. `apps/webapp/src/infra/repos/pgPatientReminderMaterialization.ts` starts with a direct Drizzle select from
   `public.reminder_rules`.
4. `apps/webapp/src/infra/db/portContextRuntime.ts` maps `principal.kind === 'organization'` to the absent generic
   descriptor `tenant_service` and throws.

The route catches the exception and returns only `{ ok: false, error: 'internal_error' }`, so the common DEV log
contains the 500 status but not the nested cause.

## Not the auth-rate SELECT-collapse defect

`deploy/postgres/privileges/declaration.ts` has a special override only for
`app.auth_rate_limit_check_and_record(...)`; it rewrites that function's relation surfaces to
`tableOperations: ['SELECT']`. That override is not applied to the reminder materializer functions.

The defects share the broader class “runtime callsite and declared database capability do not agree”, but this
500 is not the auth-rate relation-operation collapse. It occurs before SQL and before either materializer
function is invoked.

## Further blockers behind the first exception

Adding a broad `webapp.tenant_service` fallback would violate the explicit catalog test and would not make the
path work. Static traversal exposes the following next failures:

1. `listDuePlannedOccurrences()` directly reads `integrator.user_reminder_occurrences` columns
   `rule_id`, `occurrence_key`, `planned_at`, `organization_id`, and `status`, and joins `reminder_rules`. The current
   tenant-service direct relation surface is narrower and does not authorize that query shape.
2. `resolveLinkedTitle()` directly reads `public.content_pages` and `public.content_sections`; these are not a
   tenant-service direct relation surface for this callsite.
3. `materializeOccurrence()` opens a TypeScript/Drizzle transaction, calls
   `app.upsert_patient_reminder_occurrence_plan(...)`, directly upserts `public.outgoing_delivery_queue`, then calls
   `app.mark_patient_reminder_occurrence_queued(...)`. The two functions are declared SECURITY DEFINER roots
   executable by `app_staff`, but there is no webapp named capability/callsite for them, and the queue write remains
   a direct relation mutation.
4. Delivery-target resolution fails independently under the same organization principal while directly reading
   `public.user_channel_bindings`, with the same missing generic capability. Its complete snapshot also traverses
   enrollment, integrator-user projection, topic/preferences/mute, web-push, and email availability.

`runWebappNamedRoot()` cannot simply be inserted inside the current outer relation transaction: it deliberately
rejects a named-root call when the active Drizzle object is already a transaction. Splitting these calls into
separate transactions would also lose the current atomic occurrence/queue/mark guarantee.

## Named DEV data condition

The rule census was performed through the integrator application's existing Drizzle port under an organization
principal. The exact command was:

```bash
pnpm --dir apps/integrator exec tsx -e "void (async()=>{ await import('./src/config/loadEnv.ts'); const { and, count, eq, isNull }=await import('drizzle-orm'); const { createDbPort, closeDb }=await import('./src/infra/db/client.ts'); const { getIntegratorDrizzleSession }=await import('./src/infra/db/drizzle.ts'); const { runWithOrganizationPrincipal }=await import('./src/infra/principal/organizationPrincipal.ts'); const { reminderRules, platformUsers }=await import('./src/infra/db/schema/integratorPublicProduct.ts'); const org='a0000000-0000-4000-8000-000000000001'; try { const result=await runWithOrganizationPrincipal(org,()=>createDbPort().tx(async port=>{ const db=getIntegratorDrizzleSession(port); const [rulesTotal]=await db.select({n:count()}).from(reminderRules).where(eq(reminderRules.organizationId,org)); const [rulesEnabled]=await db.select({n:count()}).from(reminderRules).where(and(eq(reminderRules.organizationId,org),eq(reminderRules.isEnabled,true))); const categories=await db.select({category:reminderRules.category,n:count()}).from(reminderRules).where(and(eq(reminderRules.organizationId,org),eq(reminderRules.isEnabled,true))).groupBy(reminderRules.category); const schedules=await db.select({scheduleType:reminderRules.scheduleType,n:count()}).from(reminderRules).where(and(eq(reminderRules.organizationId,org),eq(reminderRules.isEnabled,true))).groupBy(reminderRules.scheduleType); const topics=await db.select({topic:reminderRules.notificationTopicCode,n:count()}).from(reminderRules).where(and(eq(reminderRules.organizationId,org),eq(reminderRules.isEnabled,true))).groupBy(reminderRules.notificationTopicCode); const orphans=await db.select({id:reminderRules.integratorRuleId,integratorUserId:reminderRules.integratorUserId,category:reminderRules.category,scheduleType:reminderRules.scheduleType,linkedObjectType:reminderRules.linkedObjectType,linkedObjectId:reminderRules.linkedObjectId,topic:reminderRules.notificationTopicCode}).from(reminderRules).where(and(eq(reminderRules.organizationId,org),eq(reminderRules.isEnabled,true),isNull(reminderRules.platformUserId))); const platformFor3=await db.select({id:platformUsers.id}).from(platformUsers).where(eq(platformUsers.integratorUserId,3)); return {observedAt:new Date().toISOString(),rulesTotal:rulesTotal?.n??0,rulesEnabled:rulesEnabled?.n??0,categories,schedules,topics,orphans,platformForIntegratorUser3:platformFor3}; })); console.log(JSON.stringify(result,null,2)); } finally { await closeDb(); } })()"
```

At `2026-08-17T08:21:17.399Z` it returned:

- 46 rules total, 41 enabled.
- Enabled categories: exercise 24, important 1, LFK 16.
- Enabled schedule types: `interval_window` 3, `slots_v1` 38.
- Enabled topics: `warmup_reminders` 32, `training_reminders` 8, null 1.
- Two enabled rules have no canonical `platform_user_id`:
  - `wp-122c3af1-b81f-4602-b2e4-5bb34d84f0eb` — integrator user 3, important, interval window, null topic.
  - `wp-78d3c36d-a390-4dbc-88ea-3b94d6f2f038` — integrator user 3, LFK, interval window,
    `training_reminders`, linked LFK complex `3b0f46f8-e594-41e9-ae94-2c307809bf42`.
- The same query found zero `platform_users` rows for integrator user 3.

Once the capability defect is fixed, either orphan is sufficient for `mapRule()` to abort the whole organization
wake with `patient_reminder_rule_missing_canonical_scope`.

The data correction is separate from the code fix: disable/delete the two obsolete enabled rules, or reconcile
them to a real canonical platform user only if an authoritative mapping exists. Current canonical DEV data does
not provide such a mapping. No cleanup was executed in this forensic task.

## Minimal correction boundary

Do not add a generic relation capability. Preserve the existing TypeScript scheduling/business rules, and replace
the accidental direct-relation path with explicit named roots:

1. A tenant-scoped named read snapshot for enabled rules, due planned occurrences, and linked titles.
2. A tenant-scoped named delivery-target snapshot for the exact target-resolution data traversed by this wake.
3. One atomic named mutation root accepting the planned occurrence and prepared deliveries, and performing the
   occurrence upsert, queue upsert(s), and queued mark in one database transaction.
4. Exact capability descriptors and callsite-catalog coverage for those roots, plus a route/runtime test using a
   real generated port-context descriptor set rather than only mocked application services.
5. Separately clean the two orphan enabled rules before re-running the wake.
6. Add sanitized exception/correlation logging at the route boundary so a future 500 does not erase the actionable
   nested cause.

Acceptance requires the signed short wake to return success on named DEV, occurrence/queue state to be committed
atomically, the two orphan rules to be absent or disabled, and no generic webapp relation fallback to appear.
