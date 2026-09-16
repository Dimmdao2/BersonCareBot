# Independent audit — booking acquiring webhook settlement (MONEY-13, #215)

**Verdict: PASS.** No blocking finding. Four recommendations below are non-blocking under AGENTS §24.6
(no owner requirement or repo-rule violated, no regression).

- Candidate SHA: `d116c51a497505312f17d34220f3b8a30fb26857` (`wt/webhookfix` HEAD, merge of worker
  `a0ab149ff` with integration head `59ba2ea81`).
- Implementation diff isolated from the merge: `git diff cf748226e..a0ab149ff` — 12 files,
  +1048/−89. Product code is `154a18f61`; tests are `a0ab149ff`.
- Blind kill-set (K1–K15) written before reading the candidate tests:
  [`blind-killset-booking-webhook-215.md`](blind-killset-booking-webhook-215.md).

## Per-item verdicts

### 1. Blind kill-set before tests — PASS (process)
15 named breakages derived from the authority brief and the non-test diff, committed before either
test file was opened.

### 2. Bootstrap / pre_session organization resolution without relation capability — PASS
`resolveProviderWebhookOrganization` now goes through `runWebappNamedRoot` with identity
`app.resolve_payment_webhook_organization(text,text,text)` (`pgPayments.ts:359-377`). The route stamps
a bootstrap principal (`route.ts:28`), which `portContextRuntime.ts:296-297,338-339` maps to the
`pre_session` class; the declaration adds exactly that capability (`declaration.ts` +
`port-context-capabilities.*.sql`), and EXECUTE moves `app_patient` → `app_pre_session`.

**K6 investigated and rejected.** The live body in `generated/prod-to-target/schema-pre.sql:20679`
still carries `app.require_attested_context_for_roles(…, ARRAY['app_patient'])`, which reads as a
declaration/body mismatch that would 42501 at runtime. It is not: the reconcile step is a gate
**rewriter**, not a verifier — `privileges.bcb_webapp_dev.sql:2477-2523` locates the existing guard
(falling back from `require_accepted_context` to `require_attested_context_for_roles`), overlays
`gate.gate_expression` into `prosrc`, and re-`EXECUTE`s the definition. The candidate's declaration
flips this signature from mode `attested` to `exact` with the pre-session expression, so the gate moves
on reconcile. Doing it in the declaration rather than the migration is what AGENTS §1
«Миграция не выдаёт и не отзывает права» requires.

### 3. Settlement confined to the accepted tenant — PASS
`app.settle_booking_payment_webhook_event` takes **no** organization argument; `v_org :=
app.current_org_id()` and a NULL principal raises `42501
booking_payment_webhook_settle_principal_required`. Every statement in the body is qualified with
`organization_id = v_org`, including the "event exists but belongs to another clinic" branch, which
returns `not_found` rather than claiming the settlement. Fault injection 4 (below) confirms the test
catches a root that names a tenant.

### 4. Atomic, exactly-once success notification — PASS for the same-event retry
Provider event, intent, payment, payment history, appointment `payment_ref`, lifecycle history and
patient timeline are all written inside one SECURITY DEFINER call, i.e. one transaction. Idempotency
rests on real constraints, verified in `db/schema/bookingPayments.ts`:
`be_payment_provider_events_lifecycle_uidx (provider_id, idempotency_key, event_type)`,
`be_payments_intent_uidx (payment_intent_id)`, and the partial
`be_payment_history_capture_uidx (organization_id, payment_id, event_type) WHERE payment_id IS NOT NULL
AND event_type = 'payment_captured'` — so the untargeted `ON CONFLICT DO NOTHING` on payment history is
in fact backed by an index (kill-set K3 rejected). Appointment status transitions are guarded on the
read status, so a retry appends no second history/timeline row.

### 5. Two distinct event keys for one intent, incl. concurrent — see Recommendation R1
Not a blocking finding; the money path holds. Detail and reachability analysis in R1.

### 6. Non-success and unknown/missing intent — PASS
`event_type <> 'payment.succeeded'` sets `processed_at` and returns `recorded`; an unresolvable intent
sets `processed_at` and returns `intent_not_found`. Both reach the service as `ok: true`, so the route
answers 200 and the provider stops retrying — the previous acknowledgement semantics.

