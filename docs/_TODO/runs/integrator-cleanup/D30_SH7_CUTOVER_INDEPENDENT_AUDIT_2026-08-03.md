# D30 Ш7 stages 1–4 — independent saved-oracle audit

Candidate: `623fb83c0` (`wt/trackd-d30-sh7-cutover`). Audit branch:
`wt/trackd-d30-sh7-cutover-audit`.

Verdict: **FAIL. One fixer must use the three saved RED acceptance tests; no new blind pass.**

## Findings

1. **Telegram permanent recipient failure loses the existing MAX fallback.** The new
   `appointment_reminder` branch advances its persisted ladder only when
   `isOutgoingDeliveryDispatchErrorRetryable` is true. `RecipientBlockedBotError` is intentionally
   non-retryable, so the generic path terminalizes the whole logical row instead of advancing to
   the already-materialized MAX leg. The legacy `executeJob` ladder advanced after every provider
   failure other than local outbound-policy denial. Saved oracle:
   `outgoingDeliveryWorker.scope.test.ts` — Telegram blocked must advance exactly once and must not
   mark transport sent. It is RED (`ladderTransitions 0`, expected `1`).

2. **Old persisted appointment rows do not actually survive consumer coexistence.**
   `resolveIntentForAttempt` strips policy markers, and the real outbound chokepoint rejects the
   resulting intent with `OUTBOUND_MESSAGE_POLICY_DENIED`. The candidate's old-row test uses a fake
   dispatch callback and therefore bypasses the policy gate it claims to prove. Saved oracle:
   `jobExecutor.legacy.test.ts` executes the old row through `assertOutboundMessagePolicy`; it is RED
   (`ok:false/final:true`, provider calls `0`). The no-new-legacy-producer gate itself is green.

3. **Claim-time recipient freshness omits canonical patient active state.**
   `app.revalidate_appointment_reminder_materialization` checks appointment generation, binding,
   subscription and channel/topic preferences, but not `platform_users.is_blocked`, `is_archived`,
   `merged_into_id` or global reminder mute. A patient blocked after materialization therefore still
   receives the reminder. Saved disposable-PostgreSQL oracle sets `is_blocked=true`; capability
   returns `true` and leaves the row dispatchable instead of terminalizing it.

## Kill-set coverage

- Stable identity across created/payment/reminder-update and changed reschedule generation: covered
  by product materializer tests and inspected event-id construction.
- TG success without MAX, retryable TG→MAX, one channel twice, separate Web Push leg: covered; the
  permanent-failure ladder class is the first finding.
- Cancel/reschedule/no-audience terminalization and conditional `processing` transitions: SQL uses
  conditional updates; concurrent ladder transition oracle passes. Global recipient freshness fails
  as finding 3.
- Exact policy markers/provider-zero: unified rows pass and missing markers are denied before provider;
  coexistence legacy rows fail as finding 2.
- Unique enqueue/`SKIP LOCKED` claim and tenant `organization_id` boundary reuse the established queue
  constraints. Temporary migration remains `9995`, outside the journal; no drop exists.
- D7 callbacks retain no broad `app_owner` occurrence DML: the candidate transfers the three exact
  functions to the operational table owner and the disposable test still asserts direct
  SELECT/UPDATE/DELETE false. The 0338 disposable test path includes 9995 explicitly.

## Commands and evidence

- `pnpm --dir apps/integrator test -- src/infra/runtime/worker/outgoingDeliveryWorker.scope.test.ts src/infra/runtime/worker/jobExecutor.legacy.test.ts` through the host mutex: **2 RED audit tests**, remaining suite `345 passed`, `4 expected fail`, `9 skipped`.
- `pnpm --dir apps/webapp test:postgres -- src/infra/repos/appointmentReminderDelivery.postgres.integration.test.ts src/infra/repos/reminderCallbackCapabilities.postgres.integration.test.ts src/infra/repos/patientReminderMaterialization.postgres.integration.test.ts` through the host mutex: **1 RED audit test**, remaining suite `90 passed`.
- `pnpm --dir apps/integrator check:d30-no-legacy-message-retry-producers`: PASS.
- `node scripts/check-no-new-raw-sql.mjs`: PASS, production debt `0`.
- `git diff --check`: PASS.

No product, migration body/journal, environment, persistent DB or deploy was changed by the audit.
