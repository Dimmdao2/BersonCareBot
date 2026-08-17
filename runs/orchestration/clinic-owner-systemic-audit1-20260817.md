# Independent audit A — clinic-owner nine-path candidate (2026-08-17)

Audit target: `25cf57c436647cc57884930d923a683dc5f174ea..14da19c624e1afa201fadcc6f1b21b5e6696244c`
on `wt/clinic-owner-systemic-audit1-20260817`.

Authority order: the nine clinic-owner failures quoted in the launcher brief are the owner oracle;
`docs/OWNER_DECISIONS.md`, the booking/settings/billing canon and `AGENTS.md` §§10b/24 constrain the
implementation and evidence. The launcher-named
`/tmp/bcb-dirty-salvage-20260817.8HeRlw/clinic-owner-systemic-worker-brief.md` and
`clinic-owner-forensic-handoff.md` were absent from `/tmp`, `/home/dev` and Git object history at audit start;
their required nine-path oracle is nevertheless present verbatim in the launcher brief and is used without
softening. No DB, DEV, TEST, PROD, environment, deploy, merge or push action is part of this audit.

## Pre-inspection classification and blind kill-set

Recorded after reading the owner oracle/canon/worker and parent handoffs, but before reading candidate test bodies
or the full product diff.

All nine owner paths contain repeatable behavior and therefore require behavioral fault injection at the cheapest
public layer. Declaration/generated-file parity, migration numbering/journal shape, exact principal ownership and
final absence of temporary mutations are one-time state inspected by diff/AST/generator/parser gates rather than
source-text tests.

1. **BRANCH-01 — quota omission / wrong scope.** An active Start clinic can create more than one branch, Developer
   is not unlimited, quota rejection is vague, or another organization/global patient data participates in the
   count. Impact: wrong paid entitlement or cross-tenant disclosure/write.
2. **SETTING-01 — unlink-past key/type/readback.** The intended boolean is rejected, saved globally/wrong-typed,
   or not returned; unrelated/global keys become writable. Impact: clinic configuration is lost or crosses scope.
3. **POLICY-01 — zero-state CRUD/behavior.** With no rows, either cancellation or reschedule has a fake/dead ID,
   cannot POST/edit/reload, or another organization's policy is selected. Impact: clinic cannot configure or enforce
   booking lifecycle rules.
4. **FORM-01 — form-field create/default grants/safe errors.** A valid field cannot be created/read/used because
   Drizzle default columns are undeclared, while invalid/duplicate/capability cases become 500 or cross-org.
   Impact: booking form setup is unusable or unsafe.
5. **CABINET-01 — forbidden global SMS / atomic batch.** Clinic can submit `sms_fallback_enabled`, or comments/media
   defaults partially persist/read back or write another organization. Impact: global notification policy takeover
   or split clinic configuration.
6. **SCREEN-01 — refresh and polling lifecycle.** Toggle does not refresh exactly once, disable leaves menu/summary/
   unread polling mounted, or enable needs a loop/manual reload. Impact: stale 403 request storm and unusable toggle.
7. **SLUG-01 — slug persistence/default grants/safe boundaries.** A valid unique rename does not atomically persist
   across claim/directory/event and fresh readback, while conflict/validation/capability becomes 500 or cross-org.
   Impact: broken public address or tenant corruption.
8. **BILLING-01 — principal-root split/fiscal/idempotency.** Clinic and platform periods use the other's named root,
   fiscal/provider mapping fails open, checkout readback is missing, or retry duplicates a draft. Impact: cross-role
   commercial access or incorrect/duplicate money state.
9. **CALENDAR-01 — visible canonical dependencies/exact IDs.** Specialist/service selectors are hidden/dead,
   dependency order is bypassed, submitted IDs are dropped, or foreign IDs are accepted. Impact: clinic cannot
   create the intended appointment or can write into another tenant.

