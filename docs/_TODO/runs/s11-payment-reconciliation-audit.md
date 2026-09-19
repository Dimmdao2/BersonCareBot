# S11 PAY-REL-04 — independent audit

## Candidate

- Candidate: `1d518c38a7ddd17cfd616fe1880b877d7249174a`
- Base: `a2fe36524f1561e4baf44f1669a4bc1ea32e0537`
- Branch: `wt/payment-reconciliation`
- Authority: `docs/_TODO/APPOINTMENT_PREPAYMENT_VISIBILITY_2026-09-11.md` PAY-REL-04 and
  `docs/_TODO/runs/s11-payment-reconciliation-brief.md`

## Test or inspection classification

Classified before reading existing tests.

- Architecture and scope boundaries (one provider adapter, one settlement root, existing scheduler and queue,
  no new payment journal/env/UI/process): inspect the candidate diff, imports/call graph, schema and composition
  roots. These are structural facts, so a permanent source/registry test would duplicate implementation.
- SQL migration, ownership, grants, tenant principal order and rollback safety: inspect the migration and privilege
  declarations, run generated privilege/order gates, and run the canonical owner-aware rollback-only preflight.
  PostgreSQL's own FK/transaction behavior is not an application acceptance test.
- Queue materialization, independent tenant sweep scheduling, provider adapter use, settlement idempotency,
  terminal-state monotonicity, post-expiry success, checkpoint advancement, truncation/mismatch/retry incidents:
  eligible for blind behavioral acceptance only where the oracle is independent and the observed consequence is
  a durable queue/money/history/outbox/notification/incident/checkpoint fact. Otherwise inspect or exercise with a
  one-off command.
- Final diff and absence of a second settlement algorithm: inspect. This is not a reason for a source-text test.

## Blind kill-set

Written before opening existing test files.

1. Given a due `pending` or `processing` appointment intent, a wake produces exactly one active low-priority
   `outgoing_delivery_queue` point-lookup row. A repeated or overlapping wake does not produce a second active row.
   Expensive silent failure: an invoice is never reconciled, or repeated cadence amplifies provider calls.
   Independent oracle: durable queue rows keyed by local intent, not the implementation's returned counter.
2. Given two organization/provider bindings, sweep work is materialized separately for each binding. A failure or
   retry exhaustion for one tenant leaves the other tenant's row claimable and processable.
   Expensive silent failure: one clinic's provider outage blinds reconciliation for other clinics.
   Independent oracle: organization-scoped durable queue rows and completion/incident state per row.
3. Processing a point row and a sweep row calls only the authenticated `PaymentProviderPort` capability after the
   organization principal is accepted. The resident scheduler performs no provider I/O and holds no long provider
   batch.
   Check primarily by call-graph/DI inspection; if fault injection is needed, a fake port records point/list calls
   while a scheduler wake is expected to record none.
4. A provider success found by point lookup or sweep enters `settleProviderWebhookEvent` and the existing atomic
   settlement/outbox root with the webhook-compatible event idempotency key. Repeating point lookup, overlapping
   sweep and a later webhook leaves exactly one money fact, appointment payment/history fact, outbox fact and
   Notification-producing lifecycle fact.
   Expensive silent failure: duplicate money/history/patient notification.
   Independent oracle: final durable fact counts and stable keys, not calls to the settlement method.
5. Provider metadata cannot choose the organization. Before settlement, the candidate rejects a wrong provider
   reference, local intent/idempotency binding, payer, purpose, appointment subject, amount or currency.
   Expensive silent failure: cross-tenant or wrong-invoice money attribution.
   Independent oracle: no settlement facts plus a low-cardinality mismatch/unbound incident under the locally
   accepted organization.
6. A provider `canceled`/`expired` observation may transition only a local `pending`/`processing` intent. It cannot
   lower a `succeeded`/captured intent, rewrite captured money, or emit a `payment_captured` lifecycle fact.
   Expensive silent failure: acknowledged money disappears or patients receive a false capture.
   Independent oracle: unchanged durable succeeded/money/outbox state after the observation.
7. Provider success after local expiry/cancel is still settled as money, does not revive the appointment, and opens
   one stable `success_after_local_expiry` incident. Repeats do not duplicate either money or incident.
   Expensive silent failure: received money is unaccounted or a canceled appointment is silently resurrected.
   Independent oracle: captured money present, appointment still canceled, one incident with the stable key.