### 7. Central privileges only — PASS
- Migration contains no `GRANT`/`REVOKE`/`CREATE POLICY`: `node scripts/check-migration-privileges.mjs`
  → `OK (119 migration files)`.
- Owner `app_seam_payment_webhook_owner`, `SECURITY DEFINER`, `SET search_path = pg_catalog`, and every
  reference in the body is schema-qualified (`app.`, `public.`, `pg_catalog.`).
- Accepted-context hash covers all five arguments as `text@1`/`textsend`, matching the declared
  `typedArgs: ['text','text','text','text','text']`.
- EXECUTE is exactly `app_tenant_service` for the settle root and exactly `app_pre_session` for the
  resolver, each preceded by `REVOKE ALL … FROM PUBLIC` and from every other role.
- No broad `purpose: 'relation'` capability was granted to `tenant_service`; access is column-level per
  relation, e.g. `GRANT UPDATE ("payment_ref","status","updated_at") ON TABLE "public"."be_appointments"`.
- All 7 touched relations have both a permissive `rev10_seam_business_*` and a restrictive
  `rev10_named_root_owner_gate_*` policy for the seam owner (checked individually) — no FORCE-RLS trap.
- Generated artifacts: `pnpm check:db-privileges-generated` → byte-identical, exit 0.
- Migration landing: name `20260905T194500_…` matches the timestamp rule; owner/schema-create/language
  markers and a `BCB-MIGRATION-VERIFY` probe are present.
  `bash apps/webapp/scripts/check-drizzle-migration-order.sh`, `check-legacy-migrations-frozen.sh`,
  `scripts/check-no-new-raw-sql.mjs`, `check-db-chokepoint.mjs`,
  `check-c4-migration-owned-function-bodies.mjs` → all OK.
- Worker evidence reused per §10 «Strong reuse rule»: DEV rollback-only preflight PASS
  (`migrate-local.mjs --rollback-only`, pending=1), recorded in
  `docs/_TODO/DOCTOR_MOBILE_UI_OWNER_ACCEPTANCE_2026-09-04.md`. `--execute` and the live TEST payment
  are correctly still open there.

### 8. Parsing/types and tenant crossing — PASS
`parseProviderWebhookSettlement` validates `outcome` against a closed set and throws
`booking_payment_webhook_settlement_outcome_unrecognised` otherwise — it fails closed rather than
degrading to "nothing captured". No `organizationId` reaches the root, and the route derives the
organization principal and `input.organizationId` from the same resolved value (`route.ts:41-56`), so
the accepted context and the service argument cannot diverge.

### 9. Test quality under §10a/§10b — PASS
9 tests, 2 files, both selected by their Vitest project (`|unit|`, `|fast|`). They assert behaviour —
which door the money goes through, who gets notified, what a retry does — not source text. The
principal test reads the committed generated capability SQL from disk; that is an artifact-contract
read (a typo on either side is a live 400), not a source-shape assertion, and is justified in place.
`pnpm typecheck` → exit 0.

## Fault injection — 4 independent classes, one injection each, all reverted

| # | Injected fault | Assertion that went red |
|---|---|---|
| 1 | resolver back to `runWebappSql` relation access (the original defect) | `resolves the clinic through a named root the bootstrap principal really has` |
| 2 | notify on `settled.paymentId` instead of `outcome === 'captured'` | `does not re-notify on a retry that still names the settled payment` |
| 3 | drop the closed-set check in `parseProviderWebhookSettlement` | `refuses an unrecognised settlement answer instead of reporting nothing captured` |
| 4 | pass `organizationId` as a root argument | `settles through a named root instead of relation access, and names no organization` |

Uncaught kill-set entries: 0 blocking. `git status` clean after revert; no product code was modified by
this audit.

## Recommendations (non-blocking — AGENTS §24.6: not owner scope, not a repo-rule, not a regression)

