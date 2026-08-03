# D30 Ш4 — independent audit: reminder outbound-policy prerequisite

Candidate: `63cf645da` (`8b5adb36a` product + docs correction), branch
`wt/trackd-d30-sh4-policy-audit`. Authority: `D30_SCHEDULER_REVERSAL_PLAN.md` Ш4/Ш4.0,
Р-D30 and the audit gate assigned for this candidate.

## Verdict

**MUST FIX (docs-only).** The product prerequisite passes the saved behavioral oracle: all four
reminder channels receive exact server-owned policy markers, missing/wrong markers fail closed through the real
egress policy before provider delivery, and stable occurrence/generation event identities are unchanged. The
candidate nevertheless leaves two active statements in the same owner plan which contradict its new current-state
record and the executable tree. Product code does not need another fixer; one bounded docs correction must make the
remaining Ш4.0/risk/current-state records agree, after which the same baseline gates are sufficient.

No DB, environment, deploy, provider or product code was changed by the audit.

## Finding — the active plan still says the deleted direct idempotency path exists

The new `CURRENT PARTIAL` correctly records that D21 removed the old `notify-channels` check→send→cache path and
that the unified queue now owns idempotency. But the active risk table later in the same file still says Web Push
and email go directly through `notify-channels/route.ts`, declares the race unexecuted, and prescribes a new atomic
claim. The final uncertainty section also still says it is unknown whether Web Push goes through integrator.
Additionally Ш4.0 remains an open checkbox while the current-state paragraph says its exact prerequisite is already
closed structurally.

Reachable impact: the next Ш4 worker follows the owner plan and can rebuild a second idempotency/route mechanism or
leave the completed prerequisite permanently open, despite the executable path having only unified queue
`event_id` deduplication and claim. This violates the repository rule that a false readiness/work-state record must
be corrected where it lives.

Evidence:

- `D30_SCHEDULER_REVERSAL_PLAN.md:345-365` — open Ш4.0 plus the new correct current state;
- `D30_SCHEDULER_REVERSAL_PLAN.md:421` — stale direct-route/race statement;
- `D30_SCHEDULER_REVERSAL_PLAN.md:490-491` — stale “не смог выяснить” statement;
- exact executable search below returned no old path:

```text
rg -n 'patient-reminders/notify-channels|webPushOnlyScheduler|web-push-only/reminders|web-push-only/tick|runWebPushOnlyReminderInternalTick' \
  apps packages deploy package.json \
  --glob '!**/db/drizzle-migrations/**' --glob '!**/migrations/**' \
  --glob '!**/*.md' --glob '!**/*.test.*'
```

Result: no matches.

Required bounded correction: mark Ш4.0 complete with D21/unified-queue evidence (without closing Ш4), replace the
stale risk row with the actual unique-`event_id` + `ON CONFLICT` + `SKIP LOCKED` state, and remove or resolve the
obsolete uncertainty. Keep the remaining materialization-boundary and safe live-proof gaps open.

## Saved oracle and fault injections

Baseline:

```text
pnpm --dir apps/integrator exec vitest run \
  src/kernel/domain/executor/handlers/reminders.dispatch.d21.test.ts \
  src/infra/runtime/worker/outgoingDeliveryWorker.reminderGeneration.d21.test.ts \
  src/infra/adapters/outboundMessagePolicy.test.ts \
  src/infra/adapters/dispatchPort.test.ts
```

Result: `3 passed files / 28 passed tests` (the supplied file list contains three existing files; no separate
`outboundMessagePolicy.test.ts` exists).

Independent temporary faults, all reverted immediately:

1. Removed `routine_product/app_push` from the real Web Push materializer: dispatcher oracle went red
   `1 failed / 6 passed` on the exact queued intent.
2. Removed `routine_product/essential_delivery` from Telegram/MAX materialization: dispatcher oracle went red
   `1 failed / 6 passed` on both channel legs.
3. Removed the same markers from email materialization: dispatcher oracle went red `1 failed / 6 passed`.
4. Removed the real `assertOutboundMessagePolicy(intent)` call from the worker test harness: both missing and wrong
   marker cases went red (`2 failed / 11 passed`) because the queue row was incorrectly marked sent instead of dead.

Source inspection confirms the markers are constants in the trusted materializer and are not read from request,
body, rule or queue input. The candidate did not alter `rem:<occurrence>:g<generation>:<channel>` event ids,
delivery generation fields, unique queue schema or claim code.

## Other validation

- `pnpm --dir apps/integrator typecheck` — PASS.
- scoped ESLint over the three changed integrator files — PASS.
- `node scripts/check-no-new-raw-sql.mjs` — PASS, `production debt: 0`.
- `node scripts/check-queue-port-boundary.mjs` — PASS.
- `git diff --check` after restoring all fault injections — PASS.

Disposable/real PostgreSQL, DEV, TEST and PROD were not touched, as required.
