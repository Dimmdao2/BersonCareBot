# Auditor-live final report — #915 M6 native Push backend

**Verdict: MUST FIX.** The candidate does not build (webapp typecheck fails, integrator typecheck/build
fails, webapp lint fails on the exact new files), the new table has zero privilege declaration coverage
(every runtime call to it will 42501 once privileges are reconciled), and the composite fan-out has a
confirmed cross-app content-leak path proven by a red acceptance test.

Candidate SHA: `1814ee1dae0b22fcd2d66285d526f00215c5739d` (`feat(#915): add composite native Push backend
M6`), on top of base `b3c90b232` (`fix(webapp): keep branded rewrites on internal HTTP #1100`), branch
`feat/doctor-ui-rebuild`. Audited from worktree `wt/mobile-push-backend-audit-20260909`. Docs commits
`a7f14a169`, `1b17676d1`, `e5f3dd8b4` (worker brief, acceptance-gate brief, evidence classification) were
read; none contains the privilege analysis `AGENTS.md` §1 requires before landing a migration.

Product code is unmodified by this audit. Added and committed: one acceptance-test file
(`apps/integrator/src/integrations/web-push/deliveryAdapter.nativeFanOut.contract.test.ts`) and this
`.lead/` pair. No product mutation was left in place; the RuStore-config fault injections in the report
below were exercised only inside the new test file via fakes, never against real product code.

## Kill tally (brief's 12-item blind kill-set)

