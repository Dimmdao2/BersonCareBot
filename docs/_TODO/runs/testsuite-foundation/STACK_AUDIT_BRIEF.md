# #1074 — independent audit of Phase 0 stack foundation

Authority:

- `docs/_TODO/TEST_SUITE_AUDIT_2026-07-29.md`, current order step 2 and
  `HOW-D / EXEC` → `Фаза 0 — поднять стек`;
- `docs/_TODO/TESTSUITE_HOWTO_RESEARCH_2026-07-29.md`;
- worker brief
  `/home/dev/dev-projects/BersonCareBot/docs/_TODO/runs/testsuite-foundation/STACK_WORKER_BRIEF.md`;
- repository rules in `AGENTS.md`, `.cursor/rules/test-execution-policy.md`,
  and `docs/ORCHESTRATION_BINDINGS.md`.

Audit exact worker commit:

- baseline: `01ea1c9ce8bb8051d228a5d6aba893f931aad672`;
- worker commit: `e9a9c54aadc81f7d95b20a75f63d856e24f05fd9`.

This is a read-only independent audit. Do not modify files, commit, push, access
DEV/TEST/PROD, inspect `/opt/env`, or run full CI.

Verify independently:

1. Diff scope is limited to the non-live-DB foundation described by the worker
   brief. No production behavior, migration, deployment, A0/A1, mutation gate,
   or live database code changed.
2. `fast-check` and `fishery` are development dependencies with a coherent
   lockfile. Identify any unrelated lockfile churn and whether it is material.
3. The canonical public API is `@/app-layer/testing`; strict TypeScript is
   preserved, no `any`, secrets, ambient database URLs, or second application
   architecture are introduced.
4. The Zod v4 decision is honest for the repository's installed Zod version.
   The bridge validates every generated candidate with `safeParse`, fails
   closed for incompatible arbitraries, and its scalar/object/union evidence
   actually proves that behavior. Flag false claims or a bridge that silently
   filters/narrows inputs.
5. The Fishery export and deterministic clock are minimal, usable, and do not
   alter global state.
6. `pg-harness.ts` is only a safe disposable-PostgreSQL contract/skeleton. It
   cannot connect/create/drop and rejects ordinary DEV/TEST/PROD-looking names.
7. `sessionCookie.contract.test.ts` tests public behavior and meaningful
   invariants/examples. It must not assert source text, internal calls, mock
   calls, or reproduce deleted boilerplate. Check deterministic seeds and
   reproducibility.
8. Run the two focused Vitest files through the required shared mutex:

   `/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run src/app-layer/testing/testing.contract.test.ts src/modules/auth/sessionCookie.contract.test.ts"`

   Also run scoped ESLint for changed TS files, `pnpm --dir apps/webapp
   typecheck`, and scoped `git diff --check`. Do not run full CI.
9. Check worker commit message against `#1074`, exact validations, plan clause,
   and explicit remaining work. Note that the worker run record's prose reports
   a stale/mismatched abbreviated SHA; git's exact target above is authoritative.

Return exactly:

- `PASS`, or
- `FAIL` with numbered actionable findings tied to the worker brief/plan.

Include exact commands/results and residual risks. A PASS must not claim that
the live-DB matrix, A0/A1, mutation gate, or final owner rule is complete.
