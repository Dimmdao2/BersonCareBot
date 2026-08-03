# B0.3 — apply the paid tariff without fighting the staff guard

Rules: `AGENTS.md` — Маршрут, CORE rules, §1 «Миграции», §5, §6, §9, §24. Language: internal work is English.

⚠️ **One-shot agent, no next turn** (`AGENTS.md` §24.2): never end while something runs in the background;
**commit before you finish**.

Authority: `docs/_TODO/SAAS_FOUNDATION/SAAS_BILLING_PLAN.md` **B0.3**; task `#1057`. Live evidence:
`docs/_TODO/NIGHT_WAVE_AUDIT_QUEUE_2026-07-28.md`, line `824e2fee1` / `9c7e16611`.

Источник оракула: `#1057` — «клиника выбирает и оплачивает тариф через настоящий PSP, получает и продлевает
доступ». Today the payment reaches the provider, the webhook arrives and is accepted, and only the **last** step —
applying the tariff — fails.

## The measured defect

The webhook capture path runs under `SET ROLE app_staff`. The trigger
`app.reject_staff_commercial_organization_update()` (a long-standing guard from `0225`/`0297`, unrelated to this
work) unconditionally forbids `app_staff` from changing `be_organizations.tariff_id`. The transaction rolls back
atomically — the invoice stays `pending`, nothing is corrupted, the test money moved on the provider side only.

The guard is right: clinic staff must not raise their own commercial terms. The webhook is not staff — it is the
platform acting on a payment the provider already confirmed.

## The decision (lead, engineering — do not re-open it)

Apply the tariff through a **narrow SECURITY DEFINER accessor owned by `app_owner`**, in the same shape as the
`0343` invoice resolver accepted earlier today. Not by running the capture under `app_staff`, not by widening or
weakening the guard, and not by granting `app_staff` a tariff write.

Hard requirement on that accessor: it applies the tariff **only for an invoice that is actually paid** — it takes
the invoice, verifies its paid state and its organization inside the function, and refuses anything else. It must
be impossible to use it to set an arbitrary tariff on an arbitrary organization.

Consider `app_clinic_billing` as an alternative only if the accessor route proves impossible, and say why in the
report.

## Work

1. Write the accessor and the migration (temporary number in your clone; the final one is assigned at land).
2. Route the capture step's tariff application through it.
3. Update the deploy-time privilege expectations in `deploy/host/deploy-test-saas.sh` and the C5A overlay in the
   same commit — including the SECURITY DEFINER count — or the next TEST deploy fails closed on your own change.
   Note: that count was already bumped twice today; read the current value, do not assume.
4. Behavioral proof at the level `0343` was proven: under a role holding only the new EXECUTE grant, a paid
   invoice applies its tariff; an unpaid invoice does not; a foreign organization does not; the staff guard still
   refuses a direct `app_staff` update.
5. Apply on DEV, deploy TEST, and **finish the live payment**: invoice leaves `pending`, `providerInvoiceRef` and
   `paidAt` set, the clinic's tariff/snapshot actually applied — read back through `GET /api/clinic/billing`.

## Boundaries

- **PROD (`135.106.162.170`) is untouchable.** TEST/DEV only; test shop, test key, test card.
- Do not modify the guard trigger. Do not change webhook signature/IP verification or the invoice state machine.
- No push.

## Done means

Green TEST deploy, and a final line in plain words: **can a clinic now pay for its tariff on TEST end to end, yes
or no** — with the invoice id, the amount, and the tariff that got applied.