| # | Item | Verdict | Evidence |
|---|---|---|---|
| 1 | Self-scope only; spoofed/staff/bound-install/malformed/replay fail closed | PASS | Both register routes reuse existing proven guards (`requireAccountWebPushSelfApiSession`, `requirePatientApiBusinessAccess` — `apps/webapp/src/app-layer/guards/requireRole.ts:664,945`), not new auth logic. Zod schema bounds `installationId`/`token` length and `provider` enum (`apps/webapp/src/app/api/{account,patient}/native-push/route.ts`). `pgNativePushTargets.ts:register()` reads the existing row for `(appId,provider,installationIdHash)` and throws `native_push_installation_conflict` when it belongs to a different `userId`, before any upsert — fails closed, no raw token stored/leaked. Minor robustness gap (not blocking): the route does not catch this throw, so the client sees a generic Next.js 500 instead of a typed 409 — still fails closed, just not clean UX. |
| 2 | Rotation idempotent; revoke/logout/purge disable correct target; offboarding doesn't delete a globally-owned install while M2M read for the former org stops returning it | PASS | `register()` uses `onConflictDoUpdate` on `(appId,provider,installationIdHash)` — same install re-registering updates in place, no duplicate row. `revoke()`/`deactivateById()` scope by `userId`+identity. `platformUserFullPurge.ts` and `pgPlatformUserMerge.ts` were both extended for `native_push_targets` (see §12 below). Total loss of org relation correctly 403s the M2M read (`target_outside_organization`) — see FAIL below for the narrower surface-scoping defect within an *existing* relation. |
| 3 | Integrator read for `(organization,user,surface)` returns Therapy Go only with active patient enrollment, Therapysto only with active staff membership; cross-surface invisible | **FAIL** | `apps/webapp/src/app/api/integrator/web-push/native-targets/route.ts` takes no `surface`/`appId` parameter at all. It checks `patient-enrollment OR staff-membership` for the org, then returns `listActive(userId)` — **every** active target for **both** apps, regardless of which relation justified the read. Root cause is structural (the read boundary has no surface concept), and it propagates into delivery: see fault-injection below. |
| 4 | Ciphertext round-trips with dedicated keyring/AAD, key id, old-key read/new-key write, rejects tamper/wrong namespace/unknown key | PARTIAL — MUST FIX one clause | `createNativePushTokenCipherFromEnv` (`apps/webapp/src/modules/web-push/nativePush.ts`) is a correct dedicated AES-256-GCM keyring: own `NATIVE_PUSH_TOKEN_KEYRING_JSON` bootstrap, not `STAFF_SECURITY_KEYRING_JSON`/`staff-security/crypto.ts`/`system_settings`/bundle (`grep` confirms zero references). Key id is embedded (`encrypted.keyId`) so old-key read / new-key write works once a second key is added to the keyring. **Gap:** no AAD is set (`createCipheriv('aes-256-gcm', key, iv)` with no third `setAAD` argument) — GCM's auth tag protects ciphertext bytes but not row identity. A ciphertext value copied from one `native_push_targets` row into another (bug, restore-from-backup mixup, or a future migration touching this table) decrypts silently under the new row instead of failing — the "wrong namespace" half of this kill item is unmet. |
| 5 | Logical channel stays `web_push`; policy/platform-availability/single pre-fork env policy run before either provider; local DEV calls neither; TEST suppresses non-test recipient for both, no redirect | PASS | `dispatchOutgoing()` (`apps/integrator/src/infra/adapters/dispatchPort.ts:322-353`) calls `assertOutboundMessagePolicy` then the single `applyPreForkEnvironmentDeliveryPolicy` gate, then resolves **one** adapter for channel `web_push` before `adapter.send()` ever runs — native fan-out lives entirely inside that one `send()` call, so it inherits the same gate; no second `readChannel`/env check exists for RuStore (`grep -c applyPreForkEnvironmentDeliveryPolicy` = 1 call site). Confirmed behaviorally: acceptance test "both targets empty → `no_active_target`, zero `fetch` calls" (green). |
| 6 | Browser-only/native-only both send; both fan out; neither yields `no_active_target` when configured; mixed success+failure = success; all-fail = failure; skipped legs ≠ attempts | PASS for counting logic; **FAIL** for surface isolation | `delivered/errors` sum browser+native; a leg with no config/no subscriptions is skipped via `continue`/ternary, never counted as an error (verified: "missing VAPID doesn't block native" acceptance test green, `browserResult` defaults to `{0,0,0}` without a provider call). The **surface-isolation** half of this item fails: see fault injection below — the native loop only skips a target when `nativeSurface && target.appId !== nativeSurface`; since no producer in the repo sets `pushExtras.pushSurface` (`grep -rn pushSurface` → only the type declarations and the adapter itself), `nativeSurface` is always `undefined` in production today, so the filter is a no-op and every native target of the user receives the push regardless of app. |
| 7 | Disabled global `web_push` blocks both; missing VAPID doesn't block native; missing/redacted RuStore doesn't block browser; absence of both doesn't crash | PASS | Single `isPlatformIntegrationEnabled(integrationId)` gate for channel `web_push` before the adapter is even looked up (`dispatchPort.ts:344-351`) — blocks both transports together. `getVapidCredentials(...).catch(() => null)` and `getRuStoreConfig(...).catch(() => null)` both degrade to `null`/skip, never throw into the caller — acceptance tests "missing VAPID doesn't block native" and "generic 400" exercise this without a crash. |
| 8 | Universal Push uses target's own app config/token; surface typed; internal route allowlisted/canonicalized; traversal/cross-surface rejected before invocation | PARTIAL | Config is correctly fetched per `target.appId` (`getRuStoreConfig(target.appId, organizationId)`) — no cross-app credential reuse. Route/deep-link allowlisting is **not implemented at this (server) layer**: `data: { route: url, ... }` forwards `payload.url` verbatim, with the same lack of validation the existing browser Web Push path already has (`client.ts:112` — pre-existing, not a regression). The actual origin/scheme/traversal chokepoint for a tapped native notification is the Android WebView navigation policy (`M2-05`/`M2-06`, `apps/mobile-shell/**`), out of this audit's scope. Not scored as a MUST FIX here; listed under remaining external/native-only gates. |
| 9 | Payload/copy carries only fact/date-time/link for sensitive classes; no chat/task/clinical/file/presigned/cookie/token/org secret reaches provider or logs | PASS | `title`/`body` passed to `sendRuStoreUniversalPush` are the exact same strings already produced by `modules/web-push/pushNotificationCopy.ts` for browser Web Push — no new copy path, no new field. `sendRuStoreUniversalPush`/`deliveryAdapter.ts` log only counts/booleans (`delivered/errors/deactivated`, `nativeSurface`), never the token or payload body. |
| 10 | Provider errors bounded/non-secret; generic 400 never mass-deactivates; only exact typed invalid-token deactivates that target idempotently; existing 404/410 cleanup untouched | PASS | `rustoreUniversalClient.ts` only sets `invalidToken`/`code:'invalid_token'` when the response body carries `invalidToken===true` or `code==='INVALID_TOKEN'`; a bare 400 with an unrelated body falls to `code:'provider_error'`, never triggering `deactivateNativeTarget`. Confirmed by 2 green fault-injected acceptance tests (generic 400 → 0 deactivations; exact `INVALID_TOKEN` → 1 deactivation per call, called twice for two calls = idempotent per-call, no double-deactivation side effects). Existing browser 404/410 `onSubscriptionDead` path is untouched by this diff. |
| 11 | Both RuStore settings global restricted secret envelopes; `authToken` redacts in API/audit, survives unchanged/blank update; persisted channel stays `web_push`; one visible "Push" label; no native provider preference | PASS | `registry.ts` declares `rustore_universal_push_{therapygo,therapysto}` as `restricted('admin','global','secret_envelope','absent','redacted')` wrapped in `withSecretAudit(..., auditObjectField('authToken'))` — the identical pattern already proven for `web_push_vapid`/other secrets, not a new redaction mechanism. `platformIntegrationAvailability.ts` label changed `'Web Push'→'Push'`; `CHECK` constraint on `user_notification_topic_channels_channel_check` is untouched by this diff (still `telegram|max|vk|email|web_push` — confirmed by `grep`, no new migration on that constraint) — no split channel, no new preference surface. |
| 12 | Merge dedupes/repoints native targets without ownership loss; purge removes them; migration objects run with only declared capabilities; no direct runtime-role relation access outside declaration | **FAIL** on capability declaration | `pgPlatformUserMerge.ts` and `platformUserFullPurge.ts` both correctly extended (dedupe-then-repoint on merge; hard delete on purge) — that half is PASS. The declared-capability half fails outright: `deploy/postgres/privileges/declaration.ts` has **zero** entries for `native_push_targets` (`grep -c native_push_targets declaration.ts` = 0). See migration/privilege analysis below — every runtime role that must read/write this table (the `app_patient`/`app_staff`/`app_global_admin` port-context logins that `getDrizzle()` runs under) has no grant on it at all. |

