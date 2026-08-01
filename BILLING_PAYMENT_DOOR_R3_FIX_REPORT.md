# B1.1 payment-door R3 fix report

## Scope

- Product fix: `61c7ebd148b73d89872b159910a2c550bdec5365`.
- Changed only the YooKassa manual-invoice provider request and its behavioral provider-payload test.
- No payment provider, payment entry, database path, migration, deployment, or billing item B1.2–B1.4 changed.

## Result

The invoice branch of the existing `createIntent` payment door now sends
`payment_data.confirmation = { type: 'redirect', return_url: returnUrl }` to
`POST /v3/invoices`. The existing payer, purpose, and subject metadata remains
unchanged for all four adapters.

## Evidence

- `pnpm --dir apps/webapp exec vitest run src/modules/saas-billing/service.test.ts src/infra/payments/paymentProviderIdentity.unit.test.ts` — 2 files, 9 tests passed.
- `pnpm --dir packages/db-principal run build && pnpm --dir packages/error-tracking run build && pnpm --dir packages/platform-merge run build && pnpm --dir packages/operator-db-schema run build && pnpm --dir apps/webapp exec tsc --noEmit` — passed.
- `pnpm --dir apps/webapp exec eslint .` — passed.
- `git diff --check` — passed before the product commit.
- Fault injection: removing the invoice `payment_data.confirmation` made `paymentProviderIdentity.unit.test.ts` fail with `expected undefined to deeply equal { type: 'redirect', return_url: 'https://app.example.test/app/clinic/billing' }`; the field was restored before the final green run.
