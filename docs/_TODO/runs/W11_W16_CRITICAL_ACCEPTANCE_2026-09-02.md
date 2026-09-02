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

### PASS — 02.09.2026, completing pass on candidate `42c756133`

All classes in the blind kill-set above are proven by an existing acceptance test with a targeted fault
injection that reds the exact test and is fully reverted (`git diff` clean before and after). Zero unproven
classes remain.

**W13 — reminder action journal.** Proven in the prior pass (`apps/webapp/src/infra/repos/pgReminderJournal.pg.test.ts`):
absent row stays `not_found`; repository rejection propagates as an error and is not swallowed into `not_found`.

**W14 — Web Push delivery.** Classes 1–3 (empty subscriptions, skipped result, duplicate result are not a
delivery) and 7 (provider failure is an attempt, not a delivery, step stays retryable) proven in the prior pass
via `relayOutboundRoute.route.test.ts` / `bookingLifecycleRoute.stepIsolation.test.ts`. Classes 4–6 (M2M/auth/DB
failure before the provider is fail-visible, no provider attempt, no success cache entry) proven in the prior
pass via `webPushAccessPort.test.ts`. This pass closed the remaining separate class — **a pre-provider failure
must not be cached as success/delivery, and must leave the step retryable**:
  - Mutation: `relayOutboundRoute.ts` catch block — removed `await idempotencyPort.release?.(dedupKey);` after
    a pre-provider `WEB_PUSH_ACCESS_UNAVAILABLE` rejection.
  - Test: `relayOutboundRoute.route.test.ts` → "releases the relay key after a pre-provider web-push failure so
    the booking step can retry".
  - Result: red — retry returned `{ ok: true, status: 'duplicate' }` instead of re-attempting delivery, i.e. the
    failed attempt was cached as if already handled. Reverted; `git diff` empty.

**W15 — Telegram/MAX pre-routing.** All four classes proven this pass, one targeted mutation each, all reverted
(`git diff` empty after each):
  1. *Real `null` binding is normal.* Mutation: `telegram/webhook.ts` `resolveTelegramOrganizationId` — throw
     instead of returning `null` when the per-user resolver finds nothing. Test:
     `dedicatedWebhook.route.test.ts` → "keeps a real null organization binding as normal absence and still
     dispatches". Red: `503` instead of `200`/dispatch.
  2. *Telegram resolver rejection is fail-visible, no dispatch.* Mutation: same function — `.catch(() => null)`
     around `resolveOrganizationIdForMessengerIdentity`, swallowing the rejection into an unbound scenario. Test:
     `dedicatedWebhook.route.test.ts` → "returns retryable non-2xx without dispatch when the organization
     resolver rejects". Red: `200`/dispatch instead of `503`/no dispatch.
  3. *MAX resolver rejection is fail-visible, no dispatch.* Same mutation shape in `max/webhook.ts`
     `resolveMaxOrganizationId`. Test: `max/dedicatedWebhook.route.test.ts`, same name. Red: `200`/dispatch
     instead of `503`/no dispatch.
  4. *Long polling does not advance the offset on infra failure.* Mutation: `telegram/longPolling.ts` — moved
     `offset = update.update_id + 1;` from the success path into the `catch` block. Test:
     `longPolling.test.ts` → "does not advance the offset when infrastructure processing rejects an update".
     Red: next `getUpdates` call carried `offset: 18` instead of omitting it.

**W16 — old support HTTP bridge.** Confirmed removed and unreachable by exact search, no test written (source-
absence is not a behavioral class per §10a/AGENTS.md W16 classification):
  - `rg -n "sync-user-message|syncUserMessage|sync_user_message"` across `apps/webapp/src` and
    `apps/integrator/src` → zero hits (only archived/history docs mention the retired path).
  - `apps/webapp/src/app/api/integrator/support/` contains only `status/route.ts` and `question/route.ts`
    (current canonical webapp-owned routes) — no `sync-user-message` route folder exists.
  - No CSRF-classifier or route-manifest entry references the retired path (W2's unified classifier has no
    stale second list to diverge from).
  - No producer (integrator- or webapp-side) calls the retired path; no test asserts its old persist-full-text
    behavior.

### Verification commands (this pass)

- `pnpm run check:prod-to-target-cutover` → `ok schema-pre.sql` / `ok schema-post.sql` /
  `ok ledgers-and-baseline.sql` / `prod-to-target cutover snapshot matches current DEV schema B` (W11/W12).
- `pnpm --dir apps/integrator exec vitest run <9 files>` → **9 files / 76 tests passed** (post-revert, final
  confirmation).
- `pnpm --dir apps/webapp exec vitest run --project=fast --project=unit <2 files>` → **2 files / 14 tests
  passed** (post-revert, final confirmation).
- `git status --short` / `git diff --stat` → empty at every checkpoint after each fault injection and at the end
  of the pass; only this artifact is modified in the final commit.

### Unproven classes

Zero. Every named W13–W16 kill-set class above is either caught red by a targeted fault injection against an
existing acceptance test, or (W16) established as a source-absence fact by exact search per its §10a
classification, which does not take a behavioral test.
