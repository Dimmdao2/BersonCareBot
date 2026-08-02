# D21 unified reminder occurrence — independent auditor-live

## Verdict

**MUST FIX.** Candidate `ff9b17e11` on `wt/trackd-d21-unification` has four reachable
acceptance violations. The required kill-set has **7 caught / 0 uncovered** classes:
six were killed by temporary product mutations and the seventh was reproduced as an
actual migration defect by a red PostgreSQL acceptance test. All temporary product
mutations were reverted.

Authority: `TRACK_D_D21_UNIFIED_REMINDER_OCCURRENCE_BRIEF.md`, `WORK_ORDER.md`
Р-D21/D21, and `AGENTS.md` §10a/§10b/§24. The audit did not run full CI, DEV apply,
TEST, PROD, deploy, or a live provider.

## Findings

### F1 — callback capabilities cannot write canonical history

`0322_unified_reminder_occurrence_local.sql` makes `done`, `skip`, and `snooze`
insert a missing `public.reminder_occurrence_history` row. The installed function owner
is `app_owner`, but `0314_reminder_callback_capabilities.sql:10` grants that owner only
`SELECT, UPDATE` on the table; `0322` does not add `INSERT`.

Reachable impact: a signed patient/integrator callback reaches its canonical capability
and fails with PostgreSQL `42501 permission denied for table reminder_occurrence_history`.
The action does not reach the snooze generation bump or the terminal done/skip state.

Evidence:

```text
pnpm --dir apps/webapp exec vitest run --config vitest.postgres.config.ts \
  src/infra/repos/reminderCallbackCapabilities.postgres.integration.test.ts
```

Result: `3 failed / 5 passed`; `done`, `skip`, and `snooze` all fail at the new INSERT.

### F2 — 0322 can discard an actionable legacy pending occurrence

The migration copies legacy pending rows with `ON CONFLICT DO NOTHING`
(`0322:56-92`), then calls parity successful when any unified row with the same
`occurrence_key` exists (`0322:94-128`). It does not require that the surviving row has
the legacy pending status or current `planned_at`.

Reachable impact: when the former Web Push scheduler and unified scheduler have produced
the same occurrence key, a pre-existing terminal unified row wins the conflict; the
legacy queued row is then dropped with the table. The user loses an actionable pending
reminder, contrary to “актуальный pending state не теряется”.

Evidence:

```text
pnpm --dir apps/webapp exec vitest run --config vitest.postgres.config.ts \
  src/infra/repos/reminderOccurrenceD21Migration.postgres.integration.test.ts
```

The test replays the actual `0322` file against a private disposable PostgreSQL clone.
Result: expected `{status: queued, pending: true}`, received
`{status: sent, pending: false}`.

### F3 — legacy quiet hours still suppress user-selected occurrences

Р-D21 says there are no quiet hours: the user chooses the delivery time. The live
planner still drops matching slots in
`apps/integrator/src/kernel/domain/reminders/policy.ts:288,328`. The patient reminder
write/UI path still accepts, stores, and displays quiet-hour fields, including
`ReminderCreateDialog.tsx` and `ReminderRulesClient.tsx`.

Reachable impact: an accumulated rule whose chosen time falls inside the retained quiet
window plans zero occurrences, so the user receives silence at a time they explicitly
selected.

Evidence:

```text
pnpm --dir apps/integrator exec vitest run \
  src/kernel/domain/executor/handlers/reminders.dispatch.d21.test.ts
```

Result: `1 failed / 6 passed`; the new acceptance test expected one planned occurrence
and observed zero.

### F4 — platform-user merge still writes the dropped legacy table

The source/callgraph check found a live consumer after `0322` drops the table:
`packages/platform-merge/src/pgPlatformUserMerge.ts:1349-1361` executes DELETE and
UPDATE statements against `webapp_reminder_occurrences`. The shared merge function is
called from manual doctor merge, phone/email/channel-link merge, projection merge, and
integrator merge-candidate paths.

Reachable impact: the next platform-user merge after `0322` reaches these statements,
raises `relation "webapp_reminder_occurrences" does not exist`, and rolls back the whole
identity merge.

Evidence command:

```text
rg -n "runWebPushOnlyReminderInternalTick|webPushOnlyScheduler|web-push-only|webapp_reminder_occurrences|integratorNotifyChannels|platformUserReminderWebPushNotify" \
  apps packages deploy package.json \
  --glob '!**/db/drizzle-migrations/**' --glob '!**/migrations/**' \
  --glob '!**/*.md' --glob '!**/*.test.*'
```

The only executable legacy-table hits are the three platform-merge statements above.
The two `vapidSubject.ts` hits are comments, not consumers.

## Independent kill-set

| # | Temporary fault / actual defect | Red command and catching assertion |
| ---: | --- | --- |
| 1 | Added `if (!rule.userId) continue` before planning. | `pnpm --dir apps/integrator exec vitest run src/kernel/domain/executor/handlers/reminders.dispatch.d21.test.ts` → `plans one canonical occurrence for a platform-user rule without a bot identity` observed `0`, expected `1`. |
| 2 | Changed canonical skip input from `reason: null` to `reason: 'legacy_reason'`. | `pnpm --dir apps/integrator exec vitest run src/kernel/domain/executor/handlers/reminders.skip.d21a.test.ts` → three assertions red, including `reason: null`. The Web Push dispatch test independently keeps the unified `occurrenceId` in push extras. |
| 3 | Treated global occurrence status `sent` as terminal before a sibling leg. | `pnpm --dir apps/integrator exec vitest run src/infra/runtime/worker/outgoingDeliveryWorker.reminderGeneration.d21.test.ts` → `a sent occurrence does not suppress the sibling channel` observed zero provider calls. |
| 4 | Inverted the generation equality gate so stale generation was allowed. | Same worker command → `stale generation finalizes ... without calling a provider` observed one provider call. The PostgreSQL capability test separately exercises one snooze generation and replay stability, but is currently blocked by F1. |
| 5 | Bypassed the global mute decision in the last-moment gate. | Same worker command → `mute finalizes ... without calling a provider` observed one provider call. The same parameterized test covers terminal done/skip, topic disable, and channel disable. |
| 6 | Bypassed `hasActivePatientEnrollment` for platform-user target resolution. | `pnpm --dir apps/webapp exec vitest run src/modules/integrator/deliveryTargetsApi.d21.test.ts` → `refuses to resolve a platform user outside the signed organization` resolved foreign delivery data instead of rejecting. |
| 7 | Actual candidate defect: legacy queued row conflicts with an existing terminal unified occurrence key. | The new private-PostgreSQL migration test above is red on the unmodified candidate: pending state is lost. |

