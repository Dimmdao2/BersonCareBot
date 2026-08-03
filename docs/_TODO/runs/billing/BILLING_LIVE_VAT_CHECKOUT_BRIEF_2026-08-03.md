# B0.3 — live TEST tariff payment with the owner's tax values

Rules: `AGENTS.md` — read Маршрут, CORE rules, §1/§1b (server + dev safety), §2/§3/§4 (integration config lives in
the DB), §6 (host PostgreSQL), §24. Language: internal work is English.

Authority: `docs/_TODO/SAAS_FOUNDATION/SAAS_BILLING_PLAN.md`, item **B0.3** (its «Фискализация» paragraph records
everything already done and names exactly what is missing). Task card `#1057`.

## The one thing that was missing is now decided by the owner

The owner stated his tax status on 2026-08-03: **УСН «Доходы», без НДС, никаких медицинских услуг.**
Therefore, for the YooKassa receipt:

- `vatCode` = **`1`** (без НДС)
- `taxSystemCode` = **`2`** (УСН доход) — set it as well; a «Чеки от ЮKassa» configuration ignores the field, a
  third-party cash register requires it, and `2` is the owner's actual regime either way.

Do not invent, round or re-derive these values. They are the owner's answer; use them verbatim.

## Work, in order

1. **Write the values through the existing product path.** The global-admin screen «Платежи»
   (`apps/webapp/src/app/app/admin/payments/SaasBillingProviderSettings.tsx`) edits the `saas_billing_payment_provider`
   setting via `PATCH /api/admin/settings`. Use that path on **TEST** (`https://test.bersoncare.ru`) under a real
   global-admin session. Getting that session is your job: you run as `dev-lead` with full host access (sudo,
   postgres, root-owned env under `/opt/env/bersoncarebot/`) — use whatever legitimate route works, and write down
   exactly which one you used. Do NOT add a new API, table or bypass to make this easier.
2. **Verify the write.** `GET /api/admin/settings` returns `vatCode: "1"` and `taxSystemCode: "2"`; the API key is
   still redacted.
3. **Run the live payment end to end on TEST** as a clinic: `POST /api/clinic/billing` (or whatever the current
   checkout entry point is — find it, do not guess) → YooKassa checkout URL → pay with a YooKassa **test** card →
   webhook arrives and is accepted → invoice becomes paid → the clinic's tariff/snapshot is actually applied.
   Record the status code and the decisive value at each step.
4. **If YooKassa still refuses**, capture its exact response body and parameter name, state what is missing, and
   stop. Do not guess another tax value, do not disable fiscalization, do not switch provider.

## Hard boundaries

- **PROD (`135.106.162.170`) is untouchable.** TEST and DEV only. No prod dump, no prod service, no prod DB.
- Do not change `feat`, do not push, do not deploy. If a code change turns out to be required, make it minimal on
  your branch `wt/billing-live-vat` and say so — but the expectation is that no code change is needed, only settings
  plus the live run.
- Real money is not involved: TEST shop, test key, test card.

## Done means

- The two values are stored and read back through the product path on TEST.
- Either the full chain checkout → payment → webhook → applied tariff is proven with live status codes and values,
  or the exact provider refusal is captured with its parameter name.
- Evidence appended to the B0.3 paragraph of `docs/_TODO/SAAS_FOUNDATION/SAAS_BILLING_PLAN.md`, committed on
  `wt/billing-live-vat` (one commit, no push).
- Final report: which session route you used, every command with its status code, and a plain verdict — is a clinic
  now able to pay for its tariff on TEST, yes or no.
