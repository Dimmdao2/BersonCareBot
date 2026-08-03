# B0.3 — the webhook's bootstrap role cannot read its own invoice table

Rules: `AGENTS.md` — Маршрут, CORE rules, §1 «Миграции», §5, §6, §10/§10a/§10b, §24.
Language: internal work is English.

Authority: `docs/_TODO/SAAS_FOUNDATION/SAAS_BILLING_PLAN.md` item **B0.3**; task `#1057`. Live evidence:
`docs/_TODO/NIGHT_WAVE_AUDIT_QUEUE_2026-07-28.md`, line `5ae4ac526`.

Источник оракула: `SAAS_BILLING_PLAN.md` B0.3 — «Выход: клиника может оплатить тариф через существующий provider
layer»; и владелец о цели: «клиника выбирает и оплачивает тариф через настоящий PSP, получает и продлевает доступ».

## The measured defect

The owner configured the YooKassa notification URL, and on 2026-08-03 the webhook **arrived for the first time**.
It still fails, now for a real reason:

`POST /api/payments/saas-webhook/yookassa` → `500`, PostgreSQL **`permission denied for table
saas_billing_invoices`**. The webhook's first query runs **before the organization is known** (bootstrap
principal — see the route's own header comment: «Resolve the GLOBAL provider config … organization unknown yet»),
under a role that migration `0311` never granted access to, because `0311` granted only `app_clinic_billing`.

Consequence for a real person: a clinic pays, the provider confirms, and the payment never lands — the invoice
stays `pending`, the tariff is never applied, and nothing tells anyone. This is the last thing between the owner
and a working paid tariff.

Also observed in the same run and worth one line in your report, but **not** in this slice's scope: the webhook
secret has no field on the global-admin «Платежи» screen; it had to be set through the generic settings API.

## Work

1. Establish exactly which role the webhook path runs under before the organization is resolved, and which tables
   and operations it genuinely needs — invoice lookup by provider ref, the provider-event write, and whatever the
   safe-acknowledge path touches. **Grant exactly that, nothing wider.** A grant broader than the queries is a
   defect, not caution.
2. Write it as a forward migration. Reserve the number on the board in
   `docs/_TODO/NIGHT_WAVE_AUDIT_QUEUE_2026-07-28.md` **before** creating the file (repo rule).
3. Keep the deploy-time privilege assertions honest: `deploy/host/deploy-test-saas.sh` hard-asserts each runtime
   role's exact privilege set — update the registered expectation in the same commit, or the next TEST deploy
   fails closed on your own change.
4. Prove the fix with a behavioral test at the level the repo already tests this: the webhook path under the
   bootstrap principal reaches the invoice and does not raise `42501`.

## Boundaries

- No change to webhook signature/IP verification, to what a valid notification does, or to the invoice state
  machine. This is a privilege defect, not a logic one.
- **PROD (`135.106.162.170`) is untouchable.** Do not deploy; DEV apply happens after land, by the lead.
- No push, no merge into `feat`.

## Done means

- Migration written, number reserved on the board, journal consistent, self-test passes.
- The exact grant is justified in the report line by line against the queries the path actually runs.
- `pnpm --dir apps/webapp typecheck`, scoped ESLint, `git diff --check` clean; the targeted tests pass.
- One commit on `wt/billing-live-vat`. Final line: what role got what grant, and why it is the minimum.