Initial kill-set: **9 named independent owner paths; 0 killed; 9 unhandled**. Mandatory mutations include quota
omission, default-column grant removal, empty-policy POST removal, partial settings batch, `router.refresh` removal,
slug default-grant removal, swapped billing principal roots, and hidden specialist/service or cross-org IDs.

## Evidence and verdict

**PASS — 9/9 owner paths killed, 0 unhandled, 0 candidate findings.** Eleven temporary product
faults were injected and each relevant gate went red for the intended behavioral reason. Every
temporary product mutation was then reversed with `apply_patch`; the only retained changes are two
acceptance-test paths and this report.

### 1. BRANCH-01 — PASS

- Migration 0016 parses as one bounded backfill plus two owner-ordered functions. Its backfill
  changes only named Start/Developer tariffs missing `quotas.branches`: Start receives numeric `1`,
  Developer receives `unlimited`; an owner-set key is not overwritten.
- Active tariff save rejects absent branch stock with `tariff_branches_quota_required`. Branch POST
  takes the organization only from the clinic-management context, returns the created organization
  row and maps `saas_quota_reached:branches` to exact `409 branch_quota_reached` without retry.
- The repository's quota transaction counts active physical branches for the same
  `input.organizationId`; neither a global patient lookup nor another organization participates.
- Fault `remove active-tariff branches omission guard` made the focused tariff test red: expected
  `tariff_branches_quota_required`, received no throw.

### 2. SETTING-01 — PASS

- `booking_allow_doctor_unlink_past_package_sessions` is an admin-scope PATCH key; both booleans are
  persisted/read back for the context organization. A string value returns `400 invalid_value`.
  Zod continues to reject unknown keys and the service's key/scope/org normalization remains closed.
- Fault `remove the key from ADMIN_SCOPE_KEYS` made all three route regressions red (`200 -> 400`
  for both booleans and `invalid_value -> invalid_body` for the type boundary).

### 3. POLICY-01 — PASS

- Honest empty GET state is `[]/[]`. The UI seeds one organization draft for each existing kind and
  omits the draft ID on both POSTs. The retained acceptance extension proves cancellation reloads
  the server's persisted value/ID and a later edit submits that real ID.
- Organization POST derives `scopeEntityId` from the current organization. Service/specialist scope
  validation occurs before the write; a foreign service is a safe `404` with no write. Resolver
  tests select the organization cancellation/reschedule policies, apply their threshold/limit, and
  exclude the same policy from another organization.
- Faults `send cancellation draft ID` and `remove post-save reload` both went red; the first observed
  `draft-cancellation-organization`, the second stayed at `72` instead of the server readback `96`.

### 4. FORM-01 — PASS

- A strict valid `text` field reaches the exact organization port and the returned field is the
  authoritative create readback; the canonical field type is shared with booking-form rendering.
  Invalid key/type is stopped before DB access, duplicate key is exact `409`, and `42501` is the
  redacted `booking_form_capability_unavailable` response.
- Declaration grants cover every insert column emitted by Drizzle, including default `id`,
  `created_at` and `updated_at`; generated artifacts are byte-identical.
- Fault `remove be_booking_form_fields INSERT id grant` made the independent exact-column test red.

### 5. CABINET-01 — PASS

- Clinic doctor settings neither list nor accept global `sms_fallback_enabled`; stale PATCH is
  rejected before both single and batch writes. Comments/media require exactly the two distinct
  boolean keys.
- Service normalizes both rows to the context organization before one `writeRows` call; the PG port
  maps a multi-row call to `upsertManyInTransaction`. The retained behavioral test observes exactly
  one transaction, reads both values back and observes no row in a second organization.
- Fault `Promise.all(two writeRows([row]))` made the atomic test red: transactional port calls were
  `0`, expected `1`.

### 6. SCREEN-01 — PASS

- Successful toggle calls `router.refresh()` exactly once; failed save does not refresh. Shell
  capability projection removes clinical menu entries and passes one `clinicalRuntimeEnabled`
  switch to summary/unread badge providers.