8. A sweep requests `[min(watermark - overlap, oldest unresolved), safe upper bound]`. It advances its durable
   checkpoint only after a complete, untruncated pass in which every appointment-looking item is resolved. A crash
   before checkpoint repeats safely; a retry after settlement does not duplicate downstream facts.
   Expensive silent failure: a durable blind time window loses provider successes.
   Independent oracle: provider fake's requested bounds plus durable checkpoint and downstream fact counts.
9. A truncated list, appointment-looking unbound item, binding mismatch, bounded timeout/5xx exhaustion and
   unavailable provider capability result in a retry or distinct low-cardinality operator incident. Error/incident
   material contains no credential, checkout URL, raw provider payload or patient data.
   Expensive silent failure: reconciliation skips money without an operator signal or leaks protected data.
   Independent oracle: durable retry/incident category and an allowlisted metadata shape.
10. Every point/sweep row accepts the tenant principal before provider config/read/settlement. New roots/tables have
    minimal declared privileges, organization/provider ownership, correct migration ordering and owner-aware
    rollback safety.
    Check by architecture/migration inspection, privilege generation/order commands and canonical rollback-only
    migration preflight; do not encode grants or source strings in a new test.
11. Cadence remains resident and bounded: the existing scheduler only invokes the existing signed webapp wake path,
    uses the existing `outgoing_delivery_queue`, and adds no scheduler process, queue, payment journal, environment
    setting, system setting, UI or manual-only fallback.
    Check the complete diff and call graph; no permanent absence-of-text test.
12. Generic/SaaS reconciliation cannot close appointment-specific retry or incident state merely because its own
    scan did not observe an item, and appointment reconciliation does not settle through the SaaS invoice root.
    Expensive silent failure: a real appointment mismatch is hidden or applied to the wrong ledger.
    Independent oracle where exercised: appointment incident remains open and SaaS invoice facts remain unchanged.

## Evidence and result

### Result: FAIL — MUST FIX

The exact candidate does not pass PAY-REL-04. No product fix was made by this auditor.

#### F1 — the candidate does not typecheck

- Reachable scenario: building/typechecking the webapp reaches the new reconciliation process
  route.
- Impact: the candidate cannot pass its application build gate.
- Violated requirement: worker brief requires webapp typecheck/lint on the changed applications;
  repository §24.7 requires green applicable gates.
- Evidence: `pnpm --dir apps/webapp typecheck` fails only at
  `apps/webapp/src/app/api/integrator/appointment-payment-reconciliation/process/route.ts:40` with
  `TS2783: 'ok' is specified more than once`. The route constructs `{ ok: true, ...result }`, while
  both reconciliation service results already contain `ok`.

#### F2 — a due point row runs only once in the lifetime of an unresolved intent

- Reachable scenario: the first point lookup observes `pending`. The worker marks the row `sent`.
  At the next ten-minute wake the active-row predicate permits another insert, but its immutable
  event id is again `appointment-payment-reconcile:intent:<intentId>`; the queue's unique `event_id`
  makes `ON CONFLICT DO NOTHING` discard it forever.
- Impact: a long-lived payment stops being point-reconciled after its first observation; a later
  terminal result or missed success is left to the finite sweep window and can be lost silently.
- Violated requirement: PAY-REL-04 and the worker brief require resident reconciliation to
  regularly re-read due nonterminal appointment intents, while suppressing only an active duplicate.
- Evidence: migration lines 39–56 select nonterminal intents, exclude only active rows, but insert a
  lifetime-stable event id. This is an inspection finding; testing it by reading SQL text is
  prohibited and the candidate migration was not executed.

#### F3 — the YooKassa point lookup treats an invoice id as a payment id

- Reachable scenario: every appointment prepayment with `expiresAt` uses `POST /v3/invoices` and
  stores the returned `in-…` invoice id as `providerIntentRef`; reconciliation sends that exact id
  to `GET /v3/payments/{id}`.
- Impact: the point lane receives YooKassa `404`, retries and exhausts instead of seeing the linked
  payment and settling received money.
- Violated requirement: the worker brief requires an authenticated provider point lookup through
  the existing adapter and preservation of both provider object ref and local invoice ref.
