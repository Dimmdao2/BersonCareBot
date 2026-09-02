# W11–W16 critical acceptance — 02.09.2026

Candidate: `42c75613339adb1da9ee8e08ca609ffc6c7c162a`.

Authority: `docs/_TODO/SYSTEMIC_RESIDUAL_AUDIT_AND_FIX_PLAN_2026-08-27.md`, W11–W16 and
«Один системный исправляющий проход».

## Classification

- W11, W12: one-time cutover/data action; inspect the generator and SQL, run
  `pnpm run check:prod-to-target-cutover`, and prove the TEST-only overlay wiring. No SQL-text tests.
- W13–W15: repeatable, expensive, silent behavior; inspect implementation and existing tests only after fixing
  the blind kill-set below, add only missing cheapest-layer behavioral acceptance tests, then fault-inject every
  independent class once.
- W16: removal of an old reachable surface; prove by exact route/schema/method/CSRF/contract/caller searches and
  final compilation. No source-absence test.

## Blind kill-set (fixed before reading existing tests)

### W13 — reminder action journal

1. A genuinely absent journal row must remain the domain result `not_found`.
2. A journal repository rejection, including PostgreSQL permission/runtime failure, must propagate as an error;
   it must not become `not_found`/HTTP 404 and must not apply the reminder action.

### W14 — Web Push delivery

1. Empty subscriptions are not a delivery and do not create a provider attempt.
2. A skipped result is not a delivery.
3. A duplicate result is not a delivery.
4. Missing/rejected M2M or delivery configuration before the provider is fail-visible: no provider attempt, no
   success cache entry, no delivered increment, and the booking step remains retryable.
5. Authentication failure before the provider has the same fail-visible outcome and is not a provider attempt.
6. Subscription/DB failure before the provider has the same fail-visible outcome and is not a provider attempt.
7. A provider failure is a real provider attempt, but not a delivery, and leaves the booking step retryable.

### W15 — Telegram/MAX pre-routing

1. A real `null` binding is a normal absence and may select the documented unbound path.
2. A Telegram binding/resolver rejection must not select an unbound/wrong scenario: webhook processing returns a
   retryable non-2xx result and performs no message dispatch.
3. A MAX binding/admin resolver rejection must not select an unbound/non-admin scenario: webhook processing
   returns a retryable non-2xx result and performs no message dispatch.
4. Telegram long polling must not advance its offset after infrastructure failure, so the update remains retryable.

## Result

### Interrupted pass — evidence preserved

The first critical-auditor process ended after 1,518,502 ms with `blocked_system` and no final answer. Its last
recorded progress was: W11/W12 static gates green; W13 and the main W14 matrix had each red-tested under deliberate
production mutations; it was still proving the separate W14 cache-before-provider class before moving to W15.
Therefore this is **not yet a PASS**.

The interrupted process left its deliberate production mutations in the worktree. The lead restored all six
production files to candidate `42c756133` and verified that `git diff` for those files is empty. Only acceptance
tests and this artifact remain.

Salvaged green baseline after restoration:

- Integrator: 9 files, 76 tests passed via the exact targeted Vitest command covering dispatch, access, relay,
  booking retry, Telegram/MAX webhooks, routes and long-polling.
- Webapp: 2 files, 14 tests passed covering reminder-journal errors and patient Web Push relay outcomes.

The completing audit must reuse this kill-set and these tests, finish the remaining W14 cache mutation and W15
mutations, inspect W16 removal, rerun the same targeted sets, and replace this section with a binary PASS/FAIL.
