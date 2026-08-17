# Global Admin correction 2 — manual-invoice provenance boundary (2026-08-17)

## Scope and authority

- Product branch: `wt/global-admin-systemic-20260817`; correction input product head:
  `63844034bee530eb091f248631a0621303b5dd52`.
- Independent re-audit B acceptance commit transferred from the isolated full clone:
  `546727b950e6bb8b1333da34c2d24ba75a4205f3` (cherry-picked here as `b4f4217b9`).
- Authority read in full before the correction: `AGENTS.md` core/audit/clean-architecture/test/orchestration
  sections; the Global Admin worker, audit1, correction1 and re-audit2 reports.
- Correction scope is exactly re-audit2's one `MUST FIX`: a plain external/provider `Error` with public
  `code=42501` or `code=ECONNREFUSED` cannot create database/transport provenance, a structured code/root, or
  the database-unavailable public class. Genuine DB/transport failures crossing a named internal boundary keep
  their bounded mapping; raw messages and causes remain absent from response and logs.
- No DB, DEV, TEST, PROD, env, deploy, merge-to-feat, push, or migration action was performed.

## Correction

- `manualInvoiceFailure.ts` now keeps infrastructure provenance in a module-private `WeakMap`. Route mapping and
  diagnostics read only that private carrier; they never infer provenance from a public `error.code`, error shape,
  constructor name, or raw cause.
- The carrier can be installed only by two catch boundaries:
  - `withManualInvoiceDatabaseBoundary` around the exact settings/repository operations of the manual-invoice
    service; only the bounded SQLSTATE/connection-code set is retained;
  - `withManualInvoiceProviderTransportBoundary` around `provider.adapter.createIntent`; it accepts only the typed
    provider transport error or the existing typed external-fetch timeout. Plain provider callback/domain/fiscal
    errors pass through unmarked even if they expose an allowlisted-looking public code.
- The YooKassa invoice adapter now wraps only rejection of its own `globalThis.fetch` call in
  `PaymentProviderTransportError`. Response-consumer errors (including PSP HTTP refusals) occur after that fetch
  boundary and remain ordinary provider/domain errors. Unknown network failures get a trusted transport root but
  no fabricated structured code.
- The manual-invoice service applies the DB boundary separately to its settings/repository calls, including
  fiscal repository operations and release/readback; it does not wrap the whole orchestration or local validation.

## Red-before-fix / green-after-fix

Before the product correction, on audit acceptance head `b4f4217b9`:

```bash
pnpm --dir apps/webapp exec vitest run --project route --reporter=dot \
  src/app/api/admin/saas-billing/payments/manual/route.route.test.ts \
  -t 'plain external error forge trusted provenance'
```

Result: exit 1; `2 failed | 17 skipped`. Both plain errors produced
`saas_billing_database_unavailable`, leaked the supplied code into the structured diagnostic, and emitted
`root=database_unavailable`.

After the correction, the definitive full route file run was green:

```bash
pnpm --dir apps/webapp exec vitest run --project route --reporter=dot \
  src/app/api/admin/saas-billing/payments/manual/route.route.test.ts
```

Result: exit 0; `1 passed` file, `19 passed` tests. The two new provenance assertions are green; actual branded
PostgreSQL `42501` and typed transport `ECONNREFUSED` retain `503 / saas_billing_database_unavailable` and their
bounded code/root, with raw messages absent.

## Required fault-kill evidence

Temporary product mutations were applied with `apply_patch`, run once, and reversed immediately.

1. **Remove the private carrier lookup** (`trustedInfrastructureFailure => null`):

```bash
pnpm --dir apps/webapp exec vitest run --project route --reporter=dot \
  src/app/api/admin/saas-billing/payments/manual/route.route.test.ts \
  -t 'actual PostgreSQL error|transport-shaped connect failure'
```