- Independent oracle: YooKassa documents invoice reconciliation as `GET` invoice first, then use
  `payment_details.id` to read the linked payment:
  <https://yookassa.ru/developers/payment-acceptance/scenario-extensions/invoices/payments>.
- Evidence: `createIntent` stores the invoice response id at adapter lines 330–378; `getPaymentStatus`
  calls the payments endpoint with it at lines 560–563. The new acceptance test fails on the exact
  candidate with `yookassa_payments_fetch_failed:404`.

#### F4 — an appointment-looking unbound provider item advances the checkpoint

- Reachable scenario: a succeeded provider item retains `appointmentId`/appointment `subjectRef`
  and invoice binding but has absent or damaged `metadata.purpose`.
- Impact: the item is silently skipped and the checkpoint advances; after overlap passes, received
  money has no automatic route into the local journal.
- Violated requirement: the worker brief requires every appointment-looking item to be resolved
  before checkpoint advancement, and requires an unbound item to become a diagnosable incident or
  retry.
- Evidence: service lines 903–910 use `purpose` as the sole appointment-looking discriminator and
  `continue`; lines 923–925 then advance the watermark. The new acceptance test observes the
  checkpoint side effect and fails because it was called once.

#### F5 — required incident categories are erased before the operator boundary

- Reachable scenario: list truncation, binding mismatch, unavailable provider capability, or
  timeout/5xx exhaustion throws its specific low-cardinality code in webapp. The process route
  replaces every error with `internal_error`; the integrator later records only one of two row-kind
  classes, `appointment_payment_reconciliation_intent_exhausted` or
  `appointment_payment_reconciliation_sweep_exhausted`.
- Impact: the operator cannot distinguish a provider outage from a truncated ledger scan or a
  payment-binding defect, so a received-money discrepancy is not diagnosable by its required stable
  category.
- Violated requirement: the worker brief explicitly requires distinct low-cardinality incidents for
  truncated list, appointment-looking unbound item, binding mismatch and terminal retry/capability
  failure.
- Evidence: webapp route lines 41–42; integrator worker lines 212–232 and 767–770. No PII, secret,
  checkout URL or raw payload was found in the two surviving generic incident shapes.

#### F6 — `success_after_local_expiry` is neither durable nor observable

- Reachable scenario: provider success is found for a locally `cancelled`/`failed` intent. The
  service returns `incidentKey: success_after_local_expiry`, but the signed client parser has no
  field for it and the worker marks the queue row sent after checking only `ok`.
- Impact: money may still pass through the canonical root, and the appointment is not resurrected,
  but the required operator incident is never created. In addition, once local expiry moves the
  intent out of `pending`/`processing`, it no longer anchors `oldestUnresolvedCreatedAt`; a
  long-lived payment created before the one-hour overlap can therefore disappear from later
  provider lists by `created_at`.
- Violated requirement: the worker brief requires received money after local expiry/cancel to be
  accounted without reviving the appointment and to create a stable
  `success_after_local_expiry` incident; the sweep window must not drop a long-lived unresolved
  invoice.
- Evidence: service lines 872–876 return the transient key; `webappEventsClient.ts:50–119` parses no
  such field; worker lines 763–771 discard the response body. Migration lines 145–149 anchor only
  `pending`/`processing` intents.

### Kill-set disposition

1. **FAIL** — active duplicate suppression exists, but lifetime-stable point `event_id` prevents all
   later due rows (F2).
2. **PASS by inspection** — sweep rows are organization/provider-scoped; `runOutgoingDeliveryWorkerTickInner`
   catches/finalizes each claimed row inside its loop, so one tenant failure does not stop later rows.
3. **FAIL / PASS split** — scheduler performs no provider I/O and uses the signed wake; provider calls
   stay in the existing YooKassa adapter, but invoice point lookup is invalid (F3). The permanent
   cadence acceptance test passes and its targeted mutation fails.
4. **PASS** — both reconciliation lanes call the existing `settleProviderWebhookEvent` port, whose
   only repository implementation calls `app.settle_booking_payment_webhook_event`; no second money
   settlement algorithm was found. The webhook-compatible-key acceptance test passes and its
   suffix mutation fails. Existing webhook/settlement regressions pass `36/36` under the exact
   command below.
5. **PASS by inspection** — the signed process route accepts the organization principal before
   `buildAppDeps`; local named roots read that accepted organization. Binding validation covers
   provider ref, intent/idempotency key, payer when present, purpose, appointment subject, amount
   and currency before the atomic root.
