# B0.3 — close the payment chain now that the webhook URL is configured

Rules: `AGENTS.md` — Маршрут, CORE rules, §1/§1b, §6, §24.
Language: internal work is English.

Authority: `docs/_TODO/SAAS_FOUNDATION/SAAS_BILLING_PLAN.md` item **B0.3**; task `#1057`. Prior live evidence:
`docs/_TODO/NIGHT_WAVE_AUDIT_QUEUE_2026-07-28.md`, lines `34d83f2ec`, `89ce666db`, `26fad70b8`.

## What changed

The owner configured the notification URL in the YooKassa **test** merchant cabinet on 2026-08-03:
`https://test.bersoncare.ru/api/payments/saas-webhook/yookassa`. That was the only thing missing — the previous run
proved everything up to it:

- tax values reach the provider (`vat_code=1`, `tax_system_code=2`);
- the idempotence key now rotates after a proven refusal (`saas_tariff_refused_retry:`);
- a real test-card checkout reached `succeeded` on the provider side (800 ₽);
- no request ever arrived at `/api/payments/saas-webhook/*` — the missing URL.

## Work

1. Confirm TEST is running the current `feat/doctor-ui-rebuild`; if not, deploy it
   (`bash deploy/host/deploy-test.sh feat/doctor-ui-rebuild`) and record the exit code and log path.
2. Run the payment as a clinic through the normal product path: login → `POST /api/clinic/billing` → checkout →
   pay with the official YooKassa **test** card in a real browser.
3. **Prove the webhook arrived** — nginx access log shows the POST to
   `/api/payments/saas-webhook/yookassa`, and the application accepted it (not just 2xx-acknowledged an unknown
   ref). Record the log line and the response.
4. **Prove the effect, not just the delivery**: the invoice moves out of `draft` to paid, `providerInvoiceRef` and
   `paidAt` are set, provider events are recorded, and the clinic's tariff/snapshot is actually applied. Read those
   values back through the product API (`GET /api/clinic/billing`) and state each one.
5. If any step fails, capture the exact response or log line and stop. Do not forge a notification, do not bypass
   the adapter's IP allowlist, do not disable a gate.

## Boundaries

- **PROD (`135.106.162.170`) is untouchable.** TEST only; test shop, test key, test card.
- No product code change. If the run proves a code defect, describe it precisely and stop.
- No push.

## Done means

Evidence appended to the B0.3 paragraph of `SAAS_BILLING_PLAN.md`, committed on your branch. Final line of the
report, in plain words: **can a clinic now pay for its tariff on TEST end to end, yes or no** — and if yes, name
the invoice id, the amount, and the tariff that got applied.
