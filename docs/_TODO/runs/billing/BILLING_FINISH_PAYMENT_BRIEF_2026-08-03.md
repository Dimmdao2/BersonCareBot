# B0.3 — apply the migrations, deploy, and finish the payment

Rules: `AGENTS.md` — Маршрут, CORE rules, §1 «Миграции», §6, §9, §24. Language: internal work is English.

⚠️ **You are one shot. There is no next turn** (`AGENTS.md` §24.2). Five runs today ended with «the build is
running in the background, I'll wait for the notification» — that notification never comes, and the work is lost.
**Run everything in the foreground and wait for it. Commit before you finish.**

Authority: `docs/_TODO/SAAS_FOUNDATION/SAAS_BILLING_PLAN.md` **B0.3**; task `#1057`.

Источник оракула: `#1057` — «клиника выбирает и оплачивает тариф через настоящий PSP, получает и продлевает
доступ».

## Everything is written and landed — only the run is left

On `feat/doctor-ui-rebuild` right now:

- `0343` — the bootstrap invoice resolver (webhook can read its invoice);
- `0344`/`0345` — the `app_staff` capture-step grants;
- `0346` — the trial/discount model;
- `0347` — the missing admin-settings seed rows;
- `0348` — `app.apply_paid_saas_billing_tariff(uuid,uuid)`, the accessor that applies the tariff for an invoice
  that is actually paid, so the staff guard stays untouched.

Everything the previous runs hit has been fixed: the tax values, the idempotence key rotation, the webhook secret,
the bootstrap read, the capture-step grants, the deploy gate counts. The last observed failure was the guard
trigger, and `0348` is the answer to it.

## Work, in order, all in the foreground

1. `bash deploy/host/migrate-dev.sh --preflight && bash deploy/host/migrate-dev.sh --execute` — record each
   applied migration with its journal idx/when, and verify against reality rather than the runner's word.
2. `bash deploy/host/deploy-test.sh feat/doctor-ui-rebuild` — it must end **green**, with every closure gate
   passing. If a gate is red, read its output, fix the registered expectation or the real gap, and re-deploy.
3. **Finish the live payment**: clinic login → checkout → official YooKassa **test** card → webhook arrives and is
   accepted → the invoice leaves `pending` → `providerInvoiceRef` and `paidAt` are set → the clinic's
   tariff/snapshot is actually applied. Read every decisive value back through `GET /api/clinic/billing`.
4. If something fails again, capture the exact error and stop. Do not forge a notification, do not bypass the IP
   allowlist, do not widen a grant to make a gate pass, do not touch the guard trigger.

## Boundaries

- **PROD (`135.106.162.170`) is untouchable.** TEST/DEV only; test shop, test key, test card.
- No push.

## Done means

Evidence appended to B0.3 in `SAAS_BILLING_PLAN.md` and **committed on your branch**, with the deploy log path.
Final line, in plain words: **can a clinic now pay for its tariff on TEST end to end, yes or no** — and if yes,
the invoice id, the amount, and the tariff that got applied.
