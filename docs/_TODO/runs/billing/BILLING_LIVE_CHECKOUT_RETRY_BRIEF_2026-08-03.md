# B0.3 — deploy the idempotence fix to TEST and finish the live payment chain

Rules: `AGENTS.md` — Маршрут, CORE rules, §1/§1b (server + dev safety), §6, §9 (full CI gate), §24.
Language: internal work is English.

Authority: `docs/_TODO/SAAS_FOUNDATION/SAAS_BILLING_PLAN.md` item **B0.3**; task `#1057`. Prior live evidence and
the exact refusal are already recorded there and in `docs/_TODO/NIGHT_WAVE_AUDIT_QUEUE_2026-07-28.md`
(lines `34d83f2ec` and `89ce666db`).

## State you are starting from

- The owner's tax values are already stored on TEST and reach YooKassa: `vatCode=1`, `taxSystemCode=2`. The old
  «Receipt is missing or illegal» refusal is gone.
- The remaining refusal was `400 invalid_request`, parameter `Idempotence-Key` — a burned key on a `draft` invoice.
- The fix is landed on `feat/doctor-ui-rebuild` (`89ce666db`, merge `02899a4cd`): a provider refusal proven to
  happen **before** payment creation rotates the key; ambiguous failures keep it.
- Full CI on the current `feat` head: `/home/dev/brain/host-orch/run-tests.sh 'pnpm run ci'` → `exit 0`, `466s`.
  Do not re-run it unless you change code.
- No new migration is involved: `0341` is still on an unlanded branch. This is a code-only TEST deploy.

## Work, in order

1. **Deploy the current `feat/doctor-ui-rebuild` to TEST**: `bash deploy/host/deploy-test.sh feat/doctor-ui-rebuild`.
   Record the exit code and the log path. If the deploy's fail-closed gates stop it, capture the exact gate output
   and stop — do not disable a gate.
2. **Retry the live payment as a clinic**, the same route the previous run used (`POST /api/clinic/billing` after a
   normal `POST /api/auth/email-password/login`). The previously stuck draft invoice
   `e13b2c92-5693-463f-8c3a-274cd198bcf7` is the interesting case: it must now advance instead of resending the
   burned key.
3. **Complete the chain**: open the YooKassa checkout, pay with a YooKassa **test** card, confirm the webhook is
   received and accepted, the invoice becomes paid, and the clinic's tariff/snapshot is actually applied. Record
   the decisive value at each step, not just status codes.
4. If it refuses again, capture the exact provider response body and parameter, state plainly what is missing, and
   stop. Do not guess values, do not disable fiscalization, do not switch provider.

## Hard boundaries

- **PROD (`135.106.162.170`) is untouchable.** TEST only. Real money is not involved: TEST shop, test key, test card.
- Do not change product code. If the run proves a code defect, describe it precisely and stop — a separate slice
  fixes it.
- Do not push. Commit only the evidence you write.

## Done means

- Evidence appended to the B0.3 paragraph of `SAAS_BILLING_PLAN.md` and committed on `wt/billing-live-vat`.
- A plain verdict as the last line of your report: **can a clinic now pay for its tariff on TEST, yes or no** — and
  if yes, name the invoice that went from draft to paid and the tariff that was applied.
