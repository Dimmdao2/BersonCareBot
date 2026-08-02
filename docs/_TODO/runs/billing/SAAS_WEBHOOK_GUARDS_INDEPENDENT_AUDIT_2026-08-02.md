# SaaS webhook guards — independent audit (2026-08-02)

Candidate: `c016684db` (`wt/billing-webhook-guards`). Scope: two SaaS webhook guards and the accompanying
plan correction only.

## Verdict

**PASS — 2/2 authority guard classes killed, 0 missed.** Both route tests assert the exact stable HTTP
response and absence of both provider fetch and capture. The production route was restored exactly after each
temporary mutation; its normal target run is 11/11 green.

Audit-process note: I accidentally included `git diff c016684db^ c016684db` in the command which established
the candidate commit before writing this report, so it displayed the new tests before this written kill-set.
The kill-set below is derived solely from the stated authority and the two mutations were performed independently,
but this run must not be represented as a strictly blind pre-test-read audit.

## Authority and kill-set

Authority: `docs/_TODO/SAAS_FOUNDATION/SAAS_BILLING_PLAN.md` §B0.3 and the audit-tail requirements in the
brief.

1. A configured provider without `webhookSecret` must return exactly `503` / `webhook_secret_missing` before
   provider fetch or `captureSaasBillingProviderWebhookEvent`.
2. An unknown URL provider must return exactly `400` / `payment_provider_unavailable` before provider fetch or
   `captureSaasBillingProviderWebhookEvent`.

## Behavior evidence

The two named tests in `apps/webapp/src/app/api/payments/saasWebhook.route.test.ts` call the exported route
handler. Each asserts its exact JSON error, `fetchMock` not called, and a spy on
`captureSaasBillingProviderWebhookEvent` not called.

| Fault injected temporarily in production route | Named assertion that went red | Result |
| --- | --- | --- |
| Changed `if (!secret)` to `if (false)` | missing-secret test expected status `503`, received `200` | killed |
| Changed unknown-provider `catch` to resolve `yookassa` | unknown-provider test expected status `400`, received `200` | killed |

Exact commands:

```bash
# baseline and final target run (from apps/webapp)
pnpm exec vitest run src/app/api/payments/saasWebhook.route.test.ts --project=route

# missing-secret fault only
pnpm exec vitest run src/app/api/payments/saasWebhook.route.test.ts --project=route \
  -t 'rejects a configured provider without webhookSecret before provider fetch or capture'

# unknown-provider fault only
pnpm exec vitest run src/app/api/payments/saasWebhook.route.test.ts --project=route \
  -t 'rejects an unknown provider path before provider fetch or capture'
```

Each fault run selected one test and failed it (1 failed, 10 skipped). The restored normal target run reported
`Tests 11 passed (11)`.

## Plan and production-state inspection

- `yookassaPaymentProvider.ts` fetches the remote YooKassa object and returns
  `payload: { event: eventType, object: remote, currency: remote.amount?.currency }`; the trusted remote
  currency is therefore available to the route/service comparison.
- The plan records that correction as done and retains the nested-USD mismatch oracle; this is not stale mock
  shape work.
- Census command and measured result:

```bash
rg -l --glob '!**/*.test.*' --glob '!**/*.md' --glob '!**/node_modules/**' \
  'mockPaymentProvider|mock-complete|isMockPaymentConfirmEnabled' apps/webapp/src | wc -l
# 0
```

  Thus the mock product surface is absent; no deleted mock work was reopened.
- B0.3 is correctly `[ ]`. Its authority says it remains open until a TEST-store payment with a test card is
  captured and confirmed by a real webhook. The plan explicitly says that this half cannot be truthfully
  simulated on dev.

## Proportionate hygiene

```bash
# from apps/webapp
pnpm exec eslint src/app/api/payments/saas-webhook/'[provider]'/route.ts \
  src/app/api/payments/saasWebhook.route.test.ts

# from repository root
git diff --check
```

Both exited 0. No DB, migrations, DEV/TEST/deploy, taskdb, push, merge, or product-code change was performed.

## Remaining acceptance

Lead-run TEST YooKassa payment: test card from checkout through capture, confirmed by the real public webhook.
Until that run exists, B0.3 remains open regardless of the green route tests.
