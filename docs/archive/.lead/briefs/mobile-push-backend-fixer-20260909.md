# Worker correction brief — #915 native Push backend after independent MUST FIX

Continue the complete M6 server-side Push work on the existing audited candidate branch. This is one coherent
product correction, not a new implementation and not a report-only pass. Close every finding in the retained
independent audit, preserve every already-passing M6 behavior, run the same acceptance oracle to green, and commit
the resulting product candidate. Do not write, edit, rename, format, or delete any test file: the independent
auditor already owns the retained test. Do not touch `apps/mobile-shell/**`, PWA/install surfaces, Jitsi/media UI,
TEST/PROD runtime, real provider credentials, store accounts, signing material, or unrelated #1100 work.

## Mandatory reading before action

1. Run `grep -n "^## \|^### " AGENTS.md`; read the global decision method and §1/§1b migration/security rules,
   §2–§5, §7, §9–§12 and §24 in full. Read `README.md`, `docs/README.md`,
   `docs/ARCHITECTURE/SERVER CONVENTIONS.md`, `docs/ORCHESTRATION_BINDINGS.md`,
   `docs/ARCHITECTURE/DATABASE_UNIFIED_POSTGRES.md`, and `/home/dev/brain/docs/MODEL_TIERS.md`.
2. Read the complete active authority `docs/_TODO/NATIVE_MOBILE_APP_INITIATIVE/MASTER_PLAN.md`, especially
   M6-01 through M6-11 and M7. Read `docs/ARCHITECTURE/OWNER_PRODUCT_RULES.md` §2, §15, §18 and §21–§25, §27,
   §28 completely, plus module-local docs beside every notification/system-settings module changed.
3. Read the independent artifacts completely before editing:
   `.lead/runs/mobile-push-backend-audit-20260909/00-blind-killset.md` and
   `.lead/runs/mobile-push-backend-audit-20260909/90-final-audit-report.md`. Inspect retained oracle
   `apps/integrator/src/integrations/web-push/deliveryAdapter.nativeFanOut.contract.test.ts`, but never modify it.
4. Use code-search before exact `rg`. Trace registration and delivery end-to-end: authenticated route → module
   service/port → Drizzle adapter/capability; producer → durable queue/relay → the one `dispatchOutgoing` /
   `createDefaultDispatchPort` → composite `web_push` adapter → browser/native provider. Inspect current privilege
   declarations and generated artifacts; neighboring raw SQL or direct infra imports are not authority.

Источник оракула — `docs/_TODO/NATIVE_MOBILE_APP_INITIATIVE/MASTER_PLAN.md`: «`web_push` остаётся единственным
логическим каналом «Push» в contracts, preferences, queue rows и UI.» Preserve that exact contract.

## The five audit findings are mandatory

1. Restore green type/build gates without touching tests. Export/remove the dead `isNativePushAppId` import. The
   existing `WebPushAccessPort` has old valid test fakes and deployments with browser-only behavior; represent the
   native extension as an optional transport capability (or another equally narrow production-side compatible
   shape) so pre-existing fakes compile unchanged. The composite adapter must continue to use native methods when
   supplied, and browser-only operation must remain valid.
2. Remove every direct `@/infra/repos/pgNativePushTargets` import from all new `route.ts` files. Define the target
   lifecycle port/service in the owning `modules/web-push` boundary, inject its production implementation through
   the existing `buildAppDeps()` composition, and extend the existing `integratorWebPushDelivery` seam for M2M
   reads/deactivation rather than building a second trust stack. Routes stay thin and reuse the existing patient,
   restricted-staff, HMAC, and verified organization-principal guards.
3. Make `native_push_targets` executable with the repository's real port-context roles and no broad table bypass.
   Declare the relation and every required function/capability in
   `deploy/postgres/privileges/declaration.ts`, regenerate the canonical DEV/TEST privilege artifacts, and adjust
   the still-unapplied timestamp migration if narrow SECURITY DEFINER roots are required. Follow the closest
   `user_web_push_subscriptions` patient-self and existing integrator-delivery patterns. The migration contains no
   `GRANT`, `REVOKE`, role or policy DDL; policy/execute rights belong only to the declaration generator. All table
   access remains behind module ports/Drizzle or declared named roots. Include the four-point rights analysis in
   the final report: objects, executing owners/runtime roles, body privileges, declaration coverage. Do not apply
   the migration, create a database, run raw `psql`, or touch TEST/PROD; lead/auditor performs candidate
   rollback-only named-DEV preflight after the commit.
