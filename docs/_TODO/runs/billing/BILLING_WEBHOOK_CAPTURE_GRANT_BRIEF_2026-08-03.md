# B0.3 — close the capture-step privilege gap and finish the payment

Rules: `AGENTS.md` — Маршрут, CORE rules, §1 «Миграции», §5, §6, §9, §24. Language: internal work is English.

Authority: `docs/_TODO/SAAS_FOUNDATION/SAAS_BILLING_PLAN.md` **B0.3**; task `#1057`. Prior accepted work:
`docs/_TODO/NIGHT_WAVE_AUDIT_QUEUE_2026-07-28.md` lines `57e43dbc2` (migration `0343`, the invoice resolver) and
`0dd512b14` (renumber). Both are **landed on `feat`**; `0343` is **not yet applied to DEV**.

Источник оракула: `SAAS_BILLING_PLAN.md` B0.3 — «Выход: клиника может оплатить тариф через существующий provider
layer»; task `#1057` — «клиника выбирает и оплачивает тариф через настоящий PSP, получает и продлевает доступ».

## The named next barrier — found by the previous run, not yet closed

After the resolver fix, the very next line the webhook executes is
`captureSaasBillingProviderWebhookEvent`, reached through `runWithDbOrganizationPrincipal`, which runs under
`SET ROLE app_staff` in locked mode. **`app_staff` was never granted anything on `saas_billing_invoices` or
`saas_billing_provider_events`** — migration `0311` granted only `app_clinic_billing`. So the payment will fail one
line later than before unless this is closed.

## Work, in order — stop at the first thing that proves a new defect

1. **Verify the gap for real** before writing anything: reproduce the exact privilege failure for the capture step
   under `app_staff`. If it turns out not to be reachable, say so and stop — do not write a migration for a
   theoretical hole.
2. **Close it as narrowly as the resolver was closed.** Follow the shape `0343` established: a narrow
   SECURITY DEFINER accessor owned by `app_owner`, or an exact grant limited to the operations the capture step
   actually performs. A grant wider than the queries is a defect, not caution. Reserve the migration number on the
   board **before** creating the file, and update the exact-grant assertion and secdef count in
   `deploy/host/deploy-test-saas.sh` in the same commit, or the next TEST deploy fails closed on your own change.
3. **Apply on DEV**: `bash deploy/host/migrate-dev.sh --preflight && bash deploy/host/migrate-dev.sh --execute`.
   This applies `0341`, `0342` and `0343` too if they are still pending — record the journal idx/when for each.
   Verify against reality, not the runner's word.
4. **Deploy TEST** with the current `feat` and finish the live chain: clinic login → checkout → official YooKassa
   **test** card → webhook arrives → application accepts it → invoice leaves `pending` → `providerInvoiceRef` and
   `paidAt` set → the clinic's tariff/snapshot actually applied. Read every decisive value back through
   `GET /api/clinic/billing`.
5. If a further defect appears, capture the exact error and stop. Do not forge a notification, do not bypass the
   IP allowlist, do not widen a grant to make it pass.

## Boundaries

- **PROD (`135.106.162.170`) is untouchable.** TEST/DEV only; test shop, test key, test card.
- Do not change webhook signature/IP verification, the invoice state machine, or what a valid notification does.
- No push.

## Done means

- The capture step works under its real role, proven by a behavioral test at the level `0343` was proven.
- Migrations applied on DEV with recorded journal values; TEST deployed with exit code.
- Evidence appended to B0.3 in `SAAS_BILLING_PLAN.md`, committed on your branch.
- Final line, plain words: **can a clinic now pay for its tariff on TEST end to end, yes or no** — and if yes, the
  invoice id, the amount, and the tariff that got applied.
