# Independent audit A — Global Admin systemic owner-failure set (2026-08-17)

## Scope and authority

- Audit tree: `wt/global-admin-systemic-audit1-20260817`, product head
  `3c750e5347aee22ad1e49871916dd3521df8647b` over checkpoint
  `25cf57c436647cc57884930d923a683dc5f174ea`; the whole checkpoint-to-head state is in scope.
- Product oracle: the 2026-08-17 owner wording embedded in the audit brief, including the separate ratings
  ruling that disabling ratings must also remove the stars.
- Process oracle: `AGENTS.md` core/audit rules and §§1–5, 7–10b, 24.
- Read before inspection: `README.md`, `docs/README.md`,
  `runs/orchestration/correction-dirty-tree-salvage-20260817.md`,
  `runs/orchestration/global-admin-systemic-worker-20260817.md`, the global-admin walkthrough, settings-root,
  staff-security and SaaS billing canon cited below.
- The requested temporary worker brief
  `/tmp/bcb-dirty-salvage-20260817.8HeRlw/global-admin-systemic-worker-brief.md` was absent before audit work;
  exact `find /tmp -type f -name global-admin-systemic-worker-brief.md` returned no path. Its content is not
  reconstructed or claimed read; the current immutable audit brief remains the gate.
- No DB, DEV, TEST, PROD, env, deploy, merge or push action is permitted or performed. Product fixes are outside
  this auditor's scope.

## Blind kill-set (fixed before opening test files)

Method: each item is repeated behavior and therefore needs a behavioral fault injection; the no-alternate-route,
secret-boundary, architecture and privilege claims also receive a direct code/gate inspection. The named faults
below were recorded before any `*.test.*` file was opened.

1. **Settings scope/atomicity/readback**
   - add a third per-org key to the platform NULL fallback and require a test to fail;
   - allow a clinic/no-org caller to enter that fallback and require refusal before a write;
   - make a later batch member fail after an earlier member would write and require zero persisted members;
   - accept duplicate batch keys or duplicate notification topics and require rejection without write;
   - corrupt a Unicode App theme (`test` / `Тест тема`) on save/readback and require the public result assertion
     to fail.
2. **Error-tracking DSN**
   - serialize or log the raw DSN and require a response/log assertion to fail;
   - allow enabled state with an invalid/missing DSN and require refusal before the transaction;
   - split enabled and DSN into partial writes and require atomicity/refusal evidence to fail.
3. **Specialist self-binding**
   - construct application dependencies before refusing a global admin and require the route test to fail;
   - permit a global admin to reach membership/workspace/provisioning side effects and require zero-side-effect
     assertions to fail;
   - refuse an eligible clinic owner, or expose a second HTTP entrypoint, and require retained-path/direct census
     evidence to fail.
4. **Global-admin password change**
   - remove the admin role from eligibility and require the public route/module scenario to fail;
   - bypass verified-email/current-password checks or turn missing email into a generic role failure and require
     explicit behavior assertions to fail;
   - keep the old credential valid, reject the new credential, preserve an old session epoch, or create zero/more
     than one replacement session and require the end-state assertions to fail.
5. **Manual invoice**
   - propagate arbitrary attacker-controlled `error.code` or raw provider/fiscal/customer text into logs and
     require the bounded structured-log assertion to fail;
   - collapse DB/fiscal/provider/config/idempotency classes to an unsafe status and require route mapping to fail;
   - accept a provider result with no checkout URL, or return a URL not persisted/read back, and require failure;
   - call the PSP before fiscal validation or create a second draft for the same request and require no-side-effect/
     idempotency assertions to fail.
6. **Global material-ratings switch**
   - mount stars/feedback while false and require the patient UI test to fail;
   - issue GET, PUT or feedback requests while false and require route/UI assertions to fail;
   - let clinic staff control the global switch and require authorization evidence to fail;
   - break true-state persistence/readback and require the enabled-path assertion to fail.

## Audit result

