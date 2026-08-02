# D21 unified reminder occurrence — fixer report

Product fix: `6cfa0e33a` (`fix(reminders): satisfy D21 occurrence oracle`).

Authority: `WORK_ORDER.md` Р-D21/D21, `TRACK_D_D21_UNIFIED_REMINDER_OCCURRENCE_BRIEF.md`, and the saved independent oracle `D21_UNIFIED_OCCURRENCE_INDEPENDENT_AUDIT_2026-08-03.md`.

## Fixed findings

1. `0322_unified_reminder_occurrence_local.sql` grants the SECURITY DEFINER owner only the missing `INSERT` capability on `public.reminder_occurrence_history`; patient table grants were not expanded. The exposed ambiguous skip-column reference was qualified in the same capability so the saved callback gate completes.
2. Legacy pending conflicts now replace the surviving unified row's actionable `status` and exact `planned_at`. A terminal/different surviving occurrence advances `delivery_generation` and clears stale delivery metadata, so earlier generation logs cannot suppress the restored pending delivery. Migration parity compares rule, organization, platform user, status, and exact planned time.
3. Quiet-hours suppression was removed from the canonical integrator planner and webapp schedule calculations. Patient UI and reminder write contracts no longer display, parse, or accept quiet-hours settings; retained columns/types are compatibility data only.
4. The platform-user merge source and regenerated runtime artifact no longer execute `DELETE`/`UPDATE` against the dropped `webapp_reminder_occurrences` table.

## Validation

- `pnpm --dir apps/webapp exec vitest run --config vitest.postgres.config.ts src/infra/repos/reminderCallbackCapabilities.postgres.integration.test.ts` — PASS, `8/8`.
- `pnpm --dir apps/webapp exec vitest run --config vitest.postgres.config.ts src/infra/repos/reminderOccurrenceD21Migration.postgres.integration.test.ts` — PASS, `1/1`.
- `pnpm --dir apps/integrator exec vitest run src/kernel/domain/executor/handlers/reminders.dispatch.d21.test.ts` — PASS, `7/7`, including the selected time inside former quiet hours.
- `pnpm --dir apps/integrator exec vitest run src/infra/runtime/worker/outgoingDeliveryWorker.reminderGeneration.d21.test.ts src/kernel/domain/executor/handlers/reminders.skip.d21a.test.ts src/infra/adapters/remindersWritesPort.test.ts src/infra/db/repos/reminders.d5.test.ts` — PASS, `4 files / 24 tests`.
- `pnpm --dir apps/webapp exec vitest run src/modules/integrator/deliveryTargetsApi.d21.test.ts` — PASS, `1 file / 4 tests`.
- `pnpm --dir apps/integrator exec vitest run src/infra/db/messengerPhoneLink.identity.test.ts` after `pnpm --dir packages/platform-merge build` — PASS, `13 passed / 2 expected-fail`.
- `pnpm --dir apps/integrator typecheck` and `pnpm --dir apps/webapp typecheck` — PASS.
- `pnpm --dir packages/platform-merge typecheck` — PASS.
- `pnpm exec eslint apps/integrator/src/kernel/domain/reminders/policy.ts` and `pnpm --dir apps/webapp exec eslint <changed webapp paths>` — PASS. The shared package has no applicable ESLint config and is covered by its package typecheck/build.
- `bash apps/webapp/scripts/check-legacy-migrations-frozen.sh` — PASS.
- `bash apps/webapp/scripts/check-drizzle-journal-sync.sh` — PASS (`check-drizzle-journal-sync: OK`).
- `node scripts/check-no-new-raw-sql.mjs` — PASS (`integrator manifest files: 7; webapp manifest files: 20`).
- `git diff --check` — PASS.
- `rg -n "runWebPushOnlyReminderInternalTick|webPushOnlyScheduler|web-push-only|webapp_reminder_occurrences|integratorNotifyChannels|platformUserReminderWebPushNotify" apps packages deploy package.json --glob '!**/db/drizzle-migrations/**' --glob '!**/migrations/**' --glob '!**/*.md' --glob '!**/*.test.*'` — no executable legacy-table hit; only the two pre-existing `vapidSubject.ts` comments matched other search alternatives.
- `rg -n 'webapp_reminder_occurrences' packages/platform-merge/src packages/platform-merge/dist --no-ignore` after the package build — no matches.

Full CI, DEV/TEST/PROD, deploy, push, and a new blind audit were not run, per the D21 brief.
