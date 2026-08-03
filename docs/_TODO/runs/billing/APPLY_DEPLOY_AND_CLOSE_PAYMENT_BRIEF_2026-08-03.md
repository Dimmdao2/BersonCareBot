# Apply, deploy and close the payment

Rules: `AGENTS.md` — Маршрут, CORE rules, §1/§1b, §6, §9, §24. Language: internal work is English.

⚠️ **One-shot agent, no next turn** (`AGENTS.md` §24.2). Five runs today ended mid-flight waiting for a background
build or CI — **run everything in the foreground and wait for it**, and **commit before you finish**.

Authority: `docs/_TODO/SAAS_FOUNDATION/SAAS_BILLING_PLAN.md` **B0.3**; tasks `#1057`, `#1069`. All the code below is
already landed on `feat/doctor-ui-rebuild` and accepted in `docs/_TODO/NIGHT_WAVE_AUDIT_QUEUE_2026-07-28.md`.

Источник оракула: `#1057` — «клиника выбирает и оплачивает тариф через настоящий PSP, получает и продлевает
доступ».

## State

Full CI on the current `feat` head: `/home/dev/brain/host-orch/run-tests.sh 'pnpm run ci'` → **exit 0, 449s**
(21:29 MSK). Do not re-run it unless you change code.

Landed and **not yet applied to DEV / deployed to TEST**:

- `0344` capture-step grants, `0345` bootstrap resolver reconcile — billing webhook;
- `0346` trial as a one-time period + discount window (trial extension removed, `saas_tariffs.discounted_price_minor`);
- `0347` seed for the four admin-settings keys that made `/app/admin/app-settings` fail loud;
- `0348` `app.apply_paid_saas_billing_tariff(uuid,uuid)` — the narrow accessor that applies a paid tariff without
  weakening `app.reject_staff_commercial_organization_update()`.

The last live payment reached the very end and failed only on that trigger. Invoice
`9ed3f0cf-bd8e-4a1a-a034-8eee16b027c2`, `1992.14 RUB`, tariff KLINIKA — paid at the provider, not captured by us.

## Work, in order

1. `bash deploy/host/migrate-dev.sh --preflight && bash deploy/host/migrate-dev.sh --execute`. Record each journal
   idx/when. Verify against the database, not the runner's word: the new function exists and is owned by
   `app_owner`; the trial columns are as `0346` describes; the four settings keys now have rows.
2. `bash deploy/host/deploy-test.sh feat/doctor-ui-rebuild` — must end with **all closure gates green**, not just
   "units healthy". Record the log path.
3. **Finish the live payment**: clinic login, checkout, official YooKassa **test** card, webhook accepted, invoice
   leaves `pending`, `providerInvoiceRef` and `paidAt` set, and **the clinic's tariff is actually applied**. Read
   every value back through `GET /api/clinic/billing`.
4. **Then check the owner's two pages live on TEST**: `/app/account?tab=notifications` under his own account and
   `/app/admin/app-settings` under a global-admin session — both must return `200` and render.
5. If anything fails, capture the exact error and stop. Do not forge a notification, do not bypass the IP
   allowlist, do not widen a grant or disable a gate to make it pass.

## Boundaries

- **PROD (`135.106.162.170`) is untouchable.** TEST/DEV only; test shop, test key, test card.
- No product code change. If the run proves a defect, describe it precisely and stop.
- No push.

## Done means

Evidence appended to B0.3 in `SAAS_BILLING_PLAN.md`, **committed on your branch**, and a final line in plain
words: **can a clinic now pay for its tariff on TEST end to end, yes or no** — with the invoice id, the amount and
the applied tariff if yes; plus the two page statuses.