- The polling regression observes zero requests while disabled, both requests after enable, and no
  further requests after disable/visibility events. There is no client refresh loop.
- Fault `remove router.refresh()` made the success assertion red (`0`, expected `1`).

### 7. SLUG-01 — PASS

- Strict body cannot choose organization. Service validates, reserves and then claims/renames under
  the exact staff organization principal. The repository transaction updates claims and public
  directory, and rename inserts an audit event; owner mismatch and uniqueness remain closed.
- POST maps validation/conflict specifically, redacts `42501`, and performs a fresh
  `getSlugManagementState(organizationId)` readback after success. The UI consumes its real
  `currentSlug` shape.
- Exact INSERT/UPDATE grants cover the default/touched columns for claims, public directory and
  rename events. Fault `remove rename-event created_at grant` made the exact-column gate red.

### 8. BILLING-01 — PASS

- The retained audit unit test binds a `clinicBilling` principal only to
  `app.list_saas_billing_period_catalog()` and a `platform` principal only to
  `app.list_saas_billing_period_catalog_platform()`, and verifies mapped period readback.
- Migration/declaration give the clinic root only to `app_clinic_billing` with the staff/clinic
  accepted context, and the platform root only to `app_platform_settings` with platform context.
  Clinic route operations are wrapped in `runWithDbClinicBillingPrincipal`; the manual admin route
  is entered through `requirePlatformOperationsApiContext`. One principal therefore cannot execute
  the other's root.
- Existing service/route regressions preserve fiscal fail-closed VAT/provider capability,
  provider-detail redaction, checkout URL/invoice readback, and same-key idempotent draft reuse.
- Fault `invert the platform principal decision` made both new principal-root cases red, each
  observing the other root.

### 9. CALENDAR-01 — PASS

- Create UI visibly renders canonical specialist -> branch -> dependent service fields; the chosen
  service list requires matching specialist and branch. Submit requires all three and sends their
  exact IDs. Both manual paths preserve those IDs in their authoritative appointment response.
- Repository validation binds specialist, branch, service and availability rows to
  `input.organizationId`; a foreign catalog ID becomes a specific not-found/conflict before create.
  Calendar success invokes the existing `onChanged` refresh used by calendar/upcoming projections.
- Fault `force specialist/service fields hidden` made the visible/exact-ID UI regression red.
  Fault `remove branch_not_found scoped-refusal mapping` made the cross-scope route regression red
  (`503`, expected specific `404`) without a partial create.

## Shared overlap inspection

- Settings overlap: the admin unlink key remains separate from the doctor-only atomic support
  batch; clinic doctor settings have no SMS fallback write/read surface.
- Privilege overlap: `relation-access.ts`, generated privilege/allowlist artifacts and named-root
  catalogs agree. Default-column faults for both form and slug were detected independently.
- Billing overlap: the two period roots have disjoint accepted contexts and caller roles; the new
  test closes the previous hole where catalog tests saw both literals but could not detect swapping
  their callers.
- Migration overlap: 0016 is journal index 16 after inherited 0015. Legacy freeze, journal sync and
  B0 baseline gates all pass; the custom owner parser proves one backfill plus two functions.

## Fault-injection ledger

All commands below were run after the initial blind classification and against a temporary product
mutation, then rerun green after reversal where part of the final targeted set.

