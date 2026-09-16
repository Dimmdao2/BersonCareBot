# Final correction — manual invoice trusted provider refusal — 2026-08-17

## Scope and authority

- Bounded correction for final independent audit B finding `B-01` only.
- Authority: `AGENTS.md` route and §5, §7, §9–§10b, §24;
  `systemic-final-independent-audit-a-20260817.md` and
  `systemic-final-independent-audit-b-20260817.md`; the audit-B committed typed-vs-untyped
  route acceptance.
- No DB, DEV, TEST, PROD, env, deploy, provider call or push was performed.

## Correction

- `manualInvoiceFailure` no longer derives provider-refusal mapping or diagnostics from the
  `yookassa_create_invoice_failed:*` message prefix. Only a
  `PaymentProviderRequestRefusedError` receives the bounded
  `502 / saas_billing_provider_rejected_invoice` response and
  `root=provider_invoice_refused` diagnostic.
- The exact YooKassa invoice HTTP callback now creates that typed refusal for a synchronous 4xx.
  Invoice 5xx remains an ordinary ambiguous error and fails safely as
  `503 / saas_billing_manual_invoice_unavailable` with `root=unclassified`.
- The route acceptance proves typed and untyped errors with identical message shape are separated,
  and that typed provider/fiscal/customer response content is absent from response and structured
  logs. Adapter acceptance covers invoice 403 vs 500 at the boundary.
- Existing private DB/transport provenance brands and their bounded diagnostics were not changed.

## Validation

Fresh-clone dependencies were installed without changing the lockfile:

```bash
pnpm install --frozen-lockfile
pnpm --dir packages/db-principal run build
pnpm --dir packages/operator-db-schema run build
pnpm --dir packages/platform-merge run build
pnpm --dir packages/error-tracking run build
```

All commands exited `0`.

Focused route/failure and exact adapter boundary:

```bash
/home/dev/brain/host-orch/run-tests.sh "cd /home/dev/dev-projects/bcb-wt-final-fix-invoice-20260817 && pnpm --dir apps/webapp exec vitest run --reporter=dot src/app/api/admin/saas-billing/payments/manual/route.route.test.ts src/infra/payments/yookassaPaymentProvider.unit.test.ts"
```

Result: exit `0`; **2 files / 26 tests passed**. This includes the audit-B ordinary
`Error('yookassa_create_invoice_failed:403:provider refused')` oracle, the typed equivalent, the
real adapter invoice 403, and the ambiguous adapter invoice 500.

The existing 13-file Global Admin gate was run from the fresh clone. The first load exposed only
unsynthesized local workspace package outputs, not a product/test failure. Per §10's resume rule,
already green files were not rerun after each package build:

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

Latest broad attempt before the final two workspace package builds: **11 files / 121 tests passed**;
the other two suites did not load. After building their local package prerequisites, the precise
resume commands were:

```bash
pnpm --dir apps/webapp exec vitest run --reporter=dot \
  src/modules/system-settings/platformGlobalFallback.unit.test.ts \
  src/app/api/tariffMechanics.route.test.ts
pnpm --dir apps/webapp exec vitest run --reporter=dot \
  src/app/api/tariffMechanics.route.test.ts
```

The first resume command proved **1 file / 5 tests passed** while the tariff suite exposed the next
unsynthesized workspace package and did not load. After building the remaining two packages, the
second command passed **1 file / 42 tests**. Composite current-tree
Global Admin evidence: **13 files / 168 tests passed**, including the full SaaS billing service
suite and the corrected manual-invoice route.

Types and proportionate lint for the bounded webapp change:

```bash
/home/dev/brain/host-orch/run-tests.sh "cd /home/dev/dev-projects/bcb-wt-final-fix-invoice-20260817 && pnpm --dir apps/webapp run typecheck && pnpm --dir apps/webapp exec eslint src/modules/saas-billing/manualInvoiceFailure.ts src/infra/payments/yookassaPaymentProvider.ts src/infra/payments/yookassaPaymentProvider.unit.test.ts src/app/api/admin/saas-billing/payments/manual/route.route.test.ts"
```

Result: exit `0`; webapp typecheck and scoped ESLint passed. Full webapp lint/full CI were not
rerun: this correction is a four-file single-webapp boundary fix, and final audit B separately
identified unrelated `B-02`/`B-03` gates outside this worker's scope. No new uncovered repo-level
integration hypothesis is introduced by this diff.

Final structural/diff checks:

```bash
rg -n "startsWith\\('yookassa_create_invoice_failed'\\)|\\^yookassa_create_invoice_failed" \
  apps/webapp/src/modules/saas-billing/manualInvoiceFailure.ts | wc -l
git diff --check
```

Result: exact message-prefix trust count **0**; `git diff --check` exit `0`.

## Verdict

`B-01` is corrected and its committed acceptance is green. Ordinary error text cannot forge a
trusted provider refusal; a real YooKassa 4xx invoice refusal remains a bounded typed 502 without
exposing provider, fiscal or customer response content.