6. **PASS by inspection/preflight** — the processed terminal-event trigger only changes
   `pending`/`processing` intent rows for `payment.canceled`/`payment.expired`; the accepted root does
   not create captured facts for non-success events and cannot lower an already succeeded intent.
7. **FAIL** — the settlement root preserves money and only promotes an `awaiting_payment`/`paid`
   appointment, so it does not resurrect a canceled appointment; the required durable incident and
   long-lived post-expiry discovery are absent (F6).
8. **FAIL / PASS split** — the nominal formula is
   `[min(watermark - 1h, oldest unresolved), now]`; truncation and thrown binding failures prevent
   advancement, and the root is idempotent. An appointment-looking item with damaged purpose is
   silently skipped and advances the checkpoint (F4).
9. **FAIL** — retries are bounded and incident data is low-cardinality, but the required diagnostic
   categories collapse to two generic exhausted-row classes (F5).
10. **PASS** — tenant principal precedes config/provider/settlement; checkpoint table has no direct
    runtime grants; all new roots use exact declared owners/capabilities. Generated privilege/order
    gates and owner-aware rollback-only preflight pass.
11. **PASS** — diff adds no environment setting, system setting, UI, process, payment journal or
    second queue. Existing resident scheduler and `outgoing_delivery_queue` are reused. Exact empty
    check:
    `git diff --name-only a2fe36524..1d518c38a | rg '(^|/)(\.env|.*ui|.*UI)|package\.json|pnpm-lock|system_settings|journal|scheduler.*service' || true`.
12. **PASS by inspection** — appointment work resolves only appointment intents and reaches the
    booking-payment root; existing SaaS `listPayments` remains a separate contract over the same
    adapter helper. No generic/SaaS incident-closing write was added.

### Behavioral acceptance tests and fault injection

Four independent behavioral fault classes were caught; three additional real broken classes (F2,
F5, F6) remain uncaught by behavioral tests and are proven by call-graph/final-state inspection.
The other five kill-set entries were classified inspection/preflight-only before tests.

- `yookassa appointment invoice point reconciliation` — oracle: published YooKassa invoice→payment
  protocol; expensive silent failure: all deadline-bound appointment point reads exhaust and money
  is not settled; final consequence: adapter cannot return the linked succeeded provider fact.
  Exact candidate: **RED**.
- `PAY-REL-04 appointment provider sweep checkpoint` — oracle: owner PAY-REL-04/worker brief;
  expensive silent failure: checkpoint passes an unresolved appointment-looking success; final
  consequence: durable watermark advances and the success leaves the future window. Exact candidate:
  **RED**.
- `scheduler leader cadence` reconciliation wake — oracle: PAY-REL-04 resident automatic cadence;
  expensive silent failure: no durable reconciliation work is ever materialized; final consequence:
  signed wake side effect is absent. Exact candidate: **GREEN**. Temporary removal of the cadence
  call produced `expected 1 times, got 0`; restoration returned it to green.
- `point reconciliation settlement identity` — oracle: PAY-REL-04 requires the webhook-compatible
  key and accepted atomic root; expensive silent failure: reconciliation and a later webhook can
  diverge into duplicate money/history/outbox/Notification facts; final consequence: the canonical
  settlement boundary receives a different event identity. Exact candidate: **GREEN**. Temporary
  suffix `:fault` made the test red; restoration returned it to green.

No UI/DOM/copy/source/registry/SQL-shape test was added. Both fault injections changed production
code only temporarily and were reversed with `apply_patch`; final
`git status --short` contains only the three acceptance-test paths and this audit artifact.

### Commands

- Candidate identity:
  `git rev-parse HEAD` → `1d518c38a7ddd17cfd616fe1880b877d7249174a`;
  `git merge-base a2fe36524 1d518c38a` → `a2fe36524f1561e4baf44f1669a4bc1ea32e0537`.
- Dependency install: `pnpm install --frozen-lockfile` — PASS; `git diff -- pnpm-lock.yaml` remained
  empty.
- Existing webapp provider/webhook/settlement set:
  `pnpm --dir apps/webapp exec vitest run src/modules/payments/providerWebhookSettlement.test.ts src/modules/payments/service.test.ts src/infra/repos/pgPayments.providerWebhook.principal.unit.test.ts src/app-layer/booking/appointmentPaymentConfirmedHandler.d14.test.ts`
  — PASS, `36/36`.
