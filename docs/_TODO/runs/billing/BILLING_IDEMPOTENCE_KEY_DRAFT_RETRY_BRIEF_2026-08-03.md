# B0.3 — a refused provider create must not burn the invoice's idempotence key

Rules: `AGENTS.md` — Маршрут, CORE rules, «Как решать, что делать», §5 (clean architecture, DB only through the
port), §10/§10a/§10b (tests prove behavior), §24. Language: internal work is English.

Authority: `docs/_TODO/SAAS_FOUNDATION/SAAS_BILLING_PLAN.md` item **B0.3**; task card `#1057`. The live TEST
evidence is already in that paragraph and in `docs/_TODO/NIGHT_WAVE_AUDIT_QUEUE_2026-07-28.md`
(line `34d83f2ec`).

Источник оракула: `docs/_TODO/SAAS_FOUNDATION/SAAS_BILLING_PLAN.md` B0.3 — «Выход: клиника может оплатить тариф
через существующий provider layer»; и владелец о цели работы: «клиника выбирает и оплачивает тариф через настоящий
PSP, получает и продлевает доступ».

## The measured defect

Live TEST run, 2026-08-03, invoice `e13b2c92-5693-463f-8c3a-274cd198bcf7`:
`POST /api/clinic/billing` → `500 saas_billing_invoice_failed`, because
`POST https://api.yookassa.ru/v3/payments` → `400 invalid_request`, parameter `Idempotence-Key`:
«You've already used this idempotence key for another request within the past 24 hours. Repeat the request with
another idempotence key».

Why it happens (`apps/webapp/src/modules/saas-billing/service.ts:149-192`): the idempotence key advances **only**
on the manual-retry path guarded by `invoice.status === 'failed'`. A provider create that the PSP refuses leaves the
invoice in `draft`, so every subsequent attempt re-sends the same burned key. Consequence for a real person: a
clinic whose first payment attempt was refused for **any** reason (wrong tax settings, bad request, provider
hiccup) cannot pay for 24 hours, and nothing in the UI explains it.

## What to build

Make a refused create leave the invoice retryable with a fresh key, at the existing chokepoint — do not add a second
retry mechanism, a new table or a new route.

Two invariants that must both hold, and both must be proven by tests:

1. **Refused-before-creation → rotate.** When the adapter reports the provider refused the request without creating
   a payment, the next attempt for that invoice must use a new idempotence key, derived the same deterministic way
   the manual-retry path already derives one (`deriveSaasBillingIdempotencyKey` over invoice id + previous key), so
   concurrent clicks converge on the same new key and cannot produce two payments.
2. **Possibly-created → never rotate.** If the provider may have created a payment (network timeout, 5xx, any
   ambiguous outcome), the key must stay, so a retry idempotently returns the same payment instead of charging
   twice. Decide the classification from the adapter's own error contract, not from string matching on a human
   message; if the current port cannot express "refused without creating", extend the port minimally and say so.

Keep the existing `failed`-status manual retry working exactly as it does now.

## Boundaries

- No DB migration unless the state genuinely cannot be expressed with existing columns — and then justify it in the
  report before writing it. Prefer the existing `providerIdempotencyKey` column.
- No change to webhook handling, refunds, proration, or tariff application.
- Do not touch PROD. Do not deploy, do not push.

## Done means

- Behavioral tests: a refused create followed by a second attempt sends a **different** key and succeeds; an
  ambiguous failure followed by a second attempt sends the **same** key; concurrent second attempts converge on one
  key; the existing `failed` manual-retry tests stay green.
- `pnpm --dir apps/webapp exec vitest run --project fast src/modules/saas-billing/service.test.ts` and the payment
  adapter tests pass; `pnpm --dir apps/webapp typecheck`, scoped ESLint, `git diff --check` clean.
- One commit on `wt/billing-live-vat`, no push. Report the exact commands with counts, and state plainly whether a
  clinic can now retry a refused payment without waiting 24 hours.