**FAIL — 1 MUST FIX.** The two-commit product state satisfies sets 1–4 and 6. Set 5 has one
reachable secret-boundary violation: a five-character attacker/provider-controlled `error.code` is accepted as a
SQLSTATE and emitted into the manual-invoice structured log.

Fault-injection accounting: **30 killed / 1 unhandled** behavioral hypotheses across 25 temporary mutation runs.
The unhandled case is the current-product `PWN42` finding below, not a mutation left in the tree. Every temporary
product mutation was reversed; final source census shows audit-test changes only.

### MUST FIX — arbitrary five-character invoice `error.code` reaches logs

Reachable scenario: `createManualSaasBillingInvoice` rejects with an error originating outside the diagnostic
helper and carrying `code: "PWN42"`. The manual-invoice route catches it and calls
`manualInvoiceFailureDiagnostic`. `errorCode()` accepts every `/^[0-9A-Z]{5}$/` value as SQLSTATE, without any
source identity, so the structured logger receives the exact untrusted value.

- Evidence: `apps/webapp/src/modules/saas-billing/manualInvoiceFailure.ts:22-35` and the failing acceptance test
  `apps/webapp/src/app/api/admin/saas-billing/payments/manual/route.route.test.ts:172-184`.
- Observed impact: `logger.error` received
  `{"event":"saas_billing_manual_invoice_failed","errorCode":"PWN42","root":"unclassified"}`.
- Violated gate: the owner audit brief requires no attacker-controlled `error.code` and no provider/fiscal/customer
  text in logs. Shape-bounding to five characters does not establish that the value came from PostgreSQL.
- Binary acceptance: the same test must pass while the existing explicit DB/transport classification tests keep
  their current mappings. No product fix was made by this auditor.

## Verdict by owner-failure set

1. **PASS — settings scope, atomicity and readback.** `orgScopedKeys.ts` contains exactly
   `patient_booking_url` and `notifications_topics` in the platform-NULL fallback set. Explicit fallback permission
   is still required; an unlisted per-org key and a no-org write fail before the port. Batch rows are fully
   preflighted and reach one `upsertManyInTransaction`; duplicate batch keys and duplicate notification topic IDs
   fail before write. Unicode `test` / `Тест тема` survives save and GET readback.
2. **PASS — DSN route and transaction.** `/api/platform/error-tracking` is a separate platform-gated route;
   enabled plus malformed/missing DSN is refused before persistence. Enabled and DSN enter one two-row write,
   PUT/GET return presence only, and the submitted DSN is absent from both structured and console log spies.
   Split-write, validation-bypass, response-leak and log-leak faults were all killed.
3. **PASS — specialist self-binding.** Platform capability is refused before workspace membership, dependency
   construction and provisioning. UI removes both first-run surface and `Подключить рабочий кабинет` while keeping
   password change. The eligible clinic-owner path remains green. Production census finds one HTTP caller of
   `ensureOwnBookableSpecialist`, the guarded bind route; no alternate HTTP endpoint was found.
4. **PASS — global-admin password.** Existing `admin` staff eligibility is asserted. Missing verified email is
   explicit, wrong current password performs no credential/session mutation, credential replacement invalidates
   the old password and accepts the new one, staff sessions and canonical session epoch rotate in order, and the
   HTTP boundary issues exactly one replacement session. Role removal, wrong-password bypass, missing-email
   collapse, old-epoch survival and double-session faults were killed.
5. **FAIL — manual invoice.** Structured public mappings for DB/fiscal/provider/config/domain failures, missing
   checkout URL refusal, persisted checkout readback, deterministic same-request idempotency and fiscal-before-PSP
   behavior all fault-kill. Raw messages and arbitrary long codes are redacted. The five-character arbitrary-code
   case above remains unhandled.
6. **PASS — global material-ratings switch.** Only the platform settings context can mutate the global key. False
   returns `null` before the patient component mounts and prevents component fetch plus route GET/PUT/feedback
   data access. True persists and reads back through the global row. Component-mount, each request path, clinic
   control and true-state corruption faults were killed. Direct DB bypass was not tested and is **not claimed
   closed**; it remains explicitly outside this branch.