## Confirmed by fault injection (test file, all green except the one that documents the live defect)

File: `apps/integrator/src/integrations/web-push/deliveryAdapter.nativeFanOut.contract.test.ts` (new,
committed). Run: `pnpm --dir apps/integrator exec vitest run src/integrations/web-push/deliveryAdapter.nativeFanOut.contract.test.ts`
→ **4 passed, 1 failed** (the failing one is the acceptance test for the defect above, intentionally red on
the unmodified candidate — handoff artifact per `AGENTS.md` §24.5, not something I fixed).

| Fault | Assertion | Result |
|---|---|---|
| No `pushSurface` set + user has active targets on both apps | Native send must stay inside the addressed app | **RED** — `sendTo` = `['therapygo','therapysto']` instead of `['therapygo']` |
| Generic provider 400, no invalid-token vocabulary | `deactivateNativeTarget` not called | GREEN |
| Exact `code:'INVALID_TOKEN'` provider response | `deactivateNativeTarget` called once per send, idempotent | GREEN |
| Both subscriptions and native targets empty | `status:'skipped', reason:'no_active_target'`, zero `fetch` calls | GREEN |
| `getVapidCredentials` rejects (missing VAPID) + configured native target | Composite status still `success` | GREEN |

## Migration and privilege analysis — `20260909T120000_native_push_targets.sql`

1. **Objects.** Creates `public.native_push_targets` (id, `user_id` FK→`platform_users` cascade, `app_id`
   CHECK ∈ {therapygo,therapysto}, `provider` CHECK ∈ {rustore,fcm,hms}, `installation_id_hash`,
   `token_hash`, `token_ciphertext`, `token_key_id`, `deactivated_at`, timestamps) plus two unique indexes
   and one lookup index.
2. **Statement owner.** Both statements correctly marked `-- BCB-MIGRATION-OWNER: app_object_owner`; no
   `GRANT`/`REVOKE`/policy DDL in the file (`node scripts/check-migration-privileges.mjs` → `OK`, this gate
   only forbids privilege DDL *inside* migrations, it does not check declaration coverage). Verify probe and
   `YYYYMMDDTHHMMSS_slug.sql` naming are both present and correct.
