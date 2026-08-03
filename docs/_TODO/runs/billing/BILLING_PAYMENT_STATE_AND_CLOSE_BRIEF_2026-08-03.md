# B0.3 — check what the payment state actually is, then close it

Rules: `AGENTS.md` — Маршрут, CORE rules, §1/§1b, §6, §24. Language: internal work is English.

⚠️ **One shot, no next turn.** Commit before you finish. **Budget ~20 minutes.** The previous run sat for 41
minutes with nothing to show and was stopped — do not repeat that: if a step does not converge in a few minutes,
record where it stands and finish the run.

Authority: `docs/_TODO/SAAS_FOUNDATION/SAAS_BILLING_PLAN.md` **B0.3**; task `#1057`.

Источник оракула: `#1057` — «клиника выбирает и оплачивает тариф через настоящий PSP, получает и продлевает
доступ».

## Start by measuring, not by paying

Several live attempts ran today, the last of them after every known defect was fixed and TEST was deployed green
at 22:42. **It is entirely possible a payment already succeeded and nobody read the result.** So, first:

1. Read the current state on TEST: the recent `saas_billing_invoices` rows for the demo clinic — status,
   `providerInvoiceRef`, `paidAt` — and the organization's `tariff_id`. Say plainly whether any invoice is already
   paid and any tariff already applied.
2. Check whether `/api/payments/saas-webhook/yookassa` received anything since 22:00 (nginx access log), and
   whether the application accepted or refused it (webapp service log).

If the chain already completed, **stop there and report it** — the work is done and only the evidence is missing.

## Only if it did not complete

3. Run the payment through the normal product path: clinic login → checkout → official YooKassa **test** card.
   Use the headless browser the earlier runs used. If the checkout page does not reach a terminal state within a
   few minutes, capture where it stalled and stop.
4. Then verify the same four values as in step 1 and say which of them changed.

## Boundaries

- **PROD (`135.106.162.170`) is untouchable.** TEST only; test shop, test key, test card.
- Do not deploy — TEST is already green on the code you need. Do not change product code, the guard trigger, the
  webhook verification, or the invoice state machine.
- No push.

## Done means

Evidence appended to B0.3 in `SAAS_BILLING_PLAN.md`, committed. Final line in plain words: **can a clinic pay for
its tariff on TEST end to end — yes, no, or already did** — with the invoice id, the amount and the applied tariff
if yes.
