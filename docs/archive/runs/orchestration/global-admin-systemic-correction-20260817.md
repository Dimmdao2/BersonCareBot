# Global Admin audit correction — trusted manual-invoice diagnostics (2026-08-17)

## Scope and authority

- Product branch: `wt/global-admin-systemic-20260817`.
- Product worker commit: `3c750e5347aee22ad1e49871916dd3521df8647b`.
- Independent audit acceptance commit transferred from the isolated audit clone:
  `1eb72b27ea12aea6b0b73a3195edd716ceb9eb26` (cherry-picked as `cd35e5b41`).
- Audit report: `runs/orchestration/global-admin-systemic-audit1-20260817.md`.
- Correction scope was limited to the one audit `MUST FIX`: an arbitrary external five-character
  `error.code` such as `PWN42` must not be treated as trusted PostgreSQL SQLSTATE or reach the
  manual-invoice structured log. No DB, DEV, TEST, PROD, deploy, merge-to-feat, or push action was performed.

## Correction

`manualInvoiceFailureDiagnostic` no longer infers provenance from a five-character shape. It emits an
`errorCode` only for the existing explicit `DATABASE_UNAVAILABLE_CODES` allowlist. This retains the known
PostgreSQL unavailable codes (`40001`, `40P01`, `42501`, `53300`, `53400`, `55P03`, `57P01`, `57P02`,
`57P03`) and transport codes (`ECONNREFUSED`, `ECONNRESET`, `ENOTFOUND`, `ETIMEDOUT`) while redacting
arbitrary provider/customer codes. Public HTTP failure mapping remains unchanged.

## Exact validation evidence

### Acceptance test before correction

```bash
pnpm --dir apps/webapp exec vitest run --reporter=dot src/app/api/admin/saas-billing/payments/manual/route.route.test.ts
```

Result before the product change: exit 1, `1 failed | 13 passed`; the failing audit acceptance assertion
observed `errorCode: "PWN42"` in `logger.error`.

### Acceptance test after correction

```bash
pnpm --dir apps/webapp exec vitest run --reporter=dot src/app/api/admin/saas-billing/payments/manual/route.route.test.ts
```

Result: exit 0, `1 passed` test file, `14 passed` tests. The `PWN42` acceptance test is green and the
existing `42501` mapping remains green in the same file.

### Full targeted Global Admin audit set

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

Result: exit 0, `13 passed` test files, `159 passed` tests.

### Typecheck and focused lint

```bash
pnpm --dir apps/webapp run typecheck
pnpm --dir apps/webapp exec eslint \
  src/modules/saas-billing/manualInvoiceFailure.ts \
  src/app/api/admin/saas-billing/payments/manual/route.ts \
  src/app/api/admin/saas-billing/payments/manual/route.route.test.ts
```

Result: both commands exited 0.

Full `pnpm run ci` was not run: this correction changes one webapp diagnostic classifier, and the audit
acceptance test, full targeted Global Admin behavior set, webapp typecheck, and focused ESLint cover the
identified risk without a remaining repo-level integration hypothesis.
