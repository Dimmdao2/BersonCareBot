# #1074 — Phase 0 stack worker

Authority:

- `docs/_TODO/TEST_SUITE_AUDIT_2026-07-29.md`, current order step 2 and
  `HOW-D / EXEC` → `Фаза 0 — поднять стек`;
- `docs/_TODO/TESTSUITE_HOWTO_RESEARCH_2026-07-29.md`;
- repository rules in `AGENTS.md`, `.cursor/rules/test-execution-policy.md`,
  and `docs/ORCHESTRATION_BINDINGS.md`.

Deliver one coherent, bounded non-live-DB foundation slice. Do not touch DEV,
TEST, PROD, `/opt/env`, migrations, deployment, or the A1 PostgreSQL verifier.

Required result:

1. Add `fast-check` and `fishery` to webapp development dependencies using the
   repository package manager; update the lockfile.
2. Preserve all existing files under
   `apps/webapp/src/app-layer/testing/` and add the canonical barrel
   `index.ts` plus:
   - `arbitraries.ts`;
   - `builders.ts`;
   - `clock.ts`;
   - `pg-harness.ts`.
3. The public test API must be strict TypeScript and usable only through
   `@/app-layer/testing`. It must not expose secrets, ambient database URLs, or
   a second application architecture.
4. Treat Zod v4 honestly:
   - inspect current package compatibility;
   - do not add a Zod-v3-only bridge;
   - provide a small typed Zod-v4-safe bridge/fallback that validates generated
     values against the production schema and fails generation when the
     supplied arbitrary is incompatible;
   - prove it on three representative schema shapes (scalar/object/union or
     equivalent), lazily rather than trying to cover all repository schemas.
5. `pg-harness.ts` is a safe contract/skeleton for disposable PostgreSQL only.
   It must reject DEV/TEST/PROD-looking database names and must not connect or
   create/drop databases in this worker.
6. Add one working `sessionCookie` contract example under the production
   module. It must:
   - be named `*.contract.test.ts`;
   - import all test-data/PBT helpers only from `@/app-layer/testing`;
   - combine properties/invariants with a small number of named business
     examples;
   - test public behavior, not source text, internal calls, or mocks;
   - use deterministic fast-check settings/seeds suitable for reproduction.
7. Add focused tests for the new foundation helpers themselves only where they
   prove behavior; do not recreate the deleted broad legacy suite.
8. Run focused Vitest through
   `/home/dev/brain/host-orch/run-tests.sh "<focused command>"`, plus scoped
   ESLint, webapp typecheck, and `git diff --check`. Do not run full CI.
9. Commit all worker changes with `#1074`. The commit body must state why,
   exact validation, the plan clause, and what remains undone. Do not push.

Do not:

- modify production behavior to satisfy a test;
- add `any`, snapshots, source-text assertions, mock-call assertions, or
  one-test-per-method boilerplate;
- implement mutation gates or A0/A1 changes in this slice;
- write the final owner rule yet.

Report:

- commit SHA;
- exact files and dependency versions;
- exact commands/results;
- Zod-v4 bridge decision and evidence;
- residual risks for the independent auditor.