- quota omission: `pnpm --dir apps/webapp exec vitest --run src/modules/org-entitlements/service.test.ts -t 'explicit branches stock'` -> intended red, 1 failed.
- unlink key removal: `... vitest --run src/app/api/admin/settings/route.route.test.ts` -> intended red, 3 failed.
- policy fake ID: `... BookingPoliciesSection.ui.test.tsx -t 'without a fake id'` -> intended red, 1 failed.
- policy reload removal: `... BookingPoliciesSection.ui.test.tsx -t 'reloads the created policy'` -> intended red, 1 failed.
- form default grant removal: `node --test --test-name-pattern='clinic-owner mutation grants' deploy/postgres/privileges/relation-access.test.mjs` -> intended red at form `id`.
- partial settings writes: `... clinicOwnerSettingsBatch.unit.test.ts` -> intended red, batch calls `0 != 1`.
- refresh removal: `... DoctorScreensToggleSection.ui.test.tsx` -> intended red, refresh calls `0 != 1`.
- slug default grant removal: the same exact-column command -> intended red at rename `created_at`.
- swapped billing roots: `... pgSaasBilling.periodCatalogRoots.unit.test.ts` -> intended red, 2 failed.
- hidden calendar selectors: `... DoctorCalendarEventPanel.ui.test.tsx -t 'exact ids'` -> intended red, no Specialist control.
- lost scoped-ID refusal: `... manual/route.route.test.ts -t 'organization-scoped catalog refusal'` -> intended red, `503 != 404`.

Final killed/unhandled count: **9 killed / 0 unhandled**. Product mutations remaining: **0**.

## Green command evidence

- Targeted behavioral suite: **19 files / 181 tests PASS**, including all nine paths and the retained
  billing principal-root audit test.
- `pnpm --dir apps/webapp typecheck`: **PASS**.
- ESLint on both retained acceptance-test paths: **PASS**.
- `pnpm exec tsc -p deploy/postgres/privileges/tsconfig.json --noEmit`: **PASS**.
- `node deploy/postgres/privileges/generate-cli.mjs --check`: **PASS**, all four generated artifacts
  byte-identical.
- `node deploy/postgres/privileges/generate-cli.mjs --census`: **PASS**, 219 ACTIVE relations across
  3266 production source files in both target databases.
- `node --test deploy/postgres/privileges/relation-access.test.mjs`: **38/38 PASS**.
- Raw-SQL, webapp infra-boundary + self-test, transaction-quota boundary + self-test: **PASS**.
- Legacy migration freeze, Drizzle journal sync and B0 migration baseline: **PASS**.
- Custom `parseOwnerStatements` assertion for 0016: **PASS**, including exact Start/Developer quotas.
- `git diff --check 25cf57c4..14da19c6`: **PASS**.

The worktree initially lacked dependency links. `pnpm install --offline --frozen-lockfile` could not
register this worktree in the read-only pnpm store, so ignored `node_modules` links were copied from
the worker worktree at the same product head and the four required workspace packages were built
locally. No network, database or runtime environment was contacted.

## Inherited checkpoint B0 failures — not waived and not repaired

These reproduce the worker/parent audit exactly and are outside this clinic candidate's changes:

- `pnpm --dir apps/webapp lint`: **FAIL**, inherited
  `PositiveSizeResponsiveContainer.tsx:36 react-hooks/set-state-in-effect`.
- `port-context-callsite-catalog.test.mjs`: **3/5 PASS**, first undeclared inherited patient root
  `pgMaterialRating.ts:40`; discovery **143 actual / 139 expected** (four inherited patient roots).
- `function-census.test.mjs`: **5/6 PASS**, fixed census **323 actual / 317 expected** (the same four
  patient roots plus these two declared clinic period roots).
- `port-context-catalog.test.mjs`: **15/16 PASS**, descriptor count **164 actual / 158 expected** for
  the same six roots; target-role and catalog integrity subtests pass.
- `migrate-local-parse.test.mjs`: **3/4 PASS**, inherited `ENOENT` for deleted historical
  `0449_patient_acquiring_webhook_bootstrap_resolver_local.sql`; migration 0016 passes the same
  parser independently.

## Tree boundary

Ten root-owned character-device env mounts were already reported as modified at audit start and
cannot be hashed by Git; they were not read, changed or staged. Ignored dependency links/build
outputs are test preparation only. Apart from those injected mounts, the final ordinary diff is
limited to the two acceptance-test paths and this report; staging/commit uses those exact paths,
never `git add -A`.
