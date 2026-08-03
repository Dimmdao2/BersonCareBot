# Close the red TEST gate and finish the live payment

Rules: `AGENTS.md` — Маршрут, CORE rules, §1 «Миграции», §6, §9, §24. Language: internal work is English.

⚠️ **You run as a single one-shot agent — there is no next turn** (`AGENTS.md` §24.2). Never end while something
runs in the background: run long commands in the foreground and wait for them. **Commit before you finish** — an
uncommitted tree is lost work, and four runs today reported «done» with nothing committed.

Authority: `docs/_TODO/SAAS_FOUNDATION/SAAS_BILLING_PLAN.md` **B0.3**; task `#1057`. Accepted prior work is on
`feat`: migration `0343` (invoice resolver). Your branch `wt/billing-live-vat` already carries `85adc0a41` and
`baa6a4b25` — the `app_staff` capture-step grant, a `be_organizations` tariff-update gap found along the way, a
number-collision reconciliation, and a third copy of the stale ACL assertion in the C5A overlay.

Источник оракула: `SAAS_BILLING_PLAN.md` B0.3 — «Выход: клиника может оплатить тариф через существующий provider
layer»; `#1057` — «клиника выбирает и оплачивает тариф через настоящий PSP, получает и продлевает доступ».

## The state you inherit

The last TEST deploy (`deploy-test-20260803T161652Z-4162017.log`) ended:

```
FATAL: 1 post-health closure gate(s) RED:
  - app_owner SECURITY DEFINER table-grant completeness
TEST units are left RUNNING and healthy. This is a GATE failure, not an outage.
```

All five TEST services are up and `https://test.bersoncare.ru/api/health` returns `ok`. So this is not an outage —
it is our own gate refusing to certify the deploy because the functions added this evening are not registered in
the exact privilege inventory the gate compares against.

## Work, in order

1. **Read the gate's own output** to see exactly which function/table grant it считает missing — do not guess from
   the name. Then register the real, minimal expectation in the same place the previous entries live
   (`deploy/host/deploy-test-saas.sh` and the C5A overlay), the way today's earlier fixes did. If the gate is
   right and a grant is genuinely missing, add the grant instead — say which of the two it was.
2. **Re-deploy TEST** and show the deploy ending green, not just «units healthy».
3. **Finish the live payment**: clinic login → checkout → official YooKassa **test** card → webhook arrives →
   application accepts it → the invoice leaves `pending` → `providerInvoiceRef` and `paidAt` are set → the
   clinic's tariff/snapshot is actually applied. Read every decisive value back through `GET /api/clinic/billing`.
4. If another defect appears, capture the exact error and stop. Do not forge a notification, do not bypass the IP
   allowlist, do not widen a grant to make a gate pass.

## Boundaries

- **PROD (`135.106.162.170`) is untouchable.** TEST/DEV only; test shop, test key, test card.
- Do not change webhook signature/IP verification or the invoice state machine.
- Migration numbering: temporary number in the clone; the final one is assigned at land by the lead.
- No push.

## Done means

- The TEST deploy ends with all closure gates green, log path recorded.
- Evidence appended to B0.3 in `SAAS_BILLING_PLAN.md`, **committed on your branch**.
- Final line, plain words: **can a clinic now pay for its tariff on TEST end to end, yes or no** — and if yes, the
  invoice id, the amount, and the tariff that got applied.