- Existing scheduler/lock/worker/queue set:
  `pnpm --dir apps/integrator exec vitest run src/infra/runtime/scheduler/fixedCadenceWake.unit.test.ts src/infra/runtime/scheduler/schedulerLockedTick.unit.test.ts src/infra/runtime/worker/outgoingDeliveryWorker.bookingLifecycle.s11.test.ts src/infra/runtime/worker/outgoingDeliveryWorker.scope.test.ts src/infra/db/repos/outgoingDeliveryQueue.namedRoot.unit.test.ts`
  — PASS, `34/34` before the added scheduler acceptance case; the added case is separately green.
- Exact-candidate acceptance command:
  `pnpm --dir apps/webapp exec vitest run src/infra/payments/yookassaPaymentProvider.unit.test.ts src/modules/payments/appointmentPaymentReconciliation.unit.test.ts`
  — expected audit FAIL, `2 failed / 10 passed`; the failures are F3 and F4.
- Fault injection, scheduler:
  `pnpm --dir apps/integrator exec vitest run src/infra/runtime/scheduler/schedulerLockedTick.unit.test.ts -t "wakes appointment payment reconciliation"`
  — GREEN on candidate, RED after removing the wake, GREEN after restoration.
- Fault injection, event identity:
  `pnpm --dir apps/webapp exec vitest run src/modules/payments/appointmentPaymentReconciliation.unit.test.ts -t "webhook-compatible identity"`
  — GREEN on candidate, RED with the `:fault` suffix, GREEN after restoration.
- Typecheck after building the five existing workspace prerequisites:
  `pnpm --dir apps/integrator typecheck` — PASS;
  `pnpm --dir apps/webapp typecheck` — FAIL with F1 only.
- Lint:
  `pnpm --dir apps/integrator lint` — PASS;
  `pnpm --dir apps/webapp lint` — PASS;
  final modified-test check
  `pnpm --dir apps/webapp exec eslint src/infra/payments/yookassaPaymentProvider.unit.test.ts src/modules/payments/appointmentPaymentReconciliation.unit.test.ts`
  — PASS.
- Privilege generation:
  `pnpm run check:db-privileges-generated` — PASS for DEV/TEST/PROD privilege, allowlist and
  port-context artifacts.
- Migration order: `node deploy/postgres/privileges/migration-order.mjs` — PASS.
- Targeted privilege/order tests:
  `node --test deploy/postgres/privileges/migration-order.test.mjs deploy/postgres/privileges/port-context-catalog.test.mjs deploy/postgres/privileges/named-root-column-mapping.test.mjs deploy/postgres/privileges/row-lock-privileges.test.mjs deploy/postgres/privileges/appointment-prepayment-least-privilege.test.mjs deploy/postgres/privileges/function-census.test.mjs deploy/postgres/privileges/relation-access.test.mjs`
  — PASS, `115/115`.
- Owner-aware rollback-only migration preflight:
  `bash deploy/host/migrate-dev.sh --preflight --runtime-env-root /home/dev/dev-projects/BersonCareBot`
  — PASS; `pending=1 total=241 unapplied=0`, transaction rolled back.
- Single settlement-root inspection:
  `rg -n "settleProviderWebhookEvent|settle_booking_payment_webhook_event" apps/webapp/src/modules/payments/service.ts apps/webapp/src/infra/repos/pgPayments.ts apps/webapp/src/app/api/integrator/appointment-payment-reconciliation apps/integrator/src`
  — only service calls plus the existing repo/root implementation.
- Provider I/O isolation:
  `rg -n "api\.yookassa|globalThis\.fetch|fetch\(" apps/integrator/src/infra/runtime/scheduler apps/webapp/src/app/api/integrator/appointment-payment-reconciliation apps/webapp/src/modules/payments/service.ts || true`
  — empty; provider I/O remains in the existing adapter.
- Candidate had no reconciliation tests:
  `git diff --name-only a2fe36524..1d518c38a | rg '\.(test|spec)\.(ts|tsx|mjs)$' || true`
  — empty.
- `git diff --check a2fe36524..1d518c38a` — PASS.

Full CI, migration execute, deploy, live UI and push were not run, as prohibited by the audit brief.