## Fault-injection evidence

All mutations below were applied to product files only long enough to run the named test, then reversed with an
explicit inverse patch. A final product-source diff and marker census found none remaining.

| Fault injected | Independent gate that went red |
| --- | --- |
| add `patient_home_mood_icons` as third platform fallback | unlisted-key refusal and batch preflight tests |
| replace atomic multi-row write with individual `upsert` calls | modes batch and DSN transaction tests |
| bypass batch-key and notification-topic duplicate checks | both no-write duplicate route tests |
| replace Unicode topic title with `Test theme` | Unicode save/readback assertion |
| serialize and structured-log the submitted DSN | response-shape and no-log-secret assertions |
| bypass invalid enabled DSN refusal | malformed-DSN refusal/no-persist test |
| construct bind dependencies before platform refusal | zero-dependency-side-effect bind test |
| render the bind CTA despite `showSpecialistFirstRun={false}` | platform-console UI test |
| refuse an eligible owner | retained clinic-owner bind-path test |
| remove `admin` from staff eligibility | global-admin role assertion |
| bypass current-password verification | wrong-current no-mutation test |
| collapse missing email into wrong-password | explicit missing-email test |
| preserve the old canonical session epoch | password lifecycle epoch assertion |
| issue two replacement sessions | exact-one route assertion |
| log raw invoice code and message | arbitrary-code and raw-provider/fiscal-text tests |
| collapse all invoice error mappings | DB/fiscal/provider/config mapping table |
| accept a result without checkout URL | route missing-URL refusal |
| return the pre-attach invoice instead of persisted URL | checkout readback/idempotency assertion |
| replace deterministic invoice key with random input | same-request one-draft assertion |
| bypass partial fiscal preflight | fiscal refusal-before-provider test |
| mount patient stars while false | direct `MaterialRatingBlock` no-mount test |
| bypass false-state GET, PUT and feedback guards | three route no-data-call tests |
| allow clinic context to control global ratings | platform-only settings test |
| coerce a true ratings write to false | true persistence/readback test |

## Commands and results

Definitive unchanged-product behavioral run (after every inverse patch):

```text
pnpm --dir apps/webapp exec vitest run --reporter=dot src/app/api/account/first-run/bind-specialist/route.route.test.ts src/app/api/admin/saas-billing/payments/manual/route.route.test.ts src/app/api/admin/settings/route.route.test.ts src/app/api/patient/material-ratings/route.route.test.ts src/app/api/platform/error-tracking/route.route.test.ts 'src/app/app/patient/content/[slug]/PatientContentMaterialRating.ui.test.tsx' src/app/app/account/StaffSecuritySection.ui.test.tsx src/shared/ui/patient/material-rating/MaterialRatingBlock.ui.test.tsx src/modules/auth/passwordAuth.route.test.ts src/modules/auth/passwordChange.unit.test.ts src/modules/saas-billing/service.test.ts src/modules/system-settings/platformGlobalFallback.unit.test.ts src/app/api/tariffMechanics.route.test.ts
```

Result: **12 files passed, 1 failed; 158 tests passed, 1 failed**. The sole failure is the intentional acceptance
test for `PWN42`. The older tariff-mechanics expectation was corrected to the actual explicit
`allowPlatformGlobalFallbackWrite: true` call contract; with that audit-test correction it is green.

Each fault run used the relevant exact command from this set:

```text
pnpm --dir apps/webapp exec vitest run --reporter=dot src/modules/system-settings/platformGlobalFallback.unit.test.ts
pnpm --dir apps/webapp exec vitest run --reporter=dot src/app/api/admin/settings/route.route.test.ts
pnpm --dir apps/webapp exec vitest run --reporter=dot src/app/api/platform/error-tracking/route.route.test.ts
pnpm --dir apps/webapp exec vitest run --reporter=dot src/app/api/account/first-run/bind-specialist/route.route.test.ts
pnpm --dir apps/webapp exec vitest run --reporter=dot src/app/app/account/StaffSecuritySection.ui.test.tsx
pnpm --dir apps/webapp exec vitest run --reporter=dot src/modules/auth/passwordChange.unit.test.ts
pnpm --dir apps/webapp exec vitest run --reporter=dot src/modules/auth/passwordAuth.route.test.ts
pnpm --dir apps/webapp exec vitest run --reporter=dot src/app/api/admin/saas-billing/payments/manual/route.route.test.ts
pnpm --dir apps/webapp exec vitest run --reporter=dot src/modules/saas-billing/service.test.ts -t 'тот же запрос дважды возвращает ОДИН'
pnpm --dir apps/webapp exec vitest run --reporter=dot src/modules/saas-billing/service.test.ts -t 'не отправляет manual invoice провайдеру'
pnpm --dir apps/webapp exec vitest run --reporter=dot src/shared/ui/patient/material-rating/MaterialRatingBlock.ui.test.tsx
pnpm --dir apps/webapp exec vitest run --reporter=dot src/app/api/patient/material-ratings/route.route.test.ts
```

Every command above exited 1 under its corresponding injected fault. The unchanged product exits 1 only for the
new unhandled `PWN42` acceptance case.

Static, type and architecture/privilege gates:

```text
pnpm --dir apps/webapp run typecheck
pnpm --dir apps/webapp exec eslint src/app/api/admin/saas-billing/payments/manual/route.route.test.ts src/app/api/admin/settings/route.route.test.ts src/app/api/platform/error-tracking/route.route.test.ts src/app/api/tariffMechanics.route.test.ts src/modules/auth/passwordAuth.route.test.ts src/modules/auth/passwordChange.unit.test.ts src/shared/ui/patient/material-rating/MaterialRatingBlock.ui.test.tsx
node scripts/check-no-new-raw-sql.mjs
node scripts/check-webapp-infra-import-boundary.mjs
node scripts/check-webapp-infra-import-boundary.mjs --self-test
node scripts/check-b0-migration-baseline.mjs
node docs/_TODO/SAAS_FOUNDATION/scripts/check-s5-2-settings-security.mjs
./node_modules/.bin/tsc --noEmit --strict -p deploy/postgres/privileges
node deploy/postgres/privileges/generate-cli.mjs --check
node deploy/postgres/privileges/generate-cli.mjs --census
```

Result: all exited **0**. Privilege census checked 219 active relations across 3272 source files for both
`bcb_webapp_dev` and `bersoncarebot_test`. Full `pnpm run ci` was not run: targeted behavior, webapp typecheck,
focused ESLint and the relevant architecture/privilege gates cover this audit-only delta without an identified
uncovered integration risk.

The isolated audit worktree had no installed dependencies. `pnpm install --frozen-lockfile` could not write the
shared pnpm store (`EROFS`), so tests used dependency artifacts from the worker tree after confirming the same
HEAD and lockfile; generated package `dist` outputs and dependency links are ignored audit infrastructure and are
removed before commit. No database or runtime environment was contacted.

## Canon and scope notes

Relevant product authority read for this audit: the 2026-07-27 global-admin owner walkthrough,
`SAAS_S5_SETTINGS_ROOT_SPLIT.md`, `SAAS_BILLING_PLAN.md`, `MATERIAL_RATINGS.md`, the entry/invite journey canon,
the TEST password incident/restore record, the current authority map, the parent salvage checkpoint report and
the worker report. The absent `/tmp` worker brief remains the only requested source that could not be read.

This report does not claim a live DB/runtime check, a direct-DB ratings boundary, deploy readiness or full-system
readiness. It audits only checkpoint `25cf57c436647cc57884930d923a683dc5f174ea` through product head
`3c750e5347aee22ad1e49871916dd3521df8647b` against the supplied owner oracle.