4. Close the Therapy Go/Therapysto leak at the root. The M2M target-read boundary takes a required typed surface,
   filters the query by that app, and proves the matching relation only: `therapygo` requires active patient
   enrollment; `therapysto` requires active staff membership. Deactivation proves the same target surface/relation.
   Every current production event producer sets typed `pushExtras.pushSurface`: patient appointment/reminder,
   patient message/reply and video invitation paths use `therapygo`; specialist-task, staff message and
   operator-health paths use `therapysto`. Preserve the typed surface through the durable queue and relay. For
   already-enqueued legacy intents with no field, keep one bounded compatibility resolver in the existing
   composite adapter: derive only from an allowlisted same-surface relative route (`/app/patient...` → therapygo;
   known staff cabinet roots → therapysto), otherwise skip native fail-closed. Never broadcast all targets and
   never infer from provider config. This must make the retained first acceptance case green without weakening it.
5. Bind AES-256-GCM to stable row identity via AAD. Cipher port encrypt/decrypt receives the same canonical context
   (`userId`, `appId`, `provider`, `installationIdHash` or an equivalent deterministic namespace); the adapter sets
   and verifies AAD so copied ciphertext fails authentication. Preserve the dedicated
   `NATIVE_PUSH_TOKEN_KEYRING_JSON`, key id rotation, old-key read/new-key write, tamper detection, and zero
   raw-token/ciphertext logging.

## Required integration seams, not optional polish

- The authenticated native app needs its non-secret RuStore `projectId` at runtime for the SDK `configure` call.
  Extend each fixed-surface GET/status response (or the same authenticated lifecycle service) with only the
  matching non-secret project id/typed unavailable state, derived through the sanctioned settings accessor. Never
  expose `authToken` or provider send `endpoint` to the app; never put any of these in Gradle/env/app bundle. Patient
  DB context must not gain broad `system_settings` read access—use the repository's authenticated-client settings
  projection/named-root pattern if a projection is needed.
- Return the installation ownership conflict as a bounded non-secret typed conflict (HTTP 409) rather than a
  generic 500. Malformed payload remains 400; unauthorized/session outcomes remain those of existing guards.
- `pushSurface` is product surface metadata, not a provider selection. Persisted notification channel remains
  `web_push`; no new preference, enum, provider toggle, dispatch port, queue, environment gate, or notification
  framework is allowed. Apply AGENTS §5 before adding any wrapper: parameterize the existing chokepoints named
  above whenever their boundary can carry this behavior.
- Preserve all already-passing audit behavior: one pre-provider policy/environment gate, independent browser and
  native configuration, truthful per-transport counts, mixed success semantics, exact invalid-token-only
  deactivation, existing Web Push 404/410 cleanup, secret-envelope admin behavior, platform-user merge/purge, and
  non-secret logs/payload policy.

## Validation and delivery

Do not write or change tests. Run the retained oracle exactly:

`pnpm --dir apps/integrator exec vitest run src/integrations/web-push/deliveryAdapter.nativeFanOut.contract.test.ts`

Then run all applicable existing gates in the foreground: `pnpm --dir apps/webapp typecheck`,
`pnpm --dir apps/integrator typecheck`, the package build that previously failed, scoped ESLint for every changed
webapp/integrator production file, `node apps/webapp/scripts/check-system-settings-accessors.mjs`, migration name,
owner, privilege-DDL, privilege declaration/generation/census gates, architecture/DB-access/outbound-dispatch gates,
`git diff --check`, and explicit scans for raw token/credential logging or forbidden provider envs. Do not run full
CI and do not perform any live DB/server test in this worker.

Commit all and only the corrected product/declaration/generated/documentation paths with explicit staging, never
`git add -A`; exclude the auditor-owned test/report unless they were already committed before your work. Do not
push. Finish all foreground commands before ending the one-shot turn. Report the commit SHA, exact commands and
results, the complete changed-file list, exact producer inventory/surface, migration/function objects and the
four-point privilege analysis. If any mandatory item cannot be satisfied, leave the branch uncommitted only when
committing would conceal a broken state, and name the exact blocker.