**R1 — `captured` is returned for a call that captured nothing.** The intent compare-and-set
(`UPDATE … WHERE status <> 'succeeded'`) never has its row count read, and `v_confirmed` is appended
unconditionally for every appointment in the loop. So a *second, differently-keyed* success event for
one intent inserts a fresh journal row (`v_inserted = true`, hence `duplicate = false`), matches no CAS,
finds the existing payment, and still returns `outcome: 'captured'` with `paymentId` and a populated
`confirmedAppointmentIds` — on which the service re-fires `onAppointmentPaymentConfirmed` and
`onPackagePaymentCaptured`. Money is safe (the unique indexes hold); the post-commit notification is
not. Scope of the claim, stated precisely:
- Not a regression — the removed `captureIntentSuccessInUnitOfWork` pushed `confirmedAppointments`
  unconditionally in exactly the same way, and its `runSerializedPostCommit` key was the intent, not the
  event, so it re-notified on a new event row too.
- I could not construct a reachable live path. YooKassa pins `metadata.idempotencyKey` per intent at
  `createIntent` (`yookassaPaymentProvider.ts:275`, read back at `:459`), so ordinary redeliveries share
  a key and hit `already_processed`; non-success types take the `recorded` branch. Same-key concurrency
  is safe (speculative-insert wait, then a fresh statement snapshot sees the committed row).
- What remains true regardless: the protection is provider behaviour, not construction, and the port
  contract in `ports.ts` explicitly documents `captured` as covering "уже были проведены равным ему
  повтором" — under that documented contract the service's notify condition is not exactly-once. A
  guard would be reading the CAS result, or a distinct outcome for "already captured". I am not writing
  a test for it: the fix shape is a design choice, and the oracle would need a live database, which this
  audit is barred from creating.

**R2 — dead relation-access code left on the port.** `recordProviderEvent`, `getProviderEventById` and
`markProviderEventProcessed` now have no production caller (`grep` over `apps/webapp/src`, excluding
tests). They are `db.insert()`/`db.select()` implementations that the `tenant_service` principal cannot
execute — precisely the fallback the candidate's own 4th test guards against. Worth deleting with the
port type.

**R3 — intent lookup picks the newest of several.** The fallback resolution is
`WHERE organization_id = v_org AND provider_intent_ref = v_intent_ref ORDER BY created_at DESC, id DESC
LIMIT 1`. Since `intentRef` is `remote.invoice_details?.id ?? remote.id`, several intents can share one
provider ref, and the root would settle the newest rather than the paid one, silently.

**R4 — no index for that lookup.** `be_payment_intents` has unique indexes on
`(organization_id, idempotency_key)` and `(provider_id, idempotency_key)` and plain indexes on
appointment and user, but nothing on `(organization_id, provider_intent_ref)`. Not an AGENTS §1
violation — the rule triggers on a new table/column and this path is not newly hot — but it is a seq
scan on the money path.

## Commands behind every number

```
git rev-parse HEAD                                        # d116c51a497505312f17d34220f3b8a30fb26857
git diff --stat cf748226e..a0ab149ff                      # 12 files, 1048 insertions(+), 89 deletions(-)
pnpm check:db-privileges-generated                        # exit 0, byte-identical
node scripts/check-migration-privileges.mjs               # OK (119 migration files)
node scripts/check-no-new-raw-sql.mjs                     # OK (production debt: 0)
node scripts/check-db-chokepoint.mjs                      # OK
node scripts/check-c4-migration-owned-function-bodies.mjs # OK
bash apps/webapp/scripts/check-drizzle-migration-order.sh # OK
bash apps/webapp/scripts/check-legacy-migrations-frozen.sh
pnpm typecheck                                            # exit 0, 7 projects
pnpm --dir apps/webapp exec vitest run \
  src/modules/payments/providerWebhookSettlement.test.ts \
  src/infra/repos/pgPayments.providerWebhook.principal.unit.test.ts   # 2 files, 9 tests passed
```

## NOT DONE

- No live TEST payment and no `migrate-dev.sh --execute` were run — the brief bars deploying, mutating
  DEV/TEST and touching shared dev ports. The migration therefore has rollback-only preflight evidence
  only; §24.7 `milestone done` still needs the live run by the orchestrator.
- Full CI was not run (barred by the brief); targeted gates above were run instead.
- R1 has no acceptance test, for the reason stated in R1.
