# Worker brief — #915 native push backend and composite logical Push transport

Deliver the complete server side of M6 in one coherent pass. This is product code through the repo port. Do not
write, modify, rename, or delete tests; the independent `auditor-live` writes behavioral acceptance tests. Do not
touch `apps/mobile-shell/**`, PWA/install surfaces, video/media UI, TEST/PROD runtime, real provider credentials,
store accounts or signing material. Do not create a second notification framework or a second logical channel.

## Mandatory reading before action

1. Run `grep -n "^## \|^### " AGENTS.md`; read the global decision method, §1/§1b including the complete migration
   rules, §2–§5, §7, §9–§12 and §24 in full. Read `README.md`, `docs/README.md`,
   `docs/ARCHITECTURE/SERVER CONVENTIONS.md`, `docs/ORCHESTRATION_BINDINGS.md`,
   `docs/ARCHITECTURE/DATABASE_UNIFIED_POSTGRES.md`, and `/home/dev/brain/docs/MODEL_TIERS.md`.
2. Read the complete active authority `docs/_TODO/NATIVE_MOBILE_APP_INITIATIVE/MASTER_PLAN.md`, especially M6-01
   through M6-11 and M7. Read `docs/ARCHITECTURE/OWNER_PRODUCT_RULES.md` §2, §15, §18 and §21–§25, §27, §28
   completely. Read module-local documentation beside every notification/system-settings module you change.
3. Use code-search before exact `rg`. Trace the live path end to end before editing: notification resolvers → queue
   → `dispatchOutgoing`/`createDefaultDispatchPort` → existing `web_push` adapter → Web Push provider. Inspect the
   current Drizzle schema/migration/declaration/function/accessor patterns; neighboring raw SQL is not authority.

Источник оракула — `docs/_TODO/NATIVE_MOBILE_APP_INITIATIVE/MASTER_PLAN.md`: «`web_push` остаётся единственным
логическим каналом «Push» в contracts, preferences, queue rows и UI.» Every implementation choice must preserve
that exact owner-approved product contract.

## Immutable architecture

- Universal Push is added now, directly through RuStore Universal Push. It is not a temporary custom Kotlin/direct
  RuStore transport and not a second user-visible channel. Do not add `rustore_universal_push` to channel enums,
  preference checks, queue rows, notification-topic checks or producer APIs.
- Preserve one pre-provider path. Existing `assertOutboundMessagePolicy`, platform-availability selection and
  `applyPreForkEnvironmentDeliveryPolicy` must run once before the browser/native provider fork. No second
  environment gate, `readChannel`, dispatch port or delivery queue for native push.
- Preserve producer neutrality. Producers state canonical event type and recipient; target resolution chooses
  browser subscriptions and native installations. Do not edit scenario copy/builders except the minimum typed
  metadata already supported by their shared push contract. Do not create a universal notification-event table.
- Parameterize the existing `web_push` delivery adapter into one composite Push adapter rather than placing a
  parallel adapter beside it. Before every new wrapper/function, apply AGENTS §5: extend an existing chokepoint when
  it can carry the behavior without violating its boundary.

## Native target model, crypto and authenticated lifecycle — M6-01/M6-03

Add a separately owned Drizzle entity for native installations, not columns on `user_web_push_subscriptions`.
Canonical owner is the platform user via `user_id`. Store only an allowlisted app id (`therapygo|therapysto`),
strict provider vocabulary (`rustore|fcm|hms`, with only `rustore` active in the first release), non-secret
installation-id hash, non-secret token hash, encrypted token
material with key id, active/deactivation state and timestamps. Do not duplicate targets by organization. Add the
indexes/unique constraints needed by active user/provider/app reads and token rotation/idempotency in the same
migration. Global uniqueness of `(app_id,provider,installation_id_hash)` must fail closed rather than silently move
an installation between users.

Define the `NativePushTokenCipher` port in the owning webapp module. Its production adapter uses a dedicated
process-bootstrap keyring with key id/rotation (a narrowly named native-push keyring env value is allowed by M6-01).
It must not import `staff-security/crypto.ts`, use `STAFF_SECURITY_KEYRING_JSON`, use `system_settings`, store a key
in the app bundle, or log raw token/ciphertext. Keep all DB access behind module ports/Drizzle infra/DI.

Implement thin authenticated register-or-rotate, revoke and status endpoints over one service/port. Registration
validates the fixed app/provider vocabulary and computes hashes server-side; repeated registration/rotation and
revoke are idempotent. Logout/offboarding use the same revoke/deactivate service path, not duplicate DML. An
organization-scoped target read must re-prove current membership/enrollment for `(organizationId,userId)` at read
time; organization id is not copied into the target row. Add the sanctioned integrator M2M read/deactivation seam
by extending the current web-push access pattern rather than inventing another trust mechanism.

Use the existing push-self session/security seams: staff/account keeps the restricted-second-factor rejection in
`requireAccountWebPushSelfApiSession`; patient keeps the current patient web-push business-access boundary. The
route fixes the surface (`therapygo` for patient, `therapysto` for account); it never trusts a client-supplied
surface. Status exposes non-secret state only. Do not delete a global installation merely because one organization
offboards the user; organization eligibility is enforced by the scoped read.

