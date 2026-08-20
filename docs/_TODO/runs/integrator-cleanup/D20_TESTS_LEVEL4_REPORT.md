# D20 · tests integrator, level 4 — D3/D4 security-hole evidence

Date: 2026-08-20  
Scope: only tests and this report; no product source, migration, database, or CI workflow changed.

## Result

**NOT DONE.** The D1–D3 acceptance oracle is committed and correctly red on the current product. D4–D6
cannot be truthfully closed within this brief without a product/CI decision or a sanctioned real-TEST runner.

## D1–D3: one shared fixture, three named failures

File: `apps/integrator/src/infra/db/writePort.reminderRuleFallback.test.ts:145-220`.

The single `handoffFailures` parameter table drives the existing public `delivery.attempt.log` write-port
boundary for all three outcomes. It asserts an observable operator incident in every case; for the foreign
natural key (D3) it also asserts that the direct legacy write is not called. D1 and D2 deliberately allow a
legacy write only when the incident makes it non-silent, matching the map's “refusal **or** legacy with a
signal” wording rather than inventing one product outcome.

| Point | Oracle and current product fault                                                                                                                                                                                                        | Evidence / rollback                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Transport throws → `recordOperatorFailureIncident` must be called. Current `supportCanonicalWriteHandoff.ts:16-25` catches the transport error and invokes `legacyWrite()` without an incident.                                         | `pnpm --dir apps/integrator exec vitest run src/infra/db/writePort.reminderRuleFallback.test.ts` → `webapp transport throws`: expected 1 incident, got 0. This is a failing acceptance test on the named current fault, so no extra product mutation was made; `git diff -- apps/integrator/src/infra/adapters/supportCanonicalWriteHandoff.ts apps/integrator/src/infra/db/writePort.ts` is empty (no temporary product change to roll back). |
| 2     | `{ ok: true }` with no `canonicalWrite` → named, observable incident (legacy is allowed only with that signal). Current optional-field condition at `supportCanonicalWriteHandoff.ts:18` falls through to the same silent legacy write. | Same command → `webapp acknowledges without canonicalWrite`: expected 1 incident, got 0. No injected mutation or rollback exists because the acceptance test already exposes the exact baseline defect and product fixes are out of scope.                                                                                                                                                                                                     |
| 3     | Foreign natural key → refusal (no `appendSupportDeliveryEventDirect`) **and** incident. Current `accepts()` false falls through at `supportCanonicalWriteHandoff.ts:18-25`.                                                             | Same command → expected 1 incident, got 0; plus `writePort.reminderRuleFallback.test.ts:215` reports direct legacy write called once. No temporary product mutation was made; product diff remains empty.                                                                                                                                                                                                                                      |

Full phase evidence:

```text
/home/dev/brain/host-orch/run-tests.sh "pnpm test"
Test Files  1 failed | 96 passed | 4 skipped (101)
Tests  3 failed | 478 passed | 2 expected fail | 15 skipped (498)
```

The three failures are exactly the new D1–D3 acceptance cases above. The test count in this changed suite is
2 → 5 runtime cases: the pre-change file has two direct `it()` declarations (`git show
HEAD:apps/integrator/src/infra/db/writePort.reminderRuleFallback.test.ts | rg -c '^  it\\('` → `2`), and the
targeted Vitest run reports five cases after the parameterized three-case oracle is added. The complete run's
498 total therefore contains three new D20 cases.

## D4: real narrow principal must run in ordinary CI

**NOT DONE — no sanctioned runnable path exists in this checkout.**

`apps/integrator/src/infra/db/directPublic/writeReminderRulesDirect.rls.integration.test.ts:51-58` still
uses `describe.skipIf` behind four opt-in values, and the ordinary CI workflow only runs `pnpm test`
(`.github/workflows/ci.yml:31-38`). The required D30 example does not exist in the current tree:

```text
rg --files | rg 'check-d30|scheduler.*lock|concurrency'
# no check-d30-scheduler-lock-concurrency.ts

git log --all --name-status -- .../check-d30-scheduler-lock-concurrency.ts
# bfe6b48f... D apps/integrator/src/infra/scripts/check-d30-scheduler-lock-concurrency.ts
```