Result under mutation: exit 1; `2 failed | 17 skipped`. Both trusted failures fell back to
`saas_billing_manual_invoice_unavailable`, so the assertions kill removal of provenance.

2. **Restore trust in a plain public code** inside the provider callback boundary (`42501` / `ECONNREFUSED`):

```bash
pnpm --dir apps/webapp exec vitest run --project route --reporter=dot \
  src/app/api/admin/saas-billing/payments/manual/route.route.test.ts \
  -t 'plain external error forge trusted provenance'
```

Result under mutation: exit 1; `2 failed | 17 skipped`. Both cases became database-unavailable and exposed the
substituted structured code/root, so the assertions kill code-based provenance forgery.

Final source contains neither temporary mutation; `git diff --check` exited 0.

## Global Admin regression and focused adapter evidence

```bash
pnpm --dir apps/webapp exec vitest run --reporter=dot \
  src/app/api/account/first-run/bind-specialist/route.route.test.ts \
  src/app/api/admin/saas-billing/payments/manual/route.route.test.ts \
  src/app/api/admin/settings/route.route.test.ts \
  src/app/api/patient/material-ratings/route.route.test.ts \
  src/app/api/platform/error-tracking/route.route.test.ts \
  'src/app/app/patient/content/[slug]/PatientContentMaterialRating.ui.test.tsx' \
  src/app/app/account/StaffSecuritySection.ui.test.tsx \
  src/shared/ui/patient/material-rating/MaterialRatingBlock.ui.test.tsx \
  src/modules/auth/passwordAuth.route.test.ts \
  src/modules/auth/passwordChange.unit.test.ts \
  src/modules/saas-billing/service.test.ts \
  src/modules/system-settings/platformGlobalFallback.unit.test.ts \
  src/app/api/tariffMechanics.route.test.ts
```

Result: exit 0; **13 passed files, 164 passed tests**.

```bash
pnpm --dir apps/webapp exec vitest run --reporter=dot \
  src/infra/payments/yookassaPaymentProvider.unit.test.ts
```

Result: exit 0; `1 passed` file, `4 passed` tests. The existing HTTP-response callback cases remain ordinary
provider errors rather than transport provenance.

## Type, lint and architecture gates

```bash
pnpm --dir apps/webapp run typecheck
pnpm --dir apps/webapp exec eslint \
  src/modules/saas-billing/manualInvoiceFailure.ts \
  src/modules/saas-billing/service.ts \
  src/modules/payments/providerPort.ts \
  src/infra/payments/yookassaPaymentProvider.ts \
  src/app/api/admin/saas-billing/payments/manual/route.ts \
  src/app/api/admin/saas-billing/payments/manual/route.route.test.ts
```

Result: both exited 0.

```bash
node scripts/check-no-new-raw-sql.mjs
node scripts/check-webapp-infra-import-boundary.mjs
node scripts/check-webapp-infra-import-boundary.mjs --self-test
node scripts/check-b0-migration-baseline.mjs
node docs/_TODO/SAAS_FOUNDATION/scripts/check-s5-2-settings-security.mjs
./node_modules/.bin/tsc --noEmit --strict -p deploy/postgres/privileges
node deploy/postgres/privileges/generate-cli.mjs --check
node deploy/postgres/privileges/generate-cli.mjs --census
```

Result: all exited 0. Raw-SQL production debt is 0; the infra boundary accepted the canonical port consumer and
rejected all 7 self-test bypasses; B0 reports 15 webapp and 0 integrator forward migrations with no legacy chain;
settings classifications and all four generated privilege/allowlist artifacts match. Census checked 219 active
relations across 3266 production source files for both `bcb_webapp_dev` and `bersoncarebot_test`.

Full `pnpm run ci` was not run: this is one focused webapp provenance correction. The 164-test Global Admin gate,
provider-adapter unit gate, webapp typecheck/focused lint, and affected architecture/settings/privilege gates cover
the concrete changed surface without an identified uncovered repo-level integration risk.
