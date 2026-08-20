# D20 · level 4 fix — D1–D3

Date: 2026-08-20  
Scope: D1–D3 only. D4–D6 and `upsertReminderRuleDirect` were not changed.

## Result

`executeCanonicalWriteOrLegacy` now distinguishes all three D20 handoff failures:

- transport error and an acknowledgement missing `canonicalWrite` notify the caller, then retain the permitted legacy direct write;
- a canonical acknowledgement whose natural key is rejected notifies the caller and returns without invoking the legacy direct write;
- a valid accepted canonical acknowledgement remains the successful no-legacy path.

`delivery.attempt.log` supplies one handoff-failure callback and records its operator incident through the same local incident helper used by the pre-existing direct-write-error path. Thus direct-write failures and handoff failures have one `recordOperatorFailureIncident` call site in this branch, rather than two copied reporting paths.

The existing D4 helper test was updated only where its former expectation contradicted D3: a foreign natural key is now rejected without a legacy write.

## Oracle

Before the product fix, the inherited acceptance oracle was red: 3 failed / 2 passed. Its command was:

```bash
pnpm --dir apps/integrator exec vitest run src/infra/db/writePort.reminderRuleFallback.test.ts
```

After the fix (run after formatting):

```text
Test Files  1 passed (1)
Tests  5 passed (5)
```

The compatible helper regression check also passed:

```bash
pnpm --dir apps/integrator exec vitest run src/infra/adapters/supportCanonicalWriteHandoff.d4.test.ts
# Test Files 1 passed (1); Tests 3 passed (3)
```

## Validation

- `pnpm install --frozen-lockfile` — passed (required because this checkout initially had no `node_modules`).
- `pnpm --dir packages/operator-db-schema run build && pnpm --dir packages/db-principal run build && pnpm --dir packages/platform-merge run build && pnpm --dir packages/error-tracking run build` — passed (builds required workspace package exports for Vitest).
- `/home/dev/brain/host-orch/run-tests.sh "pnpm test"` — passed: 97 test files passed, 4 skipped; 481 tests passed, 2 expected failures, 15 skipped.
- `pnpm --dir apps/integrator typecheck` — passed.
- `pnpm --dir apps/integrator lint` — passed (`check-queue-port-boundary: OK`, `legacy retry producer gate: PASS`).
- `pnpm exec prettier --check apps/integrator/src/infra/adapters/supportCanonicalWriteHandoff.ts apps/integrator/src/infra/db/writePort.ts apps/integrator/src/infra/adapters/supportCanonicalWriteHandoff.d4.test.ts` — passed.
- `git diff --check` — passed.

## Changed files

- `apps/integrator/src/infra/adapters/supportCanonicalWriteHandoff.ts`
- `apps/integrator/src/infra/db/writePort.ts`
- `apps/integrator/src/infra/adapters/supportCanonicalWriteHandoff.d4.test.ts`
- `docs/_TODO/runs/integrator-cleanup/D20_LEVEL4_FIX_D1D3_REPORT.md`

## NOT DONE

Empty.