The last historical version started a disposable PostgreSQL instance (`git show
73cce2a64:apps/integrator/src/infra/scripts/check-d30-scheduler-lock-concurrency.ts`); reusing it would
violate the mandatory DEV → TEST-only rule. Current `createRealPostgresIntegrationTestHarness.ts` is a
shared helper only for two worker principals, not `runWithIntegratorPrincipal`; the existing reminder RLS
test duplicates its own real-principal wrapping. No new Vitest/DB mechanism, disposable database, or
unapproved CI workflow change was created.

## D5: patient support message after public DML revocation

**NOT DONE — current code supplies no durable boundary to test.**

The named patient mirror (`kernel/domain/support/webappSupportSync.ts:25-67`) returns `{ mirrored: false }`
after `console.warn` on webapp failure and has neither an outbox dependency nor an explicit refusal result.
The only current `executeCanonicalWriteOrLegacy` call is the delivery-attempt branch at
`infra/db/writePort.ts:928`, not the patient-message path. A test claiming durable-outbox behavior here
would need to invent a path that the product does not expose. Product code must first define the D17
durability/refusal boundary; this task must not do that.

## D6: local integrator technical write under blocked principal

**NOT DONE — no ordinary-CI real-TEST runner exists, and the known target is currently denied.**

The sole real-principal proof is still the opt-in D4 file above. Static grant evidence also confirms the
reported starting state: `deploy/postgres/p0-5b-role-split-staff-patient.sql:136` defines `app_patient`
with “no table grants”. A fake DbPort would not prove PostgreSQL ACL behavior, while a new direct DB test or
disposable PostgreSQL is forbidden. A product/privilege fix plus the sanctioned D4 runner are prerequisites.

## Seventh reachable gap: reminder-rule direct write bypasses support handoff

**Confirmed, not tested in this stage.** `infra/db/writePort.ts:535-576` invokes
`upsertReminderRuleDirect` directly (with retry/outbox and incident only after that direct write fails), while
the support handoff is invoked exactly once at line 928. It has no webapp-handoff call. This is a separate
reachable D4-style bypass, not a typo in the map; it requires an owner-approved product boundary before a
behavioral test can name the correct outcome.

## Consolidation

- D1–D3 share one parameterized response fixture and one public write-port setup; no three copied mock
  arrangements were added.
- For D4/D6 I searched the existing real-principal helpers first. The current reusable harness cannot run
  the integrator principal, and the only applicable RLS test is opt-in; no second mechanism was built.

## Validation

- `pnpm install --frozen-lockfile` — completed.
- `pnpm --dir packages/operator-db-schema run build && pnpm --dir packages/db-principal run build && pnpm --dir packages/platform-merge run build && pnpm --dir packages/error-tracking run build` — completed.
- `pnpm --dir apps/integrator typecheck` — passed.
- `pnpm exec prettier --check apps/integrator/src/infra/db/writePort.reminderRuleFallback.test.ts` — passed.
- `pnpm --dir apps/integrator lint` — passed.
- `git diff --check` — passed.
- Full integrator command and red D1–D3 result: recorded above.

## Развилки

1. Which approved CI environment and credential source should execute the real named TEST RLS script,
   now that the historical D30 disposable runner is deleted and prohibited?
2. For D5, should patient support write failure use the existing durable outbox or an explicit refusal?
   The map allows either only after the product boundary makes it observable.
3. For the confirmed seventh gap, should reminder-rule writes be handed off to webapp or remain an explicit
   integrator-owned technical projection? The current write has no handoff contract.

## Чего не смог

- I did not run the opt-in RLS file against TEST: no sanctioned ordinary-CI runner/connection was found,
  and creating one would exceed the no-new-DB-mechanics rule.
- I did not prove D6 against a fake or a live disposable database: neither demonstrates the required ACL.

## NOT DONE

- D1–D3 are intentionally red acceptance tests awaiting a product fix.
- D4 has no ordinary-CI real-TEST runner.
- D5 lacks a product durability/refusal boundary.
- D6 remains a real ACL defect without the prerequisite D4 runner and product privilege fix.
- The reminder-rule bypass is separately reported, not fixed or tested here.
