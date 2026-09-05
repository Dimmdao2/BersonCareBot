# Blind kill-set — booking acquiring webhook settlement (#215)

Written BEFORE reading the candidate's tests (AGENTS §10b «Слепой список поломок составляет аудитор»,
§24.5). Source: authority brief (YooKassa TEST 3×400, money taken, appointment stayed unpaid),
candidate non-test diff `cf748226e..a0ab149ff`, AGENTS §1 / §5 / §9–§10b.

Candidate under audit: HEAD `d116c51a4` (merge of `a0ab149ff` with integration head `59ba2ea81`).

| # | Named breakage — "fed this → got that wrong" | Boundary |
|---|---|---|
| K1 | Two DISTINCT provider event/idempotency keys for the SAME intent: the 2nd event inserts a fresh journal row (`v_inserted = true`), the intent CAS matches nothing, the payment row already exists, yet the root still returns `outcome='captured'` + `paymentId` + a non-empty `confirmedAppointmentIds` (the loop appends unconditionally). Service re-fires `onAppointmentPaymentConfirmed` → the patient is notified a SECOND time for one payment. | exactly-once notification |
| K2 | Same as K1 under CONCURRENT delivery of the two distinct keys: both transactions pass, both return `captured`, both notify. | exactly-once notification |
| K3 | `INSERT INTO be_payment_history_events … ON CONFLICT DO NOTHING` with NO conflict target: if no unique index actually covers the row, a 2nd distinct-key delivery appends a 2nd `payment_captured` history row → duplicated money history for one capture. | money journal integrity |
| K4 | Concurrent delivery of the SAME key: the loser's `ON CONFLICT DO NOTHING` returns no id and its follow-up `SELECT` cannot see the winner's uncommitted row → `outcome='not_found'`, HTTP 200 to the provider. If the winner then rolls back, the provider stops retrying and the payment is never settled. | acknowledgement semantics |
| K5 | `ON CONFLICT (provider_id, idempotency_key, event_type)` / `ON CONFLICT (payment_intent_id)` name index specs that may not exist → `42P10` at the first live delivery; the webhook 400s exactly as before. | root executes at all |
| K6 | `app.resolve_payment_webhook_organization` body still asserts the OLD principal (`app_patient` role / patient class) in its own `require_accepted_context`, while the declaration moved its gate to `pre_session` → the bootstrap call still fails, the original 400 is not actually fixed. | bootstrap org resolution |
| K7 | Missing table privileges for `app_seam_payment_webhook_owner` on any of the 7 touched relations (esp. `UPDATE` on `be_appointments`, `INSERT` on `be_patient_timeline_events`, `be_appointment_history_events`) → `42501` on the first live capture; migration+reconcile+deploy stay green (AGENTS §1 «Перед приземлением миграции»). | central privileges |
| K8 | FORCE RLS on the touched tables with no policy for the seam owner → definer body denied at runtime. | tenant isolation |
| K9 | Accepted-context hash mismatch between the TS caller (`runWebappNamedRoot` arg encoding) and `app.hash_port_typed_args(ARRAY[ROW('text@1', textsend($n))…])` → every delivery rejected. | accepted context |
| K10 | The root takes NO organization argument but the service still passes `organizationId`; if any path lets the caller's accepted context differ from `input.organizationId`, settlement lands in another tenant (or the post-commit `onPackagePaymentCaptured` is called with the wrong `organizationId`). | tenant isolation |
| K11 | Behaviour lost vs the removed `captureIntentSuccess` path: guard against capturing a `canceled`/`refunded` intent, duplicate-history guard (`hasCapturedHistoryEvent`), membership/package side effects, appointment-chain handling — anything the SQL does not reproduce is a silent regression. | settlement completeness |
| K12 | Non-success event (`payment.canceled`) or unknown/missing intent must still mark the event processed and ACK 200; if it throws or leaves `processed_at` NULL the provider retries forever. | acknowledgement semantics |
| K13 | `parseProviderWebhookSettlement` must REJECT an unknown SQL outcome rather than degrade to "nothing settled"; a widened/looser type or a `catch` upstream would silently swallow money outcomes. | parsing/types |
| K14 | Generated privilege artifacts out of sync with `declaration.ts` (regenerate → non-empty diff), or the migration violates §1 (GRANT/REVOKE inside it, wrong owner marker, missing VERIFY probe, name format). | landing requirements |
| K15 | Other `PaymentsPort` implementations (fakes, in-memory, tests) not updated with `settleProviderWebhookEvent` → typecheck break / route unreachable. | build gate |