3. **Roles that must execute against it, and what they need.** `pgNativePushTargets.ts` runs through
   `getDrizzle()` (`apps/webapp/src/app-layer/db/drizzle.ts`), which executes under the **current DB
   principal** — in `port-context` that is one of the three webapp runtime logins
   (`DATABASE_URL_STAFF`/`DATABASE_URL_PATIENT`/`DATABASE_URL_GLOBAL_ADMIN`), never `app_object_owner`.
   `register`/`revoke`/`deactivateById`/`activeOwnerId`/`status`/`listActive` need `SELECT, INSERT, UPDATE`
   on the table for whichever of those roles serve the patient route, the account(staff) route, and the two
   `/api/integrator/web-push/**` M2M routes.
4. **What's declared: nothing.** `deploy/postgres/privileges/declaration.ts` has zero references to
   `native_push_targets` (checked by name and by pattern grep). `node deploy/postgres/privileges/generate-cli.mjs --gaps`
   currently reports `gaps=0` on both `bcb_webapp_dev` and `bersoncarebot_test` only because the table does
   not exist in either database yet (migration not applied) — that command diffs the declaration against the
   **live** schema, so it cannot see a gap for an object that isn't there yet. This is exactly the situation
   `AGENTS.md` §1 "Перед приземлением миграции" describes: the automated `--gaps` gate does not substitute
   for the required written analysis before landing, and none exists in this branch's history.
   **Consequence:** once this migration is applied and the standard `migrate-dev.sh --execute` (declaration
   reconcile inside the same run) executes, every one of the six repo/integrator operations above will fail
   with `permission denied for table native_push_targets` (`42501`) under the real runtime roles — the table
   is reachable only from a superuser/introspection socket, which none of the product code paths use.
5. **RLS.** No RLS policy is declared or enabled for this table, unlike the structurally similar
   `user_web_push_subscriptions` (which has a `patientSurface(...)` policy in the declaration and is accessed
   through narrow `SECURITY DEFINER` functions — `save_current_patient_web_push_subscription` etc., see
   `declaration.ts:25393-25400`). `pgNativePushTargets.ts` instead runs plain Drizzle CRUD directly against
   the table from the route layer. Whoever closes the missing-declaration gap above has to decide — and
   record — whether this table gets the same definer-seam treatment as `user_web_push_subscriptions` or a
   direct-grant-plus-RLS design; either is legitimate, but leaving it with no RLS **and** no grants is not a
   final state, it's simply unfinished.
6. **No superuser/bare-migrator run was performed.** Consistent with `AGENTS.md` §3a/§1b, no ad hoc database
   was created and no `--execute` was run; the analysis above is derived from reading the declaration,
   `generate-cli.mjs --gaps` output, and `getDrizzle()`'s principal wiring — not from a live apply.

## Static/build gates run on the exact candidate checkout

