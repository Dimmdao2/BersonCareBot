# Audit brief — S3 candidate: the invoice-check screen before the payment provider

Role: independent reviewer of code you did not write. Do not accept the author's report or a green
test run as evidence; confirm each claim against the running application and the database.

**First step — classify each claim: «тест или взгляд».** Say which you chose and why, then do it.
This candidate serves a route that answers **without a session**, backed by a new `SECURITY DEFINER`
pre-session SQL root. A prediction from reading, where a live DEV request was possible, makes the
review worthless.

Candidate: `355722b8c` (worker) + `57af870ec` (lead correction) on branch
`wt/prepayment-s3-check-screen` in this clone.
Owner plan — the only source of done:
`docs/_TODO/APPOINTMENT_PREPAYMENT_VISIBILITY_2026-09-11.md`, stage **S3** (S3.1, S3.2, S3.3).

Источник оракула: `docs/_TODO/DOCTOR_MOBILE_UI_OWNER_ACCEPTANCE_2026-09-04.md` §K2 `PAY-APPT-11` —
«Если предоплата не поступила до дедлайна, бронь автоматически освобождается, а запись получает»
однозначный истёкший/отменённый статус согласно действующей модели.

## What to verify, in priority order

1. **Minimal disclosure on a route with no session.** `/book/pay/<uuid>` answers any caller. Confirm
   the response reveals nothing beyond what the holder of the link needs: compare a valid uuid
   belonging to another clinic, an unknown uuid, and a string that is not a uuid — body, headers,
   status code and response time should not let the caller tell these apart. Confirm no patient
   name, phone, service, clinic name or provider URL appears for a dead invoice. Send real requests
   to the running DEV app rather than reasoning about the code. The root claims a single
   constant-shape statement for every uuid — check that claim against the actual query plan and the
   actual responses.
2. **An expired invoice must not be payable.** The owner's rule (11.09, verbatim): «он уже не должен
   оплатить в момент, когда закончилось время». Walk each path that could get a patient to the
   provider after expiry and say which our screen stops and which it cannot: a link opened one
   second before expiry and followed after; browser Back to an already-open provider page; a cached
   307 (check `Cache-Control` on every branch); the provider page opened from a previously copied
   URL. For the ones our screen cannot stop, say which mechanism is supposed to — the provider's own
   `expires_at` from stage S2 — and whether it is actually configured.
3. **Least privilege of the new root.** `app.read_booking_payment_check(uuid)` runs as
   `app_seam_payment_webhook_owner` for role `app_pre_session`. Confirm `app_pre_session` gained NO
   direct relation grant on `be_payment_intents` or `be_appointments`. Run
   `check:db-privileges-generated` yourself and confirm a hand-edited generated artifact would be
   caught. A `GRANT` living only in a migration is a fake — reconcile re-applies the declaration.
4. **The single-link rule (S3.1).** The lead's reading: `exposeIntentCheckoutUrl` sits at the service
   boundary (`service.ts:91`) and is applied at every read site (`:442`, `:499`, `:801`), so the
   provider URL never reaches a human — including the S5 notification text, which takes
   `paymentIntent.checkoutUrl` from `createAppointmentPaymentIntent`. Check this by search, not by
   trusting the call-site list: grep for the provider hosts across the repository and report any path
   where a provider domain still reaches a patient, a doctor screen, an email, a messenger message
   or a QR code.
5. **Fail-closed vs fail-silent.** When `resolvePatientPublicOrigin` is missing, the service returns
   `checkoutUrl: null` — no link at all. Is that reachable in production, and what does a patient see
   when it happens? Separately: the lead added a 503 «Не удалось проверить счёт» branch so that our
   own outage cannot tell a patient his live booking is cancelled. Confirm the split is real and that
   the 503 path cannot be reached for a genuinely dead invoice, which must stay 410.
6. **The removed deadline.** The lead removed the deadline from the failure screen because the
   pre-session root carries no clinic timezone and a deadline shown in the wrong zone is a money
   defect. Judge whether the screen is still useful without it, and whether anything else on that
   screen is rendered in a zone it cannot know.

## Boundaries

- You may change code temporarily to establish a fact; revert production code afterwards.
- Product fixes are NOT your job — report them.
- A finding with no matching checkbox in the owner plan is a QUESTION for the lead, not a FAIL.
- DEV database is `bcb_webapp_dev`. PROD is untouchable, including reads.
- `AGENTS.md` §10a and §10 before accepting or writing any test. Fewer tests is better. A test that
  pins wording or element counts is not evidence — say so.
- The main tree carries unrelated uncommitted work by other agents; `pgJournalRetention.ts`
  typecheck errors are not this candidate's.
- Heavy runs go through `/home/dev/brain/host-orch/run-tests.sh "<cmd>"`.

## Deliverable

A verdict line `PASS` or `FAIL`, then per item: what you ran or read, what you observed, and the
concrete failing input where you found one. End with an explicit «NOT CHECKED» list.