Count produced by the seven rows above: **7 caught, 0 uncovered**. Six temporary
mutations were reverted; class 7 remains as the product defect F2 and a fixed acceptance
oracle.

Exact count command (run from the repository root):

```bash
awk '/^## Independent kill-set/{inside=1; next} /^Count produced/{inside=0} inside && /^\| [1-7] \|/{caught++} END {printf "%d caught, %d uncovered\n", caught, 7-caught}' docs/_TODO/runs/integrator-cleanup/D21_UNIFIED_OCCURRENCE_INDEPENDENT_AUDIT_2026-08-03.md
```

Output: `7 caught, 0 uncovered`.

## Structural inspection

- The scheduled runtime entry is one `schedule.tick` script containing
  `reminders.planDue` followed by `reminders.dispatchDue`; the scheduler process emits an
  organization-scoped tick and does not contain a second copy/text planner.
- Event id and delivery-log id include occurrence × generation × channel. Queue legs are
  channel-separated; provider failure/dead handling does not mark the global occurrence
  failed.
- The last-moment worker gate checks generation, done/skip, mute, rule enablement,
  channel enablement, and topic enablement before provider dispatch.
- Removed Web-Push-only scheduler/internal tick/cron/deploy runtime paths have no
  executable consumer under the searched `apps`, `packages`, `deploy`, and root
  `package.json` scopes. F4 is the exception for the dropped legacy table itself.
- `handlers/reminders.ts` forwards snooze/skip/done/mute/topic actions through the
  canonical capability ports; skip reason is `NULL`, and user copy comes from existing
  templates/builders rather than Russian inline fallbacks.
- `0322` grants patient EXECUTE only on the relevant SECURITY DEFINER capabilities and
  does not grant `app_patient` direct operational-table access. F1 is a missing owner
  capability grant, not an overbroad patient grant.

## Validation

| Command | Result |
| --- | --- |
| `pnpm --dir apps/integrator exec vitest run src/infra/runtime/worker/outgoingDeliveryWorker.reminderGeneration.d21.test.ts src/kernel/domain/executor/handlers/reminders.skip.d21a.test.ts src/infra/adapters/remindersWritesPort.test.ts src/infra/db/repos/reminders.d5.test.ts` | PASS — `4 files / 24 tests`. |
| `pnpm --dir apps/webapp exec vitest run src/modules/integrator/deliveryTargetsApi.d21.test.ts` | PASS — `1 file / 4 tests`. |
| `pnpm --dir apps/integrator exec vitest run src/kernel/domain/executor/handlers/reminders.dispatch.d21.test.ts` | Expected red acceptance — F3, `1 failed / 6 passed`. |
| `pnpm --dir apps/webapp exec vitest run --config vitest.postgres.config.ts src/infra/repos/reminderOccurrenceD21Migration.postgres.integration.test.ts` | Expected red acceptance — F2, `1 failed`. Real migration chain reached count `321`. |
| `pnpm --dir apps/webapp exec vitest run --config vitest.postgres.config.ts src/infra/repos/reminderCallbackCapabilities.postgres.integration.test.ts` | FAIL — F1, `3 failed / 5 passed`; real migration chain reached count `321`. |
| `pnpm --dir apps/integrator typecheck` | PASS. |
| `pnpm --dir apps/webapp typecheck` | PASS. |
| scoped `pnpm exec eslint` over changed integrator TypeScript | PASS. |
| scoped `pnpm exec eslint` over changed webapp TypeScript/TSX plus audit tests | PASS. |
| `node scripts/check-no-new-raw-sql.mjs` | PASS — `integrator manifest files: 7; webapp manifest files: 20`. |
| `git diff --check` | PASS. |

The first README-form attempts, `pnpm --dir apps/integrator test -- <paths>` and
`pnpm --dir apps/webapp test -- <path>`, were discarded because Vitest 4 selected the
whole application suites rather than the requested files. They exposed unrelated existing
failures (`TELEGRAM_RUNTIME_CONFIG_UNAVAILABLE` and a missing booking-engine mock) and are
not D21 evidence. Direct `pnpm ... exec vitest run <exact files>` commands above are the
scoped evidence.

## Acceptance-test changes left for the worker

- Added no-bot planning, foreign-organization target denial, quiet-hours removal, and
  real 0322 pending-conflict migration acceptance cases.
- Removed `reminderRulesD5SchedulerRead.postgres.integration.test.ts`: it duplicated a
  handwritten SQL predicate, never called production code, and asserted the superseded
  rule that a reminder without `integrator_user_id` must not be scheduled.
- Corrected the existing mute-until-tomorrow assertion to verify local Moscow midnight
  without pinning the wall-clock date.

No product fix is included in this audit commit.