| Gate | Command | Result |
|---|---|---|
| Webapp typecheck | `pnpm --dir apps/webapp typecheck` | **FAIL** — `src/app/api/patient/native-push/route.ts(4,46): TS2724 '@/modules/web-push/nativePush' has no exported member 'isNativePushAppId'`. Sole error; `isNativePushAppId` is never exported from `nativePush.ts` (only `NATIVE_PUSH_APP_IDS`, `NATIVE_PUSH_PROVIDERS`, `isNativePushProvider` are). |
| Root package build (packages + integrator) | `pnpm run build` | **FAIL** — `src/integrations/bersoncare/relaySurfaceTitleFailClosed.audit.test.ts(210,7): TS2739` — existing `WebPushAccessPort` mock is missing the 3 new required methods (`getNativeTargetsForUser`, `getRuStoreConfig`, `deactivateNativeTarget`), which the candidate added as **non-optional** interface members without updating this pre-existing test. |
| Integrator typecheck | `pnpm --dir apps/integrator typecheck` | **FAIL** — same single error as above. |
| Webapp ESLint on the 4 new route files | `pnpm exec eslint <4 route.ts paths>` | **FAIL** — 4× `no-restricted-imports`: `apps/webapp/src/app/api/{account,patient}/native-push/route.ts` and both `apps/webapp/src/app/api/integrator/web-push/native-targets{,/deactivate}/route.ts` import `@/infra/repos/pgNativePushTargets` directly. `AGENTS.md` §5 (`no-restricted-imports` phase-0 rule) explicitly covers `src/app/api/**/route.ts`, not only `src/modules/**`; the message is literally "Route handlers must not import infra/repos directly. Use services via buildAppDeps() or app-layer facades." None of the 5 new route files go through `buildAppDeps()` for this port — they call `createPgNativePushTargetsPort(createNativePushTokenCipherFromEnv())` inline. |
| Migration privilege-DDL gate | `node scripts/check-migration-privileges.mjs` | PASS (does not check declaration coverage — see privilege analysis above) |
| Declaration/live-schema gap gate | `node deploy/postgres/privileges/generate-cli.mjs --gaps` | Reports `gaps=0` (table not yet applied to either DB — not a substitute for the required pre-landing written analysis) |
| `git diff --check` | `git diff --check` | PASS, exit 0 |
| Secret/raw-token scan on the candidate diff | `git show 1814ee1da \| grep -iE "AIzaSy\|BEGIN (RSA\|EC) PRIVATE\|xox[baprs]-\|-----BEGIN"` | PASS, no match |
| `native-push`-scoped module reference to staff-security keyring | `grep -rn "STAFF_SECURITY_KEYRING_JSON\|staff-security/crypto" apps/webapp/src/modules/web-push/nativePush.ts apps/webapp/src/infra/repos/pgNativePushTargets.ts` | PASS, no match |
| New acceptance test | `pnpm --dir apps/integrator exec vitest run src/integrations/web-push/deliveryAdapter.nativeFanOut.contract.test.ts` | 4 passed / 1 failed (documents the surface-leak defect, see above) |

Full root `pnpm run ci` was not run: the two build-breaking errors above already give an unambiguous FAIL
signal on the exact candidate, and per `AGENTS.md` §9 a full CI run is not itself the gate that catches a
missing privilege declaration or an import-boundary violation — those needed the targeted gates above. Full
CI remains the lead's own final integration gate once a fixed candidate exists.

## Remaining external/native-only gates (not in scope here, not findings against this candidate)

- `apps/mobile-shell/**` Kotlin/Universal-Push-SDK bridge, tap routing and WebView origin/scheme allowlist
  (`M2-05`/`M2-06`, `M6-04`, `M6-10`) — untouched by this diff and out of audit scope per brief.
- RuStore application cards, Universal Push project IDs/service tokens, physical-device delivery (`M7-04`,
  `M7-05`, plan §6 external gates).
- Full root CI on a fixed candidate (plan `M7-06`).

## What must happen before this lands (MUST FIX, in the order a fixer should take them)

1. Export/wire `isNativePushAppId` (or remove the dead import) so `pnpm --dir apps/webapp typecheck` is
   green; update `relaySurfaceTitleFailClosed.audit.test.ts`'s `WebPushAccessPort` mock for the 3 new
   methods so `pnpm run build`/`pnpm --dir apps/integrator typecheck` are green.
2. Route the 5 new `route.ts` files through `buildAppDeps()` (or an app-layer facade) instead of importing
   `@/infra/repos/pgNativePushTargets` directly, so the phase-0 `no-restricted-imports` ESLint gate passes.
3. Add `native_push_targets` to `deploy/postgres/privileges/declaration.ts` — decide and record whether it
   follows the `user_web_push_subscriptions` definer-seam pattern or a direct-grant+RLS design, then run the
   owner-aware rollback-only preflight against named DEV before this lands, per `AGENTS.md` §1.
4. Fix the surface-scoping gap at its root: either add `surface`/`appId` to the M2M read boundary
   (`/api/integrator/web-push/native-targets`) so it returns only targets justified by the specific relation
   checked, or require the event-producer to always pass `pushExtras.pushSurface` and fail closed (not
   silently fan out) when it's absent. The retained acceptance test in this branch encodes the required
   outcome and will go green once either is implemented.
5. Bind the cipher's AAD to a stable per-row identity (e.g. `userId:appId:provider:installationIdHash`) so a
   ciphertext value relocated to a different row fails to decrypt instead of silently succeeding.

No re-audit of this surface is needed once the above are fixed and the retained test is green — per
`AGENTS.md` §24.5/§24.6, the lead/fixer reruns the same test file and the static gates listed above; a new
blind pass is only required if the fix introduces a materially new surface.