Create `apps/webapp/db/schema/nativePushTargets.ts`, export it through the current schema roots/config, and add one
timestamp-named forward migration, schema declaration and required named capability functions using the current
owner-marker conventions. Prefer the current identity-self roots and extend/parameterize the existing integrator
web-push M2M seam instead of creating a second trust stack. Migration SQL must contain no
GRANT/REVOKE/policy/role manipulation. Include the required verification probe, declaration updates, exact
ownership path and privileges necessary for function bodies. Add the relation to the current user/org purge
lifecycle registry and `platformUserFullPurge`; add dedupe/repoint semantics to
`packages/platform-merge/src/pgPlatformUserMerge.ts` so canonical-user merge cannot strand or duplicate an
installation. Do not apply a migration or create a disposable database; pre-landing rollback-only candidate
preflight belongs to the independent audit.

## DB-backed Universal Push provider configuration — M6-08

Add exactly two global restricted `system_settings` envelopes:

- `rustore_universal_push_therapygo`
- `rustore_universal_push_therapysto`

Each holds the provider endpoint/project id/auth token contract, uses `restricted('admin','global',...)`,
`secret_envelope`, redacted client serialization and field-level audit redaction for `authToken`. Add them to the
canonical registry/registry-derived `ALLOWED_KEYS` and the existing global-admin settings form with current
secret-envelope retain-on-redacted/blank handling; do not
hardcode values or add provider config env variables. Integrator reads `public.system_settings` only through its
sanctioned accessor. Default/absent config is a typed unavailable result, never a startup crash.

## Composite delivery and Universal Push client — M6-02/M6-05…M6-07/M6-09/M6-11

Turn the current `createWebPushDeliveryAdapter` into the single composite handler for logical `web_push` and wire it
once in `apps/integrator/src/app/di.ts`. For each already-policy-approved intent, resolve browser subscriptions,
native targets and independent provider configs, then fan out within that adapter:

- Web Push continues to work when VAPID/subscriptions exist even if RuStore is absent.
- RuStore continues to work when its app-specific config/targets exist even if VAPID is absent.
- Disabled `platform_integration_availability.web_push` blocks both before the adapter/provider fork.
- Local DEV invokes neither provider. Deployed TEST uses the existing `TEST_ACCOUNT_WEB_PUSH_USER_IDS` against the
  original recipient for both transports and never redirects.
- No available browser/native target produces one typed `no_active_target`/skipped outcome and logical `web_push`
  metrics; denied/unconfigured native state is not an unauthorized messenger fallback.

Implement a strict Universal Push HTTP client for `POST https://vkpns-universal.rustore.ru/v1/send` with
app-specific DB credentials, request timeout, typed status/error mapping and no secret/token payload logging. Send
data-only messages so the Android app owns allowlisted tap routing/channels/sounds; do not send a provider
`notification` block that can auto-display around the native policy. Derive `pushSurface=therapygo|therapysto`
from each resolved target. Payload contains only the already-authorized fact/date/time/cabinet link and allowlisted
internal route; reuse existing `pushNotificationCopy`/intent metadata and never add chat/task text, clinical detail,
filename, presigned URL, cookies or organization secrets.

Generic Universal Push 400/provider errors do not prove which token is invalid and must not deactivate every target.
Deactivate idempotently only when a typed provider result identifies the exact invalid token; otherwise return a
non-secret provider failure through the existing attempt/outcome path. Keep browser 404/410 cleanup unchanged.

Keep `unifiedMessage.ts` logical channel unchanged and add the required strict
`pushSurface: 'therapygo'|'therapysto'` metadata to the existing web-push intent/relay contract, never a provider
field. Update the current production producers coherently: patient appointment/reminder materialization uses
`therapygo`; specialist-task and operator-health deliveries use `therapysto`; relay routes preserve that typed
surface. Extend the existing `DeliverySendResult.webPushOutcome` with bounded non-secret per-transport counts/status
and update its current dispatch/worker/relay consumers. One successful configured leg makes the logical delivery a
success while retaining the sibling failure metrics; all attempted configured legs failing is failure; skipped legs
are not provider attempts.

Rename the global-admin display label from “Web Push” to “Push” while persisted code remains `web_push`. Do not add
provider toggles to recipient preferences or split the platform availability switch.

## Validation and delivery

Do not write tests. Run all applicable existing non-test gates in the foreground: package typecheck/lint/build for
changed apps, `node apps/webapp/scripts/check-system-settings-accessors.mjs`, migration static/privilege declaration
validators, architecture/checkpoint scripts for DB access and outbound dispatch, `git diff --check`, and explicit
secret/raw-token/provider-env scans. Do not run full CI and do not touch named DEV/TEST DB in this worker.

Commit all and only the allowed paths with explicit staging, never `git add -A`; do not push. The commit message must
reference `#915`, explain the M6 behavior and name what remains external/native/audit. Do not finish the one-shot
turn while a foreground command is running. Report commit SHA, exact commands/results, migration objects/functions,
settings keys, modified chokepoints and any factual blocker.
